
-- ============================================================
-- إعادة الدالة ذات المعاملَين كـ wrapper للنسخة الجديدة
-- تستدعي النسخة الجديدة مع device_fp = NULL (بدون فحص الجهاز)
-- يُصلح خطأ "خطأ داخلي في الخادم" على الأجهزة القديمة
-- (v3.0.72 وما قبل) التي لا ترسل p_device_fp
-- ============================================================
CREATE OR REPLACE FUNCTION activate_license_key_v2(
  p_user_id UUID,
  p_code    TEXT
)
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT activate_license_key_v2(p_user_id, p_code, NULL::TEXT);
$$;
