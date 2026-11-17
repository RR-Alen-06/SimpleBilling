-- =========================================================================
-- AUTO-EXPANDING SEQUENCE NUMBER FORMATTER (4 -> 6 -> 8 DIGITS, NO TRUNCATION)
-- - 1..9,999        -> min 4 digits (0001-9999)
-- - 10,000..999,999 -> min 6 digits (010000-999999)
-- - 1,000,000+      -> min 8 digits (01000000-99999999), never cuts off digits
-- Respects any larger configured min_padding (e.g., TRANS = 6).
-- =========================================================================

CREATE OR REPLACE FUNCTION public.format_sequence_number(
    p_prefix TEXT,
    p_val BIGINT,
    p_min_padding INT DEFAULT 4
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    v_safe_val BIGINT := GREATEST(0, COALESCE(p_val, 0));
    v_val_text TEXT := v_safe_val::TEXT;
    v_len INT := LENGTH(v_val_text);
    v_base INT := GREATEST(4, COALESCE(p_min_padding, 4));
    v_width INT;
BEGIN
    IF v_safe_val >= 1000000 THEN
        v_width := GREATEST(v_base, 8, v_len);
    ELSIF v_safe_val >= 10000 THEN
        v_width := GREATEST(v_base, 6, v_len);
    ELSE
        v_width := GREATEST(v_base, v_len);
    END IF;

    RETURN p_prefix || '-' || LPAD(v_val_text, v_width, '0');
END;
$$;

-- Update get_next_sequence to default new sequences to padding = 4 and use format_sequence_number
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
        VALUES (v_user_id, UPPER(p_key), UPPER(p_key), 4, 1)
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
        v_padding := 4;
        v_next_val := 1;
    END IF;

    RETURN public.format_sequence_number(v_prefix, v_next_val, v_padding);
END;
$$;

-- Align generate_bill_number trigger with the same 4 -> 6 -> 8 auto-expanding rule
CREATE OR REPLACE FUNCTION public.generate_bill_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.bill_number IS NULL OR NEW.bill_number = '' THEN
        NEW.bill_number := public.format_sequence_number('BILL', nextval('bill_number_seq'), 4);
    END IF;
    RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
