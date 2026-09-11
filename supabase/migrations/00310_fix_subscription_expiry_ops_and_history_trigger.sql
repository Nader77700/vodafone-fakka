
-- ═══════════════════════════════════════════════════════════════════════════
-- FIX 1: atomic_consume_operation
-- الأعمدة الصحيحة: ops_count (العداد), ops_limit (الحد), ops_remaining (المتبقي)
-- المشكلة: لا ينهي الاشتراك عند انتهاء ops_count >= ops_limit
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.atomic_consume_operation(
  p_user_id  UUID,
  p_is_trial boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub         record;
  v_now         timestamptz := now();
  v_new_count   integer;
  v_trial_limit integer;
BEGIN
  SELECT * INTO v_sub
  FROM public.subscriptions
  WHERE user_id = p_user_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_active_subscription');
  END IF;

  -- فحص انتهاء المدة أولاً (يطبق على الجميع)
  IF v_sub.expires_at IS NOT NULL AND v_sub.expires_at < v_now THEN
    UPDATE public.subscriptions
      SET status = 'expired', updated_at = v_now
      WHERE id = v_sub.id;
    INSERT INTO public.activity_log (user_id, event_type, title, description, created_at)
    VALUES (p_user_id, 'subscription_expired', 'انتهى الاشتراك', 'انتهت مدة الاشتراك تلقائياً', v_now)
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('allowed', false, 'reason', 'subscription_expired', 'exhausted', true);
  END IF;

  -- ── اشتراك تجريبي ─────────────────────────────────────────────────────
  IF v_sub.code_type = 'trial' OR p_is_trial THEN
    v_trial_limit := COALESCE(v_sub.ops_limit, 5);
    IF COALESCE(v_sub.ops_count, 0) >= v_trial_limit THEN
      UPDATE public.subscriptions SET status = 'expired', updated_at = v_now WHERE id = v_sub.id;
      INSERT INTO public.activity_log (user_id, event_type, title, description, created_at)
      VALUES (p_user_id, 'trial_exhausted', 'انتهت العمليات التجريبية',
              'تم استخدام كل العمليات التجريبية المتاحة', v_now)
      ON CONFLICT DO NOTHING;
      RETURN jsonb_build_object('allowed', false, 'reason', 'trial_limit_reached',
                                'exhausted', true, 'is_trial', true);
    END IF;

    v_new_count := COALESCE(v_sub.ops_count, 0) + 1;
    UPDATE public.subscriptions
      SET ops_count     = v_new_count,
          ops_remaining = GREATEST(0, COALESCE(v_sub.ops_limit, 5) - v_new_count),
          updated_at    = v_now
      WHERE id = v_sub.id;

    -- إنهاء تلقائي بعد آخر عملية
    IF v_new_count >= v_trial_limit THEN
      UPDATE public.subscriptions SET status = 'expired', updated_at = v_now WHERE id = v_sub.id;
      INSERT INTO public.activity_log (user_id, event_type, title, description, created_at)
      VALUES (p_user_id, 'trial_exhausted', 'انتهت العمليات التجريبية',
              'تم استخدام آخر عملية تجريبية', v_now)
      ON CONFLICT DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
      'allowed', true,
      'remaining', v_trial_limit - v_new_count,
      'is_trial', true,
      'exhausted', (v_new_count >= v_trial_limit)
    );
  END IF;

  -- ── اشتراك مدفوع محدود بالعمليات ────────────────────────────────────────
  IF v_sub.ops_limit IS NOT NULL THEN
    IF COALESCE(v_sub.ops_count, 0) >= v_sub.ops_limit THEN
      -- العمليات مكتملة → أنهِ الاشتراك فوراً
      UPDATE public.subscriptions SET status = 'expired', updated_at = v_now WHERE id = v_sub.id;
      INSERT INTO public.activity_log (user_id, event_type, title, description, created_at)
      VALUES (p_user_id, 'subscription_ops_exhausted', 'انتهت العمليات',
              'تم استخدام كل عمليات الاشتراك المتاحة (' || v_sub.ops_limit || ' عملية)', v_now)
      ON CONFLICT DO NOTHING;
      RETURN jsonb_build_object('allowed', false, 'reason', 'ops_limit_reached', 'exhausted', true);
    END IF;

    v_new_count := COALESCE(v_sub.ops_count, 0) + 1;
    UPDATE public.subscriptions
      SET ops_count     = v_new_count,
          ops_remaining = GREATEST(0, v_sub.ops_limit - v_new_count),
          updated_at    = v_now
      WHERE id = v_sub.id;

    -- إنهاء تلقائي بعد آخر عملية
    IF v_new_count >= v_sub.ops_limit THEN
      UPDATE public.subscriptions SET status = 'expired', updated_at = v_now WHERE id = v_sub.id;
      INSERT INTO public.activity_log (user_id, event_type, title, description, created_at)
      VALUES (p_user_id, 'subscription_ops_exhausted', 'انتهت العمليات',
              'تم استخدام آخر عملية في الاشتراك (' || v_sub.ops_limit || ' عملية)', v_now)
      ON CONFLICT DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
      'allowed', true,
      'remaining', v_sub.ops_limit - v_new_count,
      'exhausted', (v_new_count >= v_sub.ops_limit)
    );
  END IF;

  -- ── اشتراك مفتوح (بالمدة فقط، بلا حد عمليات) ────────────────────────────
  UPDATE public.subscriptions
    SET ops_count  = COALESCE(ops_count, 0) + 1,
        updated_at = v_now
    WHERE id = v_sub.id;
  RETURN jsonb_build_object('allowed', true, 'remaining', 'unlimited');

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('allowed', false, 'reason', 'db_error', 'detail', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.atomic_consume_operation(UUID, boolean) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- FIX 2: Trigger تلقائي لـ subscription_history
-- يسجّل عند INSERT جديد أو تغيير status
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.trg_sync_subscription_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- ── INSERT: اشتراك جديد ─────────────────────────────────────────────────
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    -- تجنب تكرار ما يسجله activate_license_key (خلال 5 ثواني)
    SELECT COUNT(*) INTO v_count
    FROM public.subscription_history
    WHERE user_id    = NEW.user_id
      AND expires_at = NEW.expires_at
      AND ABS(EXTRACT(EPOCH FROM (created_at - now()))) < 5;

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

  -- ── UPDATE: تغيير status → expired/suspended ─────────────────────────────
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'active' AND NEW.status IN ('expired', 'suspended') THEN
    -- تحديث آخر سجل بسبب الانتهاء
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
$$;

DROP TRIGGER IF EXISTS trg_subscription_history_sync ON public.subscriptions;
CREATE TRIGGER trg_subscription_history_sync
  AFTER INSERT OR UPDATE OF status ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_subscription_history();


-- ═══════════════════════════════════════════════════════════════════════════
-- FIX 3: إصلاح البيانات الموجودة الآن
-- أ) اشتراكات ops_count >= ops_limit لكن status=active → expired
-- ب) اشتراكات expires_at < now() لكن status=active → expired
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE public.subscriptions
SET status = 'expired', updated_at = now()
WHERE status = 'active'
  AND ops_limit IS NOT NULL
  AND ops_count >= ops_limit;

UPDATE public.subscriptions
SET status = 'expired', updated_at = now()
WHERE status = 'active'
  AND expires_at IS NOT NULL
  AND expires_at < now();
