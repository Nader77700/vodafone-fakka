CREATE OR REPLACE FUNCTION public.security_heartbeat(p_device_fp text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text, p_hardware_hash text DEFAULT NULL::text, p_version_code integer DEFAULT 0, p_build_hash text DEFAULT NULL::text, p_apk_signature text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_banned boolean := false;
  v_min_build int := 320;
  v_registry_exists boolean := false;
  v_reason text := '';
  v_is_valid_req boolean;
BEGIN
  -- التحقق من التوقيع المشفر (HMAC)
  v_is_valid_req := verify_request_signature();
  IF NOT v_is_valid_req THEN
    -- حرق الجهاز لو التوقيع مزيف!
    RETURN jsonb_build_object('action', 'BURN', 'reason', 'INVALID_HMAC_SIGNATURE');
  END IF;

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
  END IF;

  RETURN jsonb_build_object('action', 'OK');
END;
$function$;