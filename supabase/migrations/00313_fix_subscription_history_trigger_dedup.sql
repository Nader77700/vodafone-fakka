
-- ══════════════════════════════════════════════════════════════
-- إصلاح trigger التكرار في subscription_history
-- المشكلة: activate_license_key يكتب سجل + الـ trigger يكتب سجل ثاني
-- الحل: التحقق بـ license_key_id + user_id + expires_at معاً بدل الوقت فقط
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.trg_sync_subscription_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  -- ── INSERT: اشتراك جديد ──────────────────────────────────────────────
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN

    -- منع التكرار: إذا activate_license_key سبق وسجّل نفس التفعيل
    -- نتحقق بـ (user_id + license_key_id + expires_at) وليس الوقت فقط
    SELECT COUNT(*) INTO v_count
    FROM public.subscription_history
    WHERE user_id        = NEW.user_id
      AND license_key_id = NEW.license_key_id
      AND expires_at     = NEW.expires_at;

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

  -- ── UPDATE: تغيير status → expired/suspended ─────────────────────────
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'active' AND NEW.status IN ('expired', 'suspended') THEN
    UPDATE public.subscription_history
    SET
      status     = NEW.status,
      end_reason = CASE
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
    WHERE id = (
      SELECT id FROM public.subscription_history
      WHERE user_id = NEW.user_id
      ORDER BY created_at DESC
      LIMIT 1
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_sync_subscription_history error: %', SQLERRM;
  RETURN NEW;
END;
$function$;
