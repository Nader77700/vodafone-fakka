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

  -- Default to 0 if missing
  v_app_build := COALESCE((v_req_headers->>'x-app-build')::int, 0);

  -- Get Min Build
  SELECT COALESCE((value)::int, 326) INTO v_min_build 
  FROM app_config WHERE key = 'version_min_supported';

  -- STRICT ENFORCEMENT: 
  -- If x-app-build is less than v_min_build (including 0 because the header is missing), BLOCK IT!
  -- This kills all old versions that didn't send the header.
  IF v_app_build < v_min_build THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;