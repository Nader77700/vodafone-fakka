DROP FUNCTION IF EXISTS public.get_app_config_public();

CREATE OR REPLACE FUNCTION public.get_app_config_public()
 RETURNS TABLE(key text, value text, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_req_headers jsonb;
  v_app_build int;
  v_min_build int;
BEGIN
  v_req_headers := current_setting('request.headers', true)::jsonb;
  
  -- 1. EXTRACT HEADERS (Handle PostgREST format properly)
  IF v_req_headers ? 'x-app-build' THEN
    v_app_build := (v_req_headers->>'x-app-build')::int;
  ELSE
    -- Check if it's a web browser or dev environment (bypass check)
    IF (v_req_headers->>'origin') LIKE '%localhost%' OR (v_req_headers->>'origin') LIKE '%vodafone%' THEN
      RETURN QUERY SELECT ac.key, ac.value, ac.updated_at FROM app_config ac;
      RETURN;
    END IF;
    v_app_build := 0;
  END IF;

  -- 2. GET MINIMUM SUPPORTED VERSION
  SELECT COALESCE((ac.value)::int, 326) INTO v_min_build 
  FROM app_config ac 
  WHERE ac.key = 'version_min_supported';

  -- 3. STRICT ENFORCEMENT: Force UPDATE screen, NOT maintenance screen
  IF v_app_build < v_min_build THEN
    RETURN QUERY 
    SELECT ac.key, ac.value, ac.updated_at 
    FROM app_config ac 
    WHERE ac.key NOT IN ('ff_maintenance_mode', 'version_force_update');
    
    -- CRITICAL FIX: Set maintenance to FALSE, and force_update to TRUE
    RETURN QUERY SELECT 'ff_maintenance_mode'::text, 'false'::text, now();
    RETURN QUERY SELECT 'version_force_update'::text, 'true'::text, now();
    RETURN;
  END IF;

  -- 4. Normal return for valid apps
  RETURN QUERY SELECT ac.key, ac.value, ac.updated_at FROM app_config ac;
END;
$function$;