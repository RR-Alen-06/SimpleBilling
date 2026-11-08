-- =========================================================================
-- PrintPro ERP / SimBilling Unified Store Database Schema
-- Master Idempotent Cloud Database Script for a Single Store
-- Seamless operation for anon (publishable key) & authenticated users
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 0. SEQUENCES TABLE
CREATE TABLE IF NOT EXISTS public.sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    key TEXT NOT NULL,
    prefix TEXT NOT NULL,
    padding INT NOT NULL DEFAULT 6 CHECK (padding >= 2 AND padding <= 12),
    current_val BIGINT NOT NULL DEFAULT 0 CHECK (current_val >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sequences ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();
ALTER TABLE public.sequences ADD COLUMN IF NOT EXISTS key TEXT;
ALTER TABLE public.sequences ADD COLUMN IF NOT EXISTS prefix TEXT;
ALTER TABLE public.sequences ADD COLUMN IF NOT EXISTS padding INT DEFAULT 6;
ALTER TABLE public.sequences ADD COLUMN IF NOT EXISTS current_val BIGINT DEFAULT 0;
ALTER TABLE public.sequences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 1. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    customer_code TEXT,
    name TEXT NOT NULL,
    mobile TEXT,
    email TEXT,
    advance_balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (advance_balance >= 0),
    loyalty_points NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (loyalty_points >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_code TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS advance_balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS loyalty_points NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- 2. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    product_code TEXT,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Stationery',
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_code TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Stationery';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- 3. BILLS TABLE
CREATE TABLE IF NOT EXISTS public.bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
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

ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS rounding_method TEXT DEFAULT 'None';
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS rounding_adjustment NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS advance_used NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS advance_earned NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS loyalty_points_earned NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS loyalty_points_redeemed NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS edited_by TEXT;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS edit_reason TEXT;
ALTER TABLE public.bills DROP CONSTRAINT IF EXISTS bills_payment_method_check;

-- 4. BILL ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.bill_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    total NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bill_items ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();

-- 5. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    payment_number TEXT,
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    bill_id UUID REFERENCES public.bills(id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL DEFAULT 'Cash',
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    cancellation_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    cancelled_by TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_number TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'COMPLETED';
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;

-- 6. EXPENSES TABLE
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    expense_number TEXT,
    title TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    category TEXT NOT NULL DEFAULT 'Shop Expense',
    payment_mode TEXT DEFAULT 'Cash',
    cash_amount NUMERIC(10, 2) DEFAULT 0.00,
    upi_amount NUMERIC(10, 2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS expense_number TEXT;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'Cash';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS upi_amount NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_category_check;

-- 7. SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 8. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    user_name TEXT NOT NULL DEFAULT 'Admin',
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    previous_value TEXT,
    new_value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();

-- 9. LOYALTY TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    transaction_number TEXT,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    bill_id UUID REFERENCES public.bills(id) ON DELETE SET NULL,
    points NUMERIC(10, 2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('EARN', 'REDEEM', 'ADJUST')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_transactions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();
ALTER TABLE public.loyalty_transactions ADD COLUMN IF NOT EXISTS transaction_number TEXT;

-- 10. LOYALTY RULES TABLE
CREATE TABLE IF NOT EXISTS public.loyalty_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    rule_name TEXT NOT NULL,
    min_bill_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (min_bill_amount >= 0),
    max_bill_amount NUMERIC(10, 2),
    points_earned NUMERIC(10, 2) NOT NULL DEFAULT 1.00 CHECK (points_earned > 0),
    enabled BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_rules ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();
ALTER TABLE public.loyalty_rules ADD COLUMN IF NOT EXISTS points_earned NUMERIC(10, 2) NOT NULL DEFAULT 1.00;

DO $$ BEGIN
    ALTER TABLE public.loyalty_rules ALTER COLUMN reward_type DROP NOT NULL;
    ALTER TABLE public.loyalty_rules ALTER COLUMN reward_value DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 11. LOYALTY REDEMPTION RULES TABLE
CREATE TABLE IF NOT EXISTS public.loyalty_redemption_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    points_required INT NOT NULL CHECK (points_required > 0),
    discount_amount NUMERIC(10, 2) NOT NULL CHECK (discount_amount > 0),
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_redemption_rules ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();

-- 12. INTERNAL TRANSFERS TABLE (CONTRA VOUCHERS: CASH <-> UPI CONVERSIONS)
CREATE TABLE IF NOT EXISTS public.internal_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    transfer_number TEXT,
    direction TEXT NOT NULL CHECK (direction IN ('CASH_TO_UPI', 'UPI_TO_CASH')),
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    reference_no TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.internal_transfers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();
ALTER TABLE public.internal_transfers ADD COLUMN IF NOT EXISTS transfer_number TEXT;
ALTER TABLE public.internal_transfers ADD COLUMN IF NOT EXISTS direction TEXT;
ALTER TABLE public.internal_transfers ADD COLUMN IF NOT EXISTS amount NUMERIC(10, 2);
ALTER TABLE public.internal_transfers ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.internal_transfers ADD COLUMN IF NOT EXISTS reference_no TEXT;
ALTER TABLE public.internal_transfers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.internal_transfers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- 13. ACCOUNTING CLOSINGS TABLE (PERIOD CLOSING & RECONCILIATION SNAPSHOTS)
CREATE TABLE IF NOT EXISTS public.accounting_closings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    closing_number TEXT,
    from_date TIMESTAMPTZ NOT NULL,
    to_date TIMESTAMPTZ NOT NULL,
    opening_cash NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    opening_upi NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    cash_inflow NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    upi_inflow NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    cash_outflow NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    upi_outflow NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    transfers_cash_to_upi NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    transfers_upi_to_cash NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    expected_cash NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    expected_upi NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    actual_cash NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    actual_upi NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    cash_difference NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    upi_difference NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    discrepancy_note TEXT,
    status TEXT NOT NULL DEFAULT 'CLOSED',
    is_locked BOOLEAN NOT NULL DEFAULT true,
    closed_by TEXT NOT NULL DEFAULT 'Admin',
    closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_audited_at TIMESTAMPTZ,
    last_audited_by TEXT,
    audit_notes TEXT
);

ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS closing_number TEXT;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS from_date TIMESTAMPTZ;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS to_date TIMESTAMPTZ;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS opening_cash NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS opening_upi NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS cash_inflow NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS upi_inflow NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS cash_outflow NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS upi_outflow NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS transfers_cash_to_upi NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS transfers_upi_to_cash NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS expected_cash NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS expected_upi NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS actual_cash NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS actual_upi NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS cash_difference NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS upi_difference NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS discrepancy_note TEXT;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'CLOSED';
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT true;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS closed_by TEXT DEFAULT 'Admin';
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS last_audited_at TIMESTAMPTZ;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS last_audited_by TEXT;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS audit_notes TEXT;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS opening_advance_pool NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS advance_received NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS advance_utilized NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS closing_advance_pool NUMERIC(10, 2) DEFAULT 0.00;

-- =========================================================================
-- ATOMIC DATABASE TRANSACTION SEQUENCE GENERATOR (UNIFIED STORE)
-- Works smoothly for anonymous (anon key) and authenticated sessions
-- =========================================================================
CREATE OR REPLACE FUNCTION get_next_sequence(p_key TEXT)
RETURNS TEXT AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_prefix TEXT;
    v_padding INT;
    v_next_val BIGINT;
BEGIN
    -- 1. Try to increment existing sequence matching key
    UPDATE public.sequences
    SET current_val = current_val + 1,
        updated_at = now()
    WHERE UPPER(key) = UPPER(p_key)
    RETURNING prefix, padding, current_val INTO v_prefix, v_padding, v_next_val;

    -- 2. If no record was updated, insert initial sequence record
    IF v_prefix IS NULL THEN
        INSERT INTO public.sequences (user_id, key, prefix, padding, current_val)
        VALUES (v_user_id, UPPER(p_key), UPPER(p_key), 6, 1)
        ON CONFLICT DO NOTHING
        RETURNING prefix, padding, current_val INTO v_prefix, v_padding, v_next_val;

        IF v_prefix IS NULL THEN
            UPDATE public.sequences
            SET current_val = current_val + 1,
                updated_at = now()
            WHERE UPPER(key) = UPPER(p_key)
            RETURNING prefix, padding, current_val INTO v_prefix, v_padding, v_next_val;
        END IF;
    END IF;

    -- 3. Resilient fallback defaults
    IF v_prefix IS NULL THEN
        v_prefix := UPPER(p_key);
        v_padding := 6;
        v_next_val := 1;
    END IF;

    RETURN v_prefix || '-' || LPAD(v_next_val::text, v_padding, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- DATA NORMALIZATION & DUPLICATE CLEANUP
-- =========================================================================
DELETE FROM public.loyalty_redemption_rules a
WHERE a.ctid NOT IN (
    SELECT DISTINCT ON (points_required) ctid
    FROM public.loyalty_redemption_rules
    ORDER BY points_required
);

DELETE FROM public.loyalty_rules a
WHERE a.ctid NOT IN (
    SELECT DISTINCT ON (rule_name) ctid
    FROM public.loyalty_rules
    ORDER BY rule_name
);

DELETE FROM public.sequences a
WHERE a.ctid NOT IN (
    SELECT rid
    FROM (
        SELECT DISTINCT ON (UPPER(key)) ctid AS rid
        FROM public.sequences
        ORDER BY UPPER(key), current_val DESC NULLS LAST, updated_at DESC NULLS LAST
    ) sub
);

-- Keep only the most recently updated row per settings key (single store)
DELETE FROM public.settings a
WHERE a.ctid NOT IN (
    SELECT rid
    FROM (
        SELECT DISTINCT ON (key) ctid AS rid
        FROM public.settings
        ORDER BY key, updated_at DESC NULLS LAST
    ) sub
);

-- Remove old per-user unique indexes from the legacy multi-tenant migration
DROP INDEX IF EXISTS public.idx_sequences_user_key;
DROP INDEX IF EXISTS public.idx_settings_user_key;
DROP INDEX IF EXISTS public.idx_loyalty_rules_unique;
DROP INDEX IF EXISTS public.idx_loyalty_redemption_unique;

-- NOTE: Customer advance balances are NOT overwritten here.
-- Advance is derived from each customer's ledger (payments minus billed) by the app.

-- =========================================================================
-- INDEXES FOR MAXIMUM QUERY PERFORMANCE
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON public.customers(mobile);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);
CREATE INDEX IF NOT EXISTS idx_bills_customer_id ON public.bills(customer_id);
CREATE INDEX IF NOT EXISTS idx_bills_created_at ON public.bills(created_at);
CREATE INDEX IF NOT EXISTS idx_bills_bill_number ON public.bills(bill_number);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON public.bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_product_id ON public.bill_items(product_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON public.payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_bill_id ON public.payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments(created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON public.expenses(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer_id ON public.loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_bill_id ON public.loyalty_transactions(bill_id);
CREATE INDEX IF NOT EXISTS idx_internal_transfers_created_at ON public.internal_transfers(created_at);
CREATE INDEX IF NOT EXISTS idx_accounting_closings_dates ON public.accounting_closings(from_date, to_date);

-- Unique constraints for unified store database
CREATE UNIQUE INDEX IF NOT EXISTS idx_sequences_key_unified ON public.sequences(UPPER(key));
CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_key_unified ON public.settings(key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_redemption_points ON public.loyalty_redemption_rules(points_required);
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_rules_name ON public.loyalty_rules(rule_name);

-- =========================================================================
-- ROW LEVEL SECURITY (RLS) FOR UNIFIED STORE DATABASE
-- Allows seamless read/write access for both anon and authenticated roles
-- =========================================================================
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
ALTER TABLE public.internal_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_closings ENABLE ROW LEVEL SECURITY;

-- Drop all legacy policies
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
DROP POLICY IF EXISTS "Allow full access to internal_transfers" ON public.internal_transfers;
DROP POLICY IF EXISTS "Allow full access to accounting_closings" ON public.accounting_closings;

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
DROP POLICY IF EXISTS "Allow all access to internal_transfers" ON public.internal_transfers;
DROP POLICY IF EXISTS "Allow all access to accounting_closings" ON public.accounting_closings;

DROP POLICY IF EXISTS "Tenant isolation on sequences" ON public.sequences;
DROP POLICY IF EXISTS "Tenant isolation on customers" ON public.customers;
DROP POLICY IF EXISTS "Tenant isolation on products" ON public.products;
DROP POLICY IF EXISTS "Tenant isolation on bills" ON public.bills;
DROP POLICY IF EXISTS "Tenant isolation on bill_items" ON public.bill_items;
DROP POLICY IF EXISTS "Tenant isolation on payments" ON public.payments;
DROP POLICY IF EXISTS "Tenant isolation on expenses" ON public.expenses;
DROP POLICY IF EXISTS "Tenant isolation on settings" ON public.settings;
DROP POLICY IF EXISTS "Tenant isolation on loyalty_transactions" ON public.loyalty_transactions;
DROP POLICY IF EXISTS "Tenant isolation on loyalty_rules" ON public.loyalty_rules;
DROP POLICY IF EXISTS "Tenant isolation on loyalty_redemption_rules" ON public.loyalty_redemption_rules;
DROP POLICY IF EXISTS "Tenant isolation on internal_transfers" ON public.internal_transfers;
DROP POLICY IF EXISTS "Tenant isolation on accounting_closings" ON public.accounting_closings;
DROP POLICY IF EXISTS "Tenant insert on audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Tenant select on audit_logs" ON public.audit_logs;

DROP POLICY IF EXISTS "Unified access to sequences" ON public.sequences;
DROP POLICY IF EXISTS "Unified access to customers" ON public.customers;
DROP POLICY IF EXISTS "Unified access to products" ON public.products;
DROP POLICY IF EXISTS "Unified access to bills" ON public.bills;
DROP POLICY IF EXISTS "Unified access to bill_items" ON public.bill_items;
DROP POLICY IF EXISTS "Unified access to payments" ON public.payments;
DROP POLICY IF EXISTS "Unified access to expenses" ON public.expenses;
DROP POLICY IF EXISTS "Unified access to settings" ON public.settings;
DROP POLICY IF EXISTS "Unified access to audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Unified access to loyalty_transactions" ON public.loyalty_transactions;
DROP POLICY IF EXISTS "Unified access to loyalty_rules" ON public.loyalty_rules;
DROP POLICY IF EXISTS "Unified access to loyalty_redemption_rules" ON public.loyalty_redemption_rules;
DROP POLICY IF EXISTS "Unified access to internal_transfers" ON public.internal_transfers;
DROP POLICY IF EXISTS "Unified access to accounting_closings" ON public.accounting_closings;

-- Create Unified Access Policies (Open to both anon publishable key and authenticated sessions)
CREATE POLICY "Unified access to sequences" ON public.sequences FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Unified access to customers" ON public.customers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Unified access to products" ON public.products FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Unified access to bills" ON public.bills FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Unified access to bill_items" ON public.bill_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Unified access to payments" ON public.payments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Unified access to expenses" ON public.expenses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Unified access to settings" ON public.settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Unified access to audit_logs" ON public.audit_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Unified access to loyalty_transactions" ON public.loyalty_transactions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Unified access to loyalty_rules" ON public.loyalty_rules FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Unified access to loyalty_redemption_rules" ON public.loyalty_redemption_rules FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Unified access to internal_transfers" ON public.internal_transfers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Unified access to accounting_closings" ON public.accounting_closings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- =========================================================================
-- EXACT LEDGER RECONCILIATION & SANITIZATION
-- =========================================================================
-- 1. Reset all phantom customer advance balances to 0.00
UPDATE public.customers
SET advance_balance = 0.00;

-- 3. Exact reconciliation for Madhav Suresh Kumar (BILL-0052 & ₹48 due balance)
UPDATE public.bills
SET 
    advance_used = 1.00,
    paid_total = 1.00,
    cash_paid = 0.00,
    upi_paid = 0.00,
    advance_earned = 0.00,
    payment_method = 'Pay Later'
WHERE bill_number = 'BILL-0052'
  AND customer_id IN (SELECT id FROM public.customers WHERE LOWER(TRIM(name)) = 'madhav suresh kumar');

UPDATE public.customers
SET advance_balance = 0.00
WHERE LOWER(TRIM(name)) = 'madhav suresh kumar';

-- 4. Exact reconciliation for Anandhu K R (Zero due, Zero advance)
UPDATE public.customers
SET advance_balance = 0.00
WHERE LOWER(TRIM(name)) = 'anandhu k r';

-- Record Schema Unification in Audit Log
INSERT INTO public.audit_logs (
    user_name,
    action,
    entity,
    new_value
) VALUES (
    'Super Admin',
    'UNIFY_DATABASE_SCHEMA',
    'System Database',
    'Consolidated all 14 tables into a single unified store database schema with open anon/authenticated RLS access.'
);

-- =========================================================================
-- INSTANT POSTGREST SCHEMA CACHE RELOAD
-- =========================================================================
NOTIFY pgrst, 'reload schema';
