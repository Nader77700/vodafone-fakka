CREATE OR REPLACE FUNCTION public.is_vip_owner()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_role text := auth.jwt() ->> 'role';
  v_is_owner boolean := false;
BEGIN
  -- 1. Master Owner Email / ID check (Nader Akram)
  IF v_uid = '1f4bd575-dad6-4011-9864-8759ff771147'::uuid THEN
    RETURN true;
  END IF;

  IF v_email IS NOT NULL AND lower(v_email) = 'nader77@miaoda.com' THEN
    RETURN true;
  END IF;

  -- 2. Explicit verified owner in vip_owner_config
  IF v_uid IS NOT NULL THEN
    SELECT true INTO v_is_owner
    FROM public.vip_owner_config
    WHERE id = 'default'
      AND owner_user_id = v_uid
      AND is_verified = true
    LIMIT 1;

    IF v_is_owner IS TRUE THEN
      RETURN true;
    END IF;

    -- If a specific user is authenticated and not the owner above, they are definitely NOT the owner!
    RETURN false;
  END IF;

  -- 3. Service role or internal background worker (when auth.uid() is NULL)
  IF (v_role = 'service_role') OR (current_user IN ('postgres', 'supabase_admin')) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;