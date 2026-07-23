
-- ── دالة: التحقق من تفرد رقم الهاتف قبل التسجيل ─────────────────────────
-- تُعيد true إذا كان الرقم مستخدماً مسبقاً، false إذا كان متاحاً
-- تُستدعى من Frontend كـ RPC لتجنّب Supabase RLS bypass
CREATE OR REPLACE FUNCTION public.is_phone_already_registered(p_phone TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE phone = p_phone
    AND phone IS NOT NULL
    AND phone != ''
  );
END;
$$;

-- منح الصلاحية للمستخدمين المجهولين (anon) للاستعلام قبل التسجيل
GRANT EXECUTE ON FUNCTION public.is_phone_already_registered(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.is_phone_already_registered IS
  'تتحقق مما إذا كان رقم الهاتف مسجّلاً مسبقاً في النظام. تُستخدم في صفحة التسجيل لمنع التكرار.';
