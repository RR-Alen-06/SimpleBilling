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
    ON CONFLICT (user_id, key) DO UPDATE
    SET current_val = sequences.current_val + 1,
        updated_at = now()
    RETURNING prefix, padding, current_val INTO v_prefix, v_padding, v_next_val;

    IF v_prefix IS NULL THEN
        UPDATE public.sequences
        SET current_val = sequences.current_val + 1,
            updated_at = now()
        WHERE (user_id = v_user_id OR (v_user_id IS NULL AND user_id IS NULL)) AND UPPER(key) = UPPER(p_key)
        RETURNING prefix, padding, current_val INTO v_prefix, v_padding, v_next_val;
    END IF;

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
    payment_number TEXT,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    bill_id UUID REFERENCES public.bills(id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL DEFAULT 'Cash',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_number TEXT;

-- 6. EXPENSES TABLE
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    category TEXT NOT NULL DEFAULT 'Shop Expense',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'Cash';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS expense_number TEXT;
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_category_check;

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

-- In-place Migration: Ensure user_id and points_earned, handle legacy columns safely
ALTER TABLE public.loyalty_rules ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.loyalty_rules ADD COLUMN IF NOT EXISTS points_earned NUMERIC(10, 2) NOT NULL DEFAULT 1.00;

DO $$ BEGIN
    ALTER TABLE public.loyalty_rules ALTER COLUMN reward_type DROP NOT NULL;
    ALTER TABLE public.loyalty_rules ALTER COLUMN reward_value DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

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

-- Seed Default Simplified Earning Rules
INSERT INTO public.loyalty_rules (user_id, rule_name, min_bill_amount, max_bill_amount, points_earned, enabled, sort_order)
VALUES
    (auth.uid(), 'Standard Earning Rule', 0.00, 100.00, 1.00, true, 1),
    (auth.uid(), 'Medium Purchase Bonus', 101.00, 500.00, 5.00, true, 2),
    (auth.uid(), 'Bulk Purchase Bonus', 501.00, NULL, 15.00, true, 3)
ON CONFLICT DO NOTHING;

-- Seed Default Redemption Rules
INSERT INTO public.loyalty_redemption_rules (user_id, points_required, discount_amount, enabled)
VALUES
    (auth.uid(), 10, 5.00, true),
    (auth.uid(), 20, 10.00, true),
    (auth.uid(), 50, 25.00, true)
ON CONFLICT DO NOTHING;

-- Seed Default Xerox, Printing, Lamination, Binding & Stationery Catalog
INSERT INTO public.products (user_id, product_code, name, category, price)
VALUES
    (auth.uid(), 'PRD-000001', 'A4 B&W Single', 'Xerox & Print', 2.00),
    (auth.uid(), 'PRD-000002', 'A4 B&W Both Sides', 'Xerox & Print', 3.00),
    (auth.uid(), 'PRD-000003', 'A4 Color Print Single', 'Xerox & Print', 10.00),
    (auth.uid(), 'PRD-000004', 'A4 Color Both Sides', 'Xerox & Print', 18.00),
    (auth.uid(), 'PRD-000005', 'Legal B&W Print', 'Xerox & Print', 3.00),
    (auth.uid(), 'PRD-000006', 'A3 B&W Print', 'Xerox & Print', 5.00),
    (auth.uid(), 'PRD-000007', 'A3 Color Print', 'Xerox & Print', 25.00),
    (auth.uid(), 'PRD-000008', 'Glossy Photo Print 4x6', 'Xerox & Print', 15.00),
    (auth.uid(), 'PRD-000009', 'Glossy Photo Print A4', 'Xerox & Print', 40.00),
    (auth.uid(), 'PRD-000010', 'PVC ID Card Print', 'Xerox & Print', 50.00),
    (auth.uid(), 'PRD-000011', 'A4 Document Lamination', 'Lamination & Binding', 30.00),
    (auth.uid(), 'PRD-000012', 'A3 Certificate Lamination', 'Lamination & Binding', 50.00),
    (auth.uid(), 'PRD-000013', 'ID Card Lamination (Pouch)', 'Lamination & Binding', 15.00),
    (auth.uid(), 'PRD-000014', 'Spiral Binding (Up to 100 pgs)', 'Lamination & Binding', 40.00),
    (auth.uid(), 'PRD-000015', 'Spiral Binding (Over 100 pgs)', 'Lamination & Binding', 60.00),
    (auth.uid(), 'PRD-000016', 'Hard Cover Project Binding', 'Lamination & Binding', 200.00),
    (auth.uid(), 'PRD-000017', 'Ballpoint Pen (Blue/Black)', 'Stationery', 10.00),
    (auth.uid(), 'PRD-000018', 'Gel Pen 0.5mm', 'Stationery', 20.00),
    (auth.uid(), 'PRD-000019', 'A4 75GSM Copier Paper Ream (500 Pgs)', 'Paper & Envelopes', 280.00),
    (auth.uid(), 'PRD-000020', 'Long Ruled Notebook 180 Pgs', 'Stationery', 60.00),
    (auth.uid(), 'PRD-000021', 'A4 Clear Display Folder (20 Pockets)', 'Stationery', 80.00)
ON CONFLICT DO NOTHING;

-- Seed Default Sample Customers with running balances & loyalty
INSERT INTO public.customers (user_id, customer_code, name, mobile, email, advance_balance, loyalty_points)
VALUES
    (auth.uid(), 'CUS-000001', 'Rajesh Sharma (College Staff)', '9876543210', 'rajesh.sharma@campus.edu', 200.00, 45.00),
    (auth.uid(), 'CUS-000002', 'Priya Patel (Architecture Student)', '9876543211', 'priya.patel@student.edu', 50.00, 20.00),
    (auth.uid(), 'CUS-000003', 'Apex Coaching Center (Monthly Account)', '9876543212', 'admin@apexcoaching.org', 0.00, 110.00)
ON CONFLICT DO NOTHING;

-- Indexes for fast query performance & data integrity
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON public.customers(user_id);
CREATE INDEX IF NOT EXISTS idx_products_user_id ON public.products(user_id);
CREATE INDEX IF NOT EXISTS idx_bills_user_id ON public.bills(user_id);
CREATE INDEX IF NOT EXISTS idx_bills_customer_id ON public.bills(customer_id);
CREATE INDEX IF NOT EXISTS idx_bills_created_at ON public.bills(created_at);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON public.bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON public.expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_redemption_user ON public.loyalty_redemption_rules(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sequences_user_key ON public.sequences(user_id, key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_user_key ON public.settings(user_id, key);

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

-- Create Strict Multi-Tenant Access Policies (Enforces auth.uid() = user_id for authenticated sessions)
CREATE POLICY "Tenant isolation on sequences" ON public.sequences FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Tenant isolation on customers" ON public.customers FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Tenant isolation on products" ON public.products FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Tenant isolation on bills" ON public.bills FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Tenant isolation on bill_items" ON public.bill_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Tenant isolation on payments" ON public.payments FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Tenant isolation on expenses" ON public.expenses FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Tenant isolation on settings" ON public.settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Tenant isolation on loyalty_transactions" ON public.loyalty_transactions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Tenant isolation on loyalty_rules" ON public.loyalty_rules FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Tenant isolation on loyalty_redemption_rules" ON public.loyalty_redemption_rules FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Immutable Audit Log Policies (Append-only & read-only for tenant, disallow update/delete)
CREATE POLICY "Tenant insert on audit_logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Tenant select on audit_logs" ON public.audit_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- RELOAD SUPABASE POSTGREST SCHEMA CACHE INSTANTLY
NOTIFY pgrst, 'reload schema';
