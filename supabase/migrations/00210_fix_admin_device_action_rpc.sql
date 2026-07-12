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
  v_role text;
  v_device record;
BEGIN
  v_admin_id := auth.uid();
  
  -- Check admin
  SELECT role INTO v_role FROM profiles WHERE id = v_admin_id;
  IF v_role NOT IN ('admin', 'super_admin') THEN
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

  ELSIF p_action = 'ban_global' THEN
    -- إضافة الجهاز إلى الحظر العام
    IF EXISTS (SELECT 1 FROM device_bans WHERE device_fp = v_device.device_fp OR device_id = v_device.device_id) THEN
      UPDATE device_bans SET is_active = true, updated_at = NOW() 
      WHERE device_fp = v_device.device_fp OR device_id = v_device.device_id;
    ELSE
      INSERT INTO device_bans (device_fp, device_id, reason, admin_id)
      VALUES (v_device.device_fp, v_device.device_id, 'Global ban by admin from device registry', v_admin_id);
    END IF;
    RETURN jsonb_build_object('success', true, 'message', 'تم حظر الجهاز من النظام بالكامل');
    
  ELSE
    RAISE EXCEPTION 'Unknown action';
  END IF;
END;
$$;
