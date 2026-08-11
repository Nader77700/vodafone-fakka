-- إصلاح أذونات Preview Mode RPCs
-- المشكلة: functions SECURITY DEFINER مملوكة من pg_database_owner لكنها تحتاج تحديث core_profiles

-- منح جميع الصلاحيات للمالك على الجدول الأساسي
GRANT ALL PRIVILEGES ON TABLE public.core_profiles TO pg_database_owner;
GRANT ALL PRIVILEGES ON TABLE public.preview_mode_logs TO pg_database_owner;

-- منح استخدام السلسلة (sequence) لو كان هناك
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO pg_database_owner;

-- إعادة إنشاء الدالة لضمان الملكية الصحيحة والتعامل مع الأخطاء
CREATE OR REPLACE FUNCTION public.enter_preview_mode(p_user_id uuid)
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
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enter_preview_mode failed: %', SQLERRM;
  RETURN false;
END;
$$;

-- إعادة إنشاء دالة التحويل
CREATE OR REPLACE FUNCTION public.convert_preview_to_subscribed(p_user_id uuid)
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

-- منح الصلاحيات للمستخدمين المصادق عليهم
GRANT EXECUTE ON FUNCTION public.enter_preview_mode(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_preview_to_subscribed(uuid) TO authenticated;
