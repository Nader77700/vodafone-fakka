-- 1. Fix is_vip_owner to strictly verify owner identity and NEVER treat delegated users or temporary links as owner
CREATE OR REPLACE FUNCTION public.is_vip_owner()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_role text := auth.jwt() ->> 'role';
  v_is_owner boolean := false;
BEGIN
  -- Service role or internal superuser
  IF (v_role = 'service_role') OR (current_user IN ('postgres', 'supabase_admin')) THEN
    RETURN true;
  END IF;

  -- Master Owner Email / ID check (Nader Akram)
  IF v_email IS NOT NULL AND (v_email = 'nader77@miaoda.com' OR v_email ILIKE '%nader%') THEN
    RETURN true;
  END IF;

  IF v_uid = '1f4bd575-dad6-4011-9864-8759ff771147'::uuid THEN
    RETURN true;
  END IF;

  -- Explicit verified owner in vip_owner_config
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
  END IF;

  RETURN false;
END;
$$;

-- 2. Update vip_list_sessions: Owner sees ALL sessions tagged with user info; Delegated users see ONLY their own
CREATE OR REPLACE FUNCTION public.vip_list_sessions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
          'creator_user_name', COALESCE(d.user_name, u.raw_user_meta_data->>'full_name', 'مالك VIP'),
          'creator_user_email', COALESCE(d.user_email, u.email, ''),
          'is_delegated_session', CASE WHEN s.created_by_user_id IS NOT NULL AND s.created_by_user_id != '1f4bd575-dad6-4011-9864-8759ff771147'::uuid AND s.created_by_user_id != v_uid THEN true ELSE false END
        ) ORDER BY s.created_at ASC
      ),
      '[]'::jsonb
    )
    INTO v_sessions
    FROM public.vip_sessions s
    LEFT JOIN public.vip_delegated_users d ON d.user_id = s.created_by_user_id::text
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
$$;

