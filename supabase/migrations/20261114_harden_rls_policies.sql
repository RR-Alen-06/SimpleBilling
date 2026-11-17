-- =========================================================================
-- SECURITY HARDENING MIGRATION: REVOKE ANON ACCESS & ENFORCE TENANT-SCOPED RLS
-- Review carefully before applying to your live Supabase database.
--
-- IMPORTANT NOTE FOR MULTI-STAFF SHOPS:
-- These policies scope each row to `user_id = (select auth.uid())` so one
-- authenticated user cannot read/modify another user's records.
-- If your store has multiple authenticated staff accounts sharing one store,
-- add a `store_id` / `store_members` table or `app_metadata.store_id` claim
-- and scope policies to that claim instead of reverting to `USING (true)`.
-- =========================================================================

BEGIN;

-- 1. Revoke all anonymous (unauthenticated) access to application tables
REVOKE ALL ON public.sequences FROM anon;
REVOKE ALL ON public.customers FROM anon;
REVOKE ALL ON public.products FROM anon;
REVOKE ALL ON public.bills FROM anon;
REVOKE ALL ON public.bill_items FROM anon;
REVOKE ALL ON public.payments FROM anon;
REVOKE ALL ON public.expenses FROM anon;
REVOKE ALL ON public.settings FROM anon;
REVOKE ALL ON public.audit_logs FROM anon;
REVOKE ALL ON public.loyalty_transactions FROM anon;
REVOKE ALL ON public.loyalty_rules FROM anon;
REVOKE ALL ON public.loyalty_redemption_rules FROM anon;
REVOKE ALL ON public.internal_transfers FROM anon;
REVOKE ALL ON public.accounting_closings FROM anon;

REVOKE EXECUTE ON FUNCTION public.get_next_sequence(TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_next_sequence(TEXT) TO authenticated;

-- 2. Ensure RLS is enabled and forced on all 14 tables
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

-- 3. Drop overly permissive anon + authenticated policies
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

-- 4. Create authenticated, owner-scoped RLS policies (idempotent)
DROP POLICY IF EXISTS "Owner access to sequences" ON public.sequences;
CREATE POLICY "Owner access to sequences" ON public.sequences
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Owner access to customers" ON public.customers;
CREATE POLICY "Owner access to customers" ON public.customers
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Owner access to products" ON public.products;
CREATE POLICY "Owner access to products" ON public.products
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Owner access to bills" ON public.bills;
CREATE POLICY "Owner access to bills" ON public.bills
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Owner access to bill_items" ON public.bill_items;
CREATE POLICY "Owner access to bill_items" ON public.bill_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bills b
      WHERE b.id = bill_items.bill_id AND b.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bills b
      WHERE b.id = bill_items.bill_id AND b.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owner access to payments" ON public.payments;
CREATE POLICY "Owner access to payments" ON public.payments
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Owner access to expenses" ON public.expenses;
CREATE POLICY "Owner access to expenses" ON public.expenses
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Owner access to settings" ON public.settings;
CREATE POLICY "Owner access to settings" ON public.settings
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Audit logs: authenticated users can read and append their own logs, never update/delete
DROP POLICY IF EXISTS "Owner read audit_logs" ON public.audit_logs;
CREATE POLICY "Owner read audit_logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Owner insert audit_logs" ON public.audit_logs;
CREATE POLICY "Owner insert audit_logs" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Owner access to loyalty_transactions" ON public.loyalty_transactions;
CREATE POLICY "Owner access to loyalty_transactions" ON public.loyalty_transactions
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Owner access to loyalty_rules" ON public.loyalty_rules;
CREATE POLICY "Owner access to loyalty_rules" ON public.loyalty_rules
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Owner access to loyalty_redemption_rules" ON public.loyalty_redemption_rules;
CREATE POLICY "Owner access to loyalty_redemption_rules" ON public.loyalty_redemption_rules
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Owner access to internal_transfers" ON public.internal_transfers;
CREATE POLICY "Owner access to internal_transfers" ON public.internal_transfers
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Owner access to accounting_closings" ON public.accounting_closings;
CREATE POLICY "Owner access to accounting_closings" ON public.accounting_closings
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- 5. Harden sequence generator to require an authenticated caller and scope by user_id
CREATE OR REPLACE FUNCTION public.get_next_sequence(p_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_prefix TEXT;
    v_padding INT;
    v_next_val BIGINT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to generate sequence numbers';
    END IF;

    UPDATE public.sequences
    SET current_val = current_val + 1,
        updated_at = now()
    WHERE UPPER(key) = UPPER(p_key)
      AND user_id = v_user_id
    RETURNING prefix, padding, current_val INTO v_prefix, v_padding, v_next_val;

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
              AND user_id = v_user_id
            RETURNING prefix, padding, current_val INTO v_prefix, v_padding, v_next_val;
        END IF;
    END IF;

    IF v_prefix IS NULL THEN
        v_prefix := UPPER(p_key);
        v_padding := 6;
        v_next_val := 1;
    END IF;

    RETURN v_prefix || '-' || LPAD(v_next_val::TEXT, COALESCE(v_padding, 6), '0');
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
