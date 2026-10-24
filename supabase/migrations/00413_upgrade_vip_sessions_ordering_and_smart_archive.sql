-- 1. Upgrade vip_list_sessions to sort newest sessions first (created_at DESC)
CREATE OR REPLACE FUNCTION public.vip_list_sessions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean := false;
  v_is_delegated boolean := false;
  v_sessions jsonb;
BEGIN
  v_is_owner := public.is_vip_owner();
  
  IF NOT v_is_owner AND v_uid IS NOT NULL THEN
    SELECT true INTO v_is_delegated
    FROM public.vip_delegated_users
    WHERE (user_id = v_uid OR id = v_uid)
      AND is_active = true
    LIMIT 1;
  END IF;

  IF NOT v_is_owner AND NOT v_is_delegated THEN
    RAISE EXCEPTION 'Unauthorized: VIP access required.';
  END IF;

  IF v_is_owner THEN
    -- Owner sees ALL active sessions sorted newest first (created_at DESC)
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'session_name', s.session_name,
          'session_description', s.session_description,
          'is_active', s.is_active,
          'owner_account_identifier', s.owner_account_identifier,
          'owner_account_status', s.owner_account_status,
          'owner_current_plan', s.owner_current_plan,
          'owner_mix_balance', s.owner_mix_balance,
          'last_owner_refresh_at', s.last_owner_refresh_at,
          'individual_account_identifier', s.individual_account_identifier,
          'individual_account_status', s.individual_account_status,
          'individual_current_plan', s.individual_current_plan,
          'individual_mix_balance', s.individual_mix_balance,
          'last_individual_refresh_at', s.last_individual_refresh_at,
          'relationship_verified', s.relationship_verified,
          'relationship_status', s.relationship_status,
          'relationship_details', s.relationship_details,
          'last_relationship_check_at', s.last_relationship_check_at,
          'automation_enabled', s.automation_enabled,
          'operation_state', s.operation_state,
          'target_mix_balance', s.target_mix_balance,
          'custom_target_balance', s.custom_target_balance,
          'current_cycle', s.current_cycle,
          'last_actual_operation', s.last_actual_operation,
          'last_successful_operation', s.last_successful_operation,
          'last_successful_op_at', s.last_successful_op_at,
          'last_error_summary', s.last_error_summary,
          'pause_reason', s.pause_reason,
          'created_at', s.created_at,
          'updated_at', s.updated_at,
          'cycle_delay_seconds', s.cycle_delay_seconds,
          'owner_email', s.owner_email,
          'individual_email', s.individual_email,
          'worker_status', s.worker_status,
          'worker_pid', s.worker_pid,
          'worker_last_heartbeat', s.worker_last_heartbeat,
          'current_step', s.current_step,
          'current_cycle_details', s.current_cycle_details,
          'auto_eject_child_on_complete', s.auto_eject_child_on_complete,
          'created_by_user_id', s.created_by_user_id,
          'creator_user_name', CASE 
            WHEN s.created_by_user_id IS NOT NULL 
             AND s.created_by_user_id != '1f4bd575-dad6-4011-9864-8759ff771147'::uuid 
            THEN COALESCE(d.user_name, u.raw_user_meta_data->>'username', u.email, 'مستخدم مفوض') 
            ELSE NULL 
          END,
          'creator_user_email', CASE 
            WHEN s.created_by_user_id IS NOT NULL 
             AND s.created_by_user_id != '1f4bd575-dad6-4011-9864-8759ff771147'::uuid 
            THEN COALESCE(d.user_email, u.email, '') 
            ELSE NULL 
          END,
          'is_delegated_session', CASE 
            WHEN s.created_by_user_id IS NOT NULL 
             AND s.created_by_user_id != '1f4bd575-dad6-4011-9864-8759ff771147'::uuid 
             AND (v_uid IS NULL OR s.created_by_user_id != v_uid) 
            THEN true 
            ELSE false 
          END
        ) ORDER BY s.created_at DESC
      ),
      '[]'::jsonb
    )
    INTO v_sessions
    FROM public.vip_sessions s
    LEFT JOIN public.vip_delegated_users d ON d.user_id = s.created_by_user_id
    LEFT JOIN auth.users u ON u.id = s.created_by_user_id
    WHERE s.is_active = true;
  ELSE
    -- Delegated user sees ONLY sessions they created themselves — sorted newest first
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'session_name', s.session_name,
          'session_description', s.session_description,
          'is_active', s.is_active,
          'owner_account_identifier', s.owner_account_identifier,
          'owner_account_status', s.owner_account_status,
          'owner_current_plan', s.owner_current_plan,
          'owner_mix_balance', s.owner_mix_balance,
          'last_owner_refresh_at', s.last_owner_refresh_at,
          'individual_account_identifier', s.individual_account_identifier,
          'individual_account_status', s.individual_account_status,
          'individual_current_plan', s.individual_current_plan,
          'individual_mix_balance', s.individual_mix_balance,
          'last_individual_refresh_at', s.last_individual_refresh_at,
          'relationship_verified', s.relationship_verified,
          'relationship_status', s.relationship_status,
          'relationship_details', s.relationship_details,
          'last_relationship_check_at', s.last_relationship_check_at,
          'automation_enabled', s.automation_enabled,
          'operation_state', s.operation_state,
          'target_mix_balance', s.target_mix_balance,
          'custom_target_balance', s.custom_target_balance,
          'current_cycle', s.current_cycle,
          'last_actual_operation', s.last_actual_operation,
          'last_successful_operation', s.last_successful_operation,
          'last_successful_op_at', s.last_successful_op_at,
          'last_error_summary', s.last_error_summary,
          'pause_reason', s.pause_reason,
          'created_at', s.created_at,
          'updated_at', s.updated_at,
          'cycle_delay_seconds', s.cycle_delay_seconds,
          'owner_email', s.owner_email,
          'individual_email', s.individual_email,
          'worker_status', s.worker_status,
          'worker_pid', s.worker_pid,
          'worker_last_heartbeat', s.worker_last_heartbeat,
          'current_step', s.current_step,
          'current_cycle_details', s.current_cycle_details,
          'auto_eject_child_on_complete', s.auto_eject_child_on_complete,
          'created_by_user_id', s.created_by_user_id,
          'creator_user_name', null,
          'creator_user_email', null,
          'is_delegated_session', false
        ) ORDER BY s.created_at DESC
      ),
      '[]'::jsonb
    )
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
$$;

