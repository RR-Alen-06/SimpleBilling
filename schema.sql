-- ==========================================
-- PrintPro ERP / Xerox & Stationery Billing System Database Schema
-- Supabase / PostgreSQL Script (Simplified Loyalty Earning & Redemption Rules)
-- ==========================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 0. SEQUENCES TABLE
CREATE TABLE IF NOT EXISTS public.sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL,
    prefix TEXT NOT NULL,
    padding INT NOT NULL DEFAULT 6 CHECK (padding >= 2 AND padding <= 12),
    current_val BIGINT NOT NULL DEFAULT 0 CHECK (current_val >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sequences ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.sequences ADD COLUMN IF NOT EXISTS key TEXT;
ALTER TABLE public.sequences ADD COLUMN IF NOT EXISTS prefix TEXT;
ALTER TABLE public.sequences ADD COLUMN IF NOT EXISTS padding INT DEFAULT 6;
ALTER TABLE public.sequences ADD COLUMN IF NOT EXISTS current_val BIGINT DEFAULT 0;

-- Seed Default Entity Sequences
INSERT INTO public.sequences (user_id, key, prefix, padding, current_val)
VALUES 
    (auth.uid(), 'BILL', 'BILL', 6, 0),
    (auth.uid(), 'CUSTOMER', 'CUS', 6, 0),
    (auth.uid(), 'PRODUCT', 'PRD', 6, 0),
    (auth.uid(), 'PAYMENT', 'PAY', 6, 0),
    (auth.uid(), 'EXPENSE', 'EXP', 6, 0),
    (auth.uid(), 'LEDGER', 'LED', 6, 0),
    (auth.uid(), 'LOYALTY', 'LOY', 6, 0),
    (auth.uid(), 'AUDIT', 'AUD', 6, 0)
ON CONFLICT DO NOTHING;

-- Atomic Database Transaction Sequence Generator with User Isolation
CREATE OR REPLACE FUNCTION get_next_sequence(p_key TEXT)
RETURNS TEXT AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_prefix TEXT;
    v_padding INT;
    v_next_val BIGINT;
BEGIN
    INSERT INTO public.sequences (user_id, key, prefix, padding, current_val)
    VALUES (v_user_id, UPPER(p_key), UPPER(p_key), 6, 1)
    ON CONFLICT DO NOTHING;

    UPDATE public.sequences
    SET current_val = sequences.current_val + 1,
        updated_at = now()
    WHERE (user_id = v_user_id OR user_id IS NULL) AND UPPER(key) = UPPER(p_key)
    RETURNING prefix, padding, current_val INTO v_prefix, v_padding, v_next_val;

    IF v_prefix IS NULL THEN
        v_prefix := UPPER(p_key);
        v_padding := 6;
        v_next_val := 1;
    END IF;

    RETURN v_prefix || '-' || LPAD(v_next_val::text, v_padding, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    mobile TEXT,
    advance_balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (advance_balance >= 0),
    loyalty_points NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (loyalty_points >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_code TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS advance_balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS loyalty_points NUMERIC(10, 2) NOT NULL DEFAULT 0.00;

-- 2. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Stationery',
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_code TEXT;

-- 3. BILLS TABLE
CREATE TABLE IF NOT EXISTS public.bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_number TEXT NOT NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    total NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (total >= 0),
    discount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0),
    gst_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    rounding_method TEXT NOT NULL DEFAULT 'None',
    rounding_adjustment NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    grand_total NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (grand_total >= 0),
    cash_paid NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (cash_paid >= 0),
    upi_paid NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (upi_paid >= 0),
    card_paid NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (card_paid >= 0),
    paid_total NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (paid_total >= 0),
    advance_used NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (advance_used >= 0),
    advance_earned NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (advance_earned >= 0),
    payment_method TEXT NOT NULL DEFAULT 'Cash',
    loyalty_points_earned NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (loyalty_points_earned >= 0),
    loyalty_points_redeemed NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (loyalty_points_redeemed >= 0),
    edited_at TIMESTAMPTZ,
    edited_by TEXT,
    edit_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00;

-- 4. BILL ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.bill_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    total NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bill_items ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

-- 5. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    bill_id UUID REFERENCES public.bills(id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL DEFAULT 'Cash',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

-- 6. EXPENSES TABLE
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    category TEXT NOT NULL CHECK (category IN ('Shop Expense', 'Electricity', 'Rent', 'Other Expense')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

-- 7. SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

-- 8. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_name TEXT NOT NULL DEFAULT 'Admin',
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    previous_value TEXT,
    new_value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

-- 9. LOYALTY TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    bill_id UUID REFERENCES public.bills(id) ON DELETE SET NULL,
    points NUMERIC(10, 2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('EARN', 'REDEEM', 'ADJUST')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.loyalty_transactions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

-- 10. SIMPLIFIED LOYALTY EARNING RULES TABLE
CREATE TABLE IF NOT EXISTS public.loyalty_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name TEXT NOT NULL,
    min_bill_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (min_bill_amount >= 0),
    max_bill_amount NUMERIC(10, 2),
    points_earned NUMERIC(10, 2) NOT NULL DEFAULT 1.00 CHECK (points_earned > 0),
    enabled BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- In-place Migration: Remove NOT NULL constraints on legacy reward_type & reward_value
ALTER TABLE public.loyalty_rules ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.loyalty_rules ADD COLUMN IF NOT EXISTS points_earned NUMERIC(10, 2) NOT NULL DEFAULT 1.00;
ALTER TABLE public.loyalty_rules ALTER COLUMN reward_type DROP NOT NULL;
ALTER TABLE public.loyalty_rules ALTER COLUMN reward_value DROP NOT NULL;

-- 11. DYNAMIC LOYALTY REDEMPTION RULES TABLE
CREATE TABLE IF NOT EXISTS public.loyalty_redemption_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    points_required INT NOT NULL CHECK (points_required > 0),
    discount_amount NUMERIC(10, 2) NOT NULL CHECK (discount_amount > 0),
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.loyalty_redemption_rules ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

-- Seed Default Simplified Earning Rules (Includes legacy columns as fallback)
INSERT INTO public.loyalty_rules (user_id, rule_name, min_bill_amount, max_bill_amount, points_earned, reward_type, reward_value, enabled, sort_order)
VALUES
    (auth.uid(), 'Standard Earning Rule', 0.00, 100.00, 1.00, 'FLAT', 1.00, true, 1),
    (auth.uid(), 'Medium Purchase Bonus', 101.00, 500.00, 5.00, 'FLAT', 5.00, true, 2),
    (auth.uid(), 'Bulk Purchase Bonus', 501.00, NULL, 15.00, 'FLAT', 15.00, true, 3)
ON CONFLICT DO NOTHING;

-- Seed Default Redemption Rules
INSERT INTO public.loyalty_redemption_rules (user_id, points_required, discount_amount, enabled)
VALUES
    (auth.uid(), 10, 5.00, true),
    (auth.uid(), 20, 10.00, true),
    (auth.uid(), 50, 25.00, true)
ON CONFLICT DO NOTHING;

-- Indexes for fast query performance
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON public.customers(user_id);
CREATE INDEX IF NOT EXISTS idx_products_user_id ON public.products(user_id);
CREATE INDEX IF NOT EXISTS idx_bills_user_id ON public.bills(user_id);
CREATE INDEX IF NOT EXISTS idx_bills_customer_id ON public.bills(customer_id);
CREATE INDEX IF NOT EXISTS idx_bills_created_at ON public.bills(created_at);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON public.bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON public.expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_redemption_user ON public.loyalty_redemption_rules(user_id);

-- Enable RLS Policies on ALL tables
ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_redemption_rules ENABLE ROW LEVEL SECURITY;

-- Drop previous policies to ensure clean idempotency
DROP POLICY IF EXISTS "Allow full access to sequences" ON public.sequences;
DROP POLICY IF EXISTS "Allow full access to customers" ON public.customers;
DROP POLICY IF EXISTS "Allow full access to products" ON public.products;
DROP POLICY IF EXISTS "Allow full access to bills" ON public.bills;
DROP POLICY IF EXISTS "Allow full access to bill_items" ON public.bill_items;
DROP POLICY IF EXISTS "Allow full access to payments" ON public.payments;
DROP POLICY IF EXISTS "Allow full access to expenses" ON public.expenses;
DROP POLICY IF EXISTS "Allow full access to settings" ON public.settings;
DROP POLICY IF EXISTS "Allow full access to audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow full access to loyalty_transactions" ON public.loyalty_transactions;
DROP POLICY IF EXISTS "Allow full access to loyalty_rules" ON public.loyalty_rules;
DROP POLICY IF EXISTS "Allow full access to loyalty_redemption_rules" ON public.loyalty_redemption_rules;

DROP POLICY IF EXISTS "User data isolation on sequences" ON public.sequences;
DROP POLICY IF EXISTS "User data isolation on customers" ON public.customers;
DROP POLICY IF EXISTS "User data isolation on products" ON public.products;
DROP POLICY IF EXISTS "User data isolation on bills" ON public.bills;
DROP POLICY IF EXISTS "User data isolation on bill_items" ON public.bill_items;
DROP POLICY IF EXISTS "User data isolation on payments" ON public.payments;
DROP POLICY IF EXISTS "User data isolation on expenses" ON public.expenses;
DROP POLICY IF EXISTS "User data isolation on settings" ON public.settings;
DROP POLICY IF EXISTS "User data isolation on audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "User data isolation on loyalty_transactions" ON public.loyalty_transactions;
DROP POLICY IF EXISTS "User data isolation on loyalty_rules" ON public.loyalty_rules;
DROP POLICY IF EXISTS "User data isolation on loyalty_redemption_rules" ON public.loyalty_redemption_rules;

-- Drop previous policies if they exist (allows safe re-execution)
DROP POLICY IF EXISTS "Allow all access to sequences" ON public.sequences;
DROP POLICY IF EXISTS "Allow all access to customers" ON public.customers;
DROP POLICY IF EXISTS "Allow all access to products" ON public.products;
DROP POLICY IF EXISTS "Allow all access to bills" ON public.bills;
DROP POLICY IF EXISTS "Allow all access to bill_items" ON public.bill_items;
DROP POLICY IF EXISTS "Allow all access to payments" ON public.payments;
DROP POLICY IF EXISTS "Allow all access to expenses" ON public.expenses;
DROP POLICY IF EXISTS "Allow all access to settings" ON public.settings;
DROP POLICY IF EXISTS "Allow all access to audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow all access to loyalty_transactions" ON public.loyalty_transactions;
DROP POLICY IF EXISTS "Allow all access to loyalty_rules" ON public.loyalty_rules;
DROP POLICY IF EXISTS "Allow all access to loyalty_redemption_rules" ON public.loyalty_redemption_rules;

-- Create Permissive Access Policies (Works for both authenticated users and public app access)
CREATE POLICY "Allow all access to sequences" ON public.sequences FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to customers" ON public.customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to products" ON public.products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to bills" ON public.bills FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to bill_items" ON public.bill_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to payments" ON public.payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to expenses" ON public.expenses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to audit_logs" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to loyalty_transactions" ON public.loyalty_transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to loyalty_rules" ON public.loyalty_rules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to loyalty_redemption_rules" ON public.loyalty_redemption_rules FOR ALL USING (true) WITH CHECK (true);

-- RELOAD SUPABASE POSTGREST SCHEMA CACHE INSTANTLY
NOTIFY pgrst, 'reload schema';
