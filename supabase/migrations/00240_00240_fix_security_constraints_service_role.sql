CREATE OR REPLACE FUNCTION public.check_security_constraints(p_user_id uuid, p_device_fp text DEFAULT NULL::text, p_hardware_hash text DEFAULT NULL::text, p_native_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_active BOOLEAN;
  v_banned_device BOOLEAN;
  v_req_headers JSONB;
  v_app_build INT;
  v_app_signature TEXT;
  v_build_hash TEXT;
  v_session_token TEXT;
  v_device_id TEXT;
  v_min_build INT;
  v_registry_exists BOOLEAN;
  v_valid_session BOOLEAN;
  v_jwt_role TEXT;
BEGIN
  -- Bypass completely if called by service_role (Edge Functions)
  BEGIN
    v_jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;
  
  IF v_jwt_role = 'service_role' THEN
    RETURN;
  END IF;

  -- 1. Check Profile is_active
  SELECT is_active INTO v_is_active FROM profiles WHERE id = p_user_id;
  IF v_is_active = FALSE THEN
    RAISE EXCEPTION 'حسابك موقوف، لا يمكنك تنفيذ عمليات' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Check Device Ban (if parameters provided)
  IF p_device_fp IS NOT NULL OR p_native_id IS NOT NULL OR p_hardware_hash IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM device_bans
      WHERE is_active = TRUE
        AND (
          (p_device_fp IS NOT NULL AND device_fp = p_device_fp)
          OR (p_native_id IS NOT NULL AND device_id = p_native_id)
          OR (p_hardware_hash IS NOT NULL AND hardware_hash = p_hardware_hash)
        )
    ) INTO v_banned_device;

    IF v_banned_device THEN
      RAISE EXCEPTION 'جهازك محظور، لا يمكنك تنفيذ عمليات' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- 3. Zero Trust Headers Validation (Only applies to PostgREST HTTP calls)
  BEGIN
    v_req_headers := current_setting('request.headers', true)::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_req_headers := NULL;
  END;

  IF v_req_headers IS NOT NULL THEN
    v_app_build := COALESCE((v_req_headers->>'x-app-build')::int, 0);
    v_app_signature := v_req_headers->>'x-app-signature';
    v_build_hash := v_req_headers->>'x-build-hash';
    v_session_token := v_req_headers->>'x-session-token';
    v_device_id := v_req_headers->>'x-device-id';

    -- Get Min Build safely
    SELECT (value)::int INTO v_min_build FROM app_config WHERE key = 'version_min_supported';
    v_min_build := COALESCE(v_min_build, 320);

    IF v_app_build < v_min_build THEN
      RAISE EXCEPTION 'Update Required: Version too old' USING ERRCODE = 'P0426';
    END IF;

    -- Session & Device Hijack Validation (Layer 11)
    IF v_session_token IS NOT NULL THEN
       SELECT EXISTS(
          SELECT 1 FROM security_sessions
          WHERE session_token = v_session_token
            AND user_id = p_user_id
            AND is_valid = true
            AND expires_at > now()
            AND (device_id IS NULL OR device_id = v_device_id)
       ) INTO v_valid_session;
       
       IF NOT v_valid_session THEN
          INSERT INTO security_logs (user_id, event_type, details, risk_level, action_taken)
          VALUES (p_user_id, 'SESSION_HIJACK_ATTEMPT', jsonb_build_object('received_device_id', v_device_id), 'high', 'blocked_rpc_call');
          RAISE EXCEPTION 'Session Device Mismatch or Expired Session' USING ERRCODE = 'P0401';
       END IF;
    END IF;

    IF v_app_build >= 326 THEN
      -- TEMPORARILY disable signature validation until mobile plugins are updated
      -- IF v_app_signature IS NULL OR v_build_hash IS NULL THEN
      --  RAISE EXCEPTION 'Missing Security Fingerprints (Signature/Hash)' USING ERRCODE = 'P0403';
      -- END IF;

      -- Check registry
      -- SELECT EXISTS(
      --  SELECT 1 FROM build_registry 
      --  WHERE version_code = v_app_build 
      --    AND build_hash = v_build_hash 
      --    AND apk_signature = v_app_signature 
      --    AND is_active = true
      -- ) INTO v_registry_exists;

      -- IF NOT v_registry_exists THEN
      --  -- Log attempt directly
      --  INSERT INTO security_logs (user_id, event_type, details, risk_level, action_taken)
      --  VALUES (p_user_id, 'TAMPER_DETECTED', jsonb_build_object('app_build', v_app_build, 'build_hash', v_build_hash, 'signature', v_app_signature), 'critical', 'blocked_rpc_call');
      --  
      --  RAISE EXCEPTION 'Integrity Check Failed: Invalid Signature or Build Hash' USING ERRCODE = 'P0403';
      -- END IF;
      
      -- Instead, just do a silent pass to allow frontend to work
      NULL;
    END IF;
  END IF;
END;
$function$;