-- 2. Upgrade vip_delete_all_sessions with smart scope support:
-- p_scope: 'owner_only' (default) | 'completed_only' | 'all'
CREATE OR REPLACE FUNCTION public.vip_delete_all_sessions(p_scope text DEFAULT 'owner_only')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user_email text := auth.jwt()->>'email';
  v_is_owner boolean := public.is_vip_owner();
  v_deleted_count integer := 0;
  v_scope text := COALESCE(p_scope, 'owner_only');
BEGIN
  IF NOT v_is_owner THEN
    -- Delegated user can only archive THEIR OWN sessions
    UPDATE public.vip_sessions
    SET is_active = false,
        automation_enabled = false,
        operation_state = 'stopped',
        worker_status = 'stopped',
        updated_at = now()
    WHERE is_active = true
      AND created_by_user_id = v_uid;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN jsonb_build_object(
      'success', true,
      'deleted_count', v_deleted_count,
      'scope', 'self',
      'message', 'تمت أرشفة جلساتك الخاصة بنجاح.'
    );
  END IF;

  -- Owner Scopes
  IF v_scope = 'owner_only' THEN
    -- Archive ONLY owner sessions, leave delegated users intact!
    UPDATE public.vip_sessions
    SET is_active = false,
        automation_enabled = false,
        operation_state = 'stopped',
        worker_status = 'stopped',
        updated_at = now()
    WHERE is_active = true
      AND (
        created_by_user_id = '1f4bd575-dad6-4011-9864-8759ff771147'::uuid
        OR created_by_user_id IS NULL
        OR created_by_user_id = v_uid
      );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  ELSIF v_scope = 'completed_only' THEN
    -- Archive only sessions that reached target balance or are marked completed
    UPDATE public.vip_sessions
    SET is_active = false,
        automation_enabled = false,
        operation_state = 'stopped',
        worker_status = 'stopped',
        updated_at = now()
    WHERE is_active = true
      AND (
        (target_mix_balance > 0 AND owner_mix_balance >= target_mix_balance)
        OR operation_state = 'completed'
      );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  ELSE -- 'all'
    -- Archive all active sessions
    UPDATE public.vip_sessions
    SET is_active = false,
        automation_enabled = false,
        operation_state = 'stopped',
        worker_status = 'stopped',
        updated_at = now()
    WHERE is_active = true;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  END IF;

  INSERT INTO public.vip_audit_logs (actor_email, action, details)
  VALUES (
    COALESCE(v_user_email, 'owner'),
    'vip_all_sessions_archived',
    jsonb_build_object(
      'scope', v_scope,
      'archived_count', v_deleted_count
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'scope', v_scope,
    'message', CASE
      WHEN v_scope = 'owner_only' THEN 'تمت أرشفة جلسات المالك فقط مع بقاء جلسات المستخدمين نشطة.'
      WHEN v_scope = 'completed_only' THEN 'تمت أرشفة الجلسات المكتملة فقط بنجاح.'
      ELSE 'تمت أرشفة كافة جلسات النظام بنجاح.'
    END
  );
END;
$$;