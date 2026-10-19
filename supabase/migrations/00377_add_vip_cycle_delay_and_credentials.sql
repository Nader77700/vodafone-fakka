-- Migration: Add cycle_delay_seconds and secure credentials to vip_sessions and automation

ALTER TABLE vip_sessions
  ADD COLUMN IF NOT EXISTS cycle_delay_seconds integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS owner_email text,
  ADD COLUMN IF NOT EXISTS owner_password_enc text,
  ADD COLUMN IF NOT EXISTS individual_email text,
  ADD COLUMN IF NOT EXISTS individual_password_enc text,
  ADD COLUMN IF NOT EXISTS worker_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS worker_pid integer,
  ADD COLUMN IF NOT EXISTS worker_last_heartbeat timestamptz,
  ADD COLUMN IF NOT EXISTS current_step text,
  ADD COLUMN IF NOT EXISTS current_cycle_details jsonb;

ALTER TABLE vip_automation_settings
  ADD COLUMN IF NOT EXISTS cycle_delay_seconds integer NOT NULL DEFAULT 20;

-- Update RPC vip_update_automation_settings to support cycle_delay_seconds
CREATE OR REPLACE FUNCTION vip_update_automation_settings(
  p_enabled boolean,
  p_target_balance integer DEFAULT 50000,
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
  v_session_rec record;
  v_clean_delay integer;
BEGIN
  v_user_email := auth.jwt()->>'email';
  v_is_owner := (v_user_email ILIKE '%nader%' OR v_user_email = 'nader77@miaoda.com');

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

  -- 2. Update default settings table for fallback
  IF p_session_id = 'default' OR NOT EXISTS (SELECT 1 FROM vip_sessions WHERE id = p_session_id) THEN
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
    WHERE id = 1;
  END IF;

  -- 3. Log audit event
  INSERT INTO vip_audit_logs (actor_email, action, details)
  VALUES (
    v_user_email,
    'vip_update_automation_settings',
    jsonb_build_object(
      'session_id', p_session_id,
      'enabled', p_enabled,
      'target_balance', p_target_balance,
      'custom_target', p_custom_target,
      'cycle_delay_seconds', v_clean_delay,
      'action', p_action
    )
  );

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

-- Create RPC to save session credentials securely
CREATE OR REPLACE FUNCTION vip_save_session_credentials(
  p_session_id text,
  p_owner_email text,
  p_owner_password text,
  p_individual_email text,
  p_individual_password text,
  p_cycle_delay_seconds integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email text;
  v_is_owner boolean;
BEGIN
  v_user_email := auth.jwt()->>'email';
  v_is_owner := (v_user_email ILIKE '%nader%' OR v_user_email = 'nader77@miaoda.com');

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Access Denied: Only verified VIP owner can save credentials.';
  END IF;

  UPDATE vip_sessions
  SET
    owner_email = CASE WHEN p_owner_email IS NOT NULL AND p_owner_email <> '' THEN p_owner_email ELSE owner_email END,
    owner_password_enc = CASE WHEN p_owner_password IS NOT NULL AND p_owner_password <> '' THEN p_owner_password ELSE owner_password_enc END,
    individual_email = CASE WHEN p_individual_email IS NOT NULL AND p_individual_email <> '' THEN p_individual_email ELSE individual_email END,
    individual_password_enc = CASE WHEN p_individual_password IS NOT NULL AND p_individual_password <> '' THEN p_individual_password ELSE individual_password_enc END,
    cycle_delay_seconds = COALESCE(p_cycle_delay_seconds, cycle_delay_seconds, 20),
    updated_at = now()
  WHERE id = p_session_id;

  INSERT INTO vip_audit_logs (actor_email, action, details)
  VALUES (
    v_user_email,
    'vip_save_session_credentials',
    jsonb_build_object(
      'session_id', p_session_id,
      'has_owner_email', (p_owner_email IS NOT NULL AND p_owner_email <> ''),
      'has_owner_pass', (p_owner_password IS NOT NULL AND p_owner_password <> ''),
      'has_indiv_email', (p_individual_email IS NOT NULL AND p_individual_email <> ''),
      'has_indiv_pass', (p_individual_password IS NOT NULL AND p_individual_password <> ''),
      'cycle_delay_seconds', p_cycle_delay_seconds
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'message', 'تم حفظ بيانات الدخول وفترة الانتظار بأمان في الخادم.'
  );
END;
$$;

-- Update vip_get_session_details to mask passwords and return cycle_delay_seconds & worker_status
CREATE OR REPLACE FUNCTION vip_get_session_details(p_session_id text DEFAULT 'default')
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
BEGIN
  v_user_email := auth.jwt()->>'email';
  v_is_owner := (v_user_email ILIKE '%nader%' OR v_user_email = 'nader77@miaoda.com');

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
    WHERE id = p_session_id
  ) s;

  -- Fallback to default if not found
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
      ORDER BY created_at ASC
      LIMIT 1
    ) s;
  END IF;

  -- 2. Fallback config
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
    WHERE id = 1
  ) c;

  -- 3. Automation fallback
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
    WHERE id = 1
  ) a;

  -- 4. Supported systems
  SELECT jsonb_agg(to_jsonb(sys)) INTO v_systems
  FROM vip_supported_systems sys;

  -- 5. Cycles for this session
  SELECT jsonb_agg(to_jsonb(cyc)) INTO v_cycles
  FROM (
    SELECT *
    FROM vip_cycle_history
    WHERE session_id = p_session_id
    ORDER BY cycle_number DESC, started_at DESC
    LIMIT 30
  ) cyc;

  -- 6. Operations for this session
  SELECT jsonb_agg(to_jsonb(op)) INTO v_ops
  FROM (
    SELECT *
    FROM vip_operation_history
    WHERE session_id = p_session_id
    ORDER BY created_at DESC
    LIMIT 30
  ) op;

  RETURN jsonb_build_object(
    'session', v_session,
    'config', v_config,
    'automation', v_automation,
    'supported_systems', COALESCE(v_systems, '[]'::jsonb),
    'recent_cycles', COALESCE(v_cycles, '[]'::jsonb),
    'recent_operations', COALESCE(v_ops, '[]'::jsonb)
  );
END;
$$;
