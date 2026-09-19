CREATE OR REPLACE FUNCTION public.trg_sync_subscription_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_count integer;
BEGIN
  -- ── INSERT: اشتراك جديد ──────────────────────────────────────────────
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    -- منع التكرار: dedup بـ (user_id + license_key_id + code_used + expires_at) خلال 15 ثانية
    SELECT COUNT(*) INTO v_count
    FROM public.subscription_history
    WHERE user_id        = NEW.user_id
      AND license_key_id = NEW.license_key_id
      AND COALESCE(code, '')  = COALESCE(NEW.code_used, '')
      AND expires_at     = NEW.expires_at
      AND ABS(EXTRACT(EPOCH FROM (created_at - now()))) < 15;

    IF v_count = 0 THEN
      INSERT INTO public.subscription_history (
        user_id, license_key_id, subscription_id, code, code_type,
        duration_days, days_before, days_after,
        activated_at, expires_at,
        status, operation_type, notes, created_at
      ) VALUES (
        NEW.user_id,
        NEW.license_key_id,
        NEW.id,
        NEW.code_used,
        COALESCE(NEW.code_type, 'paid'),
        COALESCE(NEW.duration_days, 30),
        0,
        COALESCE(NEW.duration_days, 30),
        now(),
        NEW.expires_at,
        'active',
        'activate',
        'تفعيل تلقائي (trigger)',
        now()
      );
    END IF;

  -- ── UPDATE: تغيير status → expired/suspended/cancelled ────────────
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'active' AND NEW.status IN ('expired', 'suspended', 'cancelled') THEN
    -- البحث بـ subscription_id أولاً (أدق) ثم fallback لـ آخر سجل
    UPDATE public.subscription_history
    SET
      status     = NEW.status,
      end_reason = CASE
        WHEN NEW.status = 'cancelled'
        THEN 'replaced_by_new_subscription'
        WHEN NEW.status = 'expired' AND NEW.ops_limit IS NOT NULL
             AND COALESCE(NEW.ops_count, 0) >= NEW.ops_limit
        THEN 'ops_exhausted'
        WHEN NEW.status = 'expired'
        THEN 'expired_by_date'
        WHEN NEW.status = 'suspended'
        THEN 'suspended'
        ELSE 'unknown'
      END,
      days_remaining_at_end = CASE
        WHEN NEW.expires_at IS NOT NULL AND NEW.expires_at > now()
        THEN EXTRACT(DAY FROM (NEW.expires_at - now()))::integer
        ELSE 0
      END
    WHERE (
      -- أولوية: البحث بـ subscription_id إذا كان موجوداً
      (subscription_id = NEW.id AND NEW.id IS NOT NULL)
      OR
      -- fallback: آخر سجل لهذا المستخدم بنفس الكود
      (subscription_id IS NULL AND id = (
        SELECT id FROM public.subscription_history
        WHERE user_id   = NEW.user_id
          AND COALESCE(code,'') = COALESCE(NEW.code_used,'')
          AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
      ))
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_sync_subscription_history error: %', SQLERRM;
  RETURN NEW;
END;
$$;