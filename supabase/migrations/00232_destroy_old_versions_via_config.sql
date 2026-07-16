CREATE OR REPLACE FUNCTION get_app_config_public()
RETURNS TABLE(key text, value text, value_type text, category text, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_req_headers JSONB;
  v_app_build INT;
  v_min_build INT;
BEGIN
  -- 1. Read headers
  BEGIN
    v_req_headers := current_setting('request.headers', true)::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_req_headers := NULL;
  END;

  v_app_build := COALESCE((v_req_headers->>'x-app-build')::int, 0);

  -- 2. Get the actual min build from config
  SELECT COALESCE((ac.value)::int, 326) INTO v_min_build 
  FROM app_config ac WHERE ac.key = 'version_min_supported';

  -- 3. If it's an old app, return FAKE data that forces an update and disables EVERYTHING
  IF v_app_build > 0 AND v_app_build < v_min_build THEN
    RETURN QUERY
    SELECT ac.key, 
           CASE 
             WHEN ac.key = 'version_min_supported' THEN '999999'
             WHEN ac.key = 'ff_maintenance_mode' THEN 'true'
             WHEN ac.key = 'ui_maintenance_msg' THEN 'إصدارك قديم جداً وتم إيقافه لدواعي أمنية. الرجاء التحديث فوراً.'
             WHEN ac.key = 'ff_recharge_enabled' THEN 'false'
             ELSE ac.value
           END as value, 
           ac.value_type, ac.category, ac.updated_at
    FROM app_config ac
    WHERE ac.is_public = true
    ORDER BY ac.category, ac.key;
  ELSE
    -- 4. Normal return for valid apps
    RETURN QUERY
    SELECT ac.key, ac.value, ac.value_type, ac.category, ac.updated_at
    FROM app_config ac
    WHERE ac.is_public = true
    ORDER BY ac.category, ac.key;
  END IF;
END;
$$;