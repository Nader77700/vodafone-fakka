CREATE OR REPLACE FUNCTION is_valid_app_version() RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req_headers JSONB;
  v_app_build INT;
  v_min_build INT;
BEGIN
  -- Read headers
  BEGIN
    v_req_headers := current_setting('request.headers', true)::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_req_headers := NULL;
  END;

  IF v_req_headers IS NOT NULL THEN
    v_app_build := COALESCE((v_req_headers->>'x-app-build')::int, 0);

    -- Get Min Build using correct key
    SELECT COALESCE((value)::int, 320) INTO v_min_build 
    FROM app_config WHERE key = 'version_min_supported';

    -- If the app build is less than min build, block access to the row!
    IF v_app_build > 0 AND v_app_build < v_min_build THEN
      RETURN FALSE;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$;