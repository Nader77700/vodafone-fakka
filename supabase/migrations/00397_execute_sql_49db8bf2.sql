CREATE OR REPLACE FUNCTION public.vip_create_session(
  p_session_name text DEFAULT NULL::text,
  p_owner_email text DEFAULT NULL::text,
  p_owner_password text DEFAULT NULL::text,
  p_individual_email text DEFAULT NULL::text,
  p_individual_password text DEFAULT NULL::text,
  p_target_balance int DEFAULT 50000,
  p_cycle_delay_seconds int DEFAULT 20,
  p_description text DEFAULT NULL::text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean := false;
  v_delegated record;
  v_session_id text := 'sess_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
  v_clean_name text := TRIM(COALESCE(p_session_name, ''));
  v_session_count integer;
  v_clean_owner_email text := NULLIF(TRIM(p_owner_email), '');
  v_clean_indiv_email text := NULLIF(TRIM(p_individual_email), '');
  v_clean_delay integer := COALESCE(p_cycle_delay_seconds, 20);
  v_clean_target integer := COALESCE(p_target_balance, 50000);
  v_new_session record;
BEGIN
  v_is_owner := public.is_vip_owner();

  IF NOT v_is_owner THEN
    SELECT * INTO v_delegated
    FROM public.vip_delegated_users
    WHERE (user_id = v_uid::text OR id::text = v_uid::text)
      AND is_active = true
    LIMIT 1;

    IF v_delegated.user_id IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: VIP Access required.';
    END IF;

    -- Strict check: package limits for delegated users
    IF v_delegated.allowed_packages IS NOT NULL AND array_length(v_delegated.allowed_packages, 1) > 0 THEN
      IF NOT (v_clean_target = ANY(v_delegated.allowed_packages)) THEN
        -- If attempted package is not allowed, clamp to the minimum allowed package
        v_clean_target := v_delegated.allowed_packages[1];
      END IF;
    END IF;

    -- Strict check: cooldown / delay enforcement for delegated users
    IF v_clean_delay < COALESCE(v_delegated.cooldown_seconds, v_delegated.min_cooldown_seconds, 30) THEN
      v_clean_delay := COALESCE(v_delegated.cooldown_seconds, v_delegated.min_cooldown_seconds, 30);
    END IF;
  END IF;

  SELECT count(*) INTO v_session_count 
  FROM public.vip_sessions 
  WHERE is_active = true AND (created_by_user_id = v_uid OR created_by_user_id IS NULL);

  IF v_clean_name = '' THEN
    v_clean_name := 'جلسة اتصالات VIP #' || (v_session_count + 1);
  END IF;

  IF v_clean_delay < 5 THEN
    v_clean_delay := 20;
  END IF;

  INSERT INTO public.vip_sessions (
    id,
    session_name,
    session_description,
    owner_email,
    owner_password_enc,
    individual_email,
    individual_password_enc,
    owner_account_status,
    individual_account_status,
    relationship_status,
    target_mix_balance,
    cycle_delay_seconds,
    operation_state,
    worker_status,
    is_active,
    created_by_user_id,
    created_at,
    updated_at
  )
  VALUES (
    v_session_id,
    v_clean_name,
    p_description,
    v_clean_owner_email,
    CASE WHEN p_owner_password IS NOT NULL AND p_owner_password <> '' THEN encode(p_owner_password::bytea, 'base64') ELSE NULL END,
    v_clean_indiv_email,
    CASE WHEN p_individual_password IS NOT NULL AND p_individual_password <> '' THEN encode(p_individual_password::bytea, 'base64') ELSE NULL END,
    'not_connected',
    'not_connected',
    'unverified',
    v_clean_target,
    v_clean_delay,
    'stopped',
    'idle',
    true,
    v_uid,
    now(),
    now()
  )
  RETURNING * INTO v_new_session;

  RETURN jsonb_build_object(
    'success', true,
    'session', to_jsonb(v_new_session),
    'message', 'تم إنشاء جلسة اتصالات VIP بنجاح.'
  );
END;
$$; CREATE OR REPLACE FUNCTION public.vip_get_default_child_credentials() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rec RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', true, 'child_email', '', 'child_password', '', 'child_dial', '');
  END IF;

  SELECT * INTO v_rec 
  FROM public.vip_default_credentials 
  WHERE user_id = v_uid 
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'child_email', '', 'child_password', '', 'child_dial', '');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'child_email', COALESCE(v_rec.child_email, ''),
    'child_password', COALESCE(v_rec.child_password_enc, ''),
    'child_dial', COALESCE(v_rec.child_dial, '')
  );
END;
$$; CREATE OR REPLACE FUNCTION public.vip_save_default_child_credentials(
  p_child_email text,
  p_child_password text,
  p_child_dial text DEFAULT NULL::text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  INSERT INTO public.vip_default_credentials (id, user_id, child_email, child_password_enc, child_dial, updated_at)
  VALUES (
    'user_' || v_uid::text,
    v_uid,
    TRIM(p_child_email),
    TRIM(p_child_password),
    TRIM(COALESCE(p_child_dial, '')),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      child_email = EXCLUDED.child_email,
      child_password_enc = EXCLUDED.child_password_enc,
      child_dial = CASE WHEN EXCLUDED.child_dial IS NOT NULL AND EXCLUDED.child_dial <> '' THEN EXCLUDED.child_dial ELSE vip_default_credentials.child_dial END,
      updated_at = NOW();

  RETURN jsonb_build_object('success', true, 'message', 'تم حفظ بيانات الفرد الافتراضية بنجاح.');
END;
$$;