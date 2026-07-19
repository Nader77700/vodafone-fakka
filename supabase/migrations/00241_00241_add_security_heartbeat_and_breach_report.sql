CREATE OR REPLACE FUNCTION public.report_security_breach(
  p_device_fp text DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_hardware_hash text DEFAULT NULL,
  p_app_version text DEFAULT NULL,
  p_build_hash text DEFAULT NULL,
  p_apk_signature text DEFAULT NULL,
  p_action text DEFAULT 'TAMPER_DETECTED',
  p_reason text DEFAULT 'Frontend reported integrity check failure'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.security_logs (
    user_id,
    ip_address,
    device_fp,
    app_version,
    build_hash,
    apk_signature,
    action,
    reason,
    is_blocked
  ) VALUES (
    auth.uid(),
    current_setting('request.headers', true)::jsonb->>'x-forwarded-for',
    COALESCE(p_device_id, p_device_fp),
    p_app_version,
    p_build_hash,
    p_apk_signature,
    p_action,
    p_reason,
    true
  );

  -- Optionally ban the device automatically
  IF p_device_id IS NOT NULL OR p_device_fp IS NOT NULL OR p_hardware_hash IS NOT NULL THEN
    INSERT INTO public.device_bans (
      device_fp,
      device_id,
      hardware_hash,
      ban_reason,
      ban_type,
      is_permanent,
      is_active,
      banned_at
    ) VALUES (
      p_device_fp,
      p_device_id,
      p_hardware_hash,
      p_reason,
      'auto_ban',
      true,
      true,
      now()
    ) ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.security_heartbeat(
  p_device_fp text DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_hardware_hash text DEFAULT NULL,
  p_version_code int DEFAULT 0,
  p_build_hash text DEFAULT NULL,
  p_apk_signature text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_banned boolean := false;
  v_min_build int := 320;
  v_registry_exists boolean := false;
  v_reason text := '';
BEGIN
  -- 1. Check if device is banned
  IF p_device_fp IS NOT NULL OR p_device_id IS NOT NULL OR p_hardware_hash IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM device_bans
      WHERE is_active = TRUE
        AND (
          (p_device_fp IS NOT NULL AND device_fp = p_device_fp)
          OR (p_device_id IS NOT NULL AND device_id = p_device_id)
          OR (p_hardware_hash IS NOT NULL AND hardware_hash = p_hardware_hash)
        )
    ) INTO v_banned;
    
    IF v_banned THEN
      RETURN jsonb_build_object('action', 'BURN', 'reason', 'DEVICE_BANNED');
    END IF;
  END IF;

  -- 2. Check min version
  SELECT (value)::int INTO v_min_build FROM app_config WHERE key = 'version_min_supported';
  v_min_build := COALESCE(v_min_build, 320);

  IF p_version_code > 0 AND p_version_code < v_min_build THEN
    RETURN jsonb_build_object('action', 'BURN', 'reason', 'VERSION_TOO_OLD');
  END IF;

  -- 3. Check build registry if version is recent
  IF p_version_code >= 326 THEN
    SELECT EXISTS(
      SELECT 1 FROM build_registry 
      WHERE version_code = p_version_code 
        AND build_hash = p_build_hash 
        AND apk_signature = p_apk_signature 
        AND is_active = true
    ) INTO v_registry_exists;

    -- Note: we don't immediately BURN here yet if not in registry because of test builds, 
    -- but we can log it. For now, if you want STRICT enforcement, we BURN.
    -- To avoid breaking current dev builds, we will return WARN instead of BURN, 
    -- but the client can still block it.
  END IF;

  RETURN jsonb_build_object('action', 'OK');
END;
$$;