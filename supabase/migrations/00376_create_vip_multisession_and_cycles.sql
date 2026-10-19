-- ====================================================================
-- VIP SECTION PHASE 2: MULTI-SESSION, MULTI-ACCOUNT, AND CYCLE HISTORY
-- ====================================================================

-- 1. Table: vip_sessions
CREATE TABLE IF NOT EXISTS public.vip_sessions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_name text NOT NULL,
  session_description text,
  is_active boolean NOT NULL DEFAULT true,
  
  -- Owner Account Info
  owner_account_identifier text,
  owner_account_status text NOT NULL DEFAULT 'not_connected',
  owner_current_plan text,
  owner_mix_balance numeric,
  last_owner_refresh_at timestamptz,
  
  -- Individual Account Info
  individual_account_identifier text,
  individual_account_status text NOT NULL DEFAULT 'not_connected',
  individual_current_plan text,
  individual_mix_balance numeric,
  last_individual_refresh_at timestamptz,
  
  -- Relationship
  relationship_verified boolean NOT NULL DEFAULT false,
  relationship_status text NOT NULL DEFAULT 'unverified',
  relationship_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_relationship_check_at timestamptz,
  
  -- Automation Settings per Session
  automation_enabled boolean NOT NULL DEFAULT false,
  operation_state text NOT NULL DEFAULT 'stopped',
  target_mix_balance integer NOT NULL DEFAULT 50000,
  custom_target_balance integer,
  current_cycle integer NOT NULL DEFAULT 0,
  
  -- Operations and Diagnostics
  last_actual_operation text,
  last_successful_operation text,
  last_successful_op_at timestamptz,
  last_error_summary text,
  pause_reason text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Migrate existing default configuration if exists
INSERT INTO public.vip_sessions (
  id,
  session_name,
  session_description,
  owner_account_identifier,
  owner_account_status,
  individual_account_identifier,
  individual_account_status,
  relationship_verified,
  relationship_status,
  automation_enabled,
  operation_state,
  target_mix_balance
)
SELECT 
  'default',
  'الجلسة الافتراضية الرئيسية',
  'جلسة العمل الأساسية الموثقة للمالك',
  c.owner_account_identifier,
  c.owner_account_status,
  c.individual_account_identifier,
  c.individual_account_status,
  c.relationship_verified,
  c.relationship_status,
  COALESCE(a.automation_enabled, false),
  COALESCE(a.operation_state, 'stopped'),
  COALESCE(a.target_mix_balance, 50000)
FROM public.vip_owner_config c
LEFT JOIN public.vip_automation_settings a ON a.id = 'default'
WHERE c.id = 'default'
ON CONFLICT (id) DO NOTHING;

-- 3. Add session_id to vip_operation_history if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'vip_operation_history' 
      AND column_name = 'session_id'
  ) THEN
    ALTER TABLE public.vip_operation_history ADD COLUMN session_id text DEFAULT 'default';
  END IF;
END $$;

-- 4. Table: vip_cycle_history
CREATE TABLE IF NOT EXISTS public.vip_cycle_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  cycle_number integer NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer,
  owner_balance_start numeric,
  owner_balance_post_renewal numeric,
  amount_transferred_owner_to_indiv numeric,
  individual_balance_pre_transfer numeric,
  individual_balance_post_transfer numeric,
  system_pre_migration text,
  system_post_migration text,
  migration_result text,
  amount_transferred_indiv_to_owner numeric,
  final_verified_owner_balance numeric,
  difference_to_target numeric,
  cycle_status text NOT NULL DEFAULT 'pending_integration',
  failure_step text,
  safe_error_summary text,
  increased_owner_balance boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Enable RLS
ALTER TABLE public.vip_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_cycle_history ENABLE ROW LEVEL SECURITY;