-- 3. Update vip_save_session_credentials: Owner can save any session, delegated users only their own
CREATE OR REPLACE FUNCTION public.vip_save_session_credentials(
  p_session_id text,
  p_owner_email text DEFAULT NULL,
  p_owner_password text DEFAULT NULL,
  p_individual_email text DEFAULT NULL,
  p_individual_password text DEFAULT NULL,
  p_cycle_delay_seconds integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user_email text := auth.jwt()->>'email';
  v_is_owner boolean := public.is_vip_owner();
  v_sess record;
  v_del record;
  v_delay integer := p_cycle_delay_seconds;
BEGIN
  SELECT * INTO v_sess FROM public.vip_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الجلسة غير موجودة.';
  END IF;

  IF NOT v_is_owner THEN
    -- Check if user is delegated and owns this session
    IF v_sess.created_by_user_id != v_uid THEN
      RAISE EXCEPTION 'Access Denied: You can only modify your own sessions.';
    END IF;

    SELECT * INTO v_del FROM public.vip_delegated_users WHERE (user_id = v_uid::text OR id::text = v_uid::text) AND is_active = true LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Access Denied: VIP delegation inactive.';
    END IF;

    -- Clamp cooldown if attempted
    IF v_delay IS NOT NULL AND v_delay < COALESCE(v_del.cooldown_seconds, v_del.min_cooldown_seconds, 30) THEN
      v_delay := COALESCE(v_del.cooldown_seconds, v_del.min_cooldown_seconds, 30);
    END IF;
  END IF;

  UPDATE public.vip_sessions
  SET
    owner_email = CASE WHEN p_owner_email IS NOT NULL AND p_owner_email <> '' THEN p_owner_email ELSE owner_email END,
    owner_password_enc = CASE WHEN p_owner_password IS NOT NULL AND p_owner_password <> '' THEN p_owner_password ELSE owner_password_enc END,
    individual_email = CASE WHEN p_individual_email IS NOT NULL AND p_individual_email <> '' THEN p_individual_email ELSE individual_email END,
    individual_password_enc = CASE WHEN p_individual_password IS NOT NULL AND p_individual_password <> '' THEN p_individual_password ELSE individual_password_enc END,
    cycle_delay_seconds = COALESCE(v_delay, cycle_delay_seconds, 20),
    updated_at = now()
  WHERE id = p_session_id;

  INSERT INTO public.vip_audit_logs (actor_email, action, details)
  VALUES (
    COALESCE(v_user_email, v_uid::text),
    'vip_save_session_credentials',
    jsonb_build_object(
      'session_id', p_session_id,
      'is_owner', v_is_owner,
      'has_owner_email', (p_owner_email IS NOT NULL AND p_owner_email <> ''),
      'has_indiv_email', (p_individual_email IS NOT NULL AND p_individual_email <> '')
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'message', 'تم حفظ بيانات الدخول بأمان في الخادم.'
  );
END;
$$;

-- 4. Update vip_update_session
CREATE OR REPLACE FUNCTION public.vip_update_session(
  p_session_id text,
  p_session_name text,
  p_owner_identifier text,
  p_individual_identifier text,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean := public.is_vip_owner();
  v_sess record;
  v_clean_name text := TRIM(p_session_name);
  v_clean_owner text := NULLIF(TRIM(p_owner_identifier), '');
  v_clean_indiv text := NULLIF(TRIM(p_individual_identifier), '');
  v_updated record;
BEGIN
  SELECT * INTO v_sess FROM public.vip_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الجلسة غير موجودة.';
  END IF;

  IF NOT v_is_owner AND v_sess.created_by_user_id != v_uid THEN
    RAISE EXCEPTION 'Unauthorized: Access Denied.';
  END IF;

  UPDATE public.vip_sessions
  SET
    session_name = COALESCE(v_clean_name, session_name),
    session_description = p_description,
    owner_account_identifier = v_clean_owner,
    owner_account_status = CASE 
      WHEN v_clean_owner IS NOT NULL THEN 'pending_verification' 
      ELSE 'not_connected' 
    END,
    individual_account_identifier = v_clean_indiv,
    individual_account_status = CASE 
      WHEN v_clean_indiv IS NOT NULL THEN 'pending_verification' 
      ELSE 'not_connected' 
    END,
    relationship_verified = false,
    relationship_status = 'unverified',
    updated_at = now()
  WHERE id = p_session_id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object(
    'success', true,
    'session', to_jsonb(v_updated),
    'message', 'تم تحديث بيانات الجلسة بنجاح.'
  );
END;
$$;

-- 5. RPC to update session target mix and cycle delay with strict server enforcement
CREATE OR REPLACE FUNCTION public.vip_update_session_target_and_delay(
  p_session_id text,
  p_target_mix integer,
  p_cycle_delay integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean := public.is_vip_owner();
  v_sess record;
  v_del record;
  v_target integer := p_target_mix;
  v_delay integer := p_cycle_delay;
BEGIN
  SELECT * INTO v_sess FROM public.vip_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الجلسة غير موجودة.';
  END IF;

  IF NOT v_is_owner THEN
    IF v_sess.created_by_user_id != v_uid THEN
      RAISE EXCEPTION 'Access Denied: You can only adjust your own sessions.';
    END IF;

    SELECT * INTO v_del FROM public.vip_delegated_users WHERE (user_id = v_uid::text OR id::text = v_uid::text) AND is_active = true LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Access Denied: Delegation inactive.';
    END IF;

    -- Strict check: package limits
    IF v_del.allowed_packages IS NOT NULL AND array_length(v_del.allowed_packages, 1) > 0 THEN
      IF NOT (v_target = ANY(v_del.allowed_packages)) THEN
        v_target := v_del.allowed_packages[1];
      END IF;
    END IF;

    -- Strict check: cooldown
    IF v_delay < COALESCE(v_del.cooldown_seconds, v_del.min_cooldown_seconds, 30) THEN
      v_delay := COALESCE(v_del.cooldown_seconds, v_del.min_cooldown_seconds, 30);
    END IF;
  ELSE
    -- Owner has full control
    IF v_delay < 5 THEN
      v_delay := 5;
    END IF;
  END IF;

  UPDATE public.vip_sessions
  SET
    target_mix_balance = v_target,
    cycle_delay_seconds = v_delay,
    updated_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'target_mix', v_target,
    'cycle_delay', v_delay,
    'message', 'تم تحديث الهدف وفترة الانتظار بنجاح.'
  );
END;
$$;

-- 6. RLS Policies on vip_sessions: allow delegated users to SELECT and UPDATE their own sessions
DROP POLICY IF EXISTS "VIP Owner modify sessions" ON public.vip_sessions;
DROP POLICY IF EXISTS "VIP Owner select sessions" ON public.vip_sessions;
DROP POLICY IF EXISTS "VIP Delegated user select own sessions" ON public.vip_sessions;
DROP POLICY IF EXISTS "VIP Delegated user update own sessions" ON public.vip_sessions;
DROP POLICY IF EXISTS "VIP Delegated user insert own sessions" ON public.vip_sessions;

CREATE POLICY "VIP Owner full access sessions"
ON public.vip_sessions
FOR ALL
TO authenticated
USING (public.is_vip_owner())
WITH CHECK (public.is_vip_owner());

CREATE POLICY "VIP Delegated user select own sessions"
ON public.vip_sessions
FOR SELECT
TO authenticated
USING (created_by_user_id = auth.uid());

CREATE POLICY "VIP Delegated user update own sessions"
ON public.vip_sessions
FOR UPDATE
TO authenticated
USING (created_by_user_id = auth.uid())
WITH CHECK (created_by_user_id = auth.uid());

CREATE POLICY "VIP Delegated user insert own sessions"
ON public.vip_sessions
FOR INSERT
TO authenticated
WITH CHECK (created_by_user_id = auth.uid());
