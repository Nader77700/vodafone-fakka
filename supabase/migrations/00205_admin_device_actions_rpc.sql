CREATE OR REPLACE FUNCTION admin_device_action(
  p_registry_id uuid,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id uuid;
  v_is_admin boolean;
  v_device record;
BEGIN
  v_admin_id := auth.uid();
  
  -- Check admin
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_admin_id;
  IF NOT coalesce(v_is_admin, false) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Get device
  SELECT * INTO v_device FROM device_registry WHERE id = p_registry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Device not found';
  END IF;

  IF p_action = 'force_logout' THEN
    UPDATE device_registry SET force_logout = true WHERE id = p_registry_id;
    RETURN jsonb_build_object('success', true, 'message', 'تم إرسال أمر تسجيل الخروج للجهاز');
    
  ELSIF p_action = 'ban_account' THEN
    UPDATE device_registry SET is_banned_from_account = true WHERE id = p_registry_id;
    RETURN jsonb_build_object('success', true, 'message', 'تم حظر الجهاز من هذا الحساب');
    
  ELSIF p_action = 'unban_account' THEN
    UPDATE device_registry SET is_banned_from_account = false WHERE id = p_registry_id;
    RETURN jsonb_build_object('success', true, 'message', 'تم فك حظر الجهاز من الحساب');
    
  ELSE
    RAISE EXCEPTION 'Unknown action';
  END IF;
END;
$$;