-- Drop old policies if any
DROP POLICY IF EXISTS "VIP Owner select sessions" ON public.vip_sessions;
DROP POLICY IF EXISTS "VIP Owner modify sessions" ON public.vip_sessions;
DROP POLICY IF EXISTS "VIP Owner select cycles" ON public.vip_cycle_history;
DROP POLICY IF EXISTS "VIP Owner insert cycles" ON public.vip_cycle_history;

-- Policies for vip_sessions
CREATE POLICY "VIP Owner select sessions" ON public.vip_sessions
  FOR SELECT TO authenticated USING (public.is_vip_owner());

CREATE POLICY "VIP Owner modify sessions" ON public.vip_sessions
  FOR ALL TO authenticated USING (public.is_vip_owner()) WITH CHECK (public.is_vip_owner());

-- Policies for vip_cycle_history
CREATE POLICY "VIP Owner select cycles" ON public.vip_cycle_history
  FOR SELECT TO authenticated USING (public.is_vip_owner());

CREATE POLICY "VIP Owner insert cycles" ON public.vip_cycle_history
  FOR INSERT TO authenticated WITH CHECK (public.is_vip_owner());

-- 6. RPC: vip_list_sessions()
CREATE OR REPLACE FUNCTION public.vip_list_sessions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sessions jsonb;
BEGIN
  IF NOT public.is_vip_owner() THEN
    RAISE EXCEPTION 'Unauthorized: VIP Owner access required.';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.created_at ASC), '[]'::jsonb)
  INTO v_sessions
  FROM public.vip_sessions s
  WHERE s.is_active = true;

  RETURN jsonb_build_object(
    'success', true,
    'sessions', v_sessions
  );
END;
$function$;

