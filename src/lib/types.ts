export type PaymentMethod = 'Cash' | 'UPI' | 'Card';

export type ExpenseCategory = 'Shop Expense' | 'Electricity' | 'Rent' | 'Other Expense';

export interface Customer {
  id: string;
  name: string;
  mobile?: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  created_at: string;
}

export interface BillItem {
  id?: string;
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
  bill_number: string;
  customer_id?: string | null;
  customer_name?: string;
  total: number;
  discount: number;
  grand_total: number;
  paid_amount: number;
  payment_method: PaymentMethod;
  created_at: string;
  items?: BillItem[];
}

export interface Payment {
  id: string;
  customer_id: string;
  bill_id?: string | null;
  amount: number;
  payment_method: PaymentMethod;
  notes?: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  created_at: string;
}

export interface CustomerLedgerEntry {
  id: string;
  date: string;
  type: 'BILL' | 'PAYMENT';
  reference_no: string;
  description: string;
  bill_amount: number;
  paid_amount: number;
  running_balance: number;
}

export interface CustomerSummary {
  id: string;
  name: string;
  mobile?: string | null;
  total_billed: number;
  total_paid: number;
  balance_due: number;
  created_at: string;
}

export interface DashboardStats {
  todays_sales: number;
  todays_bills_count: number;
  pending_balance: number;
  total_customers: number;
  total_income: number;
  total_expense: number;
  net_profit: number;
}
