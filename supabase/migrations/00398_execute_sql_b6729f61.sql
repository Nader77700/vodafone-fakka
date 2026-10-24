CREATE OR REPLACE FUNCTION public.vip_delete_session(
  p_session_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user_email text;
  v_is_owner boolean;
  v_is_delegated boolean := false;
BEGIN
  v_user_email := auth.jwt()->>'email';
  v_is_owner := public.is_vip_owner();

  IF NOT v_is_owner THEN
    SELECT true INTO v_is_delegated
    FROM public.vip_delegated_users
    WHERE (user_id = v_uid::text OR id::text = v_uid::text)
      AND is_active = true
    LIMIT 1;
  END IF;

  IF NOT v_is_owner AND NOT v_is_delegated THEN
    RAISE EXCEPTION 'Unauthorized: VIP Access required.';
  END IF;

  IF v_is_owner THEN
    UPDATE public.vip_sessions
    SET is_active = false,
        automation_enabled = false,
        operation_state = 'stopped',
        worker_status = 'stopped',
        updated_at = now()
    WHERE id = p_session_id;
  ELSE
    -- Delegated user can only delete/archive THEIR OWN session
    UPDATE public.vip_sessions
    SET is_active = false,
        automation_enabled = false,
        operation_state = 'stopped',
        worker_status = 'stopped',
        updated_at = now()
    WHERE id = p_session_id AND created_by_user_id = v_uid;
  END IF;

  INSERT INTO public.vip_audit_logs (actor_email, action, event_type, details)
  VALUES (
    COALESCE(v_user_email, 'delegated_user'),
    'vip_session_deleted',
    'vip_session_deleted',
    jsonb_build_object('session_id', p_session_id, 'user_id', v_uid)
  );

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'message', 'تمت أرشفة الجلسة بنجاح.'
  );
END;
$$; CREATE OR REPLACE FUNCTION public.vip_unarchive_session(
  p_session_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user_email text;
  v_is_owner boolean;
  v_is_delegated boolean := false;
BEGIN
  v_user_email := auth.jwt()->>'email';
  v_is_owner := public.is_vip_owner();

  IF NOT v_is_owner THEN
    SELECT true INTO v_is_delegated
    FROM public.vip_delegated_users
    WHERE (user_id = v_uid::text OR id::text = v_uid::text)
      AND is_active = true
    LIMIT 1;
  END IF;

  IF NOT v_is_owner AND NOT v_is_delegated THEN
    RAISE EXCEPTION 'Unauthorized: VIP Access required.';
  END IF;

  IF v_is_owner THEN
    UPDATE public.vip_sessions
    SET is_active = true,
        updated_at = now()
    WHERE id = p_session_id;
  ELSE
    -- Delegated user can only unarchive their own session
    UPDATE public.vip_sessions
    SET is_active = true,
        updated_at = now()
    WHERE id = p_session_id AND created_by_user_id = v_uid;
  END IF;

  INSERT INTO public.vip_audit_logs (actor_email, action, details)
  VALUES (
    COALESCE(v_user_email, 'delegated_user'),
    'vip_session_unarchived',
    jsonb_build_object('session_id', p_session_id, 'user_id', v_uid)
  );

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'message', 'تم استرجاع الجلسة من الأرشيف بنجاح.'
  );
