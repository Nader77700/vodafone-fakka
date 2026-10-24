CREATE OR REPLACE FUNCTION public.vip_list_sessions() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean := false;
  v_is_delegated boolean := false;
  v_sessions jsonb;
BEGIN
  -- Determine caller identity
  v_is_owner := public.is_vip_owner();
  
  IF NOT v_is_owner THEN
    SELECT true INTO v_is_delegated
    FROM public.vip_delegated_users
    WHERE (user_id = v_uid::text OR id::text = v_uid::text)
      AND is_active = true
    LIMIT 1;
  END IF;

  IF NOT v_is_owner AND NOT v_is_delegated THEN
    RAISE EXCEPTION 'Unauthorized: VIP access required.';
  END IF;

  IF v_is_owner THEN
    -- Owner sees their own sessions (and legacy sessions)
    SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.created_at ASC), '[]'::jsonb)
    INTO v_sessions
    FROM public.vip_sessions s
    WHERE s.is_active = true
      AND (s.created_by_user_id = v_uid OR s.created_by_user_id = '1f4bd575-dad6-4011-9864-8759ff771147'::uuid OR s.created_by_user_id IS NULL);
  ELSE
    -- Delegated user sees ONLY sessions they created themselves
    SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.created_at ASC), '[]'::jsonb)
    INTO v_sessions
    FROM public.vip_sessions s
    WHERE s.is_active = true
      AND s.created_by_user_id = v_uid;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'sessions', v_sessions
  );
END;
$$; CREATE OR REPLACE FUNCTION public.vip_list_archived_sessions() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean := false;
  v_is_delegated boolean := false;
  v_sessions jsonb;
BEGIN
  v_is_owner := public.is_vip_owner();

  IF NOT v_is_owner THEN
    SELECT true INTO v_is_delegated
    FROM public.vip_delegated_users
    WHERE (user_id = v_uid::text OR id::text = v_uid::text)
      AND is_active = true
    LIMIT 1;
  END IF;

  IF NOT v_is_owner AND NOT v_is_delegated THEN
    RAISE EXCEPTION 'Unauthorized: VIP access required.';
  END IF;

  IF v_is_owner THEN
    -- Owner sees owner archived sessions
    SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.updated_at DESC), '[]'::jsonb)
    INTO v_sessions
    FROM public.vip_sessions s
    WHERE s.is_active = false
      AND (s.created_by_user_id = v_uid OR s.created_by_user_id = '1f4bd575-dad6-4011-9864-8759ff771147'::uuid OR s.created_by_user_id IS NULL);
  ELSE
    -- Delegated user sees ONLY their own archived sessions
    SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.updated_at DESC), '[]'::jsonb)
    INTO v_sessions
    FROM public.vip_sessions s
    WHERE s.is_active = false
      AND s.created_by_user_id = v_uid;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'sessions', v_sessions
  );
END;
$$;