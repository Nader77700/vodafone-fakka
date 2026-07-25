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

    -- Get Min Build
    SELECT COALESCE((value)::int, 320) INTO v_min_build 
    FROM app_config WHERE key = 'min_supported_version';

    -- If the app build is less than min build, block access to the row!
    IF v_app_build > 0 AND v_app_build < v_min_build THEN
      RETURN FALSE;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$;

-- Apply this to product_config
DROP POLICY IF EXISTS "authenticated_read_product_config" ON product_config;
CREATE POLICY "authenticated_read_product_config" ON product_config
  FOR SELECT USING (
    auth.role() = 'authenticated' AND is_valid_app_version()
  );

-- Apply this to subscriptions
DROP POLICY IF EXISTS "Users can view own subscription" ON subscriptions;
CREATE POLICY "Users can view own subscription" ON subscriptions
  FOR SELECT USING (
    (user_id = auth.uid()) AND is_valid_app_version()
  );

-- Apply this to profiles
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (
    (auth.uid() = id) AND is_valid_app_version()
  );