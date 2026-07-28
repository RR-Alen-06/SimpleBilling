import { supabase, isSupabaseConfigured } from '../supabase/client';
import { 
  Customer, 
  Product, 
  Bill, 
  BillItem, 
  Payment, 
  Expense, 
  CustomerLedgerEntry, 
  CustomerSummary, 
  DashboardStats, 
  AllSettings, 
  RoundingMethod, 
  AuditLog, 
  DateFilterOption,
  SequenceConfig,
  PaymentSummary
} from '../types';

export const DEFAULT_SETTINGS: AllSettings = {
  shop: {
    shop_name: 'ABC PRINTING CENTER',
    address: 'Main Road, Shop No. 12, City',
    phone: '+91 98765 43210',
    email: 'contact@abcprinting.com',
    gst_number: '',
    logo_url: '',
    footer_message: 'Thank you for visiting. Powered by PrintPro ERP'
  },
  billing: {
    bill_prefix: 'BILL',
    bill_format: 'BILL-{SEQ}',
    default_payment_method: 'Cash',
    currency_symbol: '₹',
    decimal_precision: 2,
    gst_enabled: false,
    gst_rate: 0,
    default_printer_size: '80mm',
    auto_print: false,
    rounding_method: 'None'
  },
  loyalty: {
    enabled: true,
    points_per_amount: 100,
    amount_per_point: 1,
    min_redemption_points: 10
  },
  whatsapp: {
    enabled: true,
    template_text: '',
    enable_pdf_sharing: true,
    enable_text_sharing: true
  },
  security: {
    super_admin_pin: '1234',
    session_timeout_minutes: 30
  },
  app: {
    theme: 'light',
    date_format: 'DD/MM/YYYY',
    time_format: '12h'
  }
};

export class ApiService {
  // --- DEDICATED ATOMIC SEQUENCE MANAGEMENT ---
  static async getNextSequence(key: string): Promise<string> {
    if (!isSupabaseConfigured) {
      const fallbackNum = Date.now().toString().slice(-6);
      return `${key.slice(0, 3).toUpperCase()}-${fallbackNum}`;
    }

    try {
      // Invoke PostgreSQL atomic PL/pgSQL function
      const { data, error } = await supabase.rpc('get_next_sequence', { p_key: key.toUpperCase() });
      if (error || !data) {
        console.warn('RPC get_next_sequence failed, falling back to database query:', error);
        return await this.fallbackSequence(key);
      }
      return data;
    } catch {
      return await this.fallbackSequence(key);
    }
  }

  private static async fallbackSequence(key: string): Promise<string> {
    const { data: seq } = await supabase.from('sequences').select('*').eq('key', key.toUpperCase()).single();
    const prefix = seq?.prefix || key.slice(0, 3).toUpperCase();
    const padding = seq?.padding || 6;
    const nextVal = (seq?.current_val || 0) + 1;

    await supabase.from('sequences').upsert({
      key: key.toUpperCase(),
      prefix,
      padding,
      current_val: nextVal,
      updated_at: new Date().toISOString()
    });

    return `${prefix}-${String(nextVal).padStart(padding, '0')}`;
  }

  static async getSequences(): Promise<SequenceConfig[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase.from('sequences').select('*').order('key', { ascending: true });
    if (error) return [];
    return data || [];
  }

  static async updateSequenceConfig(key: string, prefix: string, padding: number, userName = 'Super Admin'): Promise<void> {
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.from('sequences').upsert({
      key: key.toUpperCase(),
      prefix: prefix.toUpperCase(),
      padding: Math.min(12, Math.max(2, padding)),
      updated_at: new Date().toISOString()
    });
    if (error) throw new Error(error.message);

    await this.logAudit({
      user_name: userName,
      action: 'UPDATE_SEQUENCE_CONFIG',
      entity: `Sequence ${key}`,
      new_value: `Prefix: ${prefix.toUpperCase()}, Padding: ${padding}`
    });
  }

