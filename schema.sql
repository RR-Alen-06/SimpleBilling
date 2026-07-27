-- ==========================================
-- Xerox & Stationery Billing System Database Schema
-- Supabase / PostgreSQL Script
-- ==========================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    mobile TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Stationery',
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. BILL NUMBER SEQUENCE & FUNCTION
CREATE SEQUENCE IF NOT EXISTS bill_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_bill_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.bill_number IS NULL OR NEW.bill_number = '' THEN
        NEW.bill_number := 'BILL-' || LPAD(nextval('bill_number_seq')::text, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. BILLS TABLE
CREATE TABLE IF NOT EXISTS public.bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_number TEXT UNIQUE NOT NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    total NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (total >= 0),
    discount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0),
    grand_total NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (grand_total >= 0),
    paid_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
    payment_method TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'UPI', 'Card')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to auto-assign bill_number if omitted
DROP TRIGGER IF EXISTS trigger_set_bill_number ON public.bills;
CREATE TRIGGER trigger_set_bill_number
BEFORE INSERT ON public.bills
FOR EACH ROW
EXECUTE FUNCTION generate_bill_number();

-- 5. BILL ITEMS TABLE
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

-- 6. PAYMENTS TABLE (Customer Payments / Ledger Settlements)
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    bill_id UUID REFERENCES public.bills(id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'UPI', 'Card')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. EXPENSES TABLE
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    category TEXT NOT NULL CHECK (category IN ('Shop Expense', 'Electricity', 'Rent', 'Other Expense')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexing for high-performance dashboard & ledger queries
CREATE INDEX IF NOT EXISTS idx_bills_customer_id ON public.bills(customer_id);
CREATE INDEX IF NOT EXISTS idx_bills_created_at ON public.bills(created_at);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON public.bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON public.payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON public.expenses(created_at);

-- Disable Row Level Security for straightforward single-admin or enable public policies for development
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anon / authenticated users (Single Shop Admin setup)
DROP POLICY IF EXISTS "Allow full access to customers" ON public.customers;
CREATE POLICY "Allow full access to customers" ON public.customers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to products" ON public.products;
CREATE POLICY "Allow full access to products" ON public.products FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to bills" ON public.bills;
CREATE POLICY "Allow full access to bills" ON public.bills FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to bill_items" ON public.bill_items;
CREATE POLICY "Allow full access to bill_items" ON public.bill_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to payments" ON public.payments;
CREATE POLICY "Allow full access to payments" ON public.payments FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to expenses" ON public.expenses;
CREATE POLICY "Allow full access to expenses" ON public.expenses FOR ALL USING (true) WITH CHECK (true);

