-- =========================================================================
-- INDEX CLEANUP MIGRATION
-- 1. Drop duplicate index on public.settings (settings_pkey already covers key)
-- 2. Add covering indexes for user_id foreign keys / RLS predicates
-- =========================================================================

DROP INDEX IF EXISTS public.idx_settings_key_unified;

CREATE INDEX IF NOT EXISTS idx_accounting_closings_user_id
  ON public.accounting_closings (user_id);

CREATE INDEX IF NOT EXISTS idx_internal_transfers_user_id
  ON public.internal_transfers (user_id);