END;
$$; CREATE OR REPLACE FUNCTION public.vip_get_session_details(
  p_session_id text DEFAULT 'default'::text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user_email text;
  v_is_owner boolean;
  v_is_delegated boolean := false;
  v_session jsonb;
  v_config jsonb;
  v_automation jsonb;
  v_systems jsonb;
  v_cycles jsonb;
  v_ops jsonb;
  v_target_id text := p_session_id;
BEGIN
  v_user_email := auth.jwt()->>'email';
  v_is_owner := public.is_vip_owner();

  IF NOT v_is_owner THEN
    SELECT true INTO v_is_delegated
    FROM public.vip_delegated_users
    WHERE (user_id = v_uid::text OR id::text = v_uid::text)
      AND is_active = true
    LIMIT 1;
  END IF;

  IF NOT v_is_owner AND NOT v_is_delegated THEN
    RAISE EXCEPTION 'Access Denied: VIP Access required.';
  END IF;

  -- Delegated user: strictly query sessions owned by them
  IF NOT v_is_owner THEN
    SELECT to_jsonb(s) INTO v_session
    FROM (
      SELECT
        id,
        session_name,
        session_description,
        owner_account_identifier,
        owner_account_status,
        owner_current_plan,
        owner_mix_balance,
        last_owner_refresh_at,
        individual_account_identifier,
        individual_account_status,
        individual_current_plan,
        individual_mix_balance,
        last_individual_refresh_at,
        relationship_verified,
        relationship_status,
        automation_enabled,
        operation_state,
        target_mix_balance,
        custom_target_balance,
        cycle_delay_seconds,
        current_cycle,
        worker_status,
        worker_last_heartbeat,
        current_step,
        last_actual_operation,
        last_successful_operation,
        last_successful_op_at,
        last_error_summary,
        owner_email,
        (owner_password_enc IS NOT NULL AND owner_password_enc <> '') as has_owner_password,
        individual_email,
        (individual_password_enc IS NOT NULL AND individual_password_enc <> '') as has_individual_password,
        created_at,
        updated_at
      FROM vip_sessions
      WHERE id = v_target_id AND created_by_user_id = v_uid
    ) s;

    IF v_session IS NULL THEN
      SELECT to_jsonb(s) INTO v_session
      FROM (
        SELECT
          id,
          session_name,
          session_description,
          owner_account_identifier,
          owner_account_status,
          owner_current_plan,
          owner_mix_balance,
          last_owner_refresh_at,
          individual_account_identifier,
          individual_account_status,
          individual_current_plan,
          individual_mix_balance,
          last_individual_refresh_at,
          relationship_verified,
          relationship_status,
          automation_enabled,
          operation_state,
          target_mix_balance,
          custom_target_balance,
          cycle_delay_seconds,
          current_cycle,
          worker_status,
          worker_last_heartbeat,
          current_step,
          last_actual_operation,
          last_successful_operation,
          last_successful_op_at,
          last_error_summary,
          owner_email,
          (owner_password_enc IS NOT NULL AND owner_password_enc <> '') as has_owner_password,
          individual_email,
          (individual_password_enc IS NOT NULL AND individual_password_enc <> '') as has_individual_password,
          created_at,
          updated_at
        FROM vip_sessions
        WHERE is_active = true AND created_by_user_id = v_uid
        ORDER BY created_at ASC
        LIMIT 1
      ) s;
    END IF;
  ELSE
    -- Owner view: can query any session, defaults to owner's active sessions
    SELECT to_jsonb(s) INTO v_session
    FROM (
      SELECT
        id,
        session_name,
        session_description,
        owner_account_identifier,
        owner_account_status,
        owner_current_plan,
        owner_mix_balance,
        last_owner_refresh_at,
        individual_account_identifier,
        individual_account_status,
        individual_current_plan,
        individual_mix_balance,
        last_individual_refresh_at,
        relationship_verified,
        relationship_status,
        automation_enabled,
        operation_state,
        target_mix_balance,
        custom_target_balance,
        cycle_delay_seconds,
        current_cycle,
        worker_status,
        worker_last_heartbeat,
        current_step,
        last_actual_operation,
        last_successful_operation,
        last_successful_op_at,
        last_error_summary,
        owner_email,
        (owner_password_enc IS NOT NULL AND owner_password_enc <> '') as has_owner_password,
        individual_email,
        (individual_password_enc IS NOT NULL AND individual_password_enc <> '') as has_individual_password,
        created_at,
        updated_at
      FROM vip_sessions
      WHERE id = v_target_id
    ) s;

    IF v_session IS NULL THEN
      SELECT to_jsonb(s) INTO v_session
      FROM (
        SELECT
          id,
          session_name,
          session_description,
          owner_account_identifier,
          owner_account_status,
          owner_current_plan,
          owner_mix_balance,
          last_owner_refresh_at,
          individual_account_identifier,
          individual_account_status,
          individual_current_plan,
          individual_mix_balance,
          last_individual_refresh_at,
          relationship_verified,
          relationship_status,
          automation_enabled,
          operation_state,
          target_mix_balance,
          custom_target_balance,
          cycle_delay_seconds,
          current_cycle,
          worker_status,
          worker_last_heartbeat,
          current_step,
          last_actual_operation,
          last_successful_operation,
          last_successful_op_at,
          last_error_summary,
          owner_email,
          (owner_password_enc IS NOT NULL AND owner_password_enc <> '') as has_owner_password,
          individual_email,
          (individual_password_enc IS NOT NULL AND individual_password_enc <> '') as has_individual_password,
          created_at,
          updated_at
        FROM vip_sessions
        WHERE is_active = true AND (created_by_user_id = v_uid OR created_by_user_id = '1f4bd575-dad6-4011-9864-8759ff771147'::uuid OR created_by_user_id IS NULL)
        ORDER BY created_at ASC
        LIMIT 1
      ) s;
    END IF;
  END IF;

  IF v_session IS NOT NULL THEN
    v_target_id := v_session->>'id';
  END IF;

  -- Config fallback
  SELECT to_jsonb(c) INTO v_config
  FROM (
    SELECT
      id,
      owner_account_identifier,
      owner_account_status,
      owner_current_plan,
      owner_mix_balance,
      individual_account_identifier,
      individual_account_status,
      individual_current_plan,
      individual_mix_balance,
      relationship_status,
      relationship_verified,
      last_owner_refresh_at,
      last_individual_refresh_at,
      updated_at
    FROM vip_owner_config
    WHERE id = 'default'
    LIMIT 1
  ) c;

  -- Automation fallback
  SELECT to_jsonb(a) INTO v_automation
  FROM (
    SELECT
      id,
      automation_enabled,
      target_mix_balance,
      custom_target_balance,
      cycle_delay_seconds,
      current_cycle,
      operation_state,
      last_actual_operation,
      last_successful_operation,
      most_recent_error,
      next_scheduled_action,
      updated_at
    FROM vip_automation_settings
    WHERE id = 'default'
    LIMIT 1
  ) a;

  SELECT jsonb_agg(to_jsonb(sys) ORDER BY sys.display_name) INTO v_systems
  FROM vip_supported_systems sys;

  SELECT jsonb_agg(to_jsonb(cyc)) INTO v_cycles
  FROM (
    SELECT *
    FROM vip_cycle_history
    WHERE session_id = v_target_id
    ORDER BY cycle_number DESC, started_at DESC
    LIMIT 30
  ) cyc;

  SELECT jsonb_agg(to_jsonb(op)) INTO v_ops
  FROM (
    SELECT *
    FROM vip_operation_history
    WHERE session_id = v_target_id
    ORDER BY created_at DESC
    LIMIT 30
  ) op;

  RETURN jsonb_build_object(
    'success', true,
    'session', v_session,
    'config', v_config,
    'automation', v_automation,
    'supported_systems', COALESCE(v_systems, '[]'::jsonb),
    'recent_cycles', COALESCE(v_cycles, '[]'::jsonb),
    'recent_operations', COALESCE(v_ops, '[]'::jsonb)
  );
END;
$$;