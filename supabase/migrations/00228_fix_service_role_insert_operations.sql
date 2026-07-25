CREATE OR REPLACE FUNCTION is_valid_app_version()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req_headers jsonb;
  secure_token text;
  v_app_build int;
  v_jwt_role text;
BEGIN
  -- Bypass validation for service_role (Edge Functions)
  BEGIN
    v_jwt_role := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  IF v_jwt_role = 'service_role' THEN
    RETURN true;
  END IF;

  BEGIN
    v_req_headers := current_setting('request.headers', true)::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_req_headers := NULL;
  END;
  
  IF v_req_headers IS NULL THEN
    RETURN false;
  END IF;

  -- Bypass validation for localhost/vodafone web origins
  IF (v_req_headers->>'origin') LIKE '%localhost%' OR (v_req_headers->>'origin') LIKE '%vodafone%' THEN
    RETURN true;
  END IF;

  secure_token := v_req_headers->>'x-app-secure-token';
  
  IF v_req_headers ? 'x-app-build' THEN
    v_app_build := (v_req_headers->>'x-app-build')::int;
  ELSE
    v_app_build := 0;
  END IF;
  
  -- Accept the newest 355 kill switch token
  IF secure_token = 'vfp_secure_355_kill_switch' THEN
    RETURN true;
  END IF;

  -- Accept version 361 which we just pushed
  IF v_app_build >= 361 THEN
    RETURN true;
  END IF;

  -- EMERGENCY FIX: The 355 APK was accidentally built with the old 354 token!
  IF secure_token = 'vfp_secure_354_omega' AND v_app_build >= 355 THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;
