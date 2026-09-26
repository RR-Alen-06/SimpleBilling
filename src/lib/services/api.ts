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
  /**
   * Helper to retrieve currently authenticated tenant user ID
   */
  static async getUserId(): Promise<string | null> {
    if (!isSupabaseConfigured) return null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      return user?.id || null;
    } catch {
      return null;
    }
  }


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
    const userId = await this.getUserId();
    let query = supabase.from('sequences').select('*').eq('key', key.toUpperCase());
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data: seq } = await query.maybeSingle();

    const prefix = seq?.prefix || key.slice(0, 3).toUpperCase();
    const padding = seq?.padding || 6;
    const nextVal = (seq?.current_val || 0) + 1;

    await supabase.from('sequences').upsert({
      key: key.toUpperCase(),
      prefix,
      padding,
      current_val: nextVal,
      ...(userId ? { user_id: userId } : {}),
      updated_at: new Date().toISOString()
    });

    return `${prefix}-${String(nextVal).padStart(padding, '0')}`;
  }


  static async getSequences(): Promise<SequenceConfig[]> {
    if (!isSupabaseConfigured) return [];
    const userId = await this.getUserId();
    let query = supabase.from('sequences').select('*');
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query.order('key', { ascending: true });
    if (error) return [];
    return data || [];
  }


  static async updateSequenceConfig(key: string, prefix: string, padding: number, userName = 'Super Admin'): Promise<void> {
    if (!isSupabaseConfigured) return;
    const userId = await this.getUserId();
    const { error } = await supabase.from('sequences').upsert({
      key: key.toUpperCase(),
      prefix: prefix.toUpperCase(),
      padding: Math.min(12, Math.max(2, padding)),
      ...(userId ? { user_id: userId } : {}),
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


  static async getLoyaltyRedemptionRules(): Promise<LoyaltyRedemptionRule[]> {
    if (!isSupabaseConfigured) {
      return [];
    }

    const userId = await this.getUserId();
    let query = supabase
      .from('loyalty_redemption_rules')
      .select('*');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.order('points_required', { ascending: true });

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
      let delQuery = supabase.from('loyalty_redemption_rules').delete().in('id', duplicateIdsToDelete);
      if (userId) {
        delQuery = delQuery.eq('user_id', userId);
      }
      delQuery.then();
    }

    return uniqueRules;
  }


  static async clearAllLoyaltyRedemptionRules(userName = 'Super Admin'): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const userId = await this.getUserId();
    let query = supabase.from('loyalty_redemption_rules').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { error } = await query;
    if (error) throw new Error(error.message);

    await this.logAudit({
      user_name: userName,
      action: 'CLEAR_ALL_LOYALTY_REDEMPTION_RULES',
      entity: 'All Redemption Rules'
    });
  }


  static async addLoyaltyRedemptionRule(rule: Omit<LoyaltyRedemptionRule, 'id' | 'created_at'>, userName = 'Super Admin'): Promise<LoyaltyRedemptionRule> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const userId = await this.getUserId();

    // Prevent duplicate points_required rules
    let checkQuery = supabase
      .from('loyalty_redemption_rules')
      .select('id, points_required')
      .eq('points_required', rule.points_required);

    if (userId) {
      checkQuery = checkQuery.eq('user_id', userId);
    }

    const { data: existing } = await checkQuery.maybeSingle();

    if (existing) {
      throw new Error(`A redemption rule for ${rule.points_required} Points already exists. Please edit the existing rule.`);
    }

    const payload = {
      ...rule,
      ...(userId ? { user_id: userId } : {})
    };

    const { data, error } = await supabase.from('loyalty_redemption_rules').insert([payload]).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Failed to create loyalty redemption rule');

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
    const userId = await this.getUserId();

    let query = supabase.from('loyalty_redemption_rules').update(rule).eq('id', id);
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      throw new Error('Loyalty redemption rule not found');
    }

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
    const userId = await this.getUserId();

    // Verify existence & ownership
    let checkQuery = supabase.from('loyalty_redemption_rules').select('id').eq('id', id);
    if (userId) {
      checkQuery = checkQuery.eq('user_id', userId);
    }
    const { data: existing } = await checkQuery.maybeSingle();
    if (!existing) {
      throw new Error('Loyalty redemption rule not found');
    }

    let delQuery = supabase.from('loyalty_redemption_rules').delete().eq('id', id);
    if (userId) {
      delQuery = delQuery.eq('user_id', userId);
    }
    const { error } = await delQuery;
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

    const userId = await this.getUserId();
    let query = supabase.from('loyalty_rules').select('*');
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching loyalty rules:', error);
      return [];
    }

    if (!data || data.length === 0) return [];

    // Deduplicate by rule_name
    const seen = new Set<string>();
    const uniqueRules: LoyaltyRule[] = [];
    const duplicateIdsToDelete: string[] = [];

    for (const rule of data) {
      const normalizedName = rule.rule_name?.trim().toLowerCase() || '';
      if (!seen.has(normalizedName)) {
        seen.add(normalizedName);
        uniqueRules.push(rule);
      } else {
        duplicateIdsToDelete.push(rule.id);
      }
    }

    if (duplicateIdsToDelete.length > 0) {
      let delQuery = supabase.from('loyalty_rules').delete().in('id', duplicateIdsToDelete);
      if (userId) {
        delQuery = delQuery.eq('user_id', userId);
      }
      delQuery.then();
    }

    return uniqueRules;
  }


  static async clearAllLoyaltyRules(userName = 'Super Admin'): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const userId = await this.getUserId();
    let query = supabase.from('loyalty_rules').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { error } = await query;
    if (error) throw new Error(error.message);

    await this.logAudit({
      user_name: userName,
      action: 'CLEAR_ALL_LOYALTY_RULES',
      entity: 'All Loyalty Rules'
    });
  }


  static async addLoyaltyRule(rule: Omit<LoyaltyRule, 'id' | 'created_at'>, userName = 'Super Admin'): Promise<LoyaltyRule> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const userId = await this.getUserId();

    let checkQuery = supabase
      .from('loyalty_rules')
      .select('id, rule_name')
      .ilike('rule_name', rule.rule_name.trim());

    if (userId) {
      checkQuery = checkQuery.eq('user_id', userId);
    }

    const { data: existing } = await checkQuery.maybeSingle();

    if (existing) {
      throw new Error(`A loyalty rule with the name "${rule.rule_name}" already exists.`);
    }

    const payload = {
      ...rule,
      ...(userId ? { user_id: userId } : {})
    };

    const { data, error } = await supabase.from('loyalty_rules').insert([payload]).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Failed to create loyalty rule');

    await this.logAudit({
      user_name: userName,
      action: 'ADD_LOYALTY_RULE',
      entity: `Loyalty Rule (${rule.rule_name})`,
      new_value: JSON.stringify(data)
    });

    return data;
  }


  static async updateLoyaltyRule(id: string, rule: Partial<Omit<LoyaltyRule, 'id' | 'created_at'>>, userName = 'Super Admin'): Promise<LoyaltyRule> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const userId = await this.getUserId();

    let query = supabase.from('loyalty_rules').update(rule).eq('id', id);
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      throw new Error('Loyalty rule not found');
    }

    await this.logAudit({
      user_name: userName,
      action: 'UPDATE_LOYALTY_RULE',
      entity: `Loyalty Rule ID ${id}`,
      new_value: JSON.stringify(data)
    });

    return data;
  }


  static async deleteLoyaltyRule(id: string, userName = 'Super Admin'): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const userId = await this.getUserId();

    // Verify existence & ownership
    let checkQuery = supabase.from('loyalty_rules').select('id').eq('id', id);
    if (userId) {
      checkQuery = checkQuery.eq('user_id', userId);
    }
    const { data: existing } = await checkQuery.maybeSingle();
    if (!existing) {
      throw new Error('Loyalty rule not found');
    }

    let delQuery = supabase.from('loyalty_rules').delete().eq('id', id);
    if (userId) {
      delQuery = delQuery.eq('user_id', userId);
    }
    const { error } = await delQuery;
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
    if (!isSupabaseConfigured) {
      return DEFAULT_SETTINGS;
    }

    const userId = await this.getUserId();
    let query = supabase.from('settings').select('*');
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error || !data) return DEFAULT_SETTINGS;

    const merged = { ...DEFAULT_SETTINGS };
    data.forEach((row: { key: string; value: unknown }) => {
      const k = row.key as keyof AllSettings;
      if (k in merged) {
        (merged as unknown as Record<string, unknown>)[k] = {
          ...((merged as unknown as Record<string, unknown>)[k] as Record<string, unknown>),
          ...(row.value as Record<string, unknown>)
        };
      }
    });
    return merged;
  }


  static async saveSettings(key: keyof AllSettings, value: unknown, userName = 'Super Admin'): Promise<void> {
    if (!isSupabaseConfigured) return;
    const userId = await this.getUserId();
    
    const prev = await this.getSettings();
    const { error } = await supabase.from('settings').upsert({
      key,
      value,
      ...(userId ? { user_id: userId } : {}),
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


  static async logAudit(log: Omit<AuditLog, 'id' | 'created_at'>): Promise<void> {
    if (!isSupabaseConfigured) return;
    try {
      const userId = await this.getUserId();
      const auditNumber = await this.getNextSequence('AUDIT');
      await supabase.from('audit_logs').insert([{
        ...log,
        ...(userId ? { user_id: userId } : {}),
        audit_number: auditNumber
      }]);
    } catch (err) {
      console.error('Audit logging error:', err);
    }
  }


  static async getAuditLogs(): Promise<AuditLog[]> {
    if (!isSupabaseConfigured) return [];
    const userId = await this.getUserId();
    let query = supabase
      .from('audit_logs')
      .select('*');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(200);
    if (error) return [];
    return data || [];
  }


  static async getProducts(): Promise<Product[]> {
    if (!isSupabaseConfigured) return [];
    const userId = await this.getUserId();
    let query = supabase
      .from('products')
      .select('*');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.order('name', { ascending: true });
    if (error) return [];
    return data || [];
  }


  static async getProductById(id: string): Promise<Product | null> {
    if (!isSupabaseConfigured) return null;
    try {
      const userId = await this.getUserId();
      let query = supabase
        .from('products')
        .select('*')
        .eq('id', id);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query.maybeSingle();
      if (error || !data) return null;
      return data;
    } catch {
      return null;
    }
  }


  static async addProduct(product: Omit<Product, 'id' | 'created_at'>, userName = 'Admin'): Promise<Product> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const userId = await this.getUserId();
    const product_code = await this.getNextSequence('PRODUCT');

    const payload = {
      ...product,
      product_code,
      ...(userId ? { user_id: userId } : {})
    };

    const { data, error } = await supabase
      .from('products')
      .insert([payload])
      .select()
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Failed to create product');

    await this.logAudit({
      user_name: userName,
      action: 'CREATE_PRODUCT',
      entity: `Product ${product.name}`,
      new_value: JSON.stringify(data)
    });

    return data;
  }


  static async updateProduct(id: string, product: Partial<Omit<Product, 'id' | 'created_at'>>, userName = 'Admin'): Promise<Product> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const userId = await this.getUserId();

    let query = supabase
      .from('products')
      .update(product)
      .eq('id', id);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query
      .select()
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      throw new Error('Product not found');
    }

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
    const userId = await this.getUserId();

    // Verify existence & ownership
    const existing = await this.getProductById(id);
    if (!existing) {
      throw new Error('Product not found');
    }

    let delQuery = supabase.from('products').delete().eq('id', id);
    if (userId) {
      delQuery = delQuery.eq('user_id', userId);
    }

    const { error } = await delQuery;
    if (error) throw new Error(error.message);

    await this.logAudit({
      user_name: userName,
      action: 'DELETE_PRODUCT',
      entity: `Product ID ${id}`
    });
  }


  static async getCustomers(): Promise<Customer[]> {
    if (!isSupabaseConfigured) return [];
    const userId = await this.getUserId();
    let query = supabase
      .from('customers')
      .select('*');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.order('name', { ascending: true });
    if (error) return [];
    return data || [];
  }


  static async addCustomer(customer: { name: string; mobile?: string; email?: string }, userName = 'Admin'): Promise<Customer> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const userId = await this.getUserId();
    const customer_code = await this.getNextSequence('CUSTOMER');

    const payload = {
      name: customer.name,
      mobile: customer.mobile || null,
      email: customer.email || null,
      customer_code,
      advance_balance: 0,
      loyalty_points: 0,
      ...(userId ? { user_id: userId } : {})
    };

    const { data, error } = await supabase
      .from('customers')
      .insert([payload])
      .select()
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Failed to create customer');

    await this.logAudit({
      user_name: userName,
      action: 'CREATE_CUSTOMER',
      entity: `Customer ${customer.name}`,
      new_value: JSON.stringify(data)
    });

    return data;
  }


  static async updateCustomer(id: string, customer: { name: string; mobile?: string; email?: string }, userName = 'Admin'): Promise<Customer> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const userId = await this.getUserId();

    let query = supabase
      .from('customers')
      .update({
        name: customer.name,
        mobile: customer.mobile || null,
        email: customer.email || null
      })
      .eq('id', id);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query
      .select()
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      throw new Error('Customer not found');
    }

    await this.logAudit({
      user_name: userName,
      action: 'UPDATE_CUSTOMER',
      entity: `Customer ${customer.name}`,
      new_value: JSON.stringify(data)
    });

    return data;
  }


  static async getCustomerSummaries(): Promise<CustomerSummary[]> {
    const customers = await this.getCustomers();
    if (!customers.length) return [];

    const userId = await this.getUserId();
    let billsQuery = supabase.from('bills').select('customer_id, grand_total, paid_total');
    let paymentsQuery = supabase.from('payments').select('customer_id, amount, bill_id, status');

    if (userId) {
      billsQuery = billsQuery.eq('user_id', userId);
      paymentsQuery = paymentsQuery.eq('user_id', userId);
    }

    const { data: bills } = await billsQuery;
    const { data: payments } = await paymentsQuery;

    return customers.map(cust => {
      const custBills = (bills || []).filter(b => b.customer_id === cust.id);
      const custPayments = (payments || []).filter(
        p => p.customer_id === cust.id && p.status !== 'CANCELLED' && p.status !== 'REVERSED'
      );

      const totalBilled = custBills.reduce((sum, b) => sum + Number(b.grand_total || 0), 0);
      const totalPaid = custBills.reduce((sum, b) => sum + Number(b.paid_total || 0), 0);
      const totalUnallocatedPayments = custPayments
        .filter(p => !p.bill_id)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const dues = Math.max(0, totalBilled - totalPaid);

      return {
        id: cust.id,
        user_id: cust.user_id,
        name: cust.name,
        mobile: cust.mobile,
        email: cust.email,
        customer_code: cust.customer_code,
        advance_balance: Number(cust.advance_balance || 0),
        loyalty_points: Number(cust.loyalty_points || 0),
        total_billed: Number(totalBilled.toFixed(2)),
        total_paid: Number((totalPaid + totalUnallocatedPayments).toFixed(2)),
        balance_due: Number(dues.toFixed(2)),
        created_at: cust.created_at
      };
    });
  }


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
    const userId = await this.getUserId();

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
    const grandTotal = roundedTotal;

    const directCashPaid = Number(billData.cash_paid || 0);
    const directUpiPaid = Number(billData.upi_paid || 0);
    const advanceUsed = Number(billData.advance_used || 0);
    const totalDirectPaid = directCashPaid + directUpiPaid;
    const totalTendered = totalDirectPaid + advanceUsed;

    // Verify customer if provided
    let verifiedCustomer: Customer | null = null;
    if (billData.customer_id) {
      let custQuery = supabase.from('customers').select('*').eq('id', billData.customer_id);
      if (userId) custQuery = custQuery.eq('user_id', userId);
      const { data: custData, error: custErr } = await custQuery.maybeSingle();
      if (custErr || !custData) {
        throw new Error('Customer not found');
      }
      verifiedCustomer = custData;
    }

    // Auto-allocate payment if paid exceeds grand total or against older bills
    let paidTotal = Math.min(grandTotal, totalTendered);
    let advanceEarned = 0;

    if (billData.customer_id && totalTendered > 0) {
      let olderBillsQuery = supabase
        .from('bills')
        .select('*')
        .eq('customer_id', billData.customer_id);

      if (userId) olderBillsQuery = olderBillsQuery.eq('user_id', userId);

      const { data: olderBills } = await olderBillsQuery.order('created_at', { ascending: true });

      const unpaidOlderBills = (olderBills || []).filter(b => Number(b.paid_total || 0) < Number(b.grand_total || 0));

      let availablePayment = totalTendered;

      for (const oldBill of unpaidOlderBills) {
        if (availablePayment <= 0) break;
        const due = Number(oldBill.grand_total || 0) - Number(oldBill.paid_total || 0);
        const allocate = Math.min(due, availablePayment);
        const newPaidTotal = Number((Number(oldBill.paid_total || 0) + allocate).toFixed(2));

        let updateOldBillQ = supabase
          .from('bills')
          .update({ paid_total: newPaidTotal })
          .eq('id', oldBill.id);

        if (userId) updateOldBillQ = updateOldBillQ.eq('user_id', userId);
        await updateOldBillQ;

        const pSeq = await this.getNextSequence('PAYMENT');
        await supabase.from('payments').insert([{
          payment_number: pSeq,
          customer_id: billData.customer_id,
          bill_id: oldBill.id,
          amount: allocate,
          payment_method: 'Auto-Allocation',
          status: 'COMPLETED',
          notes: `Payment auto-cleared against outstanding Bill ${oldBill.bill_number}`,
          ...(userId ? { user_id: userId } : {})
        }]);

        availablePayment -= allocate;
      }

      paidTotal = Math.min(grandTotal, availablePayment);
      availablePayment -= paidTotal;

      if (availablePayment > 0) {
        advanceEarned = Number(availablePayment.toFixed(2));
      }
    } else if (totalTendered > grandTotal) {
      advanceEarned = Number((totalTendered - grandTotal).toFixed(2));
    }

    let primaryPaymentMethod: PaymentMethod = 'Cash';
    if (directUpiPaid > 0 && directCashPaid === 0) primaryPaymentMethod = 'UPI';
    else if (advanceUsed > 0 && directCashPaid === 0 && directUpiPaid === 0) primaryPaymentMethod = 'Advance Used';
    else if (directCashPaid > 0 && directUpiPaid > 0) primaryPaymentMethod = 'Split Payment';

    const bill_number = await this.getNextSequence('BILL');

    const billPayload = {
      bill_number,
      customer_id: billData.customer_id || null,
      total: billData.total,
      discount: totalDiscountApplied,
      gst_amount: gstAmount,
      rounding_method: billData.rounding_method,
      rounding_adjustment: roundingAdjustment,
      grand_total: grandTotal,
      cash_paid: directCashPaid,
      upi_paid: directUpiPaid,
      paid_total: paidTotal,
      advance_used: advanceUsed,
      advance_earned: advanceEarned,
      payment_method: primaryPaymentMethod,
      loyalty_points_earned: 0,
      loyalty_points_redeemed: billData.points_to_redeem || 0,
      ...(userId ? { user_id: userId } : {})
    };

    const { data: bill, error: billErr } = await supabase
      .from('bills')
      .insert([billPayload])
      .select('*, customers(name, mobile, email)')
      .maybeSingle();

    if (billErr) throw new Error(billErr.message);
    if (!bill) throw new Error('Failed to create bill');

    const itemsToInsert = billData.items.map(item => ({
      bill_id: bill.id,
      product_id: item.product_id || null,
      product_name: item.product_name,
      quantity: item.quantity,
      price: item.price,
      total: item.total,
      ...(userId ? { user_id: userId } : {})
    }));

    const { error: itemsErr } = await supabase.from('bill_items').insert(itemsToInsert);
    if (itemsErr) throw new Error(itemsErr.message);

    if (billData.customer_id && totalDirectPaid > 0) {
      const paySeq = await this.getNextSequence('PAYMENT');
      await supabase.from('payments').insert([{
        payment_number: paySeq,
        customer_id: billData.customer_id,
        bill_id: bill.id,
        amount: totalDirectPaid,
        payment_method: primaryPaymentMethod,
        status: 'COMPLETED',
        notes: `Initial payment for Bill ${bill.bill_number}`,
        ...(userId ? { user_id: userId } : {})
      }]);
    }

    if (billData.customer_id && paidTotal >= grandTotal - 0.01 && grandTotal > 0) {
      const pointsEarned = await this.calculateLoyaltyPointsEarned(grandTotal);
      if (pointsEarned > 0) {
        const loySeq = await this.getNextSequence('LOYALTY');
        await supabase.from('loyalty_transactions').insert([{
          transaction_number: loySeq,
          customer_id: billData.customer_id,
          bill_id: bill.id,
          points: pointsEarned,
          type: 'EARN',
          notes: `Award Reason: Bill Fully Paid - ${bill.bill_number}`,
          ...(userId ? { user_id: userId } : {})
        }]);

        let updateBillQ = supabase
          .from('bills')
          .update({ loyalty_points_earned: pointsEarned })
          .eq('id', bill.id);

        if (userId) updateBillQ = updateBillQ.eq('user_id', userId);
        await updateBillQ;
        bill.loyalty_points_earned = pointsEarned;
      }
    }

    if (billData.customer_id && billData.points_to_redeem > 0) {
      const redSeq = await this.getNextSequence('LOYALTY');
      await supabase.from('loyalty_transactions').insert([{
        transaction_number: redSeq,
        customer_id: billData.customer_id,
        bill_id: bill.id,
        points: -billData.points_to_redeem,
        type: 'REDEEM',
        notes: `Redemption: Redeemed on Bill ${bill.bill_number} (Discount: ₹${redemptionDiscount})`,
        ...(userId ? { user_id: userId } : {})
      }]);
    }

    if (billData.customer_id && verifiedCustomer) {
      const currentAdvance = Number(verifiedCustomer.advance_balance || 0);
      const currentLoyalty = Number(verifiedCustomer.loyalty_points || 0);
      const pointsEarnedNow = bill.loyalty_points_earned || 0;

      const newAdvance = Math.max(0, currentAdvance - advanceUsed + advanceEarned);
      const newLoyalty = Math.max(0, currentLoyalty - (billData.points_to_redeem || 0) + pointsEarnedNow);

      let updateCustQ = supabase.from('customers').update({
        advance_balance: newAdvance,
        loyalty_points: newLoyalty
      }).eq('id', billData.customer_id);

      if (userId) updateCustQ = updateCustQ.eq('user_id', userId);
      await updateCustQ;
    }

    await this.logAudit({
      user_name: userName,
      action: 'CREATE_BILL',
      entity: `Bill ${bill.bill_number}`,
      new_value: `Grand Total: ₹${grandTotal}, Paid: ₹${paidTotal}, Advance Earned: ₹${advanceEarned}`
    });

    return this.formatBillRow({
      ...bill,
      items: billData.items.map((item, idx) => ({
        id: `temp-${idx}`,
        bill_id: bill.id,
        product_id: item.product_id || null,
        product_name: item.product_name,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
        created_at: new Date().toISOString()
      }))
    });
  }


  public static formatBillRow(row: any): Bill {
    if (!row) return row;
    const cust = Array.isArray(row.customers) ? row.customers[0] : row.customers;
    const rawItems = row.items || row.bill_items || [];
    const formattedItems = rawItems.map((it: any) => ({
      ...it,
      price: Number(it.price || 0),
      quantity: Number(it.quantity || 0),
      total: Number(it.total || 0)
    }));

    return {
      ...row,
      customer_name: row.customer_name || cust?.name || (row.customer_id ? 'Customer' : 'Walk-in Customer'),
      customer_mobile: row.customer_mobile || cust?.mobile || null,
      customer_email: row.customer_email || cust?.email || null,
      items: formattedItems,
      bill_items: formattedItems
    };
  }


  static async editBillDiscount(billId: string, newDiscount: number, reason: string, userName = 'Super Admin'): Promise<Bill> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const userId = await this.getUserId();

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

    let updateQuery = supabase
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
      .eq('id', billId);

    if (userId) {
      updateQuery = updateQuery.eq('user_id', userId);
    }

    const { data: updatedBill, error } = await updateQuery
      .select('*, customers(name, mobile, email)')
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!updatedBill) throw new Error('Bill not found');

    await this.logAudit({
      user_name: userName,
      action: 'EDIT_BILL_DISCOUNT',
      entity: `Bill ${updatedBill.bill_number}`,
      previous_value: `Discount: ₹${bill.discount}, Grand Total: ₹${bill.grand_total}`,
      new_value: `New Discount: ₹${newDiscount}, New Grand Total: ₹${newGrandTotal}, Reason: ${reason}`
    });

    return this.formatBillRow(updatedBill);
  }


  static async getBills(): Promise<Bill[]> {
    if (!isSupabaseConfigured) return [];
    const userId = await this.getUserId();
    let query = supabase
      .from('bills')
      .select('*, customers(name, mobile, email)');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return [];
    return (data || []).map(b => this.formatBillRow(b));
  }


  static async getBillsByDateRange(filter: DateFilterOption, customRange?: { from: string; to: string }): Promise<Bill[]> {
    if (!isSupabaseConfigured) return [];
    const userId = await this.getUserId();

    let query = supabase
      .from('bills')
      .select('*, customers(name, mobile, email), bill_items(*)');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { startDate, endDate } = this.getDateRangeBounds(filter, customRange);

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }
    if (endDate) {
      query = query.lte('created_at', endDate.toISOString());
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching bills by date range:', error);
      return [];
    }
    return (data || []).map(b => this.formatBillRow(b));
  }


  static async getBillById(id: string): Promise<Bill | null> {
    if (!isSupabaseConfigured) return null;
    const userId = await this.getUserId();

    let billQuery = supabase
      .from('bills')
      .select('*, customers(name, mobile, email)')
      .eq('id', id);

    if (userId) {
      billQuery = billQuery.eq('user_id', userId);
    }

    const { data: bill, error: billErr } = await billQuery.maybeSingle();
    if (billErr || !bill) return null;

    let itemsQuery = supabase
      .from('bill_items')
      .select('*')
      .eq('bill_id', id);

    if (userId) {
      itemsQuery = itemsQuery.eq('user_id', userId);
    }

    const { data: items, error: itemsErr } = await itemsQuery;
    if (itemsErr) return null;

    return this.formatBillRow({
      ...bill,
      items: items || [],
      bill_items: items || []
    });
  }


  static async getCustomerLedger(customerId: string): Promise<{
    customer: Customer | null;
    entries: CustomerLedgerEntry[];
    totalBilled: number;
    totalPaid: number;
    runningBalance: number;
    pendingPoints: number;
  }> {
    if (!isSupabaseConfigured) {
      return { customer: null, entries: [], totalBilled: 0, totalPaid: 0, runningBalance: 0, pendingPoints: 0 };
    }
    const userId = await this.getUserId();

    let custQuery = supabase
      .from('customers')
      .select('*')
      .eq('id', customerId);

    if (userId) {
      custQuery = custQuery.eq('user_id', userId);
    }

    const { data: customer, error: custErr } = await custQuery.maybeSingle();
    if (custErr || !customer) {
      return { customer: null, entries: [], totalBilled: 0, totalPaid: 0, runningBalance: 0, pendingPoints: 0 };
    }

    let billsQuery = supabase
      .from('bills')
      .select('*, bill_items(*)')
      .eq('customer_id', customerId);

    let paymentsQuery = supabase
      .from('payments')
      .select('*')
      .eq('customer_id', customerId);

    if (userId) {
      billsQuery = billsQuery.eq('user_id', userId);
      paymentsQuery = paymentsQuery.eq('user_id', userId);
    }

    const { data: bills } = await billsQuery.order('created_at', { ascending: true });
    const { data: payments } = await paymentsQuery.order('created_at', { ascending: true });

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
      items_summary: string;
      payment_method: string;
      items?: {
        product_name: string;
        quantity: number;
        price: number;
        total: number;
      }[];
    }[] = [];

    let totalBilled = 0;
    let totalPaid = 0;

    (bills || []).forEach(b => {
      const grand = Number(b.grand_total || 0);
      const items = (b.bill_items as BillItem[]) || [];
      const itemsSummary = items.map(i => `${i.product_name} (${i.quantity})`).join(', ');

      totalBilled += grand;

      rawEvents.push({
        date: b.created_at,
        type: 'BILL',
        reference_no: b.bill_number,
        description: itemsSummary || 'Invoice billed',
        bill_amount: grand,
        paid_amount: 0,
        advance_used: Number(b.advance_used || 0),
        loyalty_points: Number(b.loyalty_points_earned || 0),
        items_summary: itemsSummary,
        payment_method: b.payment_method || 'Cash',
        items: items.map(it => ({
          product_name: it.product_name,
          quantity: it.quantity,
          price: it.price,
          total: it.total
        }))
      });
    });

    (payments || []).forEach(p => {
      const amt = Number(p.amount || 0);
      totalPaid += amt;

      rawEvents.push({
        date: p.created_at,
        type: 'PAYMENT',
        reference_no: p.payment_number || 'PAY',
        description: p.notes || `Payment received via ${p.payment_method || 'Cash'}`,
        bill_amount: 0,
        paid_amount: amt,
        advance_used: 0,
        loyalty_points: 0,
        items_summary: '',
        payment_method: p.payment_method || 'Cash'
      });
    });

    rawEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = 0;
    const entries: CustomerLedgerEntry[] = rawEvents.map((evt, idx) => {
      if (evt.type === 'BILL') {
        runningBalance += evt.bill_amount;
      } else {
        runningBalance -= evt.paid_amount;
      }

      return {
        id: `entry-${idx}`,
        date: evt.date,
        type: evt.type,
        reference_no: evt.reference_no,
        description: evt.description,
        bill_amount: evt.bill_amount,
        paid_amount: evt.paid_amount,
        advance_used: evt.advance_used,
        loyalty_points: evt.loyalty_points,
        running_balance: Number(runningBalance.toFixed(2)),
        items: evt.items
      };
    });

    return {
      customer,
      entries,
      totalBilled: Number(totalBilled.toFixed(2)),
      totalPaid: Number(totalPaid.toFixed(2)),
      runningBalance: Number(runningBalance.toFixed(2)),
      pendingPoints
    };
  }


  static async processBillFullPaymentLoyalty(billId: string): Promise<number> {
    if (!isSupabaseConfigured || !billId) return 0;
    const userId = await this.getUserId();

    let billQuery = supabase.from('bills').select('*').eq('id', billId);
    if (userId) {
      billQuery = billQuery.eq('user_id', userId);
    }
    const { data: bill, error } = await billQuery.maybeSingle();
    if (error || !bill || !bill.customer_id) return 0;

    const settings = await this.getSettings();
    if (!settings.loyalty.enabled) return 0;

    // Prevent duplicate loyalty awards for the same bill
    let existingEarnQuery = supabase
      .from('loyalty_transactions')
      .select('id')
      .eq('bill_id', billId)
      .eq('type', 'EARN');

    if (userId) {
      existingEarnQuery = existingEarnQuery.eq('user_id', userId);
    }

    const { data: existingEarnTx } = await existingEarnQuery;

    if (existingEarnTx && existingEarnTx.length > 0) {
      return 0; // Already awarded!
    }

    // Determine total payments for this specific bill
    let paymentsQuery = supabase.from('payments').select('amount, status').eq('bill_id', billId);
    if (userId) {
      paymentsQuery = paymentsQuery.eq('user_id', userId);
    }
    const { data: billPayments } = await paymentsQuery;
    const directPaymentsSum = (billPayments || [])
      .filter(p => p.status !== 'CANCELLED' && p.status !== 'REVERSED')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
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
      notes: `Award Reason: Bill Fully Paid - ${bill.bill_number}`,
      ...(userId ? { user_id: userId } : {})
    }]);

    // Update bill record
    let updateBillQuery = supabase.from('bills').update({
      loyalty_points_earned: pointsEarned
    }).eq('id', billId);

    if (userId) {
      updateBillQuery = updateBillQuery.eq('user_id', userId);
    }
    await updateBillQuery;

    // Update customer loyalty points balance
    let custQuery = supabase.from('customers').select('loyalty_points').eq('id', bill.customer_id);
    if (userId) {
      custQuery = custQuery.eq('user_id', userId);
    }
    const { data: cust } = await custQuery.maybeSingle();

    if (cust) {
      const currentPoints = Number(cust.loyalty_points || 0);
      let updateCustQuery = supabase.from('customers').update({
        loyalty_points: currentPoints + pointsEarned
      }).eq('id', bill.customer_id);

      if (userId) {
        updateCustQuery = updateCustQuery.eq('user_id', userId);
      }
      await updateCustQuery;
    }

    return pointsEarned;
  }


  static async reverseLoyaltyPointsForBill(billId: string, userName = 'Admin'): Promise<number> {
    if (!isSupabaseConfigured || !billId) return 0;
    const userId = await this.getUserId();

    let billQuery = supabase.from('bills').select('*').eq('id', billId);
    if (userId) {
      billQuery = billQuery.eq('user_id', userId);
    }
    const { data: bill } = await billQuery.maybeSingle();
    if (!bill || !bill.customer_id) return 0;

    let earnTxQuery = supabase
      .from('loyalty_transactions')
      .select('*')
      .eq('bill_id', billId)
      .eq('type', 'EARN');

    if (userId) {
      earnTxQuery = earnTxQuery.eq('user_id', userId);
    }

    const { data: earnTxs } = await earnTxQuery;

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
        notes: `Loyalty Reversal: Bill Cancelled/Refunded (${bill.bill_number})`,
        ...(userId ? { user_id: userId } : {})
      }]);

      let custQuery = supabase.from('customers').select('loyalty_points').eq('id', bill.customer_id);
      if (userId) {
        custQuery = custQuery.eq('user_id', userId);
      }
      const { data: cust } = await custQuery.maybeSingle();

      if (cust) {
        const currentPoints = Number(cust.loyalty_points || 0);
        let updateCustQuery = supabase.from('customers').update({
          loyalty_points: Math.max(0, currentPoints - totalPointsToReverse)
        }).eq('id', bill.customer_id);

        if (userId) {
          updateCustQuery = updateCustQuery.eq('user_id', userId);
        }
        await updateCustQuery;
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
    const userId = await this.getUserId();

    let custQ = supabase.from('customers').select('*');
    let billsQ = supabase.from('bills').select('*');
    let txQ = supabase.from('loyalty_transactions').select('*');

    if (userId) {
      custQ = custQ.eq('user_id', userId);
      billsQ = billsQ.eq('user_id', userId);
      txQ = txQ.eq('user_id', userId);
    }

    const { data: customers, error: custErr } = await custQ;
    if (custErr) throw new Error(custErr.message);

    const { data: bills, error: billsErr } = await billsQ;
    if (billsErr) throw new Error(billsErr.message);

    const { data: transactions, error: txErr } = await txQ;
    if (txErr) throw new Error(txErr.message);

    let customersUpdated = 0;
    let billsUpdated = 0;
    let totalActivePoints = 0;

    for (const cust of (customers || [])) {
      const custBills = (bills || []).filter(b => b.customer_id === cust.id);
      const custTxs = (transactions || []).filter(t => t.customer_id === cust.id);

      let customerEarnedPoints = 0;

      for (const bill of custBills) {
        const grandTotal = Number(bill.grand_total || 0);
        const paidTotal = Number(bill.paid_total || 0);
        const isPaid = paidTotal >= grandTotal - 0.01 && grandTotal > 0;

        if (isPaid) {
          const expectedPoints = await this.calculateLoyaltyPointsEarned(grandTotal);
          customerEarnedPoints += expectedPoints;

          if (Number(bill.loyalty_points_earned || 0) !== expectedPoints) {
            let updateBillQ = supabase.from('bills').update({ loyalty_points_earned: expectedPoints }).eq('id', bill.id);
            if (userId) updateBillQ = updateBillQ.eq('user_id', userId);
            await updateBillQ;
            billsUpdated++;
          }
        } else {
          if (Number(bill.loyalty_points_earned || 0) !== 0) {
            let updateBillQ = supabase.from('bills').update({ loyalty_points_earned: 0 }).eq('id', bill.id);
            if (userId) updateBillQ = updateBillQ.eq('user_id', userId);
            await updateBillQ;
            billsUpdated++;
          }
        }
      }

      let totalRedeemed = 0;
      let totalAdjusted = 0;
      for (const tx of custTxs) {
        if (tx.type === 'REDEEM') {
          totalRedeemed += Math.abs(Number(tx.points || 0));
        } else if (tx.type === 'ADJUST') {
          totalAdjusted += Number(tx.points || 0);
        }
      }

      const calculatedLoyalty = Math.max(0, customerEarnedPoints - totalRedeemed + totalAdjusted);
      totalActivePoints += calculatedLoyalty;

      if (Number(cust.loyalty_points || 0) !== calculatedLoyalty) {
        let updateCustQ = supabase.from('customers').update({ loyalty_points: calculatedLoyalty }).eq('id', cust.id);
        if (userId) updateCustQ = updateCustQ.eq('user_id', userId);
        await updateCustQ;
        customersUpdated++;
      }
    }

    await this.logAudit({
      user_name: userName,
      action: 'RECALCULATE_LOYALTY_POINTS',
      entity: 'All Customers',
      new_value: `Processed ${(customers || []).length} customers, updated ${customersUpdated} customer balances, ${billsUpdated} bills. Total active points: ${totalActivePoints}`
    });

    return {
      customersProcessed: (customers || []).length,
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
      const userId = await this.getUserId();

      let custQ = supabase.from('customers').select('*').eq('id', bill.customer_id);
      let billsQ = supabase.from('bills').select('*').eq('customer_id', bill.customer_id).order('created_at', { ascending: true });
      let payQ = supabase.from('payments').select('*').eq('customer_id', bill.customer_id).order('created_at', { ascending: true });
      let loyQ = supabase.from('loyalty_transactions').select('*').eq('customer_id', bill.customer_id).order('created_at', { ascending: true });

      if (userId) {
        custQ = custQ.eq('user_id', userId);
        billsQ = billsQ.eq('user_id', userId);
        payQ = payQ.eq('user_id', userId);
        loyQ = loyQ.eq('user_id', userId);
      }

      const [settings, { data: customer }, { data: allCustBills }, { data: allCustPayments }, { data: allCustLoyalty }] = await Promise.all([
        this.getSettings(),
        custQ.maybeSingle(),
        billsQ,
        payQ,
        loyQ
      ]);

      if (!customer) return defaultSummary;

      // Index-based partitioning: find current bill's position in customer's bill history
      const billList = allCustBills || [];
      const billIndex = billList.findIndex(b => b.id === bill.id);
      const priorBills = billIndex > 0 ? billList.slice(0, billIndex) : (billIndex === -1 ? billList.filter(b => b.created_at < (bill.created_at || '')) : []);

      const priorBillIds = new Set(priorBills.map(b => b.id));
      const billTimestamp = new Date(bill.created_at || Date.now()).getTime();

      const priorPayments = (allCustPayments || [])
        .filter(p => p.status !== 'CANCELLED' && p.status !== 'REVERSED')
        .filter(p => {
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
        let earnTxQuery = supabase
          .from('loyalty_transactions')
          .select('*')
          .eq('bill_id', bill.id)
          .eq('type', 'EARN');

        if (userId) {
          earnTxQuery = earnTxQuery.eq('user_id', userId);
        }

        const { data: earnTx } = await earnTxQuery.maybeSingle();

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
    const userId = await this.getUserId();

    // Verify customer exists and belongs to tenant
    let custCheck = supabase.from('customers').select('*').eq('id', payment.customer_id);
    if (userId) {
      custCheck = custCheck.eq('user_id', userId);
    }
    const { data: custRecord, error: custErr } = await custCheck.maybeSingle();
    if (custErr || !custRecord) {
      throw new Error('Customer not found');
    }

    // Verify bill if specified
    if (payment.bill_id) {
      let billCheck = supabase.from('bills').select('*').eq('id', payment.bill_id);
      if (userId) {
        billCheck = billCheck.eq('user_id', userId);
      }
      const { data: billRecord, error: billErr } = await billCheck.maybeSingle();
      if (billErr || !billRecord) {
        throw new Error('Bill not found');
      }
    }

    const payment_number = await this.getNextSequence('PAYMENT');

    const paymentPayload = {
      payment_number,
      customer_id: payment.customer_id,
      bill_id: payment.bill_id || null,
      amount: payment.amount,
      payment_method: payment.payment_method || 'Cash',
      status: 'COMPLETED',
      notes: payment.notes || null,
      ...(userId ? { user_id: userId } : {})
    };

    const { data, error } = await supabase
      .from('payments')
      .insert([paymentPayload])
      .select()
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Failed to record payment');

    let unallocatedAmount = Number(payment.amount || 0);

    // 1. Direct Bill Allocation
    if (payment.bill_id) {
      let billQuery = supabase.from('bills').select('*').eq('id', payment.bill_id);
      if (userId) billQuery = billQuery.eq('user_id', userId);
      const { data: bill } = await billQuery.maybeSingle();

      if (bill) {
        const grandTotal = Number(bill.grand_total || 0);
        const currentPaid = Number(bill.paid_total || 0);
        const remainingDue = Math.max(0, grandTotal - currentPaid);
        const allocate = Math.min(remainingDue, unallocatedAmount);

        const newPaidTotal = Number((currentPaid + allocate).toFixed(2));
        const isNowFullyPaid = newPaidTotal >= grandTotal - 0.01;

        const updateData: { paid_total: number; loyalty_points_earned?: number } = { paid_total: newPaidTotal };

        if (isNowFullyPaid && Number(bill.loyalty_points_earned || 0) === 0) {
          const pointsEarned = await this.calculateLoyaltyPointsEarned(grandTotal);
          if (pointsEarned > 0) {
            const loySeq = await this.getNextSequence('LOYALTY');
            await supabase.from('loyalty_transactions').insert([{
              transaction_number: loySeq,
              customer_id: payment.customer_id,
              bill_id: payment.bill_id,
              points: pointsEarned,
              type: 'EARN',
              notes: `Award Reason: Bill Fully Paid - ${bill.bill_number}`,
              ...(userId ? { user_id: userId } : {})
            }]);
            updateData.loyalty_points_earned = pointsEarned;
          }
        }

        let updateBillQ = supabase.from('bills').update(updateData).eq('id', payment.bill_id);
        if (userId) updateBillQ = updateBillQ.eq('user_id', userId);
        await updateBillQ;

        unallocatedAmount = Math.max(0, unallocatedAmount - allocate);
      }
    } 
    // 2. FIFO Auto-Allocation across outstanding customer bills
    else {
      let billsQuery = supabase
        .from('bills')
        .select('*')
        .eq('customer_id', payment.customer_id);

      if (userId) billsQuery = billsQuery.eq('user_id', userId);

      const { data: bills } = await billsQuery.order('created_at', { ascending: true });

      const unpaidBills = (bills || []).filter(b => Number(b.paid_total || 0) < Number(b.grand_total || 0));

      for (const b of unpaidBills) {
        if (unallocatedAmount <= 0) break;

        const grandTotal = Number(b.grand_total || 0);
        const currentPaid = Number(b.paid_total || 0);
        const due = grandTotal - currentPaid;
        const allocate = Math.min(due, unallocatedAmount);

        const newPaidTotal = Number((currentPaid + allocate).toFixed(2));
        const isNowFullyPaid = newPaidTotal >= grandTotal - 0.01;

        const updateData: { paid_total: number; loyalty_points_earned?: number } = { paid_total: newPaidTotal };

        if (isNowFullyPaid && Number(b.loyalty_points_earned || 0) === 0) {
          const pointsEarned = await this.calculateLoyaltyPointsEarned(grandTotal);
          if (pointsEarned > 0) {
            const loySeq = await this.getNextSequence('LOYALTY');
            await supabase.from('loyalty_transactions').insert([{
              transaction_number: loySeq,
              customer_id: payment.customer_id,
              bill_id: b.id,
              points: pointsEarned,
              type: 'EARN',
              notes: `Award Reason: Bill Fully Paid - ${b.bill_number}`,
              ...(userId ? { user_id: userId } : {})
            }]);
            updateData.loyalty_points_earned = pointsEarned;
          }
        }

        let updateBillQ = supabase.from('bills').update(updateData).eq('id', b.id);
        if (userId) updateBillQ = updateBillQ.eq('user_id', userId);
        await updateBillQ;

        let updatePayQ = supabase.from('payments').update({ bill_id: b.id }).eq('id', data.id);
        if (userId) updatePayQ = updatePayQ.eq('user_id', userId);
        await updatePayQ;

        unallocatedAmount -= allocate;
      }
    }

    // 3. Excess payment turns into Advance Balance
    if (unallocatedAmount > 0) {
      let custQuery = supabase.from('customers').select('advance_balance').eq('id', payment.customer_id);
      if (userId) custQuery = custQuery.eq('user_id', userId);
      const { data: cust } = await custQuery.maybeSingle();

      if (cust) {
        const currentAdvance = Number(cust.advance_balance || 0);
        let updateCustQ = supabase.from('customers').update({
          advance_balance: currentAdvance + unallocatedAmount
        }).eq('id', payment.customer_id);

        if (userId) updateCustQ = updateCustQ.eq('user_id', userId);
        await updateCustQ;
      }
    }

    await this.logAudit({
      user_name: userName,
      action: 'RECORD_PAYMENT',
      entity: `Payment ${payment_number}`,
      new_value: `Amount: ₹${payment.amount}, Customer ID: ${payment.customer_id}, Method: ${payment.payment_method}`
    });

    return data;
  }


  static async getPayments(): Promise<Payment[]> {
    if (!isSupabaseConfigured) return [];
    const userId = await this.getUserId();

    let query = supabase
      .from('payments')
      .select('*, customers(name, mobile)');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching payments:', error);
      return [];
    }

    return data || [];
  }


  static async reverseBillPayment(
    billId: string, 
    reason: string, 
    adminPin: string, 
    userName = 'Super Admin',
    overridePast48Hours = false
  ): Promise<{ success: boolean; reversedAmount: number }> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const settings = await this.getSettings();

    if (settings.security.super_admin_pin && settings.security.super_admin_pin !== adminPin) {
      throw new Error('Invalid Super Admin Security PIN. Reversal rejected.');
    }

    const userId = await this.getUserId();

    let billQuery = supabase
      .from('bills')
      .select('*')
      .eq('id', billId);

    if (userId) {
      billQuery = billQuery.eq('user_id', userId);
    }

    const { data: bill, error: billErr } = await billQuery.maybeSingle();
    if (billErr || !bill) {
      throw new Error('Bill not found');
    }

    const totalPaidToReverse = Number(bill.paid_total || 0);

    // Check payment timestamps for 48-hour limit
    let activePayQuery = supabase
      .from('payments')
      .select('created_at')
      .eq('bill_id', billId)
      .neq('status', 'CANCELLED')
      .neq('status', 'REVERSED');
    if (userId) activePayQuery = activePayQuery.eq('user_id', userId);
    const { data: attachedPayments } = await activePayQuery;

    const latestPaymentTime = (attachedPayments && attachedPayments.length > 0)
      ? Math.max(...attachedPayments.map(p => new Date(p.created_at).getTime()))
      : new Date(bill.created_at).getTime();

    const elapsedHours = (Date.now() - latestPaymentTime) / (1000 * 60 * 60);
    const isPast48Hours = elapsedHours > 48;

    if (isPast48Hours && !overridePast48Hours) {
      throw new Error('Payment was recorded more than 48 hours ago. Super Admin 48-Hour Override confirmation is required.');
    }

    // 1. Soft-delete / reverse all payments attached to this bill
    let reversePayQuery = supabase
      .from('payments')
      .update({
        status: 'REVERSED',
        cancellation_reason: isPast48Hours ? `[48H Override] ${reason}` : reason,
        cancelled_at: new Date().toISOString(),
        cancelled_by: userName
      })
      .eq('bill_id', billId);

    if (userId) {
      reversePayQuery = reversePayQuery.eq('user_id', userId);
    }

    await reversePayQuery;

    // 2. Reverse advance_used and advance_earned
    if (bill.customer_id) {
      let custQuery = supabase
        .from('customers')
        .select('advance_balance')
        .eq('id', bill.customer_id);

      if (userId) {
        custQuery = custQuery.eq('user_id', userId);
      }

      const { data: cust } = await custQuery.maybeSingle();

      if (cust) {
        let currentAdvance = Number(cust.advance_balance || 0);
        currentAdvance += Number(bill.advance_used || 0);
        currentAdvance = Math.max(0, currentAdvance - Number(bill.advance_earned || 0));

        let updateCustQuery = supabase
          .from('customers')
          .update({ advance_balance: currentAdvance })
          .eq('id', bill.customer_id);

        if (userId) {
          updateCustQuery = updateCustQuery.eq('user_id', userId);
        }

        await updateCustQuery;
      }
    }

    // 3. Reset bill payment fields
    let updateBillQuery = supabase
      .from('bills')
      .update({
        paid_total: 0,
        cash_paid: 0,
        upi_paid: 0,
        advance_used: 0,
        advance_earned: 0,
        edited_at: new Date().toISOString(),
        edited_by: userName,
        edit_reason: isPast48Hours ? `Payment Reversal (48H Override): ${reason}` : `Payment Reversal: ${reason}`
      })
      .eq('id', billId);

    if (userId) {
      updateBillQuery = updateBillQuery.eq('user_id', userId);
    }

    const { error: updateErr } = await updateBillQuery;
    if (updateErr) throw new Error(updateErr.message);

    // 4. Reverse loyalty points if any were awarded
    await this.reverseLoyaltyPointsForBill(billId, userName);

    await this.logAudit({
      user_name: userName,
      action: isPast48Hours ? 'REVERSE_BILL_PAYMENT_OVERRIDE_48H' : 'REVERSE_BILL_PAYMENT',
      entity: `Bill ${bill.bill_number}`,
      previous_value: `Paid Total: ₹${totalPaidToReverse}`,
      new_value: `Payment cleared to ₹0 and marked REVERSED.${isPast48Hours ? ' [SUPER ADMIN 48H OVERRIDE]' : ''} Reason: ${reason}`
    });

    return { success: true, reversedAmount: totalPaidToReverse };
  }


  static async deletePayment(
    paymentId: string, 
    reason: string, 
    adminPin: string, 
    userName = 'Super Admin',
    overridePast48Hours = false
  ): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const settings = await this.getSettings();

    if (settings.security.super_admin_pin && settings.security.super_admin_pin !== adminPin) {
      throw new Error('Invalid Super Admin Security PIN. Delete rejected.');
    }

    const userId = await this.getUserId();

    let payQuery = supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId);

    if (userId) {
      payQuery = payQuery.eq('user_id', userId);
    }

    const { data: payment, error: payErr } = await payQuery.maybeSingle();
    if (payErr || !payment) {
      throw new Error('Payment not found');
    }

    if (payment.status === 'CANCELLED' || payment.status === 'REVERSED') {
      throw new Error('This payment has already been cancelled or reversed.');
    }

    const paymentTime = new Date(payment.created_at).getTime();
    const elapsedHours = (Date.now() - paymentTime) / (1000 * 60 * 60);
    const isPast48Hours = elapsedHours > 48;

    if (isPast48Hours && !overridePast48Hours) {
      throw new Error('Payment was recorded more than 48 hours ago. Super Admin 48-Hour Override confirmation is required.');
    }

    const amount = Number(payment.amount || 0);

    // If attached to a bill, deduct from bill paid_total
    if (payment.bill_id) {
      let billQuery = supabase
        .from('bills')
        .select('*')
        .eq('id', payment.bill_id);

      if (userId) {
        billQuery = billQuery.eq('user_id', userId);
      }

      const { data: bill } = await billQuery.maybeSingle();

      if (bill) {
        const grandTotal = Number(bill.grand_total || 0);
        const currentPaid = Number(bill.paid_total || 0);
        const newPaid = Math.max(0, currentPaid - amount);

        const updateData: { paid_total: number; loyalty_points_earned?: number } = { paid_total: newPaid };

        if (newPaid < grandTotal - 0.01 && Number(bill.loyalty_points_earned || 0) > 0) {
          await this.reverseLoyaltyPointsForBill(bill.id, userName);
          updateData.loyalty_points_earned = 0;
        }

        let updateBillQ = supabase.from('bills').update(updateData).eq('id', payment.bill_id);
        if (userId) updateBillQ = updateBillQ.eq('user_id', userId);
        await updateBillQ;
      }
    } else if (payment.customer_id) {
      let custQuery = supabase
        .from('customers')
        .select('advance_balance')
        .eq('id', payment.customer_id);

      if (userId) {
        custQuery = custQuery.eq('user_id', userId);
      }

      const { data: cust } = await custQuery.maybeSingle();

      if (cust) {
        const currentAdvance = Number(cust.advance_balance || 0);
        const newAdvance = Math.max(0, currentAdvance - amount);
        let updateCustQ = supabase
          .from('customers')
          .update({ advance_balance: newAdvance })
          .eq('id', payment.customer_id);

        if (userId) updateCustQ = updateCustQ.eq('user_id', userId);
        await updateCustQ;
      }
    }

    // Soft delete payment record by updating status to CANCELLED
    let cancelPayQ = supabase
      .from('payments')
      .update({
        status: 'CANCELLED',
        cancellation_reason: isPast48Hours ? `[48H Override] ${reason}` : reason,
        cancelled_at: new Date().toISOString(),
        cancelled_by: userName
      })
      .eq('id', paymentId);

    if (userId) cancelPayQ = cancelPayQ.eq('user_id', userId);
    const { error: cancelErr } = await cancelPayQ;
    if (cancelErr) throw new Error(cancelErr.message);

    await this.logAudit({
      user_name: userName,
      action: isPast48Hours ? 'CANCEL_PAYMENT_OVERRIDE_48H' : 'CANCEL_PAYMENT',
      entity: `Payment ${payment.payment_number || paymentId}`,
      previous_value: `Amount: ₹${amount}, Customer ID: ${payment.customer_id}`,
      new_value: `Payment cancelled/soft-deleted.${isPast48Hours ? ' [SUPER ADMIN 48H OVERRIDE]' : ''} Reason: ${reason}`
    });
  }


  static async reconcileCustomerAdvanceBalances(userName = 'Super Admin'): Promise<{
    customersReconciled: number;
    discrepanciesFixed: number;
    totalAdvanceBefore: number;
    totalAdvanceAfter: number;
  }> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const userId = await this.getUserId();

    let custQ = supabase.from('customers').select('id, name, advance_balance');
    let billsQ = supabase.from('bills').select('customer_id, advance_used, advance_earned');
    let payQ = supabase.from('payments').select('customer_id, bill_id, amount, status');

    if (userId) {
      custQ = custQ.eq('user_id', userId);
      billsQ = billsQ.eq('user_id', userId);
      payQ = payQ.eq('user_id', userId);
    }

    const [
      { data: customers, error: custErr },
      { data: bills, error: billsErr },
      { data: payments, error: payErr }
    ] = await Promise.all([custQ, billsQ, payQ]);

    if (custErr) throw new Error(custErr.message);
    if (billsErr) throw new Error(billsErr.message);
    if (payErr) throw new Error(payErr.message);

    const custList = customers || [];
    const billList = bills || [];
    const payList = payments || [];

    let totalAdvanceBefore = 0;
    let totalAdvanceAfter = 0;
    let discrepanciesFixed = 0;
    let customersReconciled = 0;

    for (const cust of custList) {
      const storedAdvance = Number(cust.advance_balance || 0);
      totalAdvanceBefore += storedAdvance;

      const custUnallocatedPayments = payList
        .filter(p => p.customer_id === cust.id && !p.bill_id && p.status !== 'CANCELLED' && p.status !== 'REVERSED')
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const custAdvanceEarned = billList
        .filter(b => b.customer_id === cust.id)
        .reduce((sum, b) => sum + Number(b.advance_earned || 0), 0);

      const custAdvanceUsed = billList
        .filter(b => b.customer_id === cust.id)
        .reduce((sum, b) => sum + Number(b.advance_used || 0), 0);

      const calculatedAdvance = Math.max(0, Number((custAdvanceEarned + custUnallocatedPayments - custAdvanceUsed).toFixed(2)));
      totalAdvanceAfter += calculatedAdvance;

      if (Math.abs(calculatedAdvance - storedAdvance) > 0.001) {
        let updateCustQ = supabase
          .from('customers')
          .update({ advance_balance: calculatedAdvance })
          .eq('id', cust.id);

        if (userId) updateCustQ = updateCustQ.eq('user_id', userId);
        await updateCustQ;

        discrepanciesFixed++;
      }
      customersReconciled++;
    }

    await this.logAudit({
      user_name: userName,
      action: 'RECONCILE_ADVANCE_BALANCES',
      entity: 'All Customers',
      new_value: `Reconciled ${customersReconciled} customers, fixed ${discrepanciesFixed} discrepancies. Advance before: ₹${totalAdvanceBefore.toFixed(2)}, after: ₹${totalAdvanceAfter.toFixed(2)}`
    });

    return {
      customersReconciled,
      discrepanciesFixed,
      totalAdvanceBefore: Number(totalAdvanceBefore.toFixed(2)),
      totalAdvanceAfter: Number(totalAdvanceAfter.toFixed(2))
    };
  }


  static async getExpenses(): Promise<Expense[]> {
    if (!isSupabaseConfigured) return [];
    const userId = await this.getUserId();

    let query = supabase
      .from('expenses')
      .select('*');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
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
    const userId = await this.getUserId();
    const expense_number = await this.getNextSequence('EXPENSE');

    const payload = {
      title: expense.title,
      amount: expense.amount,
      category: expense.category,
      payment_mode: expense.payment_mode || 'Cash',
      notes: expense.notes || null,
      expense_number,
      ...(userId ? { user_id: userId } : {})
    };

    const { data, error } = await supabase
      .from('expenses')
      .insert([payload])
      .select()
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Failed to create expense');

    await this.logAudit({
      user_name: userName,
      action: 'CREATE_EXPENSE',
      entity: `Expense ${expense.title}`,
      new_value: JSON.stringify(data)
    });

    return data;
  }


  static async deleteExpense(id: string, userName = 'Admin'): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const userId = await this.getUserId();

    // Verify existence & ownership
    let checkQ = supabase.from('expenses').select('id').eq('id', id);
    if (userId) checkQ = checkQ.eq('user_id', userId);
    const { data: existing } = await checkQ.maybeSingle();
    if (!existing) {
      throw new Error('Expense not found');
    }

    let delQ = supabase.from('expenses').delete().eq('id', id);
    if (userId) delQ = delQ.eq('user_id', userId);

    const { error } = await delQ;
    if (error) throw new Error(error.message);

    await this.logAudit({
      user_name: userName,
      action: 'DELETE_EXPENSE',
      entity: `Expense ID ${id}`
    });
  }


  static async addExpenseCategory(categoryName: string, userName = 'Admin'): Promise<string[]> {
    const trimmed = categoryName.trim();
    if (!trimmed) throw new Error('Category name cannot be empty');

    const settings = await this.getSettings();
    const currentCats = settings.expenses?.categories || [];

    if (currentCats.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error(`Category "${trimmed}" already exists.`);
    }

    const updated = [...currentCats, trimmed];
    await this.saveSettings('expenses', {
      ...(settings.expenses || DEFAULT_SETTINGS.expenses),
      categories: updated
    }, userName);

    return updated;
  }


  static async removeExpenseCategory(categoryName: string, userName = 'Admin'): Promise<string[]> {
    const settings = await this.getSettings();
    const currentCats = settings.expenses?.categories || [];
    const updated = currentCats.filter(c => c.toLowerCase() !== categoryName.toLowerCase());

    await this.saveSettings('expenses', {
      ...(settings.expenses || DEFAULT_SETTINGS.expenses),
      categories: updated
    }, userName);

    return updated;
  }


  static async purgeAllBusinessData(userName = 'Super Admin'): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const userId = await this.getUserId();

    let delBillItems = supabase.from('bill_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    let delPayments = supabase.from('payments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    let delBills = supabase.from('bills').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    let delExpenses = supabase.from('expenses').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    let delLoyalty = supabase.from('loyalty_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    let updateCust = supabase.from('customers').update({ advance_balance: 0, loyalty_points: 0 }).neq('id', '00000000-0000-0000-0000-000000000000');

    if (userId) {
      delBillItems = delBillItems.eq('user_id', userId);
      delPayments = delPayments.eq('user_id', userId);
      delBills = delBills.eq('user_id', userId);
      delExpenses = delExpenses.eq('user_id', userId);
      delLoyalty = delLoyalty.eq('user_id', userId);
      updateCust = updateCust.eq('user_id', userId);
    }

    await delBillItems;
    await delPayments;
    await delBills;
    await delExpenses;
    await delLoyalty;
    await updateCust;

    await this.logAudit({
      user_name: userName,
      action: 'PURGE_ALL_BUSINESS_DATA',
      entity: 'All Business Records'
    });
  }


  static async getDashboardStats(filter: DateFilterOption = 'today', customRange?: { from: string; to: string }): Promise<DashboardStats> {
    const { startDate, endDate } = this.getDateRangeBounds(filter, customRange);

    if (!isSupabaseConfigured) {
      const emptySummary: PaymentSummary = {
        total_sales: 0,
        cash_collected: 0,
        upi_collected: 0,
        total_amount_collected: 0,
        outstanding_amount: 0,
        customer_advance_balance: 0,
        payment_method_breakdown: [],
        daily_collection_trend: [],
        monthly_collection_trend: []
      };
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
        payment_summary: emptySummary,
        sales_trend: [],
        monthly_revenue: [],
        payment_distribution: [],
        top_products: []
      };
    }

    const userId = await this.getUserId();

    let billsQuery = supabase.from('bills').select('*, bill_items(*)');
    let paymentsQuery = supabase.from('payments').select('*');
    let expensesQuery = supabase.from('expenses').select('*');

    if (userId) {
      billsQuery = billsQuery.eq('user_id', userId);
      paymentsQuery = paymentsQuery.eq('user_id', userId);
      expensesQuery = expensesQuery.eq('user_id', userId);
    }

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

    const [
      { data: bills },
      { data: payments },
      { data: expenses }
    ] = await Promise.all([
      billsQuery.order('created_at', { ascending: false }),
      paymentsQuery.order('created_at', { ascending: false }),
      expensesQuery.order('created_at', { ascending: false })
    ]);

    const allBills = bills || [];
    const allPayments = (payments || []).filter(p => p.status !== 'CANCELLED' && p.status !== 'REVERSED');
    const allExpenses = expenses || [];

    const customers = await this.getCustomerSummaries();
    const total_customers = customers.length;
    const pending_balance = customers.reduce((sum, c) => sum + Number(c.balance_due || 0), 0);
    const total_advance = customers.reduce((sum, c) => sum + Number(c.advance_balance || 0), 0);

    let cashCollected = 0;
    let upiCollected = 0;

    allPayments.forEach(p => {
      const amt = Number(p.amount || 0);
      if (p.payment_method === 'Cash') cashCollected += amt;
      else if (p.payment_method === 'UPI') upiCollected += amt;
    });

    if (allPayments.length === 0) {
      allBills.forEach(b => {
        cashCollected += Number(b.cash_paid || 0);
        upiCollected += Number(b.upi_paid || 0);
      });
    }

    const totalAmountCollected = cashCollected + upiCollected;
    const totalSales = allBills.reduce((sum, b) => sum + Number(b.grand_total || 0), 0);
    const bills_generated = allBills.length;
    const average_bill_value = bills_generated > 0 ? totalSales / bills_generated : 0;

    const total_income = totalAmountCollected;
    const total_expense = allExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const net_profit = total_income - total_expense;

    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthly_sales = allBills
      .filter(b => b.created_at.startsWith(currentMonth))
      .reduce((sum, b) => sum + Number(b.grand_total || 0), 0);

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
      salesTrendMap.set(dateKey, (salesTrendMap.get(dateKey) || 0) + Number(b.grand_total || 0));
    });
    const sales_trend = Array.from(salesTrendMap.entries()).map(([date, amount]) => ({ date, amount }));

    const monthlyRevMap = new Map<string, number>();
    allBills.forEach(b => {
      const monthKey = new Date(b.created_at).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      monthlyRevMap.set(monthKey, (monthlyRevMap.get(monthKey) || 0) + Number(b.grand_total || 0));
    });
    const monthly_revenue = Array.from(monthlyRevMap.entries()).map(([month, amount]) => ({ month, amount }));

    const payment_distribution = [
      { name: 'Cash', value: cashCollected },
      { name: 'UPI', value: upiCollected }
    ].filter(p => p.value > 0);

    const prodMap = new Map<string, { quantity: number; revenue: number }>();
    allBills.forEach(b => {
      ((b.bill_items || []) as BillItem[]).forEach((item: BillItem) => {
        const name = item.product_name;
        const existing = prodMap.get(name) || { quantity: 0, revenue: 0 };
        prodMap.set(name, {
          quantity: existing.quantity + Number(item.quantity || 0),
          revenue: existing.revenue + Number(item.total || 0)
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
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const userId = await this.getUserId();

    const seedProducts = [
      { product_code: 'PRD-000001', name: 'A4 B/W Xerox (Single)', price: 2.00, category: 'Printing & Xerox', ...(userId ? { user_id: userId } : {}) },
      { product_code: 'PRD-000002', name: 'A4 B/W Xerox (Back-to-Back)', price: 3.00, category: 'Printing & Xerox', ...(userId ? { user_id: userId } : {}) },
      { product_code: 'PRD-000003', name: 'A4 Color Printout', price: 10.00, category: 'Printing & Xerox', ...(userId ? { user_id: userId } : {}) },
      { product_code: 'PRD-000004', name: 'Spiral Binding (upto 100 pgs)', price: 40.00, category: 'Binding & Finishing', ...(userId ? { user_id: userId } : {}) },
      { product_code: 'PRD-000005', name: 'A4 Document Lamination', price: 25.00, category: 'Binding & Finishing', ...(userId ? { user_id: userId } : {}) },
      { product_code: 'PRD-000006', name: 'Passport Size Photo (Set of 8)', price: 50.00, category: 'Photography', ...(userId ? { user_id: userId } : {}) },
      { product_code: 'PRD-000007', name: 'Classmate Notebook (Long)', price: 65.00, category: 'Stationery', ...(userId ? { user_id: userId } : {}) },
      { product_code: 'PRD-000008', name: 'Reynolds Ball Pen (Blue)', price: 10.00, category: 'Stationery', ...(userId ? { user_id: userId } : {}) }
    ];

    const seedCustomers = [
      { customer_code: 'CUS-000001', name: 'Rahul Sharma', mobile: '9876543210', email: 'rahul.s@example.com', advance_balance: 150.00, loyalty_points: 25.00, ...(userId ? { user_id: userId } : {}) },
      { customer_code: 'CUS-000002', name: 'Pooja Patel', mobile: '9823456789', email: 'pooja.p@example.com', advance_balance: 0.00, loyalty_points: 10.00, ...(userId ? { user_id: userId } : {}) },
      { customer_code: 'CUS-000003', name: 'Dr. Ramesh Gupta', mobile: '9123456780', email: 'dr.gupta@clinic.org', advance_balance: 500.00, loyalty_points: 80.00, ...(userId ? { user_id: userId } : {}) }
    ];

    const { error: pErr } = await supabase.from('products').insert(seedProducts);
    const { error: cErr } = await supabase.from('customers').insert(seedCustomers);

    if (pErr) console.warn('Products seed note:', pErr.message);
    if (cErr) console.warn('Customers seed note:', cErr.message);

    await this.logAudit({
      user_name: userName,
      action: 'SEED_CATALOG',
      entity: 'Default Catalog & Customers'
    });

    return { productsAdded: seedProducts.length, customersAdded: seedCustomers.length };
  }


  static async getProductSalesAnalytics(
    productId: string,
    filter: DateFilterOption = 'all_time',
    customRange?: { from: string; to: string }
  ): Promise<ProductSalesAnalytics> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const userId = await this.getUserId();

    const isCustom = productId.startsWith('custom:');
    let product: Product;

    if (isCustom) {
      const decodedName = decodeURIComponent(productId.replace('custom:', ''));
      product = {
        id: productId,
        name: decodedName,
        price: 0,
        category: 'Custom Service / Item',
        created_at: new Date().toISOString()
      };
    } else {
      const p = await this.getProductById(productId);
      if (!p) {
        return {
          product: {
            id: productId,
            name: 'Not Found',
            price: 0,
            category: 'Unknown',
            created_at: new Date().toISOString()
          },
          total_quantity_sold: 0,
          total_revenue: 0,
          average_selling_rate: 0,
          orders_count: 0,
          transactions: []
        };
      }
      product = p;
    }

    const { startDate, endDate } = this.getDateRangeBounds(filter, customRange);

    let query = supabase
      .from('bill_items')
      .select('*, bills(id, bill_number, created_at, customer_id, customers(name))');

    if (userId) {
      query = query.eq('user_id', userId);
    }

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
      const bill = item.bills as { id?: string; bill_number?: string; created_at?: string; customer_id?: string; customers?: { name?: string }; customer_name?: string } | null;
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


  static async getCustomItemsAnalytics(
    filter: DateFilterOption = 'all_time',
    customRange?: { from: string; to: string }
  ): Promise<CustomItemAnalytics[]> {
    if (!isSupabaseConfigured) return [];
    const userId = await this.getUserId();

    const { startDate, endDate } = this.getDateRangeBounds(filter, customRange);

    let query = supabase
      .from('bill_items')
      .select('product_name, quantity, price, total, created_at, bill_id')
      .is('product_id', null);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: customItems, error } = await query.order('created_at', { ascending: false });

    if (error || !customItems) {
      console.error('Error fetching custom items:', error);
      return [];
    }

    const itemMap = new Map<string, {
      name: string;
      total_quantity: number;
      total_revenue: number;
      rates: number[];
      bill_ids: Set<string>;
      first_used_at: string;
      last_used_at: string;
    }>();

    for (const item of customItems) {
      const itemTime = new Date(item.created_at).getTime();
      if (startDate && itemTime < startDate.getTime()) continue;
      if (endDate && itemTime > endDate.getTime()) continue;

      const name = (item.product_name || 'Ad-hoc Service').trim();
      const qty = Number(item.quantity || 0);
      const price = Number(item.price || 0);
      const total = Number(item.total || (qty * price));

      if (!itemMap.has(name)) {
        itemMap.set(name, {
          name,
          total_quantity: 0,
          total_revenue: 0,
          rates: [],
          bill_ids: new Set<string>(),
          first_used_at: item.created_at,
          last_used_at: item.created_at
        });
      }

      const entry = itemMap.get(name)!;
      entry.total_quantity += qty;
      entry.total_revenue += total;
      entry.rates.push(price);
      if (item.bill_id) entry.bill_ids.add(item.bill_id);
      if (new Date(item.created_at).getTime() > new Date(entry.last_used_at).getTime()) {
        entry.last_used_at = item.created_at;
      }
      if (new Date(item.created_at).getTime() < new Date(entry.first_used_at).getTime()) {
        entry.first_used_at = item.created_at;
      }
    }

    return Array.from(itemMap.values()).map(entry => {
      const avgRate = entry.total_quantity > 0 
        ? Number((entry.total_revenue / entry.total_quantity).toFixed(2)) 
        : (entry.rates[0] || 0);

      const minRate = Math.min(...entry.rates);
      const maxRate = Math.max(...entry.rates);
      const isDynamic = entry.rates.length > 1 && (maxRate - minRate > 0.01);

      return {
        name: entry.name,
        total_quantity: Number(entry.total_quantity.toFixed(2)),
        total_revenue: Number(entry.total_revenue.toFixed(2)),
        average_selling_rate: avgRate,
        is_dynamic_rate: isDynamic,
        min_rate: minRate,
        max_rate: maxRate,
        orders_count: entry.bill_ids.size,
        first_used_at: entry.first_used_at,
        last_used_at: entry.last_used_at
      };
    }).sort((a, b) => b.total_revenue - a.total_revenue);
  }


  static async getCustomerStatementData(
    customerId: string,
    filter: DateFilterOption = 'all_time',
    customRange?: { from: string; to: string }
  ): Promise<CustomerStatementData | null> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const userId = await this.getUserId();

    let custQuery = supabase
      .from('customers')
      .select('*')
      .eq('id', customerId);

    if (userId) {
      custQuery = custQuery.eq('user_id', userId);
    }

    const { data: customer, error: custErr } = await custQuery.maybeSingle();

    if (custErr || !customer) {
      return null;
    }

    const settings = await this.getSettings();

    let billsQuery = supabase
      .from('bills')
      .select('*, bill_items(*)')
      .eq('customer_id', customerId);

    let paymentsQuery = supabase
      .from('payments')
      .select('*')
      .eq('customer_id', customerId);

    if (userId) {
      billsQuery = billsQuery.eq('user_id', userId);
      paymentsQuery = paymentsQuery.eq('user_id', userId);
    }

    const { data: bills } = await billsQuery.order('created_at', { ascending: true });
    const { data: payments } = await paymentsQuery.order('created_at', { ascending: true });
    const activePayments = (payments || []).filter(p => p.status !== 'CANCELLED' && p.status !== 'REVERSED');

    let allTimeBilled = 0;
    let allTimePaid = 0;
    (bills || []).forEach(b => {
      allTimeBilled += Number(b.grand_total || 0);
      allTimePaid += Number(b.paid_total || 0);
    });

    const paymentBillIds = new Set(activePayments.map(p => p.bill_id).filter(Boolean));
    activePayments.forEach(p => {
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
