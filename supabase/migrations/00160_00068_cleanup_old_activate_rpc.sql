DROP FUNCTION IF EXISTS activate_license_key_v2(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS activate_license_key_v2(UUID, TEXT);

-- Wrapper for 2 params
CREATE OR REPLACE FUNCTION activate_license_key_v2(p_user_id UUID, p_code TEXT)
RETURNS JSON LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT activate_license_key_v2(p_user_id, p_code, NULL::TEXT, NULL::TEXT, NULL::TEXT, FALSE);
$$;

-- Wrapper for 3 params (for backward compatibility if something calls it)
CREATE OR REPLACE FUNCTION activate_license_key_v2(p_user_id UUID, p_code TEXT, p_device_fp TEXT)
RETURNS JSON LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT activate_license_key_v2(p_user_id, p_code, p_device_fp, NULL::TEXT, NULL::TEXT, FALSE);
$$;