  // --- ROUNDING HELPER ---
  static calculateRounding(subtotalAfterDiscount: number, method: RoundingMethod): {
    roundedTotal: number;
    roundingAdjustment: number;
  } {
    let rounded = subtotalAfterDiscount;
    switch (method) {
      case 'Round Down':
        rounded = Math.floor(subtotalAfterDiscount);
        break;
      case 'Round Up':
        rounded = Math.ceil(subtotalAfterDiscount);
        break;
      case 'Standard':
        rounded = Math.round(subtotalAfterDiscount);
        break;
      case 'None':
      default:
        rounded = Number(subtotalAfterDiscount.toFixed(2));
        break;
    }
    const adjustment = Number((rounded - subtotalAfterDiscount).toFixed(2));
    return {
      roundedTotal: rounded,
      roundingAdjustment: adjustment
    };
  }

  // --- SETTINGS SERVICE ---
  static async getSettings(): Promise<AllSettings> {
    if (!isSupabaseConfigured) return DEFAULT_SETTINGS;
    try {
      const { data, error } = await supabase.from('settings').select('*');
      if (error || !data || data.length === 0) return DEFAULT_SETTINGS;

      const merged = { ...DEFAULT_SETTINGS };
      data.forEach(row => {
        if (row.key in merged) {
          const defaultSub = (DEFAULT_SETTINGS as unknown as Record<string, object>)[row.key] || {};
          (merged as unknown as Record<string, object>)[row.key] = {
            ...defaultSub,
            ...(row.value || {})
          };
        }
      });
      return merged;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  static async saveSettings(key: keyof AllSettings, value: unknown, userName = 'Super Admin'): Promise<void> {
    if (!isSupabaseConfigured) return;
    
    const prev = await this.getSettings();
    const { error } = await supabase.from('settings').upsert({
      key,
      value,
      updated_at: new Date().toISOString()
    });

    if (error) throw new Error(error.message);

    await this.logAudit({
      user_name: userName,
      action: 'UPDATE_SETTINGS',
      entity: `settings.${key}`,
      previous_value: JSON.stringify(prev[key]),
      new_value: JSON.stringify(value)
    });
  }

  // --- AUDIT LOGGING ---
  static async logAudit(log: Omit<AuditLog, 'id' | 'created_at'>): Promise<void> {
    if (!isSupabaseConfigured) return;
    try {
      const auditNumber = await this.getNextSequence('AUDIT');
      await supabase.from('audit_logs').insert([{
        ...log,
        audit_number: auditNumber
      }]);
    } catch (err) {
      console.error('Audit logging error:', err);
    }
  }

  static async getAuditLogs(): Promise<AuditLog[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return [];
    return data || [];
  }

  // --- PRODUCTS ---
  static async getProducts(): Promise<Product[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });
    
    if (error) return [];
    return data || [];
  }

  static async addProduct(product: Omit<Product, 'id' | 'created_at'>, userName = 'Admin'): Promise<Product> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const product_code = await this.getNextSequence('PRODUCT');

    const { data, error } = await supabase
      .from('products')
      .insert([{ ...product, product_code }])
      .select()
      .single();

    if (error) throw new Error(error.message);

    await this.logAudit({
      user_name: userName,
      action: 'ADD_PRODUCT',
      entity: `Product ${data.name} (${product_code})`,
      new_value: JSON.stringify(data)
    });

