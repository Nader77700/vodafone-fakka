-- ================================================================
-- إصلاح مشكلة Preview Mode — المستخدم يرى "انتهى اشتراكك" فوراً
--
-- السبب: enter_preview_mode كانت تغير access_mode فقط
--         لكن isExpired في الـ app يفحص subscription table
--         وبما أن المستخدم في preview ليس لديه subscription → isExpired = true
--
-- الحل: enter_preview_mode تنشئ subscription مؤقت بـ code_type='trial'
--        ومدة 24 ساعة (قابلة للتعديل من core_app_config)
--        بدون أي تعديل في كود التطبيق
-- ================================================================

-- إضافة إعداد مدة المعاينة بالساعات في core_app_config (قابل للتعديل من لوحة التحكم)
INSERT INTO public.core_app_config (key, value, value_type, category, label, description)
VALUES ('preview_duration_hours', '24', 'number', 'feature_flags', 'مدة المعاينة (ساعات)', 'عدد الساعات التي يستطيع فيها المستخدم معاينة التطبيق قبل انتهاء الوقت')
ON CONFLICT (key) DO NOTHING;

-- تحديث دالة enter_preview_mode لإنشاء subscription مؤقت
CREATE OR REPLACE FUNCTION public.enter_preview_mode(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duration_hours int;
  v_expires_at     timestamptz;
  v_existing_sub   uuid;
BEGIN
  -- قراءة مدة المعاينة من الإعدادات (افتراضي: 24 ساعة)
  SELECT COALESCE(NULLIF(trim(value), ''), '24')::int
  INTO v_duration_hours
  FROM public.core_app_config
  WHERE key = 'preview_duration_hours';

  v_duration_hours := COALESCE(v_duration_hours, 24);
  v_expires_at     := now() + (v_duration_hours || ' hours')::interval;

  -- تحديث access_mode في core_profiles
  UPDATE public.core_profiles
  SET access_mode = 'preview', updated_at = now()
  WHERE id = p_user_id;

  -- البحث عن subscription trial نشط موجود
  SELECT id INTO v_existing_sub
  FROM public.subscriptions
  WHERE user_id = p_user_id
    AND code_type = 'trial'
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_sub IS NOT NULL THEN
    -- تجديد الـ subscription الموجود
    UPDATE public.subscriptions
    SET expires_at  = v_expires_at,
        activated_at = now(),
        status      = 'active',
        updated_at  = now()
    WHERE id = v_existing_sub;
  ELSE
    -- إنشاء subscription جديد trial
    INSERT INTO public.subscriptions (
      user_id, status, code_type, activated_at, expires_at,
      ops_count, ops_limit, code_used, duration_days, created_at, updated_at
    ) VALUES (
      p_user_id, 'active', 'trial', now(), v_expires_at,
      0, NULL, 'PREVIEW_MODE', v_duration_hours / 24, now(), now()
    );
  END IF;

  -- تسجيل في preview_mode_logs
  INSERT INTO public.preview_mode_logs (user_id, entered_at)
  VALUES (p_user_id, now())
  ON CONFLICT (user_id) DO UPDATE
    SET entered_at   = EXCLUDED.entered_at,
        converted_at = NULL,
        updated_at   = now();

  RETURN true;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enter_preview_mode failed for %: %', p_user_id, SQLERRM;
  RETURN false;
END;
$$;

-- تحديث convert_preview_to_subscribed لإلغاء الـ subscription المؤقت عند التحويل
CREATE OR REPLACE FUNCTION public.convert_preview_to_subscribed(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- إلغاء الـ trial subscription المؤقت
  UPDATE public.subscriptions
  SET status     = 'replaced',
      updated_at = now(),
      replace_reason = 'تم تفعيل اشتراك حقيقي'
  WHERE user_id   = p_user_id
    AND code_type = 'trial'
    AND status    = 'active';

  -- إعادة access_mode لـ subscribed
  UPDATE public.core_profiles
  SET access_mode = 'subscribed', updated_at = now()
  WHERE id = p_user_id;

  -- تحديث سجل المعاينة
  UPDATE public.preview_mode_logs
  SET converted_at = now(), updated_at = now()
  WHERE user_id = p_user_id AND converted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enter_preview_mode(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_preview_to_subscribed(uuid) TO authenticated;