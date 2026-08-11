-- ═══════════════════════════════════════════════════════════════════
-- Preview Mode: نظام المعاينة والتحكم في الصلاحيات
-- ═══════════════════════════════════════════════════════════════════

-- 1) إضافة عمود access_mode إلى الجدول الأساسي
ALTER TABLE public.core_profiles
  ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'subscribed'
    CHECK (access_mode IN ('subscribed', 'preview'));

-- 2) تحديث الـ View ليشمل access_mode
CREATE OR REPLACE VIEW public.profiles AS
SELECT
  id,
  username,
  email,
  phone,
  full_name,
  role,
  avatar_url,
  is_active,
  created_at,
  updated_at,
  last_login,
  device_fp,
  merchant_id,
  merchant_user_status,
  registration_source,
  invite_token,
  merchant_created_at,
  merchant_last_seen,
  device_id,
  vodafone_pin_locked_at,
  vodafone_lock_reason,
  active_device_model,
  access_mode
FROM public.core_profiles;

-- 3) توسيع نطاق access_mode في services_control
ALTER TABLE public.services_control
  DROP CONSTRAINT IF EXISTS services_control_access_mode_check;

ALTER TABLE public.services_control
  ADD CONSTRAINT services_control_access_mode_check
    CHECK (access_mode IN ('subscribers_only', 'preview_available', 'all'));

-- 4) جدول سجل دخول المعاينة
CREATE TABLE IF NOT EXISTS public.preview_mode_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  converted_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5) Feature Flag لـ Preview Mode
INSERT INTO public.core_app_config (key, value, value_type, category, label, description)
VALUES
  ('ff_preview_mode_enabled', 'true', 'boolean', 'feature_flags', 'تفعيل وضع المعاينة', 'إظهار/إخفاء زر معاينة التطبيق في شاشة التفعيل')
ON CONFLICT (key) DO NOTHING;

-- 6) دالة دخول Preview Mode
CREATE OR REPLACE FUNCTION enter_preview_mode(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.core_profiles
  SET access_mode = 'preview',
      updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO public.preview_mode_logs (user_id, entered_at)
  VALUES (p_user_id, NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET entered_at = EXCLUDED.entered_at,
        converted_at = NULL,
        updated_at = NOW();

  RETURN true;
END;
$$;

-- 7) دالة تحويل المستخدم من Preview إلى Subscribed
CREATE OR REPLACE FUNCTION convert_preview_to_subscribed(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.core_profiles
  SET access_mode = 'subscribed',
      updated_at = NOW()
  WHERE id = p_user_id;

  UPDATE public.preview_mode_logs
  SET converted_at = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND converted_at IS NULL;
END;
$$;

-- 8) RLS على preview_mode_logs
ALTER TABLE public.preview_mode_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "preview_logs_user_select" ON public.preview_mode_logs;
CREATE POLICY "preview_logs_user_select" ON public.preview_mode_logs
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "preview_logs_user_insert" ON public.preview_mode_logs;
CREATE POLICY "preview_logs_user_insert" ON public.preview_mode_logs
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "preview_logs_admin_all" ON public.preview_mode_logs;
CREATE POLICY "preview_logs_admin_all" ON public.preview_mode_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

-- 9) منح الصلاحيات
GRANT EXECUTE ON FUNCTION enter_preview_mode(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION convert_preview_to_subscribed(uuid) TO authenticated;
