import { supabase, isSupabaseConfigured } from '../supabase/client';
import { Customer, Product, Bill, BillItem, Payment, Expense, CustomerLedgerEntry, CustomerSummary, DashboardStats } from '../types';

export class ApiService {

  // --- PRODUCTS ---
  static async getProducts(): Promise<Product[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });
    
    if (error) {
      console.error('Error fetching products:', error);
      throw new Error(error.message);
    }
    return data || [];
  }

  static async addProduct(product: Omit<Product, 'id' | 'created_at'>): Promise<Product> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local');
    }
    const { data, error } = await supabase
      .from('products')
      .insert([product])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async updateProduct(id: string, product: Partial<Omit<Product, 'id' | 'created_at'>>): Promise<Product> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const { data, error } = await supabase
      .from('products')
      .update(product)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async deleteProduct(id: string): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  }

  // --- CUSTOMERS ---
  static async getCustomers(): Promise<Customer[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching customers:', error);
      throw new Error(error.message);
    }
    return data || [];
  }

  static async addCustomer(customer: { name: string; mobile?: string }): Promise<Customer> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const { data, error } = await supabase
      .from('customers')
      .insert([{ name: customer.name, mobile: customer.mobile || null }])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async updateCustomer(id: string, customer: { name: string; mobile?: string }): Promise<Customer> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const { data, error } = await supabase
      .from('customers')
      .update({ name: customer.name, mobile: customer.mobile || null })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async getCustomerSummaries(): Promise<CustomerSummary[]> {
    if (!isSupabaseConfigured) return [];
    
    // Fetch customers, bills, and payments
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
        name: cust.name,
        mobile: cust.mobile,
        total_billed: totalBilled,
        total_paid: totalPaid,
        balance_due: totalBilled - totalPaid,
        created_at: cust.created_at
      };
    });
  }

  // --- BILLING & BILLS ---
  static async createBill(billData: {
    customer_id?: string | null;
    total: number;
    discount: number;
    grand_total: number;
    paid_amount: number;
    payment_method: 'Cash' | 'UPI' | 'Card';
    items: {
      product_id?: string | null;
      product_name: string;
      quantity: number;
      price: number;
      total: number;
    }[];
  }): Promise<Bill> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');

    // Generate bill number fallback if trigger is not configured
    const timestamp = Date.now().toString().slice(-6);
    const bill_number = `BILL-${timestamp}`;

    const { data: bill, error: billErr } = await supabase
      .from('bills')
      .insert([{
        bill_number,
        customer_id: billData.customer_id || null,
        total: billData.total,
        discount: billData.discount,
        grand_total: billData.grand_total,
        paid_amount: billData.paid_amount,
        payment_method: billData.payment_method
      }])
      .select()
      .single();

    if (billErr) throw new Error(billErr.message);

    // Insert bill items
    const itemsToInsert = billData.items.map(item => ({
      bill_id: bill.id,
      product_id: item.product_id || null,
      product_name: item.product_name,
      quantity: item.quantity,
      price: item.price,
      total: item.total
    }));

    const { error: itemsErr } = await supabase
      .from('bill_items')
      .insert(itemsToInsert);

    if (itemsErr) throw new Error(itemsErr.message);

    // If initial payment was made by registered customer, record payment entry into ledger
    if (billData.customer_id && billData.paid_amount > 0) {
      await supabase.from('payments').insert([{
        customer_id: billData.customer_id,
        bill_id: bill.id,
        amount: billData.paid_amount,
        payment_method: billData.payment_method,
        notes: `Bill payment for ${bill.bill_number}`
      }]);
    }

    return {
      ...bill,
      items: billData.items
    };
  }

  static async getBills(): Promise<Bill[]> {
    if (!isSupabaseConfigured) return [];
    
    const { data: bills, error } = await supabase
      .from('bills')
      .select('*, customers(name)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching bills:', error);
      return [];
    }

    return (bills || []).map(b => ({
      ...b,
      customer_name: b.customers?.name || 'Walk-in Customer'
    }));
  }

  static async getBillById(id: string): Promise<Bill | null> {
    if (!isSupabaseConfigured) return null;

    const { data: bill, error } = await supabase
      .from('bills')
      .select('*, customers(name)')
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
    if (!isSupabaseConfigured) {
      throw new Error('Supabase not configured');
    }

    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();

    if (custErr || !customer) throw new Error('Customer not found');

    const { data: bills } = await supabase
      .from('bills')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true });

    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true });

    // Combine & sort by date ascending to calculate running balance
    const rawEvents: {
      date: string;
      type: 'BILL' | 'PAYMENT';
      reference_no: string;
      description: string;
      bill_amount: number;
      paid_amount: number;
    }[] = [];

    (bills || []).forEach(b => {
      rawEvents.push({
        date: b.created_at,
        type: 'BILL',
        reference_no: b.bill_number,
        description: `Bill generated (${b.payment_method})`,
        bill_amount: Number(b.grand_total),
        paid_amount: 0
      });
    });

    (payments || []).forEach(p => {
      rawEvents.push({
        date: p.created_at,
        type: 'PAYMENT',
        reference_no: `PAY-${p.id.slice(0, 6).toUpperCase()}`,
        description: p.notes || `Payment received via ${p.payment_method}`,
        bill_amount: 0,
        paid_amount: Number(p.amount)
      });
    });

    // Sort chronologically
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
    payment_method: 'Cash' | 'UPI' | 'Card';
    notes?: string;
  }): Promise<Payment> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const { data, error } = await supabase
      .from('payments')
      .insert([{
        customer_id: payment.customer_id,
        amount: payment.amount,
        payment_method: payment.payment_method,
        notes: payment.notes || null
      }])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  // --- EXPENSES ---
  static async getExpenses(): Promise<Expense[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching expenses:', error);
      return [];
    }
    return data || [];
  }

  static async addExpense(expense: { title: string; amount: number; category: 'Shop Expense' | 'Electricity' | 'Rent' | 'Other Expense' }): Promise<Expense> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const { data, error } = await supabase
      .from('expenses')
      .insert([expense])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async deleteExpense(id: string): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  }

  // --- DASHBOARD & METRICS ---
  static async getDashboardStats(): Promise<DashboardStats> {
    if (!isSupabaseConfigured) {
      return {
        todays_sales: 0,
        todays_bills_count: 0,
        pending_balance: 0,
        total_customers: 0,
        total_income: 0,
        total_expense: 0,
        net_profit: 0
      };
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Today's bills
    const { data: todayBills } = await supabase
      .from('bills')
      .select('grand_total')
      .gte('created_at', todayStart.toISOString());

    const todays_sales = (todayBills || []).reduce((sum, b) => sum + Number(b.grand_total), 0);
    const todays_bills_count = (todayBills || []).length;

    // Customers count & Due calculation
    const customers = await this.getCustomerSummaries();
    const total_customers = customers.length;
    const pending_balance = customers.reduce((sum, c) => sum + Math.max(0, c.balance_due), 0);

    // Income & Expenses
    const { data: allBills } = await supabase.from('bills').select('grand_total');
    const { data: allPayments } = await supabase.from('payments').select('amount');
    const { data: allExpenses } = await supabase.from('expenses').select('amount');

    // Total income calculation (Direct bill sales + received payments)
    const total_income = (allBills || []).reduce((sum, b) => sum + Number(b.grand_total), 0);
    const total_expense = (allExpenses || []).reduce((sum, e) => sum + Number(e.amount), 0);
    const net_profit = total_income - total_expense;

    return {
      todays_sales,
      todays_bills_count,
      pending_balance,
      total_customers,
      total_income,
      total_expense,
      net_profit
    };
  }
}
