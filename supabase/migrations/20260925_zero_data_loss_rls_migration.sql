-- =========================================================================
-- PrintPro ERP / SimBilling: Zero-Data-Loss Multi-Tenant & RLS Migration
-- Safe for execution in Supabase SQL Editor or Supabase CLI
-- =========================================================================

-- STEP 1: Add user_id column safely (Non-destructive, preserves all existing data)
ALTER TABLE public.sequences ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.bill_items ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.loyalty_transactions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.loyalty_rules ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.loyalty_redemption_rules ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

-- STEP 2: Transactional Backfill of Existing Real Data (NULL -> Primary Owner)
DO $$
DECLARE
    -- Auto-detects the first registered user in auth.users as the primary store owner
    v_owner_id UUID;
    v_updated_count INT;
BEGIN
    SELECT id INTO v_owner_id FROM auth.users ORDER BY created_at ASC LIMIT 1;

    IF v_owner_id IS NOT NULL THEN
        RAISE NOTICE 'Backfilling legacy data to Owner User ID: %', v_owner_id;

        -- 1. Sequences
        UPDATE public.sequences SET user_id = v_owner_id WHERE user_id IS NULL;
        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
        RAISE NOTICE 'Sequences backfilled: % rows', v_updated_count;

        -- 2. Customers
        UPDATE public.customers SET user_id = v_owner_id WHERE user_id IS NULL;
        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
        RAISE NOTICE 'Customers backfilled: % rows', v_updated_count;

        -- 3. Products
        UPDATE public.products SET user_id = v_owner_id WHERE user_id IS NULL;
        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
        RAISE NOTICE 'Products backfilled: % rows', v_updated_count;

        -- 4. Bills
        UPDATE public.bills SET user_id = v_owner_id WHERE user_id IS NULL;
        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
        RAISE NOTICE 'Bills backfilled: % rows', v_updated_count;

        -- 5. Bill Items (Backfill using parent bill's user_id or fallback to owner)
        UPDATE public.bill_items bi 
        SET user_id = COALESCE(b.user_id, v_owner_id)
        FROM public.bills b 
        WHERE bi.bill_id = b.id AND bi.user_id IS NULL;
        UPDATE public.bill_items SET user_id = v_owner_id WHERE user_id IS NULL;
        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
        RAISE NOTICE 'Bill Items backfilled: % rows', v_updated_count;

        -- 6. Payments
        UPDATE public.payments SET user_id = v_owner_id WHERE user_id IS NULL;
        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
        RAISE NOTICE 'Payments backfilled: % rows', v_updated_count;

        -- 7. Expenses
        UPDATE public.expenses SET user_id = v_owner_id WHERE user_id IS NULL;
        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
        RAISE NOTICE 'Expenses backfilled: % rows', v_updated_count;

        -- 8. Settings
        UPDATE public.settings SET user_id = v_owner_id WHERE user_id IS NULL;
        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
        RAISE NOTICE 'Settings backfilled: % rows', v_updated_count;

        -- 9. Audit Logs
        UPDATE public.audit_logs SET user_id = v_owner_id WHERE user_id IS NULL;
        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
        RAISE NOTICE 'Audit Logs backfilled: % rows', v_updated_count;

        -- 10. Loyalty Transactions
        UPDATE public.loyalty_transactions SET user_id = v_owner_id WHERE user_id IS NULL;
        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
        RAISE NOTICE 'Loyalty Transactions backfilled: % rows', v_updated_count;

        -- 11. Loyalty Rules
        UPDATE public.loyalty_rules SET user_id = v_owner_id WHERE user_id IS NULL;
        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
        RAISE NOTICE 'Loyalty Rules backfilled: % rows', v_updated_count;

        -- 12. Loyalty Redemption Rules
        UPDATE public.loyalty_redemption_rules SET user_id = v_owner_id WHERE user_id IS NULL;
        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
        RAISE NOTICE 'Loyalty Redemption Rules backfilled: % rows', v_updated_count;
    ELSE
        RAISE NOTICE 'No existing users found in auth.users. Skipping backfill (new records will automatically receive user_id upon creation).';
    END IF;
END $$;

-- STEP 3: Clean up any legacy duplicate seed rules before creating unique constraints
DELETE FROM public.loyalty_redemption_rules a
WHERE a.id NOT IN (
    SELECT MIN(id::text)::uuid
    FROM public.loyalty_redemption_rules
    GROUP BY user_id, points_required
);

DELETE FROM public.loyalty_rules a
WHERE a.id NOT IN (
    SELECT MIN(id::text)::uuid
    FROM public.loyalty_rules
    GROUP BY user_id, rule_name
);

-- STEP 4: Performance & Multi-Tenant Indexes
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON public.customers(user_id);
CREATE INDEX IF NOT EXISTS idx_products_user_id ON public.products(user_id);
CREATE INDEX IF NOT EXISTS idx_bills_user_id ON public.bills(user_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_user_id ON public.bill_items(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON public.expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_user_id ON public.loyalty_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_redemption_user ON public.loyalty_redemption_rules(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_redemption_unique ON public.loyalty_redemption_rules(user_id, points_required);
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_rules_unique ON public.loyalty_rules(user_id, rule_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sequences_user_key ON public.sequences(user_id, key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_user_key ON public.settings(user_id, key);

-- STEP 4: Enable Row Level Security (RLS) on all 12 tables
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

-- STEP 5: Drop legacy / insecure policies
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
DROP POLICY IF EXISTS "Tenant insert on audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Tenant select on audit_logs" ON public.audit_logs;

-- STEP 6: Apply Tenant Isolation Policies (Authenticated users read & write only their own records)
CREATE POLICY "Tenant isolation on sequences" ON public.sequences 
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Tenant isolation on customers" ON public.customers 
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Tenant isolation on products" ON public.products 
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Tenant isolation on bills" ON public.bills 
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Tenant isolation on bill_items" ON public.bill_items 
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Tenant isolation on payments" ON public.payments 
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Tenant isolation on expenses" ON public.expenses 
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Tenant isolation on settings" ON public.settings 
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Tenant isolation on loyalty_transactions" ON public.loyalty_transactions 
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Tenant isolation on loyalty_rules" ON public.loyalty_rules 
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Tenant isolation on loyalty_redemption_rules" ON public.loyalty_redemption_rules 
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Immutable Audit Log Policies (Append & Read only)
CREATE POLICY "Tenant insert on audit_logs" ON public.audit_logs 
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Tenant select on audit_logs" ON public.audit_logs 
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- STEP 7: Reload Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';
