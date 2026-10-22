-- =========================================================================
-- SimBilling: Accounting Module Cloud Schema Migration
-- Safe to paste directly into Supabase SQL Editor (Idempotent: Run anytime)
-- =========================================================================

-- 1. INTERNAL TRANSFERS TABLE (Cash ⇄ UPI Conversions)
CREATE TABLE IF NOT EXISTS public.internal_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    transfer_number TEXT,
    direction TEXT NOT NULL CHECK (direction IN ('CASH_TO_UPI', 'UPI_TO_CASH')),
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    reference_no TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure columns exist even if table was previously partially created
ALTER TABLE public.internal_transfers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.internal_transfers ADD COLUMN IF NOT EXISTS transfer_number TEXT;
ALTER TABLE public.internal_transfers ADD COLUMN IF NOT EXISTS direction TEXT;
ALTER TABLE public.internal_transfers ADD COLUMN IF NOT EXISTS amount NUMERIC(10, 2);
ALTER TABLE public.internal_transfers ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.internal_transfers ADD COLUMN IF NOT EXISTS reference_no TEXT;
ALTER TABLE public.internal_transfers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.internal_transfers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Enable RLS and Tenant Security
ALTER TABLE public.internal_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation on internal_transfers" ON public.internal_transfers;
DROP POLICY IF EXISTS "User data isolation on internal_transfers" ON public.internal_transfers;
DROP POLICY IF EXISTS "Allow all access to internal_transfers" ON public.internal_transfers;

CREATE POLICY "Tenant isolation on internal_transfers" 
    ON public.internal_transfers 
    FOR ALL TO authenticated 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);


-- 2. ACCOUNTING CLOSINGS TABLE (Period Closing & Cross-Check Reconciliation)
CREATE TABLE IF NOT EXISTS public.accounting_closings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
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

-- Ensure all columns exist
ALTER TABLE public.accounting_closings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
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

-- Enable RLS and Tenant Security
ALTER TABLE public.accounting_closings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation on accounting_closings" ON public.accounting_closings;
DROP POLICY IF EXISTS "User data isolation on accounting_closings" ON public.accounting_closings;
DROP POLICY IF EXISTS "Allow all access to accounting_closings" ON public.accounting_closings;

CREATE POLICY "Tenant isolation on accounting_closings" 
    ON public.accounting_closings 
    FOR ALL TO authenticated 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

-- 3. EXPENSES TABLE ENHANCEMENTS (Support for Cash/UPI split amounts)
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS upi_amount NUMERIC(10, 2) DEFAULT 0.00;

-- 4. REFRESH SUPABASE SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
