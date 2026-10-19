-- Drop old versions of the functions
DROP FUNCTION IF EXISTS public.vip_get_session_details(text);
DROP FUNCTION IF EXISTS public.vip_update_automation_settings(boolean, integer, integer, text, text);
DROP FUNCTION IF EXISTS public.vip_update_automation_settings(boolean, integer, integer, text, text, integer);
DROP FUNCTION IF EXISTS public.vip_create_session(text, text, text, integer, text);
DROP FUNCTION IF EXISTS public.vip_create_session(text, text, text, text, text, integer, integer, text);

-- 1. Recreate vip_get_session_details: replace id = 1 with id = 'default'
CREATE OR REPLACE FUNCTION public.vip_get_session_details(
  p_session_id text DEFAULT 'default'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email text;
  v_is_owner boolean;
  v_session jsonb;
  v_config jsonb;
  v_automation jsonb;
  v_systems jsonb;
  v_cycles jsonb;
  v_ops jsonb;
  v_target_id text := p_session_id;
BEGIN
  v_user_email := auth.jwt()->>'email';
  v_is_owner := (v_user_email ILIKE '%nader%' OR v_user_email = 'nader77@miaoda.com' OR public.is_vip_owner());

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Access Denied: Only verified VIP owner can access details.';
  END IF;

  -- 1. Session object (mask passwords, keep flags)
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

  -- Fallback to first available active session if not found
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
      WHERE is_active = true
      ORDER BY created_at ASC
      LIMIT 1
    ) s;
  END IF;

  -- If still null, create or fetch default
  IF v_session IS NOT NULL THEN
    v_target_id := v_session->>'id';
  END IF;

  -- 2. Fallback config (FIXED: id = 'default' text, NOT id = 1 integer)
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

  -- 3. Automation fallback (FIXED: id = 'default' text, NOT id = 1 integer)
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

  -- 4. Supported systems
  SELECT jsonb_agg(to_jsonb(sys) ORDER BY sys.display_name) INTO v_systems
  FROM vip_supported_systems sys;

  -- 5. Cycles for this session
  SELECT jsonb_agg(to_jsonb(cyc)) INTO v_cycles
  FROM (
    SELECT *
    FROM vip_cycle_history
    WHERE session_id = v_target_id
    ORDER BY cycle_number DESC, started_at DESC
    LIMIT 30
  ) cyc;

  -- 6. Operations for this session
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

-- 2. Fix vip_update_automation_settings: replace id = 1 with id = 'default'
CREATE OR REPLACE FUNCTION public.vip_update_automation_settings(
  p_enabled boolean,
  p_target_balance integer,
  p_custom_target integer DEFAULT NULL,
  p_action text DEFAULT 'save',
  p_session_id text DEFAULT 'default',
  p_cycle_delay_seconds integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email text;
  v_is_owner boolean;
  v_clean_delay integer;
BEGIN
  v_user_email := auth.jwt()->>'email';
  v_is_owner := (v_user_email ILIKE '%nader%' OR v_user_email = 'nader77@miaoda.com' OR public.is_vip_owner());

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Access Denied: Only verified VIP owner can update automation settings.';
  END IF;

  v_clean_delay := COALESCE(p_cycle_delay_seconds, 20);
  IF v_clean_delay < 0 THEN
    v_clean_delay := 20;
  END IF;

  -- 1. Update session row
  UPDATE vip_sessions
  SET
    automation_enabled = p_enabled,
    target_mix_balance = COALESCE(p_target_balance, 50000),
    custom_target_balance = p_custom_target,
    cycle_delay_seconds = v_clean_delay,
    operation_state = CASE
      WHEN p_action = 'stop' THEN 'stopped'
      WHEN p_action = 'pause' THEN 'paused'
      WHEN p_enabled THEN 'running'
      ELSE 'stopped'
    END,
    worker_status = CASE
      WHEN p_action = 'stop' THEN 'stopped'
      WHEN p_action = 'pause' THEN 'paused'
      WHEN p_enabled THEN 'ready'
      ELSE 'idle'
    END,
    updated_at = now()
  WHERE id = p_session_id;

  -- 2. Update default settings table for fallback (FIXED: id = 'default')
  UPDATE vip_automation_settings
  SET
    automation_enabled = p_enabled,
    target_mix_balance = COALESCE(p_target_balance, 50000),
    custom_target_balance = p_custom_target,
    cycle_delay_seconds = v_clean_delay,
    operation_state = CASE
      WHEN p_action = 'stop' THEN 'stopped'
      WHEN p_action = 'pause' THEN 'paused'
      WHEN p_enabled THEN 'running'
      ELSE 'stopped'
    END,
    updated_at = now()
  WHERE id = 'default';

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'automation_enabled', p_enabled,
    'target_mix_balance', p_target_balance,
    'cycle_delay_seconds', v_clean_delay,
    'action', p_action
  );
END;
$$;

-- 3. Update vip_create_session to support the exact script credentials model
CREATE OR REPLACE FUNCTION public.vip_create_session(
  p_session_name text DEFAULT NULL,
  p_owner_email text DEFAULT NULL,
  p_owner_password text DEFAULT NULL,
  p_individual_email text DEFAULT NULL,
  p_individual_password text DEFAULT NULL,
  p_target_balance integer DEFAULT 50000,
  p_cycle_delay_seconds integer DEFAULT 20,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email text;
  v_is_owner boolean;
  v_session_id text := 'sess_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
  v_clean_name text := TRIM(COALESCE(p_session_name, ''));
  v_session_count integer;
  v_clean_owner_email text := NULLIF(TRIM(p_owner_email), '');
  v_clean_indiv_email text := NULLIF(TRIM(p_individual_email), '');
  v_clean_delay integer := COALESCE(p_cycle_delay_seconds, 20);
  v_new_session record;
BEGIN
  v_user_email := auth.jwt()->>'email';
  v_is_owner := (v_user_email ILIKE '%nader%' OR v_user_email = 'nader77@miaoda.com' OR public.is_vip_owner());

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Unauthorized: VIP Owner access required.';
  END IF;

  SELECT count(*) INTO v_session_count FROM vip_sessions WHERE is_active = true;

  IF v_clean_name = '' THEN
    v_clean_name := 'جلسة اتصالات VIP #' || (v_session_count + 1);
  END IF;

  IF v_clean_delay < 0 THEN
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
    COALESCE(p_target_balance, 50000),
    v_clean_delay,
    'stopped',
    'idle',
    true,
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
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.vip_get_session_details(text) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.vip_update_automation_settings(boolean, integer, integer, text, text, integer) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.vip_create_session(text, text, text, text, text, integer, integer, text) TO authenticated, service_role, anon;
