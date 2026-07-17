-- LAYER 1, 2, 3, 4: Enforce Zero Trust HTTP Headers directly inside Postgres for PostgREST calls

CREATE OR REPLACE FUNCTION check_security_constraints(
  p_user_id UUID,
  p_device_fp TEXT DEFAULT NULL,
  p_hardware_hash TEXT DEFAULT NULL,
  p_native_id TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_active BOOLEAN;
  v_banned_device BOOLEAN;
  v_req_headers JSONB;
  v_app_build INT;
  v_app_signature TEXT;
  v_build_hash TEXT;
  v_min_build INT;
  v_registry_exists BOOLEAN;
BEGIN
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

    -- Get Min Build
    SELECT COALESCE((config_value)::int, 320) INTO v_min_build 
    FROM app_config WHERE config_key = 'min_supported_version';

    IF v_app_build < v_min_build THEN
      RAISE EXCEPTION 'Update Required: Version too old' USING ERRCODE = 'P0426';
    END IF;

    IF v_app_build >= 326 THEN
      IF v_app_signature IS NULL OR v_build_hash IS NULL THEN
        RAISE EXCEPTION 'Missing Security Fingerprints (Signature/Hash)' USING ERRCODE = 'P0403';
      END IF;

      -- Check registry
      SELECT EXISTS(
        SELECT 1 FROM build_registry 
        WHERE version_code = v_app_build 
          AND build_hash = v_build_hash 
          AND apk_signature = v_app_signature 
          AND is_active = true
      ) INTO v_registry_exists;

      IF NOT v_registry_exists THEN
        -- Log attempt directly
        INSERT INTO security_logs (user_id, event_type, details, risk_level, action_taken)
        VALUES (p_user_id, 'TAMPER_DETECTED', jsonb_build_object('app_build', v_app_build, 'build_hash', v_build_hash, 'signature', v_app_signature), 'critical', 'blocked_rpc_call');
        
        RAISE EXCEPTION 'Integrity Check Failed: Invalid Signature or Build Hash' USING ERRCODE = 'P0403';
      END IF;
    END IF;
  END IF;
END;
$$;