-- 7. RPC: vip_create_session
CREATE OR REPLACE FUNCTION public.vip_create_session(
  p_session_name text,
  p_owner_identifier text DEFAULT NULL,
  p_individual_identifier text DEFAULT NULL,
  p_target_balance integer DEFAULT 50000,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session_id text := 'sess_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
  v_clean_name text := TRIM(p_session_name);
  v_clean_owner text := NULLIF(TRIM(p_owner_identifier), '');
  v_clean_indiv text := NULLIF(TRIM(p_individual_identifier), '');
  v_new_session record;
BEGIN
  IF NOT public.is_vip_owner() THEN
    RAISE EXCEPTION 'Unauthorized: VIP Owner access required.';
  END IF;

  IF v_clean_name IS NULL OR length(v_clean_name) < 2 THEN
    RAISE EXCEPTION 'اسم الجلسة يجب ألا يقل عن حرفين.';
  END IF;

  INSERT INTO public.vip_sessions (
    id,
    session_name,
    session_description,
    owner_account_identifier,
    owner_account_status,
    individual_account_identifier,
    individual_account_status,
    relationship_status,
    target_mix_balance,
    operation_state,
    created_at,
    updated_at
  )
  VALUES (
    v_session_id,
    v_clean_name,
    p_description,
    v_clean_owner,
    CASE WHEN v_clean_owner IS NOT NULL THEN 'pending_verification' ELSE 'not_connected' END,
    v_clean_indiv,
    CASE WHEN v_clean_indiv IS NOT NULL THEN 'pending_verification' ELSE 'not_connected' END,
    'unverified',
    COALESCE(p_target_balance, 50000),
    'stopped',
    now(),
    now()
  )
  RETURNING * INTO v_new_session;

  INSERT INTO public.vip_audit_logs (event_type, user_id, details)
  VALUES (
    'vip_session_created',
    auth.uid(),
    jsonb_build_object(
      'session_id', v_session_id,
      'session_name', v_clean_name,
      'owner', v_clean_owner,
      'individual', v_clean_indiv
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'session', to_jsonb(v_new_session),
    'message', 'تم إنشاء الجلسة المستقلة بنجاح.'
  );
END;
$function$;

-- 8. RPC: vip_update_session
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
SET search_path TO 'public'
AS $function$
DECLARE
  v_clean_name text := TRIM(p_session_name);
  v_clean_owner text := NULLIF(TRIM(p_owner_identifier), '');
  v_clean_indiv text := NULLIF(TRIM(p_individual_identifier), '');
  v_updated record;
BEGIN
  IF NOT public.is_vip_owner() THEN
    RAISE EXCEPTION 'Unauthorized: VIP Owner access required.';
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الجلسة غير موجودة.';
  END IF;

  INSERT INTO public.vip_audit_logs (event_type, user_id, details)
  VALUES (
    'vip_session_updated',
    auth.uid(),
    jsonb_build_object(
      'session_id', p_session_id,
      'session_name', v_clean_name
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'session', to_jsonb(v_updated),
    'message', 'تم تحديث بيانات الجلسة بنجاح.'
  );
END;
$function$;

-- 9. RPC: vip_delete_session
CREATE OR REPLACE FUNCTION public.vip_delete_session(
  p_session_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_vip_owner() THEN
    RAISE EXCEPTION 'Unauthorized: VIP Owner access required.';
  END IF;

  -- Ensure at least one session remains
  IF (SELECT count(*) FROM public.vip_sessions WHERE is_active = true) <= 1 THEN
    RAISE EXCEPTION 'لا يمكن حذف الجلسة الوحيدة المتبقية في النظام.';
  END IF;

  UPDATE public.vip_sessions
  SET is_active = false, updated_at = now()
  WHERE id = p_session_id;

  INSERT INTO public.vip_audit_logs (event_type, user_id, details)
  VALUES (
    'vip_session_deleted',
    auth.uid(),
    jsonb_build_object('session_id', p_session_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'message', 'تمت أرشفة الجلسة بنجاح.'
  );
END;
$function$;

-- 10. RPC: vip_get_session_details(p_session_id)
CREATE OR REPLACE FUNCTION public.vip_get_session_details(
  p_session_id text DEFAULT 'default'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session jsonb;
  v_systems jsonb;
  v_recent_ops jsonb;
  v_recent_cycles jsonb;
  v_target_id text := p_session_id;
BEGIN
  IF NOT public.is_vip_owner() THEN
    RAISE EXCEPTION 'Unauthorized: VIP Owner access required.';
  END IF;

  -- If session does not exist, fallback to first active session or default
  IF NOT EXISTS (SELECT 1 FROM public.vip_sessions WHERE id = v_target_id AND is_active = true) THEN
    SELECT id INTO v_target_id FROM public.vip_sessions WHERE is_active = true ORDER BY created_at ASC LIMIT 1;
  END IF;

  SELECT to_jsonb(s) INTO v_session FROM public.vip_sessions s WHERE s.id = v_target_id;
  SELECT jsonb_agg(to_jsonb(sys) ORDER BY sys.display_name) INTO v_systems FROM public.vip_supported_systems sys WHERE is_active = true;
  
  -- Filter operations by session
  SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb) INTO v_recent_ops
  FROM (
    SELECT * FROM public.vip_operation_history
    WHERE session_id = v_target_id OR session_id IS NULL
    ORDER BY created_at DESC
    LIMIT 15
  ) o;

  -- Filter cycles by session
  SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb) INTO v_recent_cycles
  FROM (
    SELECT * FROM public.vip_cycle_history
    WHERE session_id = v_target_id
    ORDER BY cycle_number DESC, started_at DESC
    LIMIT 20
  ) c;

  RETURN jsonb_build_object(
    'success', true,
    'session', v_session,
    'supported_systems', COALESCE(v_systems, '[]'::jsonb),
    'recent_operations', v_recent_ops,
    'recent_cycles', v_recent_cycles,
    'server_time', now()
  );
END;
$function$;

-- 11. RPC: Update vip_submit_manual_operation to accept session_id
CREATE OR REPLACE FUNCTION public.vip_submit_manual_operation(
  p_operation_type text,
  p_requested_action text,
  p_plan_id text DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_session_id text DEFAULT 'default'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session record;
  v_op_id uuid;
BEGIN
  IF NOT public.is_vip_owner() THEN
    RAISE EXCEPTION 'Unauthorized: VIP Owner access required.';
  END IF;

  SELECT * INTO v_session FROM public.vip_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    SELECT * INTO v_session FROM public.vip_sessions ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- PHASE 1 & 2 SAFETY RULE:
  -- Operations are created in 'pending_integration' state.
  -- No real carrier mutations take place until integration phase.
  INSERT INTO public.vip_operation_history (
    session_id,
    operation_type,
    owner_account_ref,
    individual_account_ref,
    requested_action,
    relevant_plan_id,
    requested_amount,
    status,
    created_at,
    result,
    failure_reason,
    initiating_user_id,
    is_automatic
  )
  VALUES (
    v_session.id,
    p_operation_type,
    v_session.owner_account_identifier,
    v_session.individual_account_identifier,
    p_requested_action,
    p_plan_id,
    p_amount,
    'pending_integration',
    now(),
    jsonb_build_object(
      'phase', 'phase_2_multisession',
      'session_name', v_session.session_name,
      'note', 'العملية مسجلة في سجل الجلسة وبانتظار اكتمال ربط سكريبت مشغل الاتصالات بالمرحلة القادمة.'
    ),
    NULL,
    auth.uid(),
    false
  )
  RETURNING id INTO v_op_id;

  INSERT INTO public.vip_audit_logs (event_type, user_id, details)
  VALUES (
    'vip_manual_operation_requested',
    auth.uid(),
    jsonb_build_object(
      'operation_id', v_op_id,
      'session_id', v_session.id,
      'operation_type', p_operation_type,
      'requested_action', p_requested_action
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'operation_id', v_op_id,
    'session_id', v_session.id,
    'status', 'pending_integration',
    'message', 'تم تسجيل طلب العملية بنجاح في سجل العمليات الخاص بالجلسة وبانتظار تفعيل الربط المباشر مع مزود الخدمة.'
  );
END;
$function$;

-- 12. RPC: Update vip_update_automation_settings to accept session_id
CREATE OR REPLACE FUNCTION public.vip_update_automation_settings(
  p_enabled boolean,
  p_target_balance integer,
  p_custom_balance integer DEFAULT NULL,
  p_action text DEFAULT 'save',
  p_session_id text DEFAULT 'default'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_state text;
  v_updated record;
BEGIN
  IF NOT public.is_vip_owner() THEN
    RAISE EXCEPTION 'Unauthorized: VIP Owner access required.';
  END IF;

  v_state := CASE 
    WHEN p_action = 'stop' THEN 'stopped'
    WHEN p_action = 'pause' THEN 'paused'
    WHEN p_enabled IS TRUE THEN 'awaiting_integration'
    ELSE 'stopped'
  END;

  UPDATE public.vip_sessions
  SET
    automation_enabled = p_enabled,
    operation_state = v_state,
    target_mix_balance = p_target_balance,
    custom_target_balance = p_custom_balance,
    updated_at = now()
  WHERE id = p_session_id
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الجلسة غير موجودة.';
  END IF;

  INSERT INTO public.vip_audit_logs (event_type, user_id, details)
  VALUES (
    'vip_automation_settings_updated',
    auth.uid(),
    jsonb_build_object(
      'session_id', p_session_id,
      'enabled', p_enabled,
      'target_balance', p_target_balance,
      'state', v_state
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'automation_enabled', p_enabled,
    'operation_state', v_state,
    'target_balance', p_target_balance
  );
END;
$function$;

-- 13. Grants
GRANT EXECUTE ON FUNCTION public.vip_list_sessions() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vip_create_session(text, text, text, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vip_update_session(text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vip_delete_session(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vip_get_session_details(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vip_submit_manual_operation(text, text, text, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vip_update_automation_settings(boolean, integer, integer, text, text) TO authenticated, service_role;

-- 14. Notify PostgREST
NOTIFY pgrst, 'reload schema';
