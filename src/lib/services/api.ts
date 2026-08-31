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
  PaymentSummary,
  LoyaltyRule,
  LoyaltyRedemptionRule,
  LoyaltySettings,
  BillFinancialSummary,
  PaymentMethod
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
    points_required: 10,
    discount_value: 5
  },
  whatsapp: {
    enabled: true,
    template_text: '',
    enable_pdf_sharing: true,
    enable_text_sharing: true,
    email_service_id: '',
    email_template_id: '',
    email_public_key: ''
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
  // --- ATOMIC SEQUENCE MANAGEMENT ---
  static async getNextSequence(key: string): Promise<string> {
    if (!isSupabaseConfigured) {
      const fallbackNum = Date.now().toString().slice(-6);
      return `${key.slice(0, 3).toUpperCase()}-${fallbackNum}`;
    }

    try {
      const { data, error } = await supabase.rpc('get_next_sequence', { p_key: key.toUpperCase() });
      if (error || !data) return await this.fallbackSequence(key);
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

  // --- DYNAMIC LOYALTY REDEMPTION RULES CRUD ---
  static async getLoyaltyRedemptionRules(): Promise<LoyaltyRedemptionRule[]> {
    const defaultRedemptionRules: LoyaltyRedemptionRule[] = [
      { id: 'red-1', points_required: 10, discount_amount: 4.00, enabled: true },
      { id: 'red-2', points_required: 20, discount_amount: 5.00, enabled: true },
      { id: 'red-3', points_required: 30, discount_amount: 8.00, enabled: true },
      { id: 'red-4', points_required: 40, discount_amount: 10.00, enabled: true }
    ];

    if (!isSupabaseConfigured) return defaultRedemptionRules;

    const { data, error } = await supabase
      .from('loyalty_redemption_rules')
      .select('*')
      .order('points_required', { ascending: true });

    if (error || !data || data.length === 0) return defaultRedemptionRules;
    return data;
  }

  static async addLoyaltyRedemptionRule(rule: Omit<LoyaltyRedemptionRule, 'id' | 'created_at'>, userName = 'Super Admin'): Promise<LoyaltyRedemptionRule> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const { data, error } = await supabase.from('loyalty_redemption_rules').insert([rule]).select().single();
    if (error) throw new Error(error.message);

    await this.logAudit({
      user_name: userName,
      action: 'ADD_LOYALTY_REDEMPTION_RULE',
      entity: `Redemption Rule (${rule.points_required} pts = ₹${rule.discount_amount})`,
      new_value: JSON.stringify(data)
    });

    return data;
  }

  static async updateLoyaltyRedemptionRule(id: string, rule: Partial<Omit<LoyaltyRedemptionRule, 'id' | 'created_at'>>, userName = 'Super Admin'): Promise<LoyaltyRedemptionRule> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const { data, error } = await supabase.from('loyalty_redemption_rules').update(rule).eq('id', id).select().single();
    if (error) throw new Error(error.message);

    await this.logAudit({
      user_name: userName,
      action: 'UPDATE_LOYALTY_REDEMPTION_RULE',
      entity: `Redemption Rule ID ${id}`,
      new_value: JSON.stringify(data)
    });

    return data;
  }

  static async deleteLoyaltyRedemptionRule(id: string, userName = 'Super Admin'): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const { error } = await supabase.from('loyalty_redemption_rules').delete().eq('id', id);
    if (error) throw new Error(error.message);

    await this.logAudit({
      user_name: userName,
      action: 'DELETE_LOYALTY_REDEMPTION_RULE',
      entity: `Redemption Rule ID ${id}`
    });
  }

  static calculateLoyaltyDiscount(pointsToRedeem: number, loyaltySettings: LoyaltySettings, activeRedemptionRules: LoyaltyRedemptionRule[] = []): number {
    if (pointsToRedeem <= 0) return 0;

    const enabledRules = activeRedemptionRules.filter(r => r.enabled).sort((a, b) => b.points_required - a.points_required);

    if (enabledRules.length > 0) {
      let remainingPts = pointsToRedeem;
      let totalDiscount = 0;

      for (const rule of enabledRules) {
        if (remainingPts >= rule.points_required) {
          const multiplier = Math.floor(remainingPts / rule.points_required);
          totalDiscount += multiplier * Number(rule.discount_amount);
          remainingPts -= multiplier * rule.points_required;
        }
      }

      if (totalDiscount > 0) return Number(totalDiscount.toFixed(2));
      
      const bestRule = enabledRules[0];
      const rate = Number(bestRule.discount_amount) / Number(bestRule.points_required);
      return Number((pointsToRedeem * rate).toFixed(2));
    }

    const req = loyaltySettings.points_required > 0 ? loyaltySettings.points_required : 10;
    const disc = loyaltySettings.discount_value > 0 ? loyaltySettings.discount_value : 5;
    const ratePerPoint = disc / req;
    return Number((pointsToRedeem * ratePerPoint).toFixed(2));
  }

  // --- SIMPLIFIED DYNAMIC LOYALTY EARNING RULES ---
  static async getLoyaltyRules(): Promise<LoyaltyRule[]> {
    const defaultRules: LoyaltyRule[] = [
      { id: 'rule-1', rule_name: '1', min_bill_amount: 1, max_bill_amount: 20, points_earned: 1, enabled: true, sort_order: 1 },
      { id: 'rule-2', rule_name: '2', min_bill_amount: 21, max_bill_amount: 30, points_earned: 2, enabled: true, sort_order: 2 },
      { id: 'rule-3', rule_name: '3', min_bill_amount: 31, max_bill_amount: 40, points_earned: 3, enabled: true, sort_order: 3 },
      { id: 'rule-4', rule_name: '4', min_bill_amount: 41, max_bill_amount: 60, points_earned: 4, enabled: true, sort_order: 4 },
      { id: 'rule-5', rule_name: '5', min_bill_amount: 61, max_bill_amount: 80, points_earned: 5, enabled: true, sort_order: 5 },
      { id: 'rule-6', rule_name: '6', min_bill_amount: 81, max_bill_amount: 99, points_earned: 6, enabled: true, sort_order: 6 },
      { id: 'rule-7', rule_name: '7', min_bill_amount: 100, max_bill_amount: 200, points_earned: 7, enabled: true, sort_order: 7 },
      { id: 'rule-8', rule_name: '8', min_bill_amount: 201, max_bill_amount: 300, points_earned: 8, enabled: true, sort_order: 8 },
      { id: 'rule-9', rule_name: '9', min_bill_amount: 301, max_bill_amount: 375, points_earned: 9, enabled: true, sort_order: 9 },
      { id: 'rule-10', rule_name: '10', min_bill_amount: 376, max_bill_amount: 500, points_earned: 10, enabled: true, sort_order: 10 }
    ];

    if (!isSupabaseConfigured) return defaultRules;

    const { data, error } = await supabase.from('loyalty_rules').select('*').order('sort_order', { ascending: true });
    if (error || !data || data.length === 0) return defaultRules;
    return data;
  }

  static async addLoyaltyRule(rule: Omit<LoyaltyRule, 'id' | 'created_at'>, userName = 'Super Admin'): Promise<LoyaltyRule> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const { data, error } = await supabase.from('loyalty_rules').insert([rule]).select().single();
    if (error) throw new Error(error.message);

    await this.logAudit({
      user_name: userName,
      action: 'ADD_LOYALTY_RULE',
      entity: `Rule ${rule.rule_name}`,
      new_value: JSON.stringify(data)
    });

    return data;
  }

  static async updateLoyaltyRule(id: string, rule: Partial<Omit<LoyaltyRule, 'id' | 'created_at'>>, userName = 'Super Admin'): Promise<LoyaltyRule> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const { data, error } = await supabase.from('loyalty_rules').update(rule).eq('id', id).select().single();
    if (error) throw new Error(error.message);

    await this.logAudit({
      user_name: userName,
      action: 'UPDATE_LOYALTY_RULE',
      entity: `Rule ${data.rule_name}`,
      new_value: JSON.stringify(data)
    });

    return data;
  }

  static async deleteLoyaltyRule(id: string, userName = 'Super Admin'): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const { error } = await supabase.from('loyalty_rules').delete().eq('id', id);
    if (error) throw new Error(error.message);

    await this.logAudit({
      user_name: userName,
      action: 'DELETE_LOYALTY_RULE',
      entity: `Rule ID ${id}`
    });
  }

  static async calculateLoyaltyPointsEarned(billAmount: number): Promise<number> {
    const rules = await this.getLoyaltyRules();
    const activeRules = rules.filter(r => r.enabled).sort((a, b) => a.sort_order - b.sort_order);

    for (const rule of activeRules) {
      const min = Number(rule.min_bill_amount || 0);
      const max = rule.max_bill_amount !== null && rule.max_bill_amount !== undefined ? Number(rule.max_bill_amount) : Infinity;

      if (billAmount >= min && billAmount <= max) {
        return Number(rule.points_earned);
      }
    }

    return Math.max(1, Math.floor(billAmount / 100));
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

  static async addCustomer(customer: { name: string; mobile?: string; email?: string }, userName = 'Admin'): Promise<Customer> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const customer_code = await this.getNextSequence('CUSTOMER');

    const { data, error } = await supabase
      .from('customers')
      .insert([{ 
        customer_code,
        name: customer.name, 
        mobile: customer.mobile || null,
        email: customer.email || null,
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

  static async updateCustomer(id: string, customer: { name: string; mobile?: string; email?: string }, userName = 'Admin'): Promise<Customer> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const { data, error } = await supabase
      .from('customers')
      .update({ 
        name: customer.name, 
        mobile: customer.mobile || null,
        email: customer.email || null 
      })
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
        user_id: cust.user_id,
        customer_code: cust.customer_code,
        name: cust.name,
        mobile: cust.mobile,
        email: cust.email,
        total_billed: totalBilled,
        total_paid: totalPaid,
        balance_due: Math.max(0, totalBilled - totalPaid - Number(cust.advance_balance || 0)),
        advance_balance: Number(cust.advance_balance || 0),
        loyalty_points: Number(cust.loyalty_points || 0),
        created_at: cust.created_at
      };
    });
  }

  // --- BILLING WITH DYNAMIC REDEMPTION RULES ---
  static async createBill(billData: {
    customer_id?: string | null;
    total: number;
    discount: number;
    rounding_method: RoundingMethod;
    cash_paid: number;
    upi_paid: number;

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

    const [settings, activeRedemptionRules] = await Promise.all([
      this.getSettings(),
      this.getLoyaltyRedemptionRules()
    ]);

    // 1. Calculate Loyalty Redemption Discount from active rules
    const redemptionDiscount = this.calculateLoyaltyDiscount(billData.points_to_redeem, settings.loyalty, activeRedemptionRules);
    const totalDiscountApplied = billData.discount + redemptionDiscount;

    // 2. Calculate Subtotal after discount and optional GST
    const subtotalAfterDiscount = Math.max(0, billData.total - totalDiscountApplied);
    let gstAmount = 0;
    if (settings.billing.gst_enabled && Number(settings.billing.gst_rate) > 0) {
      gstAmount = Number(((subtotalAfterDiscount * Number(settings.billing.gst_rate)) / 100).toFixed(2));
    }
    const totalBeforeRounding = subtotalAfterDiscount + gstAmount;

    const { roundedTotal, roundingAdjustment } = this.calculateRounding(totalBeforeRounding, billData.rounding_method);

    // 3. Payments, Prior Balance & Advance Math
    let priorOutstanding = 0;
    const priorUnpaidBillsList: Array<{ id: string; due: number; bill: any }> = [];

    if (billData.customer_id) {
      const { data: priorUnpaid } = await supabase
        .from('bills')
        .select('*')
        .eq('customer_id', billData.customer_id)
        .order('created_at', { ascending: true });

      (priorUnpaid || []).forEach(pb => {
        const due = Math.max(0, Number(pb.grand_total || 0) - Number(pb.paid_total || 0));
        if (due > 0.01) {
          priorOutstanding += due;
          priorUnpaidBillsList.push({ id: pb.id, due, bill: pb });
        }
      });
    }

    const directPaid = billData.cash_paid + billData.upi_paid;
    const paidTotal = directPaid + billData.advance_used;
    const netDueForBill = roundedTotal - billData.advance_used;

    // Calculate overpayment beyond current bill
    const overpayment = Math.max(0, directPaid - netDueForBill);

    // Overpayments first clear customer's prior unpaid balance (Case 1 & Case 2)
    const allocatedToPriorBills = Math.min(priorOutstanding, overpayment);

    // Remaining overpayment after clearing prior outstanding is earned as advance (Case 2 & Scenario 3)
    const advanceEarned = overpayment - allocatedToPriorBills;

    const isFullyPaidAtCreation = paidTotal >= roundedTotal - 0.01;

    // 4. Dynamic Loyalty Earning Calculator (Awarded ONLY if bill is fully paid)
    let pointsEarned = 0;
    if (settings.loyalty.enabled && isFullyPaidAtCreation) {
      pointsEarned = await this.calculateLoyaltyPointsEarned(roundedTotal);
    }

    const payment_method: PaymentMethod = billData.upi_paid > billData.cash_paid ? 'UPI' : 'Cash';

    // 5. ATOMIC DATABASE SEQUENCE GENERATOR
    const bill_number = await this.getNextSequence('BILL');

    const { data: bill, error: billErr } = await supabase
      .from('bills')
      .insert([{
        bill_number,
        customer_id: billData.customer_id || null,
        total: billData.total,
        discount: totalDiscountApplied,
        gst_amount: gstAmount,
        rounding_method: billData.rounding_method,
        rounding_adjustment: roundingAdjustment,
        grand_total: roundedTotal,
        cash_paid: billData.cash_paid,
        upi_paid: billData.upi_paid,

        paid_total: paidTotal,
        advance_used: billData.advance_used,
        advance_earned: advanceEarned,
        payment_method,
        loyalty_points_earned: isFullyPaidAtCreation ? pointsEarned : 0,
        loyalty_points_redeemed: billData.points_to_redeem
      }])
      .select()
      .single();

    if (billErr) throw new Error(billErr.message);

    // 6. Insert Items
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

    // 7. Insert Payment Records per method used (Single Source of Truth)
    // Deduct amount allocated to prior bills so total payment inserted equals exact cash/UPI handed over
    const cashForCurrentBill = Math.max(0, billData.cash_paid - allocatedToPriorBills);
    const remainingAlloc = Math.max(0, allocatedToPriorBills - billData.cash_paid);
    const upiForCurrentBill = Math.max(0, billData.upi_paid - remainingAlloc);

    if (cashForCurrentBill > 0) {
      const pNum = await this.getNextSequence('PAYMENT');
      await supabase.from('payments').insert([{
        payment_number: pNum,
        customer_id: billData.customer_id || null,
        bill_id: bill.id,
        amount: cashForCurrentBill,
        payment_method: 'Cash',
        notes: `Initial Cash payment for ${bill.bill_number}`
      }]);
    }

    if (upiForCurrentBill > 0) {
      const pNum = await this.getNextSequence('PAYMENT');
      await supabase.from('payments').insert([{
        payment_number: pNum,
        customer_id: billData.customer_id || null,
        bill_id: bill.id,
        amount: upiForCurrentBill,
        payment_method: 'UPI',
        notes: `Initial UPI payment for ${bill.bill_number}`
      }]);
    }

    // Allocate payment surplus to clear customer's prior unpaid bills (Case 1 & Case 2)
    if (allocatedToPriorBills > 0 && billData.customer_id) {
      let remainingToAllocate = allocatedToPriorBills;
      for (const item of priorUnpaidBillsList) {
        if (remainingToAllocate <= 0) break;
        const alloc = Math.min(item.due, remainingToAllocate);
        remainingToAllocate -= alloc;

        const newPaidTotal = Number(item.bill.paid_total || 0) + alloc;
        const updateData: Record<string, number> = { paid_total: newPaidTotal };
        if (billData.cash_paid > 0 && billData.upi_paid > 0) {
          const cashRatio = billData.cash_paid / (billData.cash_paid + billData.upi_paid);
          updateData.cash_paid = Number(item.bill.cash_paid || 0) + (alloc * cashRatio);
          updateData.upi_paid = Number(item.bill.upi_paid || 0) + (alloc * (1 - cashRatio));
        } else if (billData.cash_paid > 0) {
          updateData.cash_paid = Number(item.bill.cash_paid || 0) + alloc;
        } else if (billData.upi_paid > 0) {
          updateData.upi_paid = Number(item.bill.upi_paid || 0) + alloc;
        }

        await supabase.from('bills').update(updateData).eq('id', item.id);

        const pNum = await this.getNextSequence('PAYMENT');
        await supabase.from('payments').insert([{
          payment_number: pNum,
          customer_id: billData.customer_id,
          bill_id: item.id,
          amount: alloc,
          payment_method: billData.upi_paid > billData.cash_paid ? 'UPI' : 'Cash',
          notes: `Automated payment allocation from Bill #${bill.bill_number}`
        }]);

        // Process loyalty point award if this prior bill has now become fully paid
        await this.processBillFullPaymentLoyalty(item.id);
      }
    }

    let customerName = 'N/A';
    let customerMobile: string | null = null;

    if (billData.customer_id) {
      // Record loyalty earn transaction ONLY if bill is fully paid
      if (isFullyPaidAtCreation && pointsEarned > 0) {
        const loySeq = await this.getNextSequence('LOYALTY');
        await supabase.from('loyalty_transactions').insert([{
          transaction_number: loySeq,
          customer_id: billData.customer_id,
          bill_id: bill.id,
          points: pointsEarned,
          type: 'EARN',
          notes: `Award Reason: Bill Fully Paid - ${bill.bill_number}`
        }]);
      }

      // Record loyalty redeem transaction
      if (billData.points_to_redeem > 0) {
        const loySeq = await this.getNextSequence('LOYALTY');
        await supabase.from('loyalty_transactions').insert([{
          transaction_number: loySeq,
          customer_id: billData.customer_id,
          bill_id: bill.id,
          points: billData.points_to_redeem,
          type: 'REDEEM',
          notes: `Loyalty points redeemed for ₹${redemptionDiscount} discount on bill ${bill.bill_number}`
        }]);
      }

      const { data: custInfo } = await supabase.from('customers').select('name, mobile, advance_balance, loyalty_points').eq('id', billData.customer_id).single();
      if (custInfo) {
        customerName = custInfo.name;
        customerMobile = custInfo.mobile || null;

        const newAdvance = Math.max(0, Number(custInfo.advance_balance || 0) - billData.advance_used + advanceEarned);
        const addedLoyalty = isFullyPaidAtCreation ? pointsEarned : 0;
        const newLoyalty = Math.max(0, Number(custInfo.loyalty_points || 0) - billData.points_to_redeem + addedLoyalty);

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
      new_value: JSON.stringify({ grand_total: roundedTotal, payment_method, pointsEarned, pointsRedeemed: billData.points_to_redeem, redemptionDiscount })
    });

    return {
      ...bill,
      customer_name: customerName,
      customer_mobile: customerMobile,
      items: billData.items
    };
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
      .select('*, customers(name, mobile, email)')
      .order('created_at', { ascending: false });

    if (error) return [];

    return (bills || []).map(b => ({
      ...b,
      customer_name: b.customers?.name || 'N/A',
      customer_mobile: b.customers?.mobile || null,
      customer_email: b.customers?.email || null
    }));
  }

  static async getBillsByDateRange(filter: DateFilterOption, customRange?: { from: string; to: string }): Promise<Bill[]> {
    if (!isSupabaseConfigured) {
      const allBills = await this.getBills();
      const { startDate, endDate } = this.getDateRangeBounds(filter, customRange);
      return allBills.filter(b => {
        const bTime = new Date(b.created_at).getTime();
        if (startDate && bTime < startDate.getTime()) return false;
        if (endDate && bTime > endDate.getTime()) return false;
        return true;
      });
    }

    const { startDate, endDate } = this.getDateRangeBounds(filter, customRange);

    let query = supabase
      .from('bills')
      .select('*, customers(name, mobile, email), bill_items(*)')
      .order('created_at', { ascending: false });

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }
    if (endDate) {
      query = query.lte('created_at', endDate.toISOString());
    }

    const { data: bills, error } = await query;
    if (error) return [];

    return (bills || []).map(b => ({
      ...b,
      customer_name: b.customers?.name || 'N/A',
      customer_mobile: b.customers?.mobile || null,
      customer_email: b.customers?.email || null,
      items: b.bill_items || []
    }));
  }

  static async getBillById(id: string): Promise<Bill | null> {
    if (!isSupabaseConfigured) return null;

    const { data: bill, error } = await supabase
      .from('bills')
      .select('*, customers(name, mobile, email)')
      .eq('id', id)
      .single();

    if (error || !bill) return null;

    const { data: items } = await supabase
      .from('bill_items')
      .select('*')
      .eq('bill_id', id);

    return {
      ...bill,
      customer_name: bill.customers?.name || 'N/A',
      customer_mobile: bill.customers?.mobile || null,
      customer_email: bill.customers?.email || null,
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
    pendingPoints: number;
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

    let pendingPoints = 0;
    for (const b of (bills || [])) {
      const due = Math.max(0, Number(b.grand_total || 0) - Number(b.paid_total || 0));
      if (due > 0.01) {
        const pts = await this.calculateLoyaltyPointsEarned(Number(b.grand_total || 0));
        pendingPoints += pts;
      }
    }

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

    const paymentBillIds = new Set((payments || []).map(p => p.bill_id).filter(Boolean));

    (bills || []).forEach(b => {
      const hasPaymentRecord = paymentBillIds.has(b.id);
      const directPaidForBill = hasPaymentRecord ? 0 : Math.max(0, Number(b.paid_total || 0) - Number(b.advance_used || 0));
      const effectivePaidOnBill = Number(b.advance_used || 0) + directPaidForBill;

      rawEvents.push({
        date: b.created_at,
        type: 'BILL',
        reference_no: b.bill_number,
        description: `Bill generated (${b.payment_method})`,
        bill_amount: Number(b.grand_total),
        paid_amount: effectivePaidOnBill,
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
      runningBalance: Math.max(0, balance),
      pendingPoints
    };
  }

  static async processBillFullPaymentLoyalty(billId: string): Promise<number> {
    if (!isSupabaseConfigured || !billId) return 0;

    const { data: bill, error } = await supabase.from('bills').select('*').eq('id', billId).single();
    if (error || !bill || !bill.customer_id) return 0;

    const settings = await this.getSettings();
    if (!settings.loyalty.enabled) return 0;

    // Prevent duplicate loyalty awards for the same bill
    const { data: existingEarnTx } = await supabase
      .from('loyalty_transactions')
      .select('id')
      .eq('bill_id', billId)
      .eq('type', 'EARN');

    if (existingEarnTx && existingEarnTx.length > 0) {
      return 0; // Already awarded!
    }

    // Determine total payments for this specific bill
    const { data: billPayments } = await supabase.from('payments').select('amount').eq('bill_id', billId);
    const directPaymentsSum = (billPayments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalPaidForBill = Number(bill.advance_used || 0) + Math.max(Number(bill.paid_total || 0) - Number(bill.advance_used || 0), directPaymentsSum);

    const isFullyPaid = totalPaidForBill >= Number(bill.grand_total || 0) - 0.01;

    if (!isFullyPaid) {
      return 0; // Bill is not fully paid yet
    }

    // Calculate points using active earning rules on grand_total
    const pointsEarned = await this.calculateLoyaltyPointsEarned(Number(bill.grand_total || 0));
    if (pointsEarned <= 0) return 0;

    // Insert EARN transaction record with reason: Bill Fully Paid
    const loySeq = await this.getNextSequence('LOYALTY');
    await supabase.from('loyalty_transactions').insert([{
      transaction_number: loySeq,
      customer_id: bill.customer_id,
      bill_id: billId,
      points: pointsEarned,
      type: 'EARN',
      created_at: bill.created_at || new Date().toISOString(),
      notes: `Award Reason: Bill Fully Paid - ${bill.bill_number}`
    }]);

    // Update bill record
    await supabase.from('bills').update({
      loyalty_points_earned: pointsEarned
    }).eq('id', billId);

    // Update customer loyalty points balance
    const { data: cust } = await supabase.from('customers').select('loyalty_points').eq('id', bill.customer_id).single();
    if (cust) {
      const currentPoints = Number(cust.loyalty_points || 0);
      await supabase.from('customers').update({
        loyalty_points: currentPoints + pointsEarned
      }).eq('id', bill.customer_id);
    }

    return pointsEarned;
  }

  static async reverseLoyaltyPointsForBill(billId: string, userName = 'Admin'): Promise<number> {
    if (!isSupabaseConfigured || !billId) return 0;

    const { data: bill } = await supabase.from('bills').select('*').eq('id', billId).single();
    if (!bill || !bill.customer_id) return 0;

    const { data: earnTxs } = await supabase
      .from('loyalty_transactions')
      .select('*')
      .eq('bill_id', billId)
      .eq('type', 'EARN');

    if (!earnTxs || earnTxs.length === 0) return 0;

    let totalPointsToReverse = 0;
    for (const tx of earnTxs) {
      totalPointsToReverse += Number(tx.points || 0);
    }

    if (totalPointsToReverse > 0) {
      const loySeq = await this.getNextSequence('LOYALTY');
      await supabase.from('loyalty_transactions').insert([{
        transaction_number: loySeq,
        customer_id: bill.customer_id,
        bill_id: billId,
        points: -totalPointsToReverse,
        type: 'ADJUST',
        notes: `Loyalty Reversal: Bill Cancelled/Refunded (${bill.bill_number})`
      }]);

      const { data: cust } = await supabase.from('customers').select('loyalty_points').eq('id', bill.customer_id).single();
      if (cust) {
        const currentPoints = Number(cust.loyalty_points || 0);
        await supabase.from('customers').update({
          loyalty_points: Math.max(0, currentPoints - totalPointsToReverse)
        }).eq('id', bill.customer_id);
      }

      await this.logAudit({
        user_name: userName,
        action: 'REVERSE_LOYALTY_POINTS',
        entity: `Bill ${bill.bill_number}`,
        new_value: `Reversed ${totalPointsToReverse} loyalty points due to cancellation/refund`
      });
    }

    return totalPointsToReverse;
  }

  static async getBillFinancialSummary(bill: Bill): Promise<BillFinancialSummary> {
    const defaultSummary: BillFinancialSummary = {
      previous_outstanding: 0,
      previous_advance: 0,
      current_bill_amount: Number(bill.grand_total || 0),
      total_amount_due: Number(bill.grand_total || 0),
      cash_paid: Number(bill.cash_paid || 0),
      upi_paid: Number(bill.upi_paid || 0),

      advance_used: Number(bill.advance_used || 0),
      total_paid: Number(bill.paid_total || 0),
      remaining_balance: Math.max(0, Number(bill.grand_total || 0) - Number(bill.paid_total || 0)),
      remaining_advance_balance: Number(bill.advance_earned || 0),
      payment_status: (Number(bill.paid_total || 0) >= Number(bill.grand_total || 0) - 0.01) 
        ? 'Fully Paid' 
        : (Number(bill.paid_total || 0) > 0.01 ? 'Partially Paid' : 'Payment Pending')
    };

    if (!bill.customer_id || !isSupabaseConfigured) {
      return defaultSummary;
    }

    try {
      const [settings, { data: customer }, { data: allCustBills }, { data: allCustPayments }, { data: allCustLoyalty }] = await Promise.all([
        this.getSettings(),
        supabase.from('customers').select('*').eq('id', bill.customer_id).single(),
        supabase.from('bills').select('*').eq('customer_id', bill.customer_id).order('created_at', { ascending: true }),
        supabase.from('payments').select('*').eq('customer_id', bill.customer_id).order('created_at', { ascending: true }),
        supabase.from('loyalty_transactions').select('*').eq('customer_id', bill.customer_id).order('created_at', { ascending: true })
      ]);

      if (!customer) return defaultSummary;

      // Index-based partitioning: find current bill's position in customer's bill history
      const billList = allCustBills || [];
      const billIndex = billList.findIndex(b => b.id === bill.id);
      const priorBills = billIndex > 0 ? billList.slice(0, billIndex) : (billIndex === -1 ? billList.filter(b => b.created_at < (bill.created_at || '')) : []);

      const priorBillIds = new Set(priorBills.map(b => b.id));
      const billTimestamp = new Date(bill.created_at || Date.now()).getTime();

      const priorPayments = (allCustPayments || []).filter(p => {
        if (p.bill_id === bill.id) return false;
        if (p.bill_id && priorBillIds.has(p.bill_id)) return true;
        const pTime = new Date(p.created_at).getTime();
        return pTime <= billTimestamp;
      });

      const priorLoyalty = (allCustLoyalty || []).filter(lt => {
        if (lt.bill_id === bill.id) return false;
        if (lt.bill_id && priorBillIds.has(lt.bill_id)) return true;
        const ltTime = new Date(lt.created_at).getTime();
        return ltTime <= billTimestamp;
      });

      let priorTotalBilled = 0;
      let priorTotalPaid = 0;

      const priorPaymentBillIds = new Set((priorPayments || []).map(p => p.bill_id).filter(Boolean));

      priorBills.forEach(b => {
        priorTotalBilled += Number(b.grand_total || 0);
        const hasPaymentRec = priorPaymentBillIds.has(b.id);
        const directPaid = hasPaymentRec ? 0 : Math.max(0, Number(b.paid_total || 0) - Number(b.advance_used || 0));
        priorTotalPaid += Number(b.advance_used || 0) + directPaid;
      });

      priorPayments.forEach(p => {
        priorTotalPaid += Number(p.amount || 0);
      });

      const previous_outstanding = Math.max(0, priorTotalBilled - priorTotalPaid);

      const currentAdvBalance = Number(customer.advance_balance || 0);
      const advance_used = Number(bill.advance_used || 0);
      const advance_earned = Number(bill.advance_earned || 0);
      const previous_advance = Math.max(0, currentAdvBalance + advance_used - advance_earned);

      const current_bill_amount = Number(bill.grand_total || 0);
      const total_amount_due = previous_outstanding + current_bill_amount;

      const cash_paid = Number(bill.cash_paid || 0);
      const upi_paid = Number(bill.upi_paid || 0);
      const total_paid = Number(bill.paid_total || (cash_paid + upi_paid + advance_used));

      const remaining_balance = Math.max(0, total_amount_due - total_paid);
      const remaining_advance_balance = Math.max(0, previous_advance - advance_used + advance_earned);

      const bill_remaining = Math.max(0, current_bill_amount - total_paid);
      const isFullyPaid = bill_remaining <= 0.01;
      const isPartiallyPaid = !isFullyPaid && total_paid > 0.01;
      const payment_status = isFullyPaid 
        ? 'Fully Paid' 
        : (isPartiallyPaid ? 'Partially Paid' : 'Payment Pending');

      let loyaltySummary: BillFinancialSummary['loyalty'] = undefined;
      if (settings?.loyalty?.enabled) {
        // Query if an EARN transaction exists for this bill
        const { data: earnTx } = await supabase
          .from('loyalty_transactions')
          .select('*')
          .eq('bill_id', bill.id)
          .eq('type', 'EARN')
          .maybeSingle();

        const is_fully_paid = bill_remaining <= 0.01;
        const points_awarded = !!earnTx;

        let previous_points = 0;
        (priorLoyalty || []).forEach(lt => {
          if (lt.bill_id !== bill.id) {
            if (lt.type === 'REDEEM') {
              previous_points -= Math.abs(Number(lt.points || 0));
            } else {
              previous_points += Number(lt.points || 0);
            }
          }
        });
        previous_points = Math.max(0, previous_points);

        const calculatedEarned = await this.calculateLoyaltyPointsEarned(current_bill_amount);
        const points_earned = earnTx ? Number(earnTx.points) : calculatedEarned;
        const points_redeemed = Number(bill.loyalty_points_redeemed || 0);
        const points_added = (is_fully_paid || points_awarded) ? points_earned : 0;
        const current_points_balance = Math.max(0, previous_points + points_added - points_redeemed);

        const message = is_fully_paid
          ? `🎁 Loyalty Earned: +${points_earned} Points`
          : `⏳ Loyalty Points will be credited after this bill is fully paid.`;

        loyaltySummary = {
          enabled: true,
          is_fully_paid,
          points_awarded,
          points_earned,
          points_redeemed,
          previous_points,
          current_points_balance,
          message
        };
      }

      return {
        previous_outstanding,
        previous_advance,
        current_bill_amount,
        total_amount_due,
        cash_paid,
        upi_paid,

        advance_used,
        total_paid,
        remaining_balance,
        remaining_advance_balance,
        payment_status,
        loyalty: loyaltySummary
      };
    } catch (err) {
      console.error('Error computing bill financial summary:', err);
      return defaultSummary;
    }
  }

  static async recordCustomerPayment(payment: {
    customer_id: string;
    amount: number;
    payment_method: string;
    bill_id?: string;
    notes?: string;
  }, userName = 'Admin'): Promise<Payment> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const payment_number = await this.getNextSequence('PAYMENT');

    const { data, error } = await supabase
      .from('payments')
      .insert([{
        payment_number,
        customer_id: payment.customer_id,
        bill_id: payment.bill_id || null,
        amount: payment.amount,
        payment_method: payment.payment_method,
        notes: payment.notes || null
      }])
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Update Bill paid_total and payment_status with FIFO logic
    if (payment.bill_id) {
      // 1. Direct payment for a specific bill
      const { data: bill } = await supabase.from('bills').select('*').eq('id', payment.bill_id).single();
      if (bill) {
        const currentPaid = Number(bill.paid_total || 0);
        const newPaidTotal = currentPaid + payment.amount;

        const updateData: Record<string, number> = {
          paid_total: newPaidTotal
        };

        if (payment.payment_method === 'Cash') {
          updateData.cash_paid = Number(bill.cash_paid || 0) + payment.amount;
        } else if (payment.payment_method === 'UPI') {
          updateData.upi_paid = Number(bill.upi_paid || 0) + payment.amount;

        }

        await supabase.from('bills').update(updateData).eq('id', payment.bill_id);
        await this.processBillFullPaymentLoyalty(payment.bill_id);
      }
    } else {
      // 2. Customer-level payment: Apply FIFO to unpaid bills (oldest created_at first)
      const { data: custBills } = await supabase
        .from('bills')
        .select('*')
        .eq('customer_id', payment.customer_id)
        .order('created_at', { ascending: true });

      let unallocatedAmount = payment.amount;

      if (custBills && custBills.length > 0) {
        for (const b of custBills) {
          if (unallocatedAmount <= 0) break;

          const grandTotal = Number(b.grand_total || 0);
          const paidTotal = Number(b.paid_total || 0);
          const remainingBillBalance = Math.max(0, grandTotal - paidTotal);

          if (remainingBillBalance > 0) {
            const allocation = Math.min(remainingBillBalance, unallocatedAmount);
            const newPaidTotal = paidTotal + allocation;
            unallocatedAmount -= allocation;

            const updateData: Record<string, number> = {
              paid_total: newPaidTotal
            };

            if (payment.payment_method === 'Cash') {
              updateData.cash_paid = Number(b.cash_paid || 0) + allocation;
            } else if (payment.payment_method === 'UPI') {
              updateData.upi_paid = Number(b.upi_paid || 0) + allocation;

            }

            await supabase.from('bills').update(updateData).eq('id', b.id);

            if (!data.bill_id) {
              await supabase.from('payments').update({ bill_id: b.id }).eq('id', data.id);
            }

            await this.processBillFullPaymentLoyalty(b.id);
          }
        }
      }

      // If there is still leftover payment after clearing all bills, credit to customer's advance_balance
      if (unallocatedAmount > 0) {
        const { data: cust } = await supabase.from('customers').select('advance_balance').eq('id', payment.customer_id).single();
        if (cust) {
          const currentAdvance = Number(cust.advance_balance || 0);
          await supabase.from('customers').update({
            advance_balance: currentAdvance + unallocatedAmount
          }).eq('id', payment.customer_id);
        }
      }
    }

    await this.logAudit({
      user_name: userName,
      action: 'RECORD_PAYMENT',
      entity: `Payment ${payment_number} (₹${payment.amount})`,
      new_value: JSON.stringify(data)
    });

    return data;
  }

  static async getPayments(): Promise<Payment[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from('payments')
      .select('*, customers(name, mobile)')
      .order('created_at', { ascending: false });

    if (error) return [];
    return (data || []).map((p: any) => ({
      ...p,
      customer_name: p.customers?.name || undefined,
      customer_mobile: p.customers?.mobile || undefined
    }));
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
      total_amount_collected: 0,
      outstanding_amount: 0,
      customer_advance_balance: 0,
      payment_method_breakdown: [
        { method: 'Cash', amount: 0 },
        { method: 'UPI', amount: 0 },

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
    // Calculate outstanding balance for bills generated within the selected date period
    const pending_balance = allBills.reduce((sum, b) => sum + Math.max(0, Number(b.grand_total || 0) - Number(b.paid_total || 0)), 0);

    // ── PRIMARY formula (unchanged): sum of denormalized advance_balance stored on each customer row
    const total_advance = customers.reduce((sum, c) => sum + Number(c.advance_balance || 0), 0);

    // ── SECONDARY VALIDATION formula: reconstruct advance balance from raw transaction history.
    //    Advance balance = (payments credited to customer with no bill attached)
    //                    + SUM(bills.advance_earned)   ← overpayments credited as advance
    //                    − SUM(bills.advance_used)     ← advance drawn down against bills
    //    This is intentionally computed from ALL historical records (no date filter) because
    //    advance_balance is a cumulative running total, not a period-scoped metric.
    try {
      const [{ data: allTimeBills }, { data: allTimePayments }] = await Promise.all([
        supabase.from('bills').select('advance_used, advance_earned, customer_id'),
        supabase.from('payments').select('amount, bill_id, customer_id'),
      ]);

      const allTimeBillsData   = allTimeBills   || [];
      const allTimePaymentsData = allTimePayments || [];

      // Unallocated payments: payments that are not linked to any specific bill
      const unallocatedPaymentsTotal = allTimePaymentsData
        .filter(p => !p.bill_id)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const totalAdvanceEarned = allTimeBillsData
        .reduce((sum, b) => sum + Number(b.advance_earned || 0), 0);

      const totalAdvanceUsed = allTimeBillsData
        .reduce((sum, b) => sum + Number(b.advance_used || 0), 0);

      const total_advance_secondary = unallocatedPaymentsTotal + totalAdvanceEarned - totalAdvanceUsed;

      // Compare and warn if the two formulas diverge by more than ₹0.01
      const discrepancy = Math.abs(total_advance - total_advance_secondary);
      if (discrepancy > 0.01) {
        console.warn(
          `[AdvanceBalance Validation] DISCREPANCY DETECTED!\n` +
          `  Primary   (customers.advance_balance sum): ₹${total_advance.toFixed(2)}\n` +
          `  Secondary (transaction reconstruction):    ₹${total_advance_secondary.toFixed(2)}\n` +
          `  Difference: ₹${discrepancy.toFixed(2)}\n` +
          `  Breakdown — Unallocated payments: ₹${unallocatedPaymentsTotal.toFixed(2)}, ` +
          `Advance earned: ₹${totalAdvanceEarned.toFixed(2)}, ` +
          `Advance used: ₹${totalAdvanceUsed.toFixed(2)}`
        );
      } else {
        console.debug(
          `[AdvanceBalance Validation] ✓ Verified — ` +
          `Primary ₹${total_advance.toFixed(2)} matches Secondary ₹${total_advance_secondary.toFixed(2)} ` +
          `(Δ ₹${discrepancy.toFixed(2)})`
        );
      }
    } catch (validationErr) {
      console.warn('[AdvanceBalance Validation] Could not run secondary check:', validationErr);
    }

    let cashCollected = 0;
    let upiCollected = 0;

    const billsWithPaymentRecords = new Set<string>();

    // Primary Single Source of Truth: Sum from payment records
    allPayments.forEach(p => {
      if (p.bill_id) billsWithPaymentRecords.add(p.bill_id);

      const amt = Number(p.amount || 0);
      if (p.payment_method === 'Cash') cashCollected += amt;
      else if (p.payment_method === 'UPI') upiCollected += amt;
    });

    // Fallback for bills without payment records to ensure backward compatibility without duplication
    allBills.forEach(b => {
      const c = Number(b.cash_paid || 0);
      const u = Number(b.upi_paid || 0);

      if (!billsWithPaymentRecords.has(b.id)) {
        cashCollected += c;
        upiCollected += u;
      }
    });

    const totalAmountCollected = cashCollected + upiCollected;
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
      total_amount_collected: totalAmountCollected,
      outstanding_amount: pending_balance,
      customer_advance_balance: total_advance,
      payment_method_breakdown: [
        { method: 'Cash', amount: cashCollected },
        { method: 'UPI', amount: upiCollected },
        { method: 'Total Collected', amount: totalAmountCollected }
      ],
      daily_collection_trend: [],
      monthly_collection_trend: []
    };

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
      { name: 'UPI', value: upiCollected }
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

  static getDateRangeBounds(filter: DateFilterOption, customRange?: { from: string; to: string }): {
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
  static generateWhatsAppTextReceipt(bill: Bill, financialSummary?: BillFinancialSummary): string {
    const formattedDate = new Date(bill.created_at || Date.now()).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    const itemsText = (bill.items || []).map((item, idx) => 
      `${idx + 1}. ${item.product_name}\n   Qty : ${item.quantity} × ₹${item.price.toFixed(2)} = ₹${item.total.toFixed(2)}`
    ).join('\n\n');

    const isFullyPaidFallback = Math.max(0, Number(bill.grand_total || 0) - Number(bill.paid_total || 0)) === 0;
    const ptsEarnedFallback = Number(bill.loyalty_points_earned || 0);

    const summary: BillFinancialSummary = financialSummary || bill.financial_summary || {
      previous_outstanding: 0,
      previous_advance: 0,
      current_bill_amount: Number(bill.grand_total || 0),
      total_amount_due: Number(bill.grand_total || 0),
      cash_paid: Number(bill.cash_paid || 0),
      upi_paid: Number(bill.upi_paid || 0),
      advance_used: Number(bill.advance_used || 0),
      total_paid: Number(bill.paid_total || 0),
      remaining_balance: Math.max(0, Number(bill.grand_total || 0) - Number(bill.paid_total || 0)),
      remaining_advance_balance: Number(bill.advance_earned || 0),
      payment_status: isFullyPaidFallback ? 'Fully Paid' : 'Payment Pending',
      loyalty: ptsEarnedFallback > 0 ? {
        enabled: true,
        is_fully_paid: isFullyPaidFallback,
        points_awarded: isFullyPaidFallback,
        previous_points: 0,
        points_earned: ptsEarnedFallback,
        points_redeemed: Number(bill.loyalty_points_redeemed || 0),
        current_points_balance: ptsEarnedFallback,
        message: isFullyPaidFallback ? `🎁 Loyalty Earned: +${ptsEarnedFallback} Points` : `⏳ Loyalty Points will be credited after this bill is fully paid.`
      } : undefined
    };

    const statusBadge = summary.payment_status === 'Fully Paid'
      ? 'Status : Fully Paid ✅'
      : summary.payment_status === 'Partially Paid'
      ? `Status : Partially Paid ℹ️ (Remaining: ₹${summary.remaining_balance.toFixed(2)})`
      : `Status : Payment Pending ⚠️ (Remaining: ₹${summary.remaining_balance.toFixed(2)})`;

    const currentBillDue = Math.max(0, summary.current_bill_amount - summary.total_paid);

    let text = `🧾 *PRINTPRO ERP*

🏪 *ABC PRINTING CENTER*

Bill No : ${bill.bill_number}
Date : ${formattedDate}
Customer : ${bill.customer_name || 'N/A'}

━━━━━━━━━━━━━━━━━━━━━━
*ITEMS*

${itemsText}

━━━━━━━━━━━━━━━━━━━━━━
Subtotal : ₹${Number(bill.total || 0).toFixed(2)}
Discount : ₹${Number(bill.discount || 0).toFixed(2)}
Rounding : ${Number(bill.rounding_adjustment || 0) >= 0 ? '+' : ''}₹${Number(bill.rounding_adjustment || 0).toFixed(2)}
🧾 *Current Bill Total* : ₹${Number(bill.grand_total || 0).toFixed(2)}

━━━━━━━━━━━━━━━━━━━━━━
*CUSTOMER ACCOUNT SUMMARY*

Previous Outstanding : ₹${summary.previous_outstanding.toFixed(2)}
Previous Advance : ₹${summary.previous_advance.toFixed(2)}
Current Bill Amount : ₹${summary.current_bill_amount.toFixed(2)}
*Total Amount Due* : ₹${summary.total_amount_due.toFixed(2)}

━━━━━━━━━━━━━━━━━━━━━━
*PAYMENT SUMMARY*

Cash Paid : ₹${summary.cash_paid.toFixed(2)}
UPI Paid : ₹${summary.upi_paid.toFixed(2)}
Advance Used : ₹${summary.advance_used.toFixed(2)}
*Total Paid* : ₹${summary.total_paid.toFixed(2)}

━━━━━━━━━━━━━━━━━━━━━━
*BALANCE SUMMARY*

Current Bill Due : ₹${currentBillDue.toFixed(2)} (${summary.payment_status})
Net Account Balance Due : ₹${summary.remaining_balance.toFixed(2)}
Customer Advance Balance : ₹${summary.remaining_advance_balance.toFixed(2)}
${statusBadge}`;

    if (summary.loyalty && summary.loyalty.enabled) {
      if (summary.remaining_balance === 0 || summary.loyalty.is_fully_paid) {
        text += `\n\n━━━━━━━━━━━━━━━━━━━━━━
🎁 *Loyalty Earned:* +${summary.loyalty.points_earned} Points

Previous Points : ${summary.loyalty.previous_points} pts
Points Redeemed : -${summary.loyalty.points_redeemed} pts
*Current Loyalty Balance* : ${summary.loyalty.current_points_balance} pts`;
      } else {
        text += `\n\n━━━━━━━━━━━━━━━━━━━━━━
⏳ *Loyalty Points:* Will be credited after this bill is fully paid.`;
      }
    }

    text += `\n\nThank you for visiting.\nPowered by PrintPro ERP`;

    return text;
  }
}
