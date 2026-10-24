-- 1. Add user_role column to vip_delegated_users if not exists
ALTER TABLE public.vip_delegated_users 
ADD COLUMN IF NOT EXISTS user_role text DEFAULT 'delegated_user';

UPDATE public.vip_delegated_users 
SET user_role = 'delegated_user' 
WHERE user_role IS NULL;

-- 2. Drop all overloaded signatures of vip_create_session
DROP FUNCTION IF EXISTS public.vip_create_session(text, text, text, text, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.vip_create_session(text, text, text, text, text, integer, integer, text);
DROP FUNCTION IF EXISTS public.vip_create_session(text, text, text, text, text, integer, integer);

-- 3. Create SINGLE canonical vip_create_session
CREATE OR REPLACE FUNCTION public.vip_create_session(
  p_session_name text DEFAULT NULL::text,
  p_owner_email text DEFAULT NULL::text,
  p_owner_password text DEFAULT NULL::text,
  p_individual_email text DEFAULT NULL::text,
  p_individual_password text DEFAULT NULL::text,
  p_target_balance integer DEFAULT 50000,
  p_cycle_delay_seconds integer DEFAULT 20,
  p_description text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: User not authenticated.';
    END IF;

    SELECT * INTO v_delegated
    FROM public.vip_delegated_users
    WHERE (user_id = v_uid OR id = v_uid)
      AND is_active = true
    LIMIT 1;

    IF v_delegated.user_id IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: VIP Access required.';
    END IF;

    -- Strict check: package limits for delegated users
    IF v_delegated.allowed_packages IS NOT NULL AND jsonb_array_length(CASE WHEN jsonb_typeof(v_delegated.allowed_packages) = 'array' THEN v_delegated.allowed_packages ELSE '[]'::jsonb END) > 0 THEN
      -- If attempted package is not allowed, clamp to first allowed package
      IF NOT (v_delegated.allowed_packages @> to_jsonb(v_clean_target)) THEN
        v_clean_target := COALESCE((v_delegated.allowed_packages->>0)::integer, 50000);
      END IF;
    END IF;

    -- Strict check: cooldown / delay enforcement for delegated users
    IF v_clean_delay < COALESCE(v_delegated.cooldown_seconds, v_delegated.min_cooldown_seconds, 30) THEN
      v_clean_delay := COALESCE(v_delegated.cooldown_seconds, v_delegated.min_cooldown_seconds, 30);
    END IF;
  END IF;

  SELECT count(*) INTO v_session_count 
  FROM public.vip_sessions 
  WHERE is_active = true AND (created_by_user_id = v_uid OR (v_is_owner AND (created_by_user_id = '1f4bd575-dad6-4011-9864-8759ff771147'::uuid OR created_by_user_id IS NULL)));

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
    COALESCE(v_uid, '1f4bd575-dad6-4011-9864-8759ff771147'::uuid),
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
$function$;

-- 4. Fix vip_get_session_details UUID comparison
CREATE OR REPLACE FUNCTION public.vip_get_session_details(p_session_id text DEFAULT 'default'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF NOT v_is_owner AND v_uid IS NOT NULL THEN
    SELECT true INTO v_is_delegated
    FROM public.vip_delegated_users
    WHERE (user_id = v_uid OR id = v_uid)
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
$function$;

-- 5. Fix vip_list_sessions to clearly distinguish Owner vs Delegated sessions
CREATE OR REPLACE FUNCTION public.vip_list_sessions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
    -- Owner sees ALL active sessions, with creator details if created by a delegated user
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
        ) ORDER BY s.created_at ASC
      ),
      '[]'::jsonb
    )
    INTO v_sessions
    FROM public.vip_sessions s
    LEFT JOIN public.vip_delegated_users d ON d.user_id = s.created_by_user_id
    LEFT JOIN auth.users u ON u.id = s.created_by_user_id
    WHERE s.is_active = true;
  ELSE
    -- Delegated user sees ONLY sessions they created themselves — NEVER owner sessions!
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
        ) ORDER BY s.created_at ASC
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
$function$;

-- 6. Fix vip_list_archived_sessions with same creator_user_name logic
CREATE OR REPLACE FUNCTION public.vip_list_archived_sessions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
        ) ORDER BY s.updated_at DESC
      ),
      '[]'::jsonb
    )
    INTO v_sessions
    FROM public.vip_sessions s
    LEFT JOIN public.vip_delegated_users d ON d.user_id = s.created_by_user_id
    LEFT JOIN auth.users u ON u.id = s.created_by_user_id
    WHERE s.is_active = false;
  ELSE
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
        ) ORDER BY s.updated_at DESC
      ),
      '[]'::jsonb
    )
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
$function$;
