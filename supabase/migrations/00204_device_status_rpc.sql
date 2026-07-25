CREATE OR REPLACE FUNCTION check_device_status(p_device_fp text, p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_global_ban boolean := false;
  v_account_ban boolean := false;
  v_force_logout boolean := false;
  v_registry_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  -- 1. Check global ban
  IF EXISTS (
    SELECT 1 FROM device_bans
    WHERE is_active = true
      AND (
        (p_device_fp IS NOT NULL AND device_fp = p_device_fp) OR
        (p_device_id IS NOT NULL AND device_id = p_device_id)
      )
  ) THEN
    v_global_ban := true;
  END IF;

  -- 2. Check account specific bans and force logout
  IF v_user_id IS NOT NULL THEN
    SELECT id, is_banned_from_account, force_logout
    INTO v_registry_id, v_account_ban, v_force_logout
    FROM device_registry
    WHERE user_id = v_user_id
      AND (
        (p_device_fp IS NOT NULL AND device_fp = p_device_fp) OR
        (p_device_id IS NOT NULL AND device_id = p_device_id)
      )
    ORDER BY last_seen_at DESC
    LIMIT 1;
    
    -- If force_logout is true, reset it so it doesn't loop forever
    IF v_force_logout THEN
      UPDATE device_registry SET force_logout = false WHERE id = v_registry_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'global_ban', v_global_ban,
    'account_ban', coalesce(v_account_ban, false),
    'force_logout', coalesce(v_force_logout, false)
  );
END;
$$;
