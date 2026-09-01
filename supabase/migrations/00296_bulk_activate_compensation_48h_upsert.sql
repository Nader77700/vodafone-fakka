-- ================================================================
-- تفعيل اشتراك تعويضي 48 ساعة — UPSERT آمن
-- subscriptions لها UNIQUE(user_id) — نحدّث من غير نشط أو compensation
-- ================================================================

DO $$
DECLARE
  v_expires_at  timestamptz := now() + interval '48 hours';
  v_activated   int := 0;
  v_skipped     int := 0;
  v_user_id     uuid;
  v_existing    record;
BEGIN

  FOR v_user_id IN
    SELECT id FROM public.core_profiles WHERE role = 'user'
  LOOP
    -- فحص الاشتراك الحالي
    SELECT * INTO v_existing
    FROM public.subscriptions
    WHERE user_id = v_user_id
    LIMIT 1;

    IF NOT FOUND THEN
      -- لا يوجد subscription أصلاً — أدرج جديد
      INSERT INTO public.subscriptions (
        user_id, status, code_type, code_used,
        activated_at, expires_at, ops_count, ops_limit,
        duration_days, created_at, updated_at
      ) VALUES (
        v_user_id, 'active', 'compensation', 'ADMIN_COMP_48H',
        now(), v_expires_at, 0, NULL, 2, now(), now()
      );
      v_activated := v_activated + 1;

    ELSIF v_existing.status IN ('expired','cancelled','replaced')
       OR (v_existing.code_type = 'compensation' AND v_existing.status = 'active')
       OR (v_existing.code_type = 'trial') THEN
      -- منتهي أو compensation قديم أو trial → حوّله لـ compensation جديد
      UPDATE public.subscriptions SET
        status       = 'active',
        code_type    = 'compensation',
        code_used    = 'ADMIN_COMP_48H',
        activated_at = now(),
        expires_at   = v_expires_at,
        ops_count    = 0,
        ops_limit    = NULL,
        duration_days = 2,
        in_grace_period   = false,
        grace_started_at  = NULL,
        grace_ends_at     = NULL,
        updated_at   = now()
      WHERE user_id = v_user_id;
      v_activated := v_activated + 1;

    ELSE
      -- اشتراك نشط حقيقي — لا نمسّه
      v_skipped := v_skipped + 1;
    END IF;

  END LOOP;

  RAISE NOTICE '✅ تم تفعيل: % | تم تخطي (مشتركين نشطين): % | تنتهي في: %',
    v_activated, v_skipped, v_expires_at;
END;
$$;