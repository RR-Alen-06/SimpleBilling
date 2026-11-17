-- =========================================================================
-- CLEANUP MIGRATION: REMOVE DUPLICATE LEGACY RLS POLICIES & FIX SEARCH_PATH
-- Resolves Supabase Advisor warnings:
--   - auth_rls_initplan (13)
--   - multiple_permissive_policies (46)
--   - function_search_path_mutable (public.generate_bill_number)
-- =========================================================================

DROP POLICY IF EXISTS "Tenant isolation on sequences" ON public.sequences;
DROP POLICY IF EXISTS "Tenant isolation on customers" ON public.customers;
DROP POLICY IF EXISTS "Tenant isolation on products" ON public.products;
DROP POLICY IF EXISTS "Tenant isolation on bills" ON public.bills;
DROP POLICY IF EXISTS "Tenant isolation on bill_items" ON public.bill_items;
DROP POLICY IF EXISTS "Tenant isolation on payments" ON public.payments;
DROP POLICY IF EXISTS "Tenant isolation on expenses" ON public.expenses;
DROP POLICY IF EXISTS "Tenant isolation on settings" ON public.settings;
DROP POLICY IF EXISTS "Tenant select on audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Tenant insert on audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Tenant isolation on loyalty_transactions" ON public.loyalty_transactions;
DROP POLICY IF EXISTS "Tenant isolation on loyalty_rules" ON public.loyalty_rules;
DROP POLICY IF EXISTS "Tenant isolation on loyalty_redemption_rules" ON public.loyalty_redemption_rules;

-- Pin search_path on generate_bill_number (if present)
DO $$
DECLARE
  fn_sig regprocedure;
BEGIN
  SELECT p.oid::regprocedure INTO fn_sig
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'generate_bill_number'
  LIMIT 1;

  IF fn_sig IS NOT NULL THEN
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', fn_sig);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
