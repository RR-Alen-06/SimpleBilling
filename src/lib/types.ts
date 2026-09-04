export type PaymentMethod = 'Cash' | 'UPI' | 'Split Payment' | 'Advance Used';

export type ExpenseCategory = 'Shop Expense' | 'Electricity' | 'Rent' | 'Other Expense';

export type RoundingMethod = 'None' | 'Round Down' | 'Round Up' | 'Standard';

export type DateFilterOption = 
  | 'today' 
  | 'yesterday' 
  | 'weekly' 
  | 'monthly' 
  | 'quarterly' 
  | 'yearly' 
  | 'financial_year' 
  | 'specific_date' 
  | 'custom';

export interface SequenceConfig {
  id?: string;
  user_id?: string | null;
  key: string;
  prefix: string;
  padding: number;
  current_val: number;
  updated_at?: string;
}

export interface Customer {
  id: string;
  user_id?: string | null;
  customer_code?: string | null;
  name: string;
  mobile?: string | null;
  email?: string | null;
  advance_balance: number;
  loyalty_points: number;
  created_at: string;
}

export interface Product {
  id: string;
  user_id?: string | null;
  product_code?: string | null;
  name: string;
  category: string;
  price: number;
  created_at: string;
}

export interface BillItem {
  id?: string;
  user_id?: string | null;
  bill_id?: string;
  product_id?: string | null;
  product_name: string;
  quantity: number;
  price: number;
  total: number;
  created_at?: string;
}

export interface Bill {
  id: string;
  user_id?: string | null;
  bill_number: string;
  customer_id?: string | null;
  customer_name?: string;
  customer_mobile?: string | null;
  customer_email?: string | null;
  total: number;
  discount: number;
  gst_amount?: number;
  rounding_method: RoundingMethod;
  rounding_adjustment: number;
  grand_total: number;
  cash_paid: number;
  upi_paid: number;

  paid_total: number;
  advance_used: number;
  advance_earned: number;
  payment_method: string;
  loyalty_points_earned: number;
  loyalty_points_redeemed: number;
  loyalty_discount_applied?: number;
  edited_at?: string | null;
  edited_by?: string | null;
  edit_reason?: string | null;
  created_at: string;
  items?: BillItem[];
  financial_summary?: BillFinancialSummary;
}

export interface BillFinancialSummary {
  previous_outstanding: number;
  previous_advance: number;
  current_bill_amount: number;
  total_amount_due: number;
  
  cash_paid: number;
  upi_paid: number;

  advance_used: number;
  total_paid: number;
  
  remaining_balance: number;
  remaining_advance_balance: number;
  payment_status: 'Fully Paid' | 'Partially Paid' | 'Payment Pending';
  
  loyalty?: {
    enabled: boolean;
    is_fully_paid: boolean;
    points_awarded: boolean;
    points_earned: number;
    points_redeemed: number;
    previous_points: number;
    current_points_balance: number;
    message: string;
  };
}


export interface Payment {
  id: string;
  user_id?: string | null;
  payment_number?: string | null;
  customer_id: string;
  customer_name?: string | null;
  customer_mobile?: string | null;
  bill_id?: string | null;
  amount: number;
  payment_method: string;
  notes?: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  user_id?: string | null;
  expense_number?: string | null;
  title: string;
  amount: number;
  category: ExpenseCategory;
  created_at: string;
}

export interface CustomerLedgerEntry {
  id: string;
  date: string;
  type: 'BILL' | 'PAYMENT' | 'ADVANCE_USED' | 'LOYALTY_REDEEM';
  reference_no: string;
  description: string;
  bill_amount: number;
  paid_amount: number;
  advance_used: number;
  loyalty_points: number;
  running_balance: number;
}

export interface CustomerSummary {
  id: string;
  user_id?: string | null;
  customer_code?: string | null;
  name: string;
  mobile?: string | null;
  email?: string | null;
  total_billed: number;
  total_paid: number;
  balance_due: number;
  advance_balance: number;
  loyalty_points: number;
  created_at: string;
}

export interface PaymentSummary {
  total_sales: number;
  cash_collected: number;
  upi_collected: number;
  total_amount_collected: number;
  outstanding_amount: number;
  customer_advance_balance: number;
  payment_method_breakdown: { method: string; amount: number }[];
  daily_collection_trend: { date: string; cash: number; upi: number; total: number }[];
  monthly_collection_trend: { month: string; amount: number }[];
}

export interface DashboardStats {
  todays_sales: number;
  monthly_sales: number;
  todays_bills_count: number;
  pending_balance: number;
  total_customers: number;
  total_income: number;
  total_expense: number;
  net_profit: number;
  bills_generated: number;
  average_bill_value: number;
  payment_summary: PaymentSummary;
  sales_trend: { date: string; amount: number }[];
  monthly_revenue: { month: string; amount: number }[];
  payment_distribution: { name: string; value: number }[];
  top_products: { name: string; quantity: number; revenue: number }[];
}

// Simplified Loyalty Earning & Redemption Models
export interface LoyaltyRule {
  id: string;
  user_id?: string | null;
  rule_name: string;
  min_bill_amount: number;
  max_bill_amount?: number | null;
  points_earned: number;
  enabled: boolean;
  sort_order: number;
  created_at?: string;
}

export interface LoyaltyRedemptionRule {
  id: string;
  user_id?: string | null;
  points_required: number;
  discount_amount: number;
  enabled: boolean;
  created_at?: string;
}

export interface LoyaltySettings {
  enabled: boolean;
  points_required: number; // Fallback
  discount_value: number;  // Fallback
}

// System Settings Models
export interface ShopSettings {
  shop_name: string;
  address: string;
  phone: string;
  email: string;
  gst_number: string;
  logo_url: string;
  footer_message: string;
}

export interface BillingSettings {
  bill_prefix: string;
  bill_format: string;
  default_payment_method: string;
  currency_symbol: string;
  decimal_precision: number;
  gst_enabled: boolean;
  gst_rate: number;
  default_printer_size: '80mm' | 'A4';
  auto_print: boolean;
  rounding_method: RoundingMethod;
}

export interface WhatsAppSettings {
  enabled: boolean;
  template_text: string;
  enable_pdf_sharing: boolean;
  enable_text_sharing: boolean;
  email_service_id?: string;
  email_template_id?: string;
  email_public_key?: string;
}

export interface SecuritySettings {
  super_admin_pin: string;
  session_timeout_minutes: number;
}

export interface ApplicationSettings {
  theme: 'light' | 'dark' | 'system';
  date_format: string;
  time_format: string;
}

export interface AllSettings {
  shop: ShopSettings;
  billing: BillingSettings;
  loyalty: LoyaltySettings;
  whatsapp: WhatsAppSettings;
  security: SecuritySettings;
  app: ApplicationSettings;
}

export interface AuditLog {
  id: string;
  user_id?: string | null;
  audit_number?: string | null;
  user_name: string;
  action: string;
  entity: string;
  previous_value?: string | null;
  new_value?: string | null;
  created_at: string;
}

export interface LoyaltyTransaction {
  id: string;
  user_id?: string | null;
  transaction_number?: string | null;
  customer_id: string;
  bill_id?: string | null;
  points: number;
  type: 'EARN' | 'REDEEM' | 'ADJUST';
  notes?: string | null;
  created_at: string;
}
