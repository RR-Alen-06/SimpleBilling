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
  PaymentMethod,
  ProductSalesAnalytics,
  ProductSalesHistoryItem,
  CustomerStatementData,
  CustomerStatementBill,
  CustomerStatementBillItem,
  CustomerStatementDateGroup,
  CustomItemAnalytics,
  ShopSettings
} from '../types';

export const DEFAULT_SETTINGS: AllSettings = {
  shop: {
    shop_name: 'PrintPro Store',
    address: '',
    phone: '',
    email: '',
    gst_number: '',
    logo_url: '',
    footer_message: 'Thank you for your business!'
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
    calculation_mode: 'rate',
    earn_points: 1,
    earn_spend_unit: 10,
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
  },
  expenses: {
    categories: [
      'Shop Expense',
      'Electricity',
      'Rent',
      'Paper Stock & Rolls',
      'Toner & Cartridges',
      'Machine Maintenance',
      'Staff Wages',
      'Other Expense'
    ],
    default_payment_mode: 'Cash'
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
    if (!isSupabaseConfigured) {
      return [];
    }

    const { data, error } = await supabase
      .from('loyalty_redemption_rules')
      .select('*')
      .order('points_required', { ascending: true });

    if (error) {
      console.error('Error fetching loyalty redemption rules:', error);
      return [];
    }

    if (!data || data.length === 0) return [];

    // Auto-deduplicate by points_required (keep one, collect duplicates to delete)
    const seen = new Set<number>();
    const uniqueRules: LoyaltyRedemptionRule[] = [];
    const duplicateIdsToDelete: string[] = [];

    for (const rule of data) {
      if (!seen.has(rule.points_required)) {
        seen.add(rule.points_required);
        uniqueRules.push(rule);
      } else {
        duplicateIdsToDelete.push(rule.id);
      }
    }

    // Auto-purge duplicates from database
    if (duplicateIdsToDelete.length > 0) {
      supabase.from('loyalty_redemption_rules').delete().in('id', duplicateIdsToDelete).then();
    }

    return uniqueRules;
  }

  static async clearAllLoyaltyRedemptionRules(userName = 'Super Admin'): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const { error } = await supabase.from('loyalty_redemption_rules').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw new Error(error.message);

    await this.logAudit({
      user_name: userName,
      action: 'CLEAR_ALL_LOYALTY_REDEMPTION_RULES',
      entity: 'All Redemption Rules'
    });
  }

  static async addLoyaltyRedemptionRule(rule: Omit<LoyaltyRedemptionRule, 'id' | 'created_at'>, userName = 'Super Admin'): Promise<LoyaltyRedemptionRule> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');

    // Prevent duplicate points_required rules
    const { data: existing } = await supabase
      .from('loyalty_redemption_rules')
      .select('id, points_required')
      .eq('points_required', rule.points_required)
      .maybeSingle();

    if (existing) {
      throw new Error(`A redemption rule for ${rule.points_required} Points already exists. Please edit the existing rule.`);
    }

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
    if (pointsToRedeem <= 0 || !loyaltySettings?.enabled) return 0;

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

    if (loyaltySettings.points_required > 0 && loyaltySettings.discount_value > 0) {
      const ratePerPoint = loyaltySettings.discount_value / loyaltySettings.points_required;
      return Number((pointsToRedeem * ratePerPoint).toFixed(2));
    }

    return 0;
  }

  // --- SIMPLIFIED DYNAMIC LOYALTY EARNING RULES ---
  static async getLoyaltyRules(): Promise<LoyaltyRule[]> {
    if (!isSupabaseConfigured) {
      return [];
    }

    const { data, error } = await supabase.from('loyalty_rules').select('*').order('sort_order', { ascending: true });
    if (error) {
      console.error('Error fetching loyalty rules:', error);
      return [];
    }

    if (!data || data.length === 0) return [];

    // Auto-deduplicate by rule_name
    const seen = new Set<string>();
    const uniqueRules: LoyaltyRule[] = [];
    const duplicateIdsToDelete: string[] = [];

    for (const rule of data) {
      const normalizedName = rule.rule_name.trim().toLowerCase();
      if (!seen.has(normalizedName)) {
        seen.add(normalizedName);
        uniqueRules.push(rule);
      } else {
        duplicateIdsToDelete.push(rule.id);
      }
    }

    // Auto-purge duplicates from database
    if (duplicateIdsToDelete.length > 0) {
      supabase.from('loyalty_rules').delete().in('id', duplicateIdsToDelete).then();
    }

    return uniqueRules;
  }

  static async clearAllLoyaltyRules(userName = 'Super Admin'): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const { error } = await supabase.from('loyalty_rules').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw new Error(error.message);

    await this.logAudit({
      user_name: userName,
      action: 'CLEAR_ALL_LOYALTY_RULES',
      entity: 'All Earning Rules'
    });
  }

  static async addLoyaltyRule(rule: Omit<LoyaltyRule, 'id' | 'created_at'>, userName = 'Super Admin'): Promise<LoyaltyRule> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');

    const { data: existing } = await supabase
      .from('loyalty_rules')
      .select('id, rule_name')
      .ilike('rule_name', rule.rule_name)
      .maybeSingle();

    if (existing) {
      throw new Error(`A loyalty rule named "${rule.rule_name}" already exists. Please choose a different name.`);
    }

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
    if (billAmount <= 0) return 0;
    
    const settings = await this.getSettings();
    if (settings.loyalty && settings.loyalty.enabled === false) {
      return 0;
    }

    // 1. PRIMARY: Check and evaluate active database rules in loyalty_rules table
    const rules = await this.getLoyaltyRules();
    const activeRules = rules.filter(r => r.enabled);

    if (activeRules.length > 0) {
      // Sort rules by min_bill_amount descending to match the highest qualified tier first
      const sortedRules = [...activeRules].sort((a, b) => {
        const minA = Number(a.min_bill_amount || 0);
        const minB = Number(b.min_bill_amount || 0);
        if (minB !== minA) return minB - minA;
        return (a.sort_order || 0) - (b.sort_order || 0);
      });

      for (const rule of sortedRules) {
        const min = Number(rule.min_bill_amount || 0);
        const hasMax = rule.max_bill_amount !== null && rule.max_bill_amount !== undefined && Number(rule.max_bill_amount) > 0;
        const max = hasMax ? Number(rule.max_bill_amount) : Infinity;

        if (billAmount >= min && billAmount <= max) {
          return Number(rule.points_earned);
        }
      }
    }

    // 2. FALLBACK: Rate-based calculation if no database rules matched or table is empty
    const earnPoints = Number(settings.loyalty?.earn_points ?? 1);
    const spendUnit = Number(settings.loyalty?.earn_spend_unit ?? 10);
    if (spendUnit > 0) {
      const earned = Math.floor(billAmount / spendUnit) * earnPoints;
      return Math.max(0, earned);
    }

    return 0;
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

  static async getProductById(id: string): Promise<Product | null> {
    if (!isSupabaseConfigured) return null;
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) return null;
    return data;
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

    const { data: bills } = await supabase.from('bills').select('customer_id, grand_total, paid_total');
    const { data: payments } = await supabase.from('payments').select('customer_id, amount, bill_id');

    return customers.map(cust => {
      const custBills = bills?.filter(b => b.customer_id === cust.id) || [];
      const totalBilled = custBills.reduce((sum, b) => sum + Number(b.grand_total || 0), 0);
      const totalPaid = custBills.reduce((sum, b) => sum + Math.min(Number(b.grand_total || 0), Number(b.paid_total || 0)), 0);
      const rawUnpaidOnBills = custBills.reduce((sum, b) => {
        const g = Number(b.grand_total || 0);
        const p = Math.min(g, Number(b.paid_total || 0));
        return sum + Math.max(0, g - p);
      }, 0);
      const balanceDue = Math.max(0, rawUnpaidOnBills - Number(cust.advance_balance || 0));

      return {
        id: cust.id,
        user_id: cust.user_id,
        customer_code: cust.customer_code,
        name: cust.name,
        mobile: cust.mobile,
        email: cust.email,
        total_billed: totalBilled,
        total_paid: totalPaid,
        balance_due: balanceDue,
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
    const priorUnpaidBillsList: Array<{ id: string; due: number; bill: Bill }> = [];

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
    const netDueForBill = Math.max(0, roundedTotal - billData.advance_used);

    // Calculate overpayment beyond current bill
    const overpayment = Math.max(0, directPaid - netDueForBill);

    // Overpayments first clear customer's prior unpaid balance (Case 1 & Case 2)
    const allocatedToPriorBills = Math.min(priorOutstanding, overpayment);

    // Remaining overpayment after clearing prior outstanding is earned as advance (Case 2 & Scenario 3)
    const advanceEarned = overpayment - allocatedToPriorBills;

    // Bill paid_total strictly capped at roundedTotal to prevent overpayment from bleeding into other bills
    const paidTotal = Math.min(roundedTotal, directPaid + billData.advance_used);

    const isFullyPaidAtCreation = paidTotal >= roundedTotal - 0.01;

    // 4. Dynamic Loyalty Earning Calculator (Awarded ONLY if bill is fully paid)
    let pointsEarned = 0;
    if (settings.loyalty.enabled && isFullyPaidAtCreation) {
      pointsEarned = await this.calculateLoyaltyPointsEarned(roundedTotal);
    }

    let payment_method: PaymentMethod = 'Pay Later';
    if (paidTotal <= 0.01) {
      payment_method = 'Pay Later';
    } else if (billData.cash_paid > 0 && billData.upi_paid > 0) {
      payment_method = 'Split Payment';
    } else if (billData.upi_paid > 0) {
      payment_method = 'UPI';
    } else if (billData.cash_paid > 0) {
      payment_method = 'Cash';
    } else if (billData.advance_used > 0) {
      payment_method = 'Advance Used';
    }

    // 5. ATOMIC DATABASE SEQUENCE GENERATOR
    const bill_number = await this.getNextSequence('BILL');

    let { data: bill, error: billErr } = await supabase
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

    if (billErr && (billErr.message?.includes('bills_payment_method_check') || billErr.message?.includes('check constraint'))) {
      const fallbackMethod = (billData.upi_paid > billData.cash_paid) ? 'UPI' : 'Cash';
      const retryResult = await supabase
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
          payment_method: fallbackMethod,
          loyalty_points_earned: isFullyPaidAtCreation ? pointsEarned : 0,
          loyalty_points_redeemed: billData.points_to_redeem
        }])
        .select()
        .single();

      bill = retryResult.data;
      billErr = retryResult.error;
    }

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

    const settings = await this.getSettings();
    const subtotalAfterDiscount = Math.max(0, Number(bill.total || 0) - newDiscount);

    let newGstAmount = 0;
    if (settings.billing.gst_enabled && Number(settings.billing.gst_rate) > 0) {
      const rate = Number(settings.billing.gst_rate);
      newGstAmount = Number(((subtotalAfterDiscount * rate) / 100).toFixed(2));
    } else if (Number(bill.gst_amount || 0) > 0 && Number(bill.total || 0) > 0) {
      const prevNet = Math.max(1, Number(bill.total || 0) - Number(bill.discount || 0));
      const priorRate = (Number(bill.gst_amount) / prevNet) * 100;
      newGstAmount = Number(((subtotalAfterDiscount * priorRate) / 100).toFixed(2));
    }

    const preRoundTotal = subtotalAfterDiscount + newGstAmount;
    const { roundedTotal: newGrandTotal, roundingAdjustment: newAdjustment } = this.calculateRounding(
      preRoundTotal,
      (bill.rounding_method as RoundingMethod) || 'None'
    );

    const { data: updatedBill, error } = await supabase
      .from('bills')
      .update({
        discount: newDiscount,
        gst_amount: newGstAmount,
        rounding_adjustment: newAdjustment,
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

    const { data: bills } = await supabase
      .from('bills')
      .select('*, bill_items(*)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true });
    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true });

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
      items?: { product_name: string; quantity: number; price: number; total: number }[];
    }[] = [];

    const paymentBillIds = new Set((payments || []).map(p => p.bill_id).filter(Boolean));

    (bills || []).forEach(b => {
      const hasPaymentRecord = paymentBillIds.has(b.id);
      const directPaidForBill = hasPaymentRecord ? 0 : Math.max(0, Number(b.paid_total || 0) - Number(b.advance_used || 0));
      const effectivePaidOnBill = Number(b.advance_used || 0) + directPaidForBill;

      const items = ((b.bill_items as BillItem[]) || []).map(item => ({
        product_name: item.product_name,
        quantity: Number(item.quantity || 0),
        price: Number(item.price || 0),
        total: Number(item.total || (Number(item.quantity || 0) * Number(item.price || 0)))
      }));

      rawEvents.push({
        date: b.created_at,
        type: 'BILL',
        reference_no: b.bill_number,
        description: `Bill generated (${b.payment_method})`,
        bill_amount: Number(b.grand_total),
        paid_amount: effectivePaidOnBill,
        advance_used: Number(b.advance_used || 0),
        loyalty_points: Number(b.loyalty_points_earned || 0),
        items
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
        running_balance: balance,
        items: evt.items
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

  static async recalculateAllCustomerLoyaltyPoints(userName = 'Super Admin'): Promise<{
    customersProcessed: number;
    customersUpdated: number;
    billsUpdated: number;
    totalActivePoints: number;
  }> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured.');
    }

    // 1. Fetch all customers
    const { data: customers, error: custErr } = await supabase.from('customers').select('*');
    if (custErr) throw new Error(custErr.message);

    // 2. Fetch all bills
    const { data: bills, error: billsErr } = await supabase.from('bills').select('*');
    if (billsErr) throw new Error(billsErr.message);

    // 3. Fetch all payments
    const { data: payments, error: payErr } = await supabase.from('payments').select('*');
    if (payErr) throw new Error(payErr.message);

    // 4. Fetch all loyalty transactions
    const { data: transactions, error: txErr } = await supabase.from('loyalty_transactions').select('*');
    if (txErr) throw new Error(txErr.message);

    let customersUpdated = 0;
    let billsUpdated = 0;
    let totalActivePoints = 0;

    for (const cust of (customers || [])) {
      const custBills = (bills || []).filter(b => b.customer_id === cust.id && b.status !== 'CANCELLED');
      const custTxs = (transactions || []).filter(t => t.customer_id === cust.id);

      let customerEarnedPoints = 0;

      for (const bill of custBills) {
        const grandTotal = Number(bill.grand_total || 0);
        const correctEarned = await this.calculateLoyaltyPointsEarned(grandTotal);

        // Update bill loyalty_points_earned if changed
        if (Number(bill.loyalty_points_earned || 0) !== correctEarned) {
          await supabase.from('bills').update({ loyalty_points_earned: correctEarned }).eq('id', bill.id);
          billsUpdated++;
        }

        // Determine if bill is fully paid
        const billPayments = (payments || []).filter(p => p.bill_id === bill.id);
        const directPaymentsSum = billPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const totalPaidForBill = Number(bill.advance_used || 0) + Math.max(Number(bill.paid_total || 0) - Number(bill.advance_used || 0), directPaymentsSum);
        const isFullyPaid = totalPaidForBill >= grandTotal - 0.01;

        // Existing EARN transaction for this bill
        const earnTx = custTxs.find(t => t.bill_id === bill.id && t.type === 'EARN');

        if (isFullyPaid) {
          customerEarnedPoints += correctEarned;

          if (earnTx) {
            if (Number(earnTx.points || 0) !== correctEarned) {
              await supabase.from('loyalty_transactions').update({
                points: correctEarned,
                notes: `Award Reason: Bill Fully Paid (Reconciled) - ${bill.bill_number}`
              }).eq('id', earnTx.id);
            }
          } else if (correctEarned > 0) {
            const loySeq = await this.getNextSequence('LOYALTY');
            await supabase.from('loyalty_transactions').insert([{
              transaction_number: loySeq,
              customer_id: cust.id,
              bill_id: bill.id,
              points: correctEarned,
              type: 'EARN',
              created_at: bill.created_at || new Date().toISOString(),
              notes: `Award Reason: Bill Fully Paid - ${bill.bill_number}`
            }]);
          }
        } else {
          // If not fully paid, EARN transaction should not exist or be removed
          if (earnTx) {
            await supabase.from('loyalty_transactions').delete().eq('id', earnTx.id);
          }
        }
      }

      // Calculate redeemed points from REDEEM transactions
      const redeemTxs = custTxs.filter(t => t.type === 'REDEEM');
      const totalRedeemed = redeemTxs.reduce((sum, t) => sum + Math.abs(Number(t.points || 0)), 0);

      // Calculate manual adjustments (not bill-related)
      const manualAdjustTxs = custTxs.filter(t => t.type === 'ADJUST' && !t.bill_id);
      const totalAdjustments = manualAdjustTxs.reduce((sum, t) => sum + Number(t.points || 0), 0);

      const finalLoyaltyPoints = Math.max(0, customerEarnedPoints - totalRedeemed + totalAdjustments);
      totalActivePoints += finalLoyaltyPoints;

      if (Number(cust.loyalty_points || 0) !== finalLoyaltyPoints) {
        await supabase.from('customers').update({
          loyalty_points: finalLoyaltyPoints
        }).eq('id', cust.id);
        customersUpdated++;
      }
    }

    await this.logAudit({
      user_name: userName,
      action: 'RECALCULATE_LOYALTY_POINTS',
      entity: 'All Customers',
      new_value: `Recalculated: ${customers?.length || 0} customers checked, ${customersUpdated} customer balances updated, ${billsUpdated} bills updated`
    });

    return {
      customersProcessed: customers?.length || 0,
      customersUpdated,
      billsUpdated,
      totalActivePoints
    };
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

        // Calculate total pending points across all unpaid customer bills
        let total_pending_points = 0;
        const processedBillIds = new Set<string>();
        for (const b of (allCustBills || [])) {
          processedBillIds.add(b.id);
          const bDue = Math.max(0, Number(b.grand_total || 0) - (b.id === bill.id ? total_paid : Number(b.paid_total || 0)));
          if (bDue > 0.01) {
            const pts = (b.id === bill.id) ? points_earned : await this.calculateLoyaltyPointsEarned(Number(b.grand_total || 0));
            total_pending_points += pts;
          }
        }
        if (!processedBillIds.has(bill.id) && !is_fully_paid) {
          total_pending_points += points_earned;
        }

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
          total_pending_points,
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

        const updateData: Record<string, string | number> = {
          paid_total: newPaidTotal
        };

        if (payment.payment_method === 'Cash') {
          updateData.cash_paid = Number(bill.cash_paid || 0) + payment.amount;
        } else if (payment.payment_method === 'UPI') {
          updateData.upi_paid = Number(bill.upi_paid || 0) + payment.amount;
        }

        if (bill.payment_method === 'Pay Later' || !bill.payment_method) {
          updateData.payment_method = payment.payment_method;
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

            const updateData: Record<string, string | number> = {
              paid_total: newPaidTotal
            };

            if (payment.payment_method === 'Cash') {
              updateData.cash_paid = Number(b.cash_paid || 0) + allocation;
            } else if (payment.payment_method === 'UPI') {
              updateData.upi_paid = Number(b.upi_paid || 0) + allocation;
            }

            if (b.payment_method === 'Pay Later' || !b.payment_method) {
              updateData.payment_method = payment.payment_method;
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
    return (data || []).map((p: Payment & { customers?: { name?: string; mobile?: string } | null }) => ({
      ...p,
      customer_name: p.customers?.name || undefined,
      customer_mobile: p.customers?.mobile || undefined
    }));
  }

  // --- REVERSE BILL PAYMENT (MARK AS UNPAID / RESET PAYMENT) ---
  static async reverseBillPayment(
    billId: string, 
    reason: string, 
    adminPin: string, 
    userName = 'Super Admin'
  ): Promise<Bill> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');

    const settings = await this.getSettings();
    const expectedPin = settings.security?.super_admin_pin || '1234';
    if (adminPin !== expectedPin) {
      throw new Error('Invalid Super Admin Security PIN');
    }

    if (!reason || !reason.trim()) {
      throw new Error('A reason is required to reverse bill payments.');
    }

    const { data: bill, error: billErr } = await supabase
      .from('bills')
      .select('*')
      .eq('id', billId)
      .single();

    if (billErr || !bill) throw new Error('Bill not found');

    const previousPaidTotal = Number(bill.paid_total || 0);
    const previousCashPaid = Number(bill.cash_paid || 0);
    const previousUpiPaid = Number(bill.upi_paid || 0);
    const advanceEarned = Number(bill.advance_earned || 0);
    const advanceUsed = Number(bill.advance_used || 0);

    // 1. Delete all payments associated with this bill
    const { error: payDeleteErr } = await supabase
      .from('payments')
      .delete()
      .eq('bill_id', billId);

    if (payDeleteErr) throw new Error(`Failed to delete associated payment records: ${payDeleteErr.message}`);

    // 2. Reverse any loyalty points earned on this bill
    if (Number(bill.loyalty_points_earned || 0) > 0) {
      await this.reverseLoyaltyPointsForBill(billId, userName);
    }

    // 3. Update customer advance balance if advance was earned or used on this bill
    if (bill.customer_id) {
      const { data: cust } = await supabase
        .from('customers')
        .select('advance_balance')
        .eq('id', bill.customer_id)
        .single();

      if (cust) {
        let currentAdvance = Number(cust.advance_balance || 0);
        currentAdvance -= advanceEarned;
        currentAdvance += advanceUsed;
        currentAdvance = Math.max(0, currentAdvance);

        await supabase
          .from('customers')
          .update({ advance_balance: currentAdvance })
          .eq('id', bill.customer_id);
      }
    }

    // 4. Reset bill payment fields to unpaid
    const { data: updatedBill, error: updateErr } = await supabase
      .from('bills')
      .update({
        paid_total: 0,
        cash_paid: 0,
        upi_paid: 0,
        advance_used: 0,
        advance_earned: 0,
        loyalty_points_earned: 0,
        payment_method: 'Pay Later',
        edited_at: new Date().toISOString(),
        edited_by: userName,
        edit_reason: `Payment Reversal: ${reason.trim()}`
      })
      .eq('id', billId)
      .select()
      .single();

    if (updateErr) throw new Error(updateErr.message);

    // 5. Audit Log
    await this.logAudit({
      user_name: userName,
      action: 'REVERSE_BILL_PAYMENT',
      entity: `Bill ${bill.bill_number}`,
      previous_value: `Paid Total: ₹${previousPaidTotal.toFixed(2)} (Cash: ₹${previousCashPaid.toFixed(2)}, UPI: ₹${previousUpiPaid.toFixed(2)}, Adv Earned: ₹${advanceEarned.toFixed(2)}, Adv Used: ₹${advanceUsed.toFixed(2)})`,
      new_value: `Reset to Unpaid (₹0.00). Reason: ${reason.trim()}`
    });

    return updatedBill;
  }

  // --- DELETE STANDALONE PAYMENT / REVERSE PAYMENT ENTRY ---
  static async deletePayment(
    paymentId: string, 
    reason: string, 
    adminPin: string, 
    userName = 'Super Admin'
  ): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');

    const settings = await this.getSettings();
    const expectedPin = settings.security?.super_admin_pin || '1234';
    if (adminPin !== expectedPin) {
      throw new Error('Invalid Super Admin Security PIN');
    }

    if (!reason || !reason.trim()) {
      throw new Error('A reason is required to delete payment records.');
    }

    const { data: payment, error: payErr } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .single();

    if (payErr || !payment) throw new Error('Payment record not found');

    const payAmount = Number(payment.amount || 0);

    // 1. If attached to a bill, decrement the bill's paid_total and cash/upi
    if (payment.bill_id) {
      const { data: bill } = await supabase
        .from('bills')
        .select('*')
        .eq('id', payment.bill_id)
        .single();

      if (bill) {
        const currentPaid = Number(bill.paid_total || 0);
        const newPaidTotal = Math.max(0, currentPaid - payAmount);
        const updateData: Record<string, string | number> = {
          paid_total: newPaidTotal
        };

        if (payment.payment_method === 'Cash') {
          updateData.cash_paid = Math.max(0, Number(bill.cash_paid || 0) - payAmount);
        } else if (payment.payment_method === 'UPI') {
          updateData.upi_paid = Math.max(0, Number(bill.upi_paid || 0) - payAmount);
        }

        if (newPaidTotal <= 0.01) {
          updateData.payment_method = 'Pay Later';
        }

        await supabase.from('bills').update(updateData).eq('id', payment.bill_id);
      }
    } else if (payment.customer_id) {
      // If unallocated advance payment, decrement customer's advance_balance
      const { data: cust } = await supabase
        .from('customers')
        .select('advance_balance')
        .eq('id', payment.customer_id)
        .single();

      if (cust) {
        const newAdvance = Math.max(0, Number(cust.advance_balance || 0) - payAmount);
        await supabase
          .from('customers')
          .update({ advance_balance: newAdvance })
          .eq('id', payment.customer_id);
      }
    }

    // 2. Delete payment
    const { error: delErr } = await supabase
      .from('payments')
      .delete()
      .eq('id', paymentId);

    if (delErr) throw new Error(delErr.message);

    // 3. Audit Log
    await this.logAudit({
      user_name: userName,
      action: 'DELETE_PAYMENT',
      entity: `Payment ${payment.payment_number || payment.id} (₹${payAmount})`,
      previous_value: JSON.stringify(payment),
      new_value: `Deleted payment record. Reason: ${reason.trim()}`
    });
  }

  // --- RECONCILE ALL CUSTOMER ADVANCE BALANCES ---
  static async reconcileCustomerAdvanceBalances(userName = 'Super Admin'): Promise<{
    customersReconciled: number;
    discrepanciesFixed: number;
    totalAdvanceBefore: number;
    totalAdvanceAfter: number;
  }> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');

    const [{ data: customers }, { data: bills }, { data: payments }] = await Promise.all([
      supabase.from('customers').select('id, name, advance_balance'),
      supabase.from('bills').select('customer_id, advance_used, advance_earned'),
      supabase.from('payments').select('customer_id, bill_id, amount')
    ]);

    const custList = customers || [];
    const billList = bills || [];
    const payList = payments || [];

    let totalAdvanceBefore = 0;
    let totalAdvanceAfter = 0;
    let discrepanciesFixed = 0;

    for (const cust of custList) {
      const storedAdvance = Number(cust.advance_balance || 0);
      totalAdvanceBefore += storedAdvance;

      // Reconstruct accurate advance from raw transactions
      const custUnallocatedPayments = payList
        .filter(p => p.customer_id === cust.id && !p.bill_id)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const custAdvanceEarned = billList
        .filter(b => b.customer_id === cust.id)
        .reduce((sum, b) => sum + Number(b.advance_earned || 0), 0);

      const custAdvanceUsed = billList
        .filter(b => b.customer_id === cust.id)
        .reduce((sum, b) => sum + Number(b.advance_used || 0), 0);

      const calculatedAdvance = Math.max(0, custUnallocatedPayments + custAdvanceEarned - custAdvanceUsed);
      totalAdvanceAfter += calculatedAdvance;

      if (Math.abs(storedAdvance - calculatedAdvance) > 0.009) {
        discrepanciesFixed++;
        await supabase
          .from('customers')
          .update({ advance_balance: calculatedAdvance })
          .eq('id', cust.id);
      }
    }

    await this.logAudit({
      user_name: userName,
      action: 'RECONCILE_ADVANCE_BALANCES',
      entity: 'Customer Ledgers & Advance Balances',
      previous_value: `Total Advance: ₹${totalAdvanceBefore.toFixed(2)}`,
      new_value: `Reconciled ${discrepanciesFixed} discrepancies. Total Advance: ₹${totalAdvanceAfter.toFixed(2)}`
    });

    return {
      customersReconciled: custList.length,
      discrepanciesFixed,
      totalAdvanceBefore,
      totalAdvanceAfter
    };
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

  static async addExpense(expense: { 
    title: string; 
    amount: number; 
    category: string;
    payment_mode?: string;
    notes?: string;
  }, userName = 'Admin'): Promise<Expense> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const expense_number = await this.getNextSequence('EXPENSE');

    const { data, error } = await supabase
      .from('expenses')
      .insert([{
        title: expense.title,
        amount: expense.amount,
        category: expense.category,
        payment_mode: expense.payment_mode || 'Cash',
        notes: expense.notes || null,
        expense_number
      }])
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

  static async addExpenseCategory(categoryName: string, userName = 'Admin'): Promise<string[]> {
    const settings = await this.getSettings();
    const existing = settings.expenses?.categories || [
      'Shop Expense', 'Electricity', 'Rent', 'Paper Stock & Rolls', 
      'Toner & Cartridges', 'Machine Maintenance', 'Staff Wages', 'Other Expense'
    ];
    if (!existing.includes(categoryName)) {
      const updated = [...existing, categoryName];
      await this.saveSettings('expenses', { ...settings.expenses, categories: updated }, userName);
      return updated;
    }
    return existing;
  }

  static async removeExpenseCategory(categoryName: string, userName = 'Admin'): Promise<string[]> {
    const settings = await this.getSettings();
    const existing = settings.expenses?.categories || [
      'Shop Expense', 'Electricity', 'Rent', 'Other Expense'
    ];
    const updated = existing.filter(c => c !== categoryName);
    await this.saveSettings('expenses', { ...settings.expenses, categories: updated }, userName);
    return updated;
  }

  // --- SUPER ADMIN PURGE ---
  static async purgeAllBusinessData(userName = 'Super Admin'): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');

    await supabase.from('bill_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('payments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('bills').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('expenses').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('loyalty_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');

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
    let expensesQuery = supabase.from('expenses').select('*');

    if (startDate) {
      billsQuery = billsQuery.gte('created_at', startDate.toISOString());
      paymentsQuery = paymentsQuery.gte('created_at', startDate.toISOString());
      expensesQuery = expensesQuery.gte('created_at', startDate.toISOString());
    }
    if (endDate) {
      billsQuery = billsQuery.lte('created_at', endDate.toISOString());
      paymentsQuery = paymentsQuery.lte('created_at', endDate.toISOString());
      expensesQuery = expensesQuery.lte('created_at', endDate.toISOString());
    }

    const { data: bills } = await billsQuery;
    const { data: payments } = await paymentsQuery;
    const { data: expenses } = await expensesQuery;

    const allBills = bills || [];
    const allPayments = payments || [];
    const allExpenses = expenses || [];

    const customers = await this.getCustomerSummaries();
    const total_customers = customers.length;
    // Calculate total net outstanding balance across all customer accounts
    const pending_balance = customers.reduce((sum, c) => sum + Number(c.balance_due || 0), 0);

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

    // Single Source of Truth: All collections are recorded in the payments table
    allPayments.forEach(p => {
      const amt = Number(p.amount || 0);
      if (p.payment_method === 'Cash') cashCollected += amt;
      else if (p.payment_method === 'UPI') upiCollected += amt;
    });

    // Fallback ONLY for walk-in / legacy bills when no payment records exist at all
    if (allPayments.length === 0) {
      allBills.forEach(b => {
        cashCollected += Number(b.cash_paid || 0);
        upiCollected += Number(b.upi_paid || 0);
      });
    }

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
  // --- DIGITAL MULTI-CHANNEL RECEIPT GENERATOR (WhatsApp, Telegram, SMS, Social) ---
  static generateDigitalReceiptText(
    bill: Bill, 
    financialSummary?: BillFinancialSummary, 
    shopSettings?: Partial<ShopSettings>
  ): string {
    const formattedDate = new Date(bill.created_at || Date.now()).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    const shopName = shopSettings?.shop_name || 'SIMPLEBILLING STORE';
    const shopPhone = shopSettings?.phone ? `📞 Ph: ${shopSettings.phone}` : '';
    const shopAddress = shopSettings?.address ? `📍 ${shopSettings.address}` : '';
    const shopGstin = shopSettings?.gst_number ? `🏛️ GSTIN: ${shopSettings.gst_number}` : '';
    const footerMsg = shopSettings?.footer_message || 'Thank you for your business!';

    const itemsText = (bill.items || []).map((item, idx) => 
      `${idx + 1}. *${item.product_name}*\n   Qty: ${item.quantity} × ₹${Number(item.price).toFixed(2)} = ₹${Number(item.total).toFixed(2)}`
    ).join('\n\n');

    const isFullyPaidFallback = Math.max(0, Number(bill.grand_total || 0) - Number(bill.paid_total || 0)) <= 0.01;
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
      ? 'Status: Fully Paid ✅'
      : summary.payment_status === 'Partially Paid'
      ? `Status: Partially Paid ℹ️ (Remaining: ₹${summary.remaining_balance.toFixed(2)})`
      : `Status: Payment Pending ⚠️ (Remaining: ₹${summary.remaining_balance.toFixed(2)})`;

    const currentBillDue = Math.max(0, summary.current_bill_amount - summary.total_paid);
    const advanceEarnedOnBill = Number(bill.advance_earned || 0);

    let text = `🧾 *${shopName.toUpperCase()}*`;
    if (shopAddress) text += `\n${shopAddress}`;
    if (shopPhone || shopGstin) {
      text += `\n${[shopPhone, shopGstin].filter(Boolean).join(' | ')}`;
    }

    text += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 *TAX INVOICE / BILL RECEIPT*
Bill No: *${bill.bill_number}*
Date: ${formattedDate}
Customer: *${bill.customer_name || 'Walk-in Customer'}* ${bill.customer_mobile ? `(${bill.customer_mobile})` : ''}
Payment Mode: *${bill.payment_method || 'Cash'}*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛒 *ITEMIZED PURCHASES*

${itemsText || '1. General Purchase\n   Qty: 1 × ₹' + Number(bill.grand_total).toFixed(2) + ' = ₹' + Number(bill.grand_total).toFixed(2)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 *BILL TOTALS*
Subtotal: ₹${Number(bill.total || 0).toFixed(2)}
Discount: -₹${Number(bill.discount || 0).toFixed(2)}`;

    if (Number(bill.gst_amount || 0) > 0) {
      text += `\nGST: +₹${Number(bill.gst_amount).toFixed(2)}`;
    }
    if (Number(bill.rounding_adjustment || 0) !== 0) {
      text += `\nRounding: ${Number(bill.rounding_adjustment) >= 0 ? '+' : ''}₹${Number(bill.rounding_adjustment).toFixed(2)}`;
    }

    text += `\n🧾 *Grand Total: ₹${Number(bill.grand_total || 0).toFixed(2)}*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 *CUSTOMER ACCOUNT SUMMARY*
Previous Outstanding: ₹${summary.previous_outstanding.toFixed(2)}
Previous Advance: ₹${summary.previous_advance.toFixed(2)}
Current Bill Amount: ₹${summary.current_bill_amount.toFixed(2)}
*Total Amount Due: ₹${summary.total_amount_due.toFixed(2)}*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💵 *PAYMENT SUMMARY*
Cash Paid: ₹${summary.cash_paid.toFixed(2)}
UPI Paid: ₹${summary.upi_paid.toFixed(2)}
Advance Used: ₹${summary.advance_used.toFixed(2)}
*Total Paid: ₹${summary.total_paid.toFixed(2)}*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚖️ *BALANCE & ADVANCE SUMMARY*
Current Bill Due: ₹${currentBillDue.toFixed(2)}
Net Account Balance Due: ₹${summary.remaining_balance.toFixed(2)}`;

    if (advanceEarnedOnBill > 0) {
      text += `\n🔵 *Advance Credited (This Bill): +₹${advanceEarnedOnBill.toFixed(2)}*`;
    }
    text += `\nCustomer Advance Balance: ₹${summary.remaining_advance_balance.toFixed(2)}
📌 ${statusBadge}`;

    if (summary.loyalty && summary.loyalty.enabled) {
      text += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎁 *LOYALTY REWARDS*`;
      if (summary.remaining_balance <= 0.01 || summary.loyalty.is_fully_paid) {
        text += `\nPoints Earned (This Bill): *+${summary.loyalty.points_earned} Pts*
Previous Points: ${summary.loyalty.previous_points} pts
Points Redeemed: -${summary.loyalty.points_redeemed} pts
*Current Active Loyalty Balance: ${summary.loyalty.current_points_balance} pts*`;
      } else {
        const totalPending = summary.loyalty.total_pending_points || summary.loyalty.points_earned;
        text += `\n⏳ *Points on This Bill (Pending): +${summary.loyalty.points_earned} Pts*
⏳ *Total Pending on Account: ${totalPending} Pts*
Available Spendable Balance: ${summary.loyalty.previous_points} pts
_(Points will be credited upon bill settlement)_`;
      }
    }

    text += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${footerMsg}\n_Powered by SimpleBilling_`;

    return text;
  }

  // Backwards compatibility alias
  static generateWhatsAppTextReceipt(bill: Bill, financialSummary?: BillFinancialSummary, shopSettings?: Partial<ShopSettings>): string {
    return this.generateDigitalReceiptText(bill, financialSummary, shopSettings);
  }

  // --- HTML EMAIL RECEIPT TEMPLATE GENERATOR ---
  static generateEmailHtmlReceipt(
    bill: Bill, 
    financialSummary?: BillFinancialSummary, 
    shopSettings?: Partial<ShopSettings>
  ): string {
    const shopName = shopSettings?.shop_name || 'SimpleBilling Center';
    const shopPhone = shopSettings?.phone || '';
    const shopAddress = shopSettings?.address || '';
    const shopGstin = shopSettings?.gst_number || '';
    const footerMsg = shopSettings?.footer_message || 'Thank you for your business!';

    const itemsRows = (bill.items || []).map((item, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0; font-size: 13px;">
        <td style="padding: 8px 4px; text-align: left;">${idx + 1}. ${item.product_name}</td>
        <td style="padding: 8px 4px; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px 4px; text-align: right;">₹${Number(item.price).toFixed(2)}</td>
        <td style="padding: 8px 4px; text-align: right; font-weight: bold;">₹${Number(item.total).toFixed(2)}</td>
      </tr>
    `).join('');

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
      payment_status: (Number(bill.paid_total || 0) >= Number(bill.grand_total || 0) - 0.01) ? 'Fully Paid' : 'Payment Pending'
    };

    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
        <div style="background: #0f172a; color: #ffffff; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">${shopName.toUpperCase()}</h1>
          ${shopAddress ? `<p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">${shopAddress}</p>` : ''}
          <p style="margin: 4px 0 0 0; font-size: 11px; color: #94a3b8;">
            ${shopPhone ? `Ph: ${shopPhone}` : ''} ${shopGstin ? `| GSTIN: ${shopGstin}` : ''}
          </p>
        </div>

        <div style="padding: 20px;">
          <div style="background: #f8fafc; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; display: flex; justify-content: space-between; font-size: 13px;">
            <div>
              <p style="margin: 0; font-weight: bold; color: #0f172a;">Invoice #${bill.bill_number}</p>
              <p style="margin: 2px 0 0 0; color: #64748b; font-size: 12px;">Customer: ${bill.customer_name || 'Valued Customer'}</p>
            </div>
            <div style="text-align: right;">
              <p style="margin: 0; color: #64748b; font-size: 12px;">Date: ${new Date(bill.created_at || Date.now()).toLocaleDateString('en-IN')}</p>
              <p style="margin: 2px 0 0 0; font-weight: bold; color: ${summary.remaining_balance <= 0.01 ? '#15803d' : '#b45309'}; font-size: 12px;">Status: ${summary.payment_status}</p>
            </div>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
              <tr style="background: #f1f5f9; color: #475569; font-size: 11px; text-transform: uppercase;">
                <th style="padding: 8px 4px; text-align: left;">Item</th>
                <th style="padding: 8px 4px; text-align: center;">Qty</th>
                <th style="padding: 8px 4px; text-align: right;">Price</th>
                <th style="padding: 8px 4px; text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <div style="background: #f8fafc; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; font-size: 13px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span style="color: #64748b;">Subtotal:</span>
              <span style="font-weight: 600;">₹${Number(bill.total || 0).toFixed(2)}</span>
            </div>
            ${Number(bill.discount || 0) > 0 ? `
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #15803d;">
                <span>Discount:</span>
                <span>-₹${Number(bill.discount).toFixed(2)}</span>
              </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: 800; border-top: 2px solid #cbd5e1; padding-top: 8px; margin-top: 8px; color: #0f172a;">
              <span>Grand Total:</span>
              <span>₹${Number(bill.grand_total || 0).toFixed(2)}</span>
            </div>
          </div>

          <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; font-size: 12px;">
            <p style="margin: 0 0 8px 0; font-weight: 700; text-transform: uppercase; color: #475569; font-size: 11px; letter-spacing: 0.5px;">Account & Payment Summary</p>
            <div style="display: flex; justify-content: space-between; margin-bottom: 3px; color: #64748b;">
              <span>Total Paid:</span>
              <span style="font-weight: 600; color: #15803d;">₹${summary.total_paid.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 3px; color: #64748b;">
              <span>Current Bill Due:</span>
              <span style="font-weight: 600; color: ${summary.remaining_balance > 0 ? '#b45309' : '#15803d'};">₹${summary.remaining_balance.toFixed(2)}</span>
            </div>
            ${Number(bill.advance_earned || 0) > 0 ? `
              <div style="display: flex; justify-content: space-between; margin-bottom: 3px; color: #4338ca; font-weight: bold;">
                <span>Advance Credited (This Bill):</span>
                <span>+₹${Number(bill.advance_earned).toFixed(2)}</span>
              </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; color: #64748b;">
              <span>Customer Advance Balance:</span>
              <span style="font-weight: 600;">₹${summary.remaining_advance_balance.toFixed(2)}</span>
            </div>
          </div>

          <div style="text-align: center; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
            <p style="margin: 0;">${footerMsg}</p>
            <p style="margin: 4px 0 0 0;">Generated by SimpleBilling</p>
          </div>
        </div>
      </div>
    `;
  }

  // --- DATABASE SEED UTILITY ---
  static async seedDefaultCatalogAndCustomers(userName = 'Super Admin'): Promise<{ productsAdded: number; customersAdded: number }> {
    if (!isSupabaseConfigured) return { productsAdded: 0, customersAdded: 0 };

    let productsAdded = 0;
    let customersAdded = 0;

    try {
      const existingProds = await this.getProducts();
      if (existingProds.length === 0) {
        const seedProducts = [
          { name: 'A4 B&W Single', category: 'Xerox & Print', price: 2.00, product_code: 'PRD-000001' },
          { name: 'A4 B&W Both Sides', category: 'Xerox & Print', price: 3.00, product_code: 'PRD-000002' },
          { name: 'A4 Color Print Single', category: 'Xerox & Print', price: 10.00, product_code: 'PRD-000003' },
          { name: 'A4 Color Both Sides', category: 'Xerox & Print', price: 18.00, product_code: 'PRD-000004' },
          { name: 'Legal B&W Print', category: 'Xerox & Print', price: 3.00, product_code: 'PRD-000005' },
          { name: 'A3 B&W Print', category: 'Xerox & Print', price: 5.00, product_code: 'PRD-000006' },
          { name: 'A3 Color Print', category: 'Xerox & Print', price: 25.00, product_code: 'PRD-000007' },
          { name: 'Glossy Photo Print 4x6', category: 'Xerox & Print', price: 15.00, product_code: 'PRD-000008' },
          { name: 'Glossy Photo Print A4', category: 'Xerox & Print', price: 40.00, product_code: 'PRD-000009' },
          { name: 'PVC ID Card Print', category: 'Xerox & Print', price: 50.00, product_code: 'PRD-000010' },
          { name: 'A4 Document Lamination', category: 'Lamination & Binding', price: 30.00, product_code: 'PRD-000011' },
          { name: 'A3 Certificate Lamination', category: 'Lamination & Binding', price: 50.00, product_code: 'PRD-000012' },
          { name: 'ID Card Lamination (Pouch)', category: 'Lamination & Binding', price: 15.00, product_code: 'PRD-000013' },
          { name: 'Spiral Binding (Up to 100 pgs)', category: 'Lamination & Binding', price: 40.00, product_code: 'PRD-000014' },
          { name: 'Spiral Binding (Over 100 pgs)', category: 'Lamination & Binding', price: 60.00, product_code: 'PRD-000015' },
          { name: 'Hard Cover Project Binding', category: 'Lamination & Binding', price: 200.00, product_code: 'PRD-000016' },
          { name: 'Ballpoint Pen (Blue/Black)', category: 'Stationery', price: 10.00, product_code: 'PRD-000017' },
          { name: 'Gel Pen 0.5mm', category: 'Stationery', price: 20.00, product_code: 'PRD-000018' },
          { name: 'A4 75GSM Copier Paper Ream', category: 'Paper & Envelopes', price: 280.00, product_code: 'PRD-000019' },
          { name: 'Long Ruled Notebook 180 Pgs', category: 'Stationery', price: 60.00, product_code: 'PRD-000020' },
          { name: 'A4 Clear Display Folder (20 Pockets)', category: 'Stationery', price: 80.00, product_code: 'PRD-000021' }
        ];

        const { error: pErr } = await supabase.from('products').insert(seedProducts);
        if (!pErr) productsAdded = seedProducts.length;
      }

      const existingCusts = await this.getCustomers();
      if (existingCusts.length === 0) {
        const seedCustomers = [
          { name: 'Sample Walk-in Customer', mobile: '9876543210', email: 'customer@example.com', advance_balance: 0.00, loyalty_points: 0.0, customer_code: 'CUS-000001' }
        ];

        const { error: cErr } = await supabase.from('customers').insert(seedCustomers);
        if (!cErr) customersAdded = seedCustomers.length;
      }

      if (productsAdded > 0 || customersAdded > 0) {
        await this.logAudit({
          user_name: userName,
          action: 'SEED_DEFAULT_DATABASE_CATALOG',
          entity: 'System Seed Data',
          new_value: `Added ${productsAdded} products, ${customersAdded} customers`
        });
      }
    } catch (e) {
      console.error('Database seed error:', e);
    }

    return { productsAdded, customersAdded };
  }

  // --- PRODUCT SALES HISTORY & ANALYTICS ---
  static async getProductSalesAnalytics(
    productId: string,
    filter: DateFilterOption = 'all_time',
    customRange?: { from: string; to: string }
  ): Promise<ProductSalesAnalytics> {
    const isCustom = productId.startsWith('custom:');
    let product: Product;

    if (isCustom) {
      const customName = decodeURIComponent(productId.replace(/^custom:/, ''));
      product = {
        id: productId,
        name: customName,
        price: 0,
        category: 'Custom Service',
        product_code: 'CUSTOM',
        created_at: new Date().toISOString()
      };
    } else {
      const p = await this.getProductById(productId);
      if (!p) throw new Error('Product not found');
      product = p;
    }

    if (!isSupabaseConfigured) {
      return {
        product,
        total_quantity_sold: 0,
        total_revenue: 0,
        average_selling_rate: product.price,
        orders_count: 0,
        transactions: []
      };
    }

    const { startDate, endDate } = this.getDateRangeBounds(filter, customRange);

    let query = supabase
      .from('bill_items')
      .select('*, bills(id, bill_number, created_at, customer_id, customers(name))');

    if (isCustom) {
      query = query.is('product_id', null).eq('product_name', product.name);
    } else {
      query = query.or(`product_id.eq.${productId},product_name.eq.${product.name}`);
    }

    const { data: items, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching product sales history:', error);
      return {
        product,
        total_quantity_sold: 0,
        total_revenue: 0,
        average_selling_rate: product.price,
        orders_count: 0,
        transactions: []
      };
    }

    const transactions: ProductSalesHistoryItem[] = [];
    const billIds = new Set<string>();
    let totalQty = 0;
    let totalRev = 0;

    for (const item of (items || [])) {
      const bill = item.bills;
      const createdAt = bill?.created_at || item.created_at || new Date().toISOString();
      const itemTime = new Date(createdAt).getTime();

      if (startDate && itemTime < startDate.getTime()) continue;
      if (endDate && itemTime > endDate.getTime()) continue;

      const qty = Number(item.quantity || 0);
      const price = Number(item.price || 0);
      const total = Number(item.total || (qty * price));
      const isCustomRate = isCustom ? false : Math.abs(price - product.price) > 0.001;

      const billId = bill?.id || item.bill_id || '';
      if (billId) billIds.add(billId);

      totalQty += qty;
      totalRev += total;

      const customerName = bill?.customers?.name || bill?.customer_name || 'Walk-in Customer';

      transactions.push({
        bill_id: billId,
        bill_number: bill?.bill_number || 'N/A',
        created_at: createdAt,
        customer_id: bill?.customer_id || null,
        customer_name: customerName,
        quantity: qty,
        price,
        total,
        is_custom_rate: isCustomRate,
        catalog_price: product.price
      });
    }

    transactions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const avgRate = totalQty > 0 ? Number((totalRev / totalQty).toFixed(2)) : product.price;

    return {
      product: {
        ...product,
        price: isCustom ? avgRate : product.price
      },
      total_quantity_sold: Number(totalQty.toFixed(2)),
      total_revenue: Number(totalRev.toFixed(2)),
      average_selling_rate: avgRate,
      orders_count: billIds.size,
      transactions
    };
  }

  // --- CUSTOM & AD-HOC SERVICES ANALYTICS ---
  static async getCustomItemsAnalytics(
    filter: DateFilterOption = 'all_time',
    customRange?: { from: string; to: string }
  ): Promise<CustomItemAnalytics[]> {
    if (!isSupabaseConfigured) return [];

    const { startDate, endDate } = this.getDateRangeBounds(filter, customRange);

    let query = supabase
      .from('bill_items')
      .select('product_name, quantity, price, total, created_at, bill_id')
      .is('product_id', null)
      .order('created_at', { ascending: false });

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }
    if (endDate) {
      query = query.lte('created_at', endDate.toISOString());
    }

    const { data: items, error } = await query;
    if (error || !items) {
      console.error('Error fetching custom items analytics:', error);
      return [];
    }

    const groupMap = new Map<string, {
      name: string;
      total_quantity: number;
      total_revenue: number;
      bill_ids: Set<string>;
      first_used_at: string;
      last_used_at: string;
    }>();

    for (const item of items) {
      const name = (item.product_name || 'Custom Service').trim();
      const qty = Number(item.quantity || 0);
      const price = Number(item.price || 0);
      const total = Number(item.total || (qty * price));
      const createdAt = item.created_at || new Date().toISOString();

      const existing = groupMap.get(name);
      if (!existing) {
        groupMap.set(name, {
          name,
          total_quantity: qty,
          total_revenue: total,
          bill_ids: new Set(item.bill_id ? [item.bill_id] : []),
          first_used_at: createdAt,
          last_used_at: createdAt,
        });
      } else {
        existing.total_quantity += qty;
        existing.total_revenue += total;
        if (item.bill_id) existing.bill_ids.add(item.bill_id);
        if (new Date(createdAt).getTime() < new Date(existing.first_used_at).getTime()) {
          existing.first_used_at = createdAt;
        }
        if (new Date(createdAt).getTime() > new Date(existing.last_used_at).getTime()) {
          existing.last_used_at = createdAt;
        }
      }
    }

    const results: CustomItemAnalytics[] = Array.from(groupMap.values()).map(g => ({
      name: g.name,
      total_quantity: Number(g.total_quantity.toFixed(2)),
      total_revenue: Number(g.total_revenue.toFixed(2)),
      average_selling_rate: g.total_quantity > 0 ? Number((g.total_revenue / g.total_quantity).toFixed(2)) : 0,
      orders_count: g.bill_ids.size,
      first_used_at: g.first_used_at,
      last_used_at: g.last_used_at,
    }));

    return results.sort((a, b) => b.total_revenue - a.total_revenue);
  }

  // --- CUSTOMER CONSOLIDATED STATEMENT DATA ---
  static async getCustomerStatementData(
    customerId: string,
    filter: DateFilterOption = 'all_time',
    customRange?: { from: string; to: string }
  ): Promise<CustomerStatementData> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');

    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();

    if (custErr || !customer) throw new Error('Customer not found');

    const settings = await this.getSettings();

    const { data: bills } = await supabase
      .from('bills')
      .select('*, bill_items(*)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true });

    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true });

    let allTimeBilled = 0;
    let allTimePaid = 0;
    (bills || []).forEach(b => {
      allTimeBilled += Number(b.grand_total || 0);
      allTimePaid += Number(b.paid_total || 0);
    });

    const paymentBillIds = new Set((payments || []).map(p => p.bill_id).filter(Boolean));
    (payments || []).forEach(p => {
      if (!p.bill_id || !paymentBillIds.has(p.bill_id)) {
        allTimePaid += Number(p.amount || 0);
      }
    });

    const currentOutstandingBalance = Math.max(0, allTimeBilled - allTimePaid);

    const { startDate, endDate } = this.getDateRangeBounds(filter, customRange);

    const filteredBills: CustomerStatementBill[] = [];
    let periodInvoiced = 0;
    let periodPaid = 0;
    let periodUnits = 0;

    for (const b of (bills || [])) {
      const bTime = new Date(b.created_at).getTime();
      if (startDate && bTime < startDate.getTime()) continue;
      if (endDate && bTime > endDate.getTime()) continue;

      const grandTotal = Number(b.grand_total || 0);
      const paidTotal = Number(b.paid_total || 0);
      const discount = Number(b.discount || 0);
      const subtotal = Number(b.total || (grandTotal + discount));
      const balanceDue = Math.max(0, grandTotal - paidTotal);

      periodInvoiced += grandTotal;
      periodPaid += paidTotal;

      const items: CustomerStatementBillItem[] = ((b.bill_items as BillItem[]) || []).map((item, idx) => {
        const qty = Number(item.quantity || 0);
        const price = Number(item.price || 0);
        const total = Number(item.total || (qty * price));
        periodUnits += qty;
        return {
          item_index: idx + 1,
          product_id: item.product_id || null,
          product_name: item.product_name,
          is_custom_item: !item.product_id,
          quantity: qty,
          price,
          total
        };
      });

      filteredBills.push({
        bill_id: b.id,
        bill_number: b.bill_number,
        created_at: b.created_at,
        items,
        subtotal,
        discount,
        grand_total: grandTotal,
        paid_amount: paidTotal,
        balance_due: balanceDue
      });
    }

    const dateMap = new Map<string, CustomerStatementBill[]>();
    for (const bill of filteredBills) {
      const d = new Date(bill.created_at);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, []);
      }
      dateMap.get(dateKey)!.push(bill);
    }

    const date_groups: CustomerStatementDateGroup[] = Array.from(dateMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([rawDate, billsOnDate]) => {
        const d = new Date(rawDate);
        const formatted = d.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
        return {
          raw_date: rawDate,
          date_formatted: formatted,
          bills: billsOnDate
        };
      });

    let filterLabel = 'All Invoices';
    if (filter === 'today') filterLabel = 'Today';
    else if (filter === 'monthly') filterLabel = 'This Month';
    else if (filter === 'financial_year') filterLabel = 'Financial Year (FY)';
    else if (filter === 'custom' && customRange?.from && customRange?.to) {
      filterLabel = `${customRange.from} to ${customRange.to}`;
    }

    return {
      customer,
      shop_settings: settings.shop,
      period: {
        filter_label: filterLabel,
        start_date: startDate?.toISOString(),
        end_date: endDate?.toISOString()
      },
      kpi: {
        total_invoiced: Number(periodInvoiced.toFixed(2)),
        total_paid: Number(periodPaid.toFixed(2)),
        invoices_count: filteredBills.length,
        total_units_bought: Number(periodUnits.toFixed(2))
      },
      date_groups,
      reconciliation: {
        period_purchases: Number(periodInvoiced.toFixed(2)),
        period_payments: Number(periodPaid.toFixed(2)),
        current_outstanding_balance: Number(currentOutstandingBalance.toFixed(2)),
        advance_balance: Number(customer.advance_balance || 0)
      }
    };
  }
}


