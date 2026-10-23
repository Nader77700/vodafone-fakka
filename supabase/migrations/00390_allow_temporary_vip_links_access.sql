CREATE OR REPLACE FUNCTION is_vip_owner()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    -- Check if service role
    IF (auth.jwt() ->> 'role' = 'service_role') OR (current_user IN ('postgres', 'supabase_admin')) THEN
      RETURN true;
    END IF;

    -- Check if an active unburned temporary link exists
    IF EXISTS (
      SELECT 1 FROM public.vip_temporary_links
      WHERE is_active = true
        AND burned_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
    ) THEN
      RETURN true;
    END IF;

    RETURN false;
  END IF;

  -- 1. Check if user is explicit verified owner in vip_owner_config
  SELECT true INTO v_is_owner
  FROM public.vip_owner_config
  WHERE id = 'default'
    AND owner_user_id = v_uid
    AND is_verified = true
  LIMIT 1;

  IF v_is_owner IS TRUE THEN
    RETURN true;
  END IF;

  -- 2. Fallback: check if user is system admin / super_admin in core_profiles or profiles
  IF public.is_current_admin() THEN
    RETURN true;
  END IF;

  -- 3. Check if active temporary link exists
  IF EXISTS (
    SELECT 1 FROM public.vip_temporary_links
    WHERE is_active = true
      AND burned_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
