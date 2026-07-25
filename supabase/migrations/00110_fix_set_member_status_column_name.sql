-- إصلاح set_member_status: تصحيح اسم العمود من member_status إلى status
CREATE OR REPLACE FUNCTION public.set_member_status(
  p_merchant_id UUID,
  p_user_id     UUID,
  p_new_status  TEXT,
  p_admin_id    UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member merchant_members%ROWTYPE;
BEGIN
  IF p_new_status NOT IN ('active','pending','suspended','disabled','blocked','expired') THEN
    RETURN jsonb_build_object('success', false, 'error', 'حالة غير صالحة');
  END IF;

  SELECT * INTO v_member FROM merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  -- FIX: تصحيح اسم العمود من member_status إلى status
  UPDATE merchant_members
  SET status            = p_new_status::member_status,
      last_operation_at = NOW(),
      expired_at        = CASE WHEN p_new_status = 'expired' THEN NOW() ELSE expired_at END,
      activated_at      = CASE WHEN p_new_status = 'active' AND activated_at IS NULL THEN NOW() ELSE activated_at END
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'new_status', p_new_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_member_status(uuid, uuid, text, uuid) TO authenticated;

-- إصلاح delete_merchant_member أيضاً
CREATE OR REPLACE FUNCTION public.delete_merchant_member(
  p_merchant_id UUID,
  p_user_id     UUID,
  p_admin_id    UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member merchant_members%ROWTYPE;
BEGIN
  SELECT * INTO v_member FROM merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  -- FIX: تصحيح اسم العمود من member_status إلى status
  UPDATE merchant_members
  SET status = 'disabled'::member_status,
      last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'deleted', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_merchant_member(uuid, uuid, uuid) TO authenticated;