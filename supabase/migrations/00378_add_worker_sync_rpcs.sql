-- RPC for Worker / Session Step Reporting

CREATE OR REPLACE FUNCTION vip_worker_report_step(
  p_session_id text,
  p_cycle_number integer,
  p_step text,
  p_status text DEFAULT 'running',
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE vip_sessions
  SET
    current_step = p_step,
    worker_status = p_status,
    worker_last_heartbeat = now(),
    current_cycle = COALESCE(p_cycle_number, current_cycle),
    current_cycle_details = p_details,
    updated_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION vip_worker_record_cycle(
  p_session_id text,
  p_cycle_number integer,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_owner_start integer,
  p_owner_post_renewal integer,
  p_transferred_to_indiv integer,
  p_indiv_pre_transfer integer,
  p_indiv_post_transfer integer,
  p_system_pre text,
  p_system_post text,
  p_transferred_to_owner integer,
  p_final_balance integer,
  p_target_balance integer,
  p_status text,
  p_failure_step text DEFAULT NULL,
  p_error_summary text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duration integer;
  v_diff integer;
  v_increased boolean;
BEGIN
  IF p_ended_at IS NOT NULL AND p_started_at IS NOT NULL THEN
    v_duration := EXTRACT(EPOCH FROM (p_ended_at - p_started_at))::integer;
  ELSE
    v_duration := 0;
  END IF;

  IF p_target_balance IS NOT NULL AND p_final_balance IS NOT NULL THEN
    v_diff := GREATEST(0, p_target_balance - p_final_balance);
  ELSE
    v_diff := NULL;
  END IF;

  v_increased := (p_final_balance IS NOT NULL AND p_owner_start IS NOT NULL AND p_final_balance > p_owner_start);

  -- Insert cycle history record
  INSERT INTO vip_cycle_history (
    session_id,
    cycle_number,
    started_at,
    ended_at,
    duration_seconds,
    owner_balance_start,
    owner_balance_post_renewal,
    amount_transferred_owner_to_indiv,
    indiv_balance_pre_transfer,
    indiv_balance_post_transfer,
    system_pre_migration,
    system_post_migration,
    amount_transferred_indiv_to_owner,
    final_verified_owner_balance,
    difference_to_target,
    cycle_status,
    increased_owner_balance,
    failure_step,
    safe_error_summary
  )
  VALUES (
    p_session_id,
    p_cycle_number,
    COALESCE(p_started_at, now()),
    p_ended_at,
    v_duration,
    p_owner_start,
    p_owner_post_renewal,
    p_transferred_to_indiv,
    p_indiv_pre_transfer,
    p_indiv_post_transfer,
    p_system_pre,
    p_system_post,
    p_transferred_to_owner,
    p_final_balance,
    v_diff,
    p_status,
    v_increased,
    p_failure_step,
    p_error_summary
  );

  -- Update session summary
  UPDATE vip_sessions
  SET
    current_cycle = p_cycle_number,
    owner_mix_balance = COALESCE(p_final_balance, owner_mix_balance),
    last_owner_refresh_at = now(),
    last_actual_operation = 'دورة #' || p_cycle_number || ' (' || p_status || ')',
    last_successful_operation = CASE WHEN p_status = 'completed' OR p_status = 'stopped_at_target' THEN 'دورة #' || p_cycle_number ELSE last_successful_operation END,
    last_successful_op_at = CASE WHEN p_status = 'completed' OR p_status = 'stopped_at_target' THEN now() ELSE last_successful_op_at END,
    last_error_summary = p_error_summary,
    worker_status = CASE WHEN p_status = 'stopped_at_target' THEN 'completed' ELSE worker_status END,
    operation_state = CASE WHEN p_status = 'stopped_at_target' THEN 'completed' ELSE operation_state END,
    updated_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