    return data;
  }

  static async updateProduct(id: string, product: Partial<Omit<Product, 'id' | 'created_at'>>, userName = 'Admin'): Promise<Product> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const { data, error } = await supabase
      .from('products')
      .update(product)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);

    await this.logAudit({
      user_name: userName,
      action: 'UPDATE_PRODUCT',
      entity: `Product ${data.name}`,
      new_value: JSON.stringify(data)
    });

    return data;
  }

  static async deleteProduct(id: string, userName = 'Admin'): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw new Error(error.message);

    await this.logAudit({
      user_name: userName,
      action: 'DELETE_PRODUCT',
      entity: `Product ID ${id}`
    });
  }

  // --- CUSTOMERS ---
  static async getCustomers(): Promise<Customer[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('name', { ascending: true });

    if (error) return [];
    return data || [];
  }

  static async addCustomer(customer: { name: string; mobile?: string }, userName = 'Admin'): Promise<Customer> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const customer_code = await this.getNextSequence('CUSTOMER');

    const { data, error } = await supabase
      .from('customers')
      .insert([{ 
        customer_code,
        name: customer.name, 
        mobile: customer.mobile || null,
        advance_balance: 0,
        loyalty_points: 0
      }])
      .select()
      .single();

    if (error) throw new Error(error.message);

    await this.logAudit({
      user_name: userName,
      action: 'ADD_CUSTOMER',
      entity: `Customer ${data.name} (${customer_code})`,
      new_value: JSON.stringify(data)
    });

    return data;
  }

  static async updateCustomer(id: string, customer: { name: string; mobile?: string }, userName = 'Admin'): Promise<Customer> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const { data, error } = await supabase
      .from('customers')
      .update({ name: customer.name, mobile: customer.mobile || null })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);

    await this.logAudit({
      user_name: userName,
      action: 'UPDATE_CUSTOMER',
      entity: `Customer ${data.name}`,
      new_value: JSON.stringify(data)
    });

    return data;
  }

  static async getCustomerSummaries(): Promise<CustomerSummary[]> {
    if (!isSupabaseConfigured) return [];
    
    const customers = await this.getCustomers();
    if (customers.length === 0) return [];

    const { data: bills } = await supabase.from('bills').select('customer_id, grand_total');
    const { data: payments } = await supabase.from('payments').select('customer_id, amount');

    return customers.map(cust => {
      const custBills = bills?.filter(b => b.customer_id === cust.id) || [];
      const custPayments = payments?.filter(p => p.customer_id === cust.id) || [];

      const totalBilled = custBills.reduce((sum, b) => sum + Number(b.grand_total), 0);
      const totalPaid = custPayments.reduce((sum, p) => sum + Number(p.amount), 0);

      return {
        id: cust.id,
        customer_code: cust.customer_code,
        name: cust.name,
        mobile: cust.mobile,
        total_billed: totalBilled,
        total_paid: totalPaid,
        balance_due: Math.max(0, totalBilled - totalPaid - Number(cust.advance_balance || 0)),
        advance_balance: Number(cust.advance_balance || 0),
        loyalty_points: Number(cust.loyalty_points || 0),
        created_at: cust.created_at
      };
    });
  }

  // --- BILLING WITH ATOMIC SEQUENCE GENERATOR & SPLIT PAYMENTS ---
  static async createBill(billData: {
    customer_id?: string | null;
    total: number;
    discount: number;
    rounding_method: RoundingMethod;
    cash_paid: number;
    upi_paid: number;
    card_paid: number;
    advance_used: number;
    points_to_redeem: number;
    items: {
      product_id?: string | null;
      product_name: string;
      quantity: number;
      price: number;
      total: number;
    }[];
  }, userName = 'Admin'): Promise<Bill> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');

    const settings = await this.getSettings();

    // 1. Calculate Rounding
    const subtotalAfterDiscount = Math.max(0, billData.total - billData.discount - (billData.points_to_redeem * settings.loyalty.amount_per_point));
    const { roundedTotal, roundingAdjustment } = this.calculateRounding(subtotalAfterDiscount, billData.rounding_method);

    // 2. Payments & Advance Math
    const directPaid = billData.cash_paid + billData.upi_paid + billData.card_paid;
    const paidTotal = directPaid + billData.advance_used;
    const netDueForBill = roundedTotal - billData.advance_used;
    const advanceEarned = directPaid > netDueForBill ? directPaid - netDueForBill : 0;

    // 3. Loyalty Math
    let pointsEarned = 0;
    if (settings.loyalty.enabled && settings.loyalty.points_per_amount > 0) {
      pointsEarned = Math.floor(roundedTotal / settings.loyalty.points_per_amount);
    }

    const activeModes: string[] = [];
    if (billData.cash_paid > 0) activeModes.push(`Cash: ₹${billData.cash_paid}`);
    if (billData.upi_paid > 0) activeModes.push(`UPI: ₹${billData.upi_paid}`);
    if (billData.card_paid > 0) activeModes.push(`Card: ₹${billData.card_paid}`);
    if (billData.advance_used > 0) activeModes.push(`Advance: ₹${billData.advance_used}`);

    const payment_method = activeModes.length > 1 ? 'Split Payment' : (activeModes[0]?.split(':')[0] || 'Cash');

    // 4. ATOMIC DATABASE SEQUENCE GENERATOR (Never client-side)
    const bill_number = await this.getNextSequence('BILL');

    const { data: bill, error: billErr } = await supabase
      .from('bills')
      .insert([{
        bill_number,
        customer_id: billData.customer_id || null,
        total: billData.total,
        discount: billData.discount,
        rounding_method: billData.rounding_method,
        rounding_adjustment: roundingAdjustment,
        grand_total: roundedTotal,
        cash_paid: billData.cash_paid,
        upi_paid: billData.upi_paid,
        card_paid: billData.card_paid,
        paid_total: paidTotal,
        advance_used: billData.advance_used,
        advance_earned: advanceEarned,
        payment_method,
        loyalty_points_earned: pointsEarned,
        loyalty_points_redeemed: billData.points_to_redeem
      }])
      .select()
      .single();

    if (billErr) throw new Error(billErr.message);

    // 5. Insert Items
    const itemsToInsert = billData.items.map(item => ({
      bill_id: bill.id,
      product_id: item.product_id || null,
      product_name: item.product_name,
      quantity: item.quantity,
      price: item.price,
      total: item.total
    }));

    const { error: itemsErr } = await supabase.from('bill_items').insert(itemsToInsert);
    if (itemsErr) throw new Error(itemsErr.message);

    // 6. Customer Ledger & Balances Update
    if (billData.customer_id) {
      if (directPaid > 0) {
        const paymentNumber = await this.getNextSequence('PAYMENT');
        await supabase.from('payments').insert([{
          payment_number: paymentNumber,
          customer_id: billData.customer_id,
          bill_id: bill.id,
          amount: directPaid,
          payment_method,
          notes: `Bill payment for ${bill.bill_number}`
        }]);
      }

      const { data: cust } = await supabase.from('customers').select('advance_balance, loyalty_points').eq('id', billData.customer_id).single();
      if (cust) {
        const newAdvance = Math.max(0, Number(cust.advance_balance || 0) - billData.advance_used + advanceEarned);
        const newLoyalty = Math.max(0, Number(cust.loyalty_points || 0) - billData.points_to_redeem + pointsEarned);

        await supabase.from('customers').update({
          advance_balance: newAdvance,
          loyalty_points: newLoyalty
        }).eq('id', billData.customer_id);
      }
    }

    await this.logAudit({
      user_name: userName,
      action: 'CREATE_BILL',
      entity: `Bill ${bill.bill_number}`,
      new_value: JSON.stringify({ grand_total: roundedTotal, payment_method })
    });

    return { ...bill, items: billData.items };
  }

  // --- EDIT BILL DISCOUNT ---
  static async editBillDiscount(billId: string, newDiscount: number, reason: string, userName = 'Super Admin'): Promise<Bill> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');

    const bill = await this.getBillById(billId);
    if (!bill) throw new Error('Bill not found');

    const newGrandTotal = Math.max(0, bill.total - newDiscount + bill.rounding_adjustment);

    const { data: updatedBill, error } = await supabase
      .from('bills')
      .update({
        discount: newDiscount,
        grand_total: newGrandTotal,
        edited_at: new Date().toISOString(),
        edited_by: userName,
        edit_reason: reason
      })
      .eq('id', billId)
      .select()
      .single();

    if (error) throw new Error(error.message);

    await this.logAudit({
      user_name: userName,
      action: 'EDIT_BILL_DISCOUNT',
      entity: `Bill ${bill.bill_number}`,
      previous_value: `Discount: ₹${bill.discount}, Total: ₹${bill.grand_total}`,
      new_value: `Discount: ₹${newDiscount}, Total: ₹${newGrandTotal}, Reason: ${reason}`
    });

    return updatedBill;
  }

  static async getBills(): Promise<Bill[]> {
    if (!isSupabaseConfigured) return [];
    
    const { data: bills, error } = await supabase
      .from('bills')
      .select('*, customers(name, mobile)')
      .order('created_at', { ascending: false });

    if (error) return [];

    return (bills || []).map(b => ({
      ...b,
      customer_name: b.customers?.name || 'Walk-in Customer',
      customer_mobile: b.customers?.mobile || null
    }));
  }

  static async getBillById(id: string): Promise<Bill | null> {
    if (!isSupabaseConfigured) return null;

    const { data: bill, error } = await supabase
      .from('bills')
      .select('*, customers(name, mobile)')
      .eq('id', id)
      .single();

    if (error || !bill) return null;

    const { data: items } = await supabase
      .from('bill_items')
      .select('*')
      .eq('bill_id', id);

    return {
      ...bill,
      customer_name: bill.customers?.name || 'Walk-in Customer',
      customer_mobile: bill.customers?.mobile || null,
      items: items || []
    };
  }

  // --- CUSTOMER LEDGER ---
  static async getCustomerLedger(customerId: string): Promise<{
    customer: Customer;
    entries: CustomerLedgerEntry[];
    totalBilled: number;
    totalPaid: number;
    runningBalance: number;
  }> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');

    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();

    if (custErr || !customer) throw new Error('Customer not found');

    const { data: bills } = await supabase.from('bills').select('*').eq('customer_id', customerId).order('created_at', { ascending: true });
    const { data: payments } = await supabase.from('payments').select('*').eq('customer_id', customerId).order('created_at', { ascending: true });

    const rawEvents: {
      date: string;
      type: 'BILL' | 'PAYMENT';
      reference_no: string;
      description: string;
      bill_amount: number;
      paid_amount: number;
      advance_used: number;
      loyalty_points: number;
    }[] = [];

    (bills || []).forEach(b => {
      rawEvents.push({
        date: b.created_at,
        type: 'BILL',
        reference_no: b.bill_number,
        description: `Bill generated (${b.payment_method})`,
        bill_amount: Number(b.grand_total),
        paid_amount: Number(b.paid_total),
        advance_used: Number(b.advance_used || 0),
        loyalty_points: Number(b.loyalty_points_earned || 0)
      });
    });

    (payments || []).forEach(p => {
      rawEvents.push({
        date: p.created_at,
        type: 'PAYMENT',
        reference_no: p.payment_number || `PAY-${p.id.slice(0, 6).toUpperCase()}`,
        description: p.notes || `Payment received via ${p.payment_method}`,
        bill_amount: 0,
        paid_amount: Number(p.amount),
        advance_used: 0,
        loyalty_points: 0
      });
    });

    rawEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let balance = 0;
    let totalBilled = 0;
    let totalPaid = 0;

    const entries: CustomerLedgerEntry[] = rawEvents.map((evt, idx) => {
      totalBilled += evt.bill_amount;
      totalPaid += evt.paid_amount;
      balance = balance + evt.bill_amount - evt.paid_amount;

      return {
        id: `ledger-${idx}`,
        date: evt.date,
        type: evt.type,
        reference_no: evt.reference_no,
        description: evt.description,
        bill_amount: evt.bill_amount,
        paid_amount: evt.paid_amount,
        advance_used: evt.advance_used,
        loyalty_points: evt.loyalty_points,
        running_balance: balance
      };
    });

    return {
      customer,
      entries,
      totalBilled,
      totalPaid,
      runningBalance: balance
    };
  }

  static async recordCustomerPayment(payment: {
    customer_id: string;
    amount: number;
    payment_method: string;
    notes?: string;
  }, userName = 'Admin'): Promise<Payment> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const payment_number = await this.getNextSequence('PAYMENT');

    const { data, error } = await supabase
      .from('payments')
      .insert([{
        payment_number,
        customer_id: payment.customer_id,
        amount: payment.amount,
        payment_method: payment.payment_method,
        notes: payment.notes || null
      }])
      .select()
      .single();

    if (error) throw new Error(error.message);

    await this.logAudit({
      user_name: userName,
      action: 'RECORD_PAYMENT',
      entity: `Payment ${payment_number} (₹${payment.amount})`,
      new_value: JSON.stringify(data)
    });

    return data;
  }

  // --- EXPENSES ---
  static async getExpenses(): Promise<Expense[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return [];
    return data || [];
  }

  static async addExpense(expense: { title: string; amount: number; category: 'Shop Expense' | 'Electricity' | 'Rent' | 'Other Expense' }, userName = 'Admin'): Promise<Expense> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const expense_number = await this.getNextSequence('EXPENSE');

    const { data, error } = await supabase
      .from('expenses')
      .insert([{ ...expense, expense_number }])
      .select()
      .single();

    if (error) throw new Error(error.message);

    await this.logAudit({
      user_name: userName,
      action: 'ADD_EXPENSE',
      entity: `Expense ${expense.title} (${expense_number})`,
      new_value: JSON.stringify(data)
    });

    return data;
  }

  static async deleteExpense(id: string, userName = 'Admin'): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw new Error(error.message);

    await this.logAudit({
      user_name: userName,
      action: 'DELETE_EXPENSE',
      entity: `Expense ID ${id}`
    });
  }

  // --- SUPER ADMIN PURGE ---
  static async purgeAllBusinessData(userName = 'Super Admin'): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');

    await supabase.from('bill_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('payments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('bills').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('expenses').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('loyalty_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('audit_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    await supabase.from('customers').update({ advance_balance: 0, loyalty_points: 0 }).neq('id', '00000000-0000-0000-0000-000000000000');

    await this.logAudit({
      user_name: userName,
      action: 'PURGE_ALL_BUSINESS_DATA',
      entity: 'Entire Business Transactional Database'
    });
  }

  // --- DASHBOARD PAYMENT RECONCILIATIONS & METRICS ---
  static async getDashboardStats(filter: DateFilterOption = 'today', customRange?: { from: string; to: string }): Promise<DashboardStats> {
    const emptyPaymentSummary: PaymentSummary = {
      total_sales: 0,
      cash_collected: 0,
      upi_collected: 0,
      card_collected: 0,
      mixed_payments_total: 0,
      total_amount_collected: 0,
      outstanding_amount: 0,
      customer_advance_balance: 0,
      payment_method_breakdown: [
        { method: 'Cash', amount: 0 },
        { method: 'UPI', amount: 0 },
        { method: 'Card', amount: 0 }
      ],
      daily_collection_trend: [],
      monthly_collection_trend: []
    };

    if (!isSupabaseConfigured) {
      return {
        todays_sales: 0,
        monthly_sales: 0,
        todays_bills_count: 0,
        pending_balance: 0,
        total_customers: 0,
        total_income: 0,
        total_expense: 0,
        net_profit: 0,
        bills_generated: 0,
        average_bill_value: 0,
        payment_summary: emptyPaymentSummary,
        sales_trend: [],
        monthly_revenue: [],
        payment_distribution: [],
        top_products: []
      };
    }

    const { startDate, endDate } = this.getDateRangeBounds(filter, customRange);

    let billsQuery = supabase.from('bills').select('*, bill_items(*)');
    let paymentsQuery = supabase.from('payments').select('*');

    if (startDate) {
      billsQuery = billsQuery.gte('created_at', startDate.toISOString());
      paymentsQuery = paymentsQuery.gte('created_at', startDate.toISOString());
    }
    if (endDate) {
      billsQuery = billsQuery.lte('created_at', endDate.toISOString());
      paymentsQuery = paymentsQuery.lte('created_at', endDate.toISOString());
    }

    const { data: bills } = await billsQuery;
    const { data: payments } = await paymentsQuery;
    const { data: expenses } = await supabase.from('expenses').select('*');

    const allBills = bills || [];
    const allPayments = payments || [];
    const allExpenses = expenses || [];

    const customers = await this.getCustomerSummaries();
    const total_customers = customers.length;
    const pending_balance = customers.reduce((sum, c) => sum + Math.max(0, c.balance_due), 0);
    const total_advance = customers.reduce((sum, c) => sum + Number(c.advance_balance || 0), 0);

    // --- RECONCILE COLLECTIONS FROM ACTUAL PAYMENTS & SPLIT BILL FIELDS ---
    let cashCollected = 0;
    let upiCollected = 0;
    let cardCollected = 0;
    let mixedPaymentsTotal = 0;

    allBills.forEach(b => {
      const c = Number(b.cash_paid || 0);
      const u = Number(b.upi_paid || 0);
      const cd = Number(b.card_paid || 0);

      cashCollected += c;
      upiCollected += u;
      cardCollected += cd;

      if ((c > 0 && (u > 0 || cd > 0)) || (u > 0 && cd > 0)) {
        mixedPaymentsTotal += Number(b.grand_total);
      }
    });

    // Reconcile direct standalone payment entries
    allPayments.forEach(p => {
      const amt = Number(p.amount || 0);
      if (p.payment_method === 'Cash') cashCollected += amt;
      else if (p.payment_method === 'UPI') upiCollected += amt;
      else if (p.payment_method === 'Card') cardCollected += amt;
    });

    const totalAmountCollected = cashCollected + upiCollected + cardCollected;
    const totalSales = allBills.reduce((sum, b) => sum + Number(b.grand_total), 0);
    const bills_generated = allBills.length;
    const average_bill_value = bills_generated > 0 ? totalSales / bills_generated : 0;

    const total_income = totalAmountCollected;
    const total_expense = allExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const net_profit = total_income - total_expense;

    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthly_sales = allBills
      .filter(b => b.created_at.startsWith(currentMonth))
      .reduce((sum, b) => sum + Number(b.grand_total), 0);

    const paymentSummary: PaymentSummary = {
      total_sales: totalSales,
      cash_collected: cashCollected,
      upi_collected: upiCollected,
      card_collected: cardCollected,
      mixed_payments_total: mixedPaymentsTotal,
      total_amount_collected: totalAmountCollected,
      outstanding_amount: pending_balance,
      customer_advance_balance: total_advance,
      payment_method_breakdown: [
        { method: 'Cash', amount: cashCollected },
        { method: 'UPI', amount: upiCollected },
        { method: 'Card', amount: cardCollected },
        { method: 'Total Collected', amount: totalAmountCollected }
      ],
      daily_collection_trend: [],
      monthly_collection_trend: []
    };

    // Chart Trends
    const salesTrendMap = new Map<string, number>();
    allBills.forEach(b => {
      const dateKey = new Date(b.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      salesTrendMap.set(dateKey, (salesTrendMap.get(dateKey) || 0) + Number(b.grand_total));
    });
    const sales_trend = Array.from(salesTrendMap.entries()).map(([date, amount]) => ({ date, amount }));

    const monthlyRevMap = new Map<string, number>();
    allBills.forEach(b => {
      const monthKey = new Date(b.created_at).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      monthlyRevMap.set(monthKey, (monthlyRevMap.get(monthKey) || 0) + Number(b.grand_total));
    });
    const monthly_revenue = Array.from(monthlyRevMap.entries()).map(([month, amount]) => ({ month, amount }));

    const payment_distribution = [
      { name: 'Cash', value: cashCollected },
      { name: 'UPI', value: upiCollected },
      { name: 'Card', value: cardCollected }
    ].filter(p => p.value > 0);

    const prodMap = new Map<string, { quantity: number; revenue: number }>();
    allBills.forEach(b => {
      b.bill_items?.forEach((item: BillItem) => {
        const name = item.product_name;
        const existing = prodMap.get(name) || { quantity: 0, revenue: 0 };
        prodMap.set(name, {
          quantity: existing.quantity + Number(item.quantity),
          revenue: existing.revenue + Number(item.total)
        });
      });
    });

    const top_products = Array.from(prodMap.entries())
      .map(([name, stat]) => ({ name, quantity: stat.quantity, revenue: stat.revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      todays_sales: totalSales,
      monthly_sales,
      todays_bills_count: bills_generated,
      pending_balance,
      total_customers,
      total_income,
      total_expense,
      net_profit,
      bills_generated,
      average_bill_value,
      payment_summary: paymentSummary,
      sales_trend,
      monthly_revenue,
      payment_distribution,
      top_products
    };
  }

  private static getDateRangeBounds(filter: DateFilterOption, customRange?: { from: string; to: string }): {
    startDate?: Date;
    endDate?: Date;
  } {
    const now = new Date();
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    switch (filter) {
      case 'today':
        return { startDate, endDate };
      case 'yesterday':
        startDate.setDate(startDate.getDate() - 1);
        endDate.setDate(endDate.getDate() - 1);
        return { startDate, endDate };
      case 'weekly':
        startDate.setDate(startDate.getDate() - 7);
        return { startDate, endDate };
      case 'monthly':
        startDate.setMonth(startDate.getMonth() - 1);
        return { startDate, endDate };
      case 'quarterly':
        startDate.setMonth(startDate.getMonth() - 3);
        return { startDate, endDate };
      case 'yearly':
        startDate.setFullYear(startDate.getFullYear() - 1);
        return { startDate, endDate };
      case 'financial_year':
        const currentYear = now.getFullYear();
        const fyStart = now.getMonth() >= 3 ? new Date(currentYear, 3, 1) : new Date(currentYear - 1, 3, 1);
        return { startDate: fyStart, endDate };
      case 'custom':
        if (customRange?.from && customRange?.to) {
          return {
            startDate: new Date(customRange.from),
            endDate: new Date(customRange.to)
          };
        }
        return {};
      default:
        return {};
    }
  }

  // --- WHATSAPP TEXT RECEIPT GENERATOR ---
  static generateWhatsAppTextReceipt(bill: Bill, customerLedger?: { previousOutstanding: number }): string {
    const formattedDate = new Date(bill.created_at).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    const itemsText = (bill.items || []).map((item, idx) => 
      `${idx + 1}. ${item.product_name}\n   Qty : ${item.quantity} × ₹${item.price.toFixed(2)} = ₹${item.total.toFixed(2)}`
    ).join('\n\n');

    const prevDue = customerLedger?.previousOutstanding || 0;
    const totalDue = prevDue + bill.grand_total;
    const remainingToPay = Math.max(0, totalDue - bill.paid_total);

    return `🧾 *PRINTPRO ERP*

🏪 *ABC PRINTING CENTER*

Bill No : ${bill.bill_number}
Date : ${formattedDate}
Customer : ${bill.customer_name || 'Walk-in'}

━━━━━━━━━━━━━━━━━━━━━━
*ITEMS*

${itemsText}

━━━━━━━━━━━━━━━━━━━━━━

Subtotal ₹${bill.total.toFixed(2)}
Discount ₹${bill.discount.toFixed(2)}
Rounding ₹${bill.rounding_adjustment >= 0 ? '+' : ''}${bill.rounding_adjustment.toFixed(2)}

🧾 *Current Bill Total* ₹${bill.grand_total.toFixed(2)}

━━━━━━━━━━━━━━━━━━━━━━
*LEDGER SUMMARY*

Previous Outstanding ₹${prevDue.toFixed(2)}
Current Bill ₹${bill.grand_total.toFixed(2)}

Total Amount Due ₹${totalDue.toFixed(2)}

━━━━━━━━━━━━━━━━━━━━━━
*PAYMENT RECEIVED*

Cash Paid ₹${bill.cash_paid.toFixed(2)}
UPI Paid ₹${bill.upi_paid.toFixed(2)}
Card Paid ₹${bill.card_paid.toFixed(2)}
Advance Used ₹${bill.advance_used.toFixed(2)}

Paid Now ₹${bill.paid_total.toFixed(2)}

━━━━━━━━━━━━━━━━━━━━━━
*BALANCE SUMMARY*

Remaining to Pay ₹${remainingToPay.toFixed(2)}

Customer Advance Balance ₹${bill.advance_earned.toFixed(2)}

━━━━━━━━━━━━━━━━━━━━━━
🎁 *Loyalty Earned:* +${bill.loyalty_points_earned} Points

Thank you for visiting.

Powered by PrintPro ERP`;
  }
}
