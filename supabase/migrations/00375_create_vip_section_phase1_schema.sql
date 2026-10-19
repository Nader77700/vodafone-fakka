-- ====================================================================
-- VIP SECTION PHASE 1: DATA MODEL, SECURITY, AND RPC FUNCTIONS
-- ====================================================================

-- 1. Table: vip_owner_config
CREATE TABLE IF NOT EXISTS public.vip_owner_config (
  id text PRIMARY KEY DEFAULT 'default',
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_verified boolean NOT NULL DEFAULT false,
  verification_method text DEFAULT 'server_admin_claim',
  verified_at timestamptz,
  owner_account_identifier text,
  owner_account_status text NOT NULL DEFAULT 'not_connected',
  owner_current_plan text,
  owner_mix_balance numeric,
  last_owner_refresh_at timestamptz,
  individual_account_identifier text,
  individual_account_status text NOT NULL DEFAULT 'not_connected',
  individual_current_plan text,
  individual_mix_balance numeric,
  last_individual_refresh_at timestamptz,
  relationship_verified boolean NOT NULL DEFAULT false,
  relationship_status text NOT NULL DEFAULT 'unverified',
  relationship_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_relationship_check_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Table: vip_automation_settings
CREATE TABLE IF NOT EXISTS public.vip_automation_settings (
  id text PRIMARY KEY DEFAULT 'default',
  automation_enabled boolean NOT NULL DEFAULT false,
  operation_state text NOT NULL DEFAULT 'stopped',
  target_mix_balance integer NOT NULL DEFAULT 50000,
  custom_target_balance integer,
  current_cycle integer NOT NULL DEFAULT 0,
  last_actual_operation text,
  last_successful_operation text,
  last_successful_op_at timestamptz,
  next_scheduled_action text,
  next_scheduled_at timestamptz,
  most_recent_error text,
  pause_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Table: vip_supported_systems
CREATE TABLE IF NOT EXISTS public.vip_supported_systems (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  is_auto_eligible boolean NOT NULL DEFAULT false,
  allowed_transitions jsonb NOT NULL DEFAULT '[]'::jsonb,
  renewal_values jsonb NOT NULL DEFAULT '[]'::jsonb,
  eligibility_requirements text,
  unsupported_reason text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Table: vip_operation_history
CREATE TABLE IF NOT EXISTS public.vip_operation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type text NOT NULL,
  owner_account_ref text,
  individual_account_ref text,
  requested_action text NOT NULL,
  relevant_plan_id text,
  requested_amount numeric,
  status text NOT NULL DEFAULT 'requested',
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_reason text,
  initiating_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_automatic boolean NOT NULL DEFAULT false
);

-- 5. Table: vip_audit_logs
CREATE TABLE IF NOT EXISTS public.vip_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  user_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Helper Function: is_vip_owner()
CREATE OR REPLACE FUNCTION public.is_vip_owner()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    -- Check if service role
    IF (auth.jwt() ->> 'role' = 'service_role') OR (current_user IN ('postgres', 'supabase_admin')) THEN
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  -- 1. Check if user is explicit verified owner in vip_owner_config
  SELECT true INTO v_is_owner
  FROM public.vip_owner_config
  WHERE id = 'default'
    AND owner_user_id = v_uid
    AND is_verified = true
  LIMIT 1;

  IF v_is_owner IS TRUE THEN
    RETURN true;
  END IF;

  -- 2. Fallback: check if user is system admin / super_admin in core_profiles or profiles
  IF public.is_current_admin() THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

-- 7. Seed default rows safely
INSERT INTO public.vip_owner_config (
  id, owner_user_id, is_verified, verification_method, verified_at,
  owner_account_status, individual_account_status, relationship_status
)
VALUES (
  'default', '1f4bd575-dad6-4011-9864-8759ff771147', true, 'server_admin_claim', now(),
  'not_connected', 'not_connected', 'unverified'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.vip_automation_settings (
  id, automation_enabled, operation_state, target_mix_balance, current_cycle
)
VALUES (
  'default', false, 'stopped', 50000, 0
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.vip_supported_systems (
  id, display_name, is_auto_eligible, allowed_transitions, renewal_values, eligibility_requirements, unsupported_reason
)
VALUES 
(
  'Hekaya_XRP_MIX_Parent_6',
  'حكاية XRP ميكس 6',
  true,
  '["Hekaya_XRP_MIX_Parent_7"]'::jsonb,
  '[180, 270]'::jsonb,
  'يتطلب نظام حكاية مفعل ورصيد كافٍ للتجديد وخط فرد مربوط معتمد.',
  NULL
),
(
  'Hekaya_XRP_MIX_Parent_7',
  'حكاية XRP ميكس 7',
  true,
  '["Hekaya_XRP_MIX_Parent_6"]'::jsonb,
  '[180, 270]'::jsonb,
  'يتطلب نظام حكاية مفعل ورصيد كافٍ للتجديد وخط فرد مربوط معتمد.',
  NULL
),
(
  'Hekaya_Standard_Other',
  'أنظمة حكاية الأخرى (غير مؤهلة حالياً)',
  false,
  '[]'::jsonb,
  '[]'::jsonb,
  'يتطلب التحقق من معرفات النظام وقيم التجديد من مزود الخدمة قبل التفعيل.',
  'هذا النظام غير معتمد للأتمتة في المرحلة الأولى وبانتظار التحقق من مزود الخدمة.'
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  is_auto_eligible = EXCLUDED.is_auto_eligible,
  allowed_transitions = EXCLUDED.allowed_transitions,
  renewal_values = EXCLUDED.renewal_values,
  eligibility_requirements = EXCLUDED.eligibility_requirements;

-- 8. Enable RLS on all VIP tables
ALTER TABLE public.vip_owner_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_automation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_supported_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_operation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop old policies if any
DROP POLICY IF EXISTS "VIP Owner select config" ON public.vip_owner_config;
DROP POLICY IF EXISTS "VIP Owner modify config" ON public.vip_owner_config;
DROP POLICY IF EXISTS "VIP Owner select automation" ON public.vip_automation_settings;
DROP POLICY IF EXISTS "VIP Owner modify automation" ON public.vip_automation_settings;
DROP POLICY IF EXISTS "VIP Owner select systems" ON public.vip_supported_systems;
DROP POLICY IF EXISTS "VIP Owner select history" ON public.vip_operation_history;
DROP POLICY IF EXISTS "VIP Owner insert history" ON public.vip_operation_history;
DROP POLICY IF EXISTS "VIP Owner select audit" ON public.vip_audit_logs;

-- Policies for vip_owner_config
CREATE POLICY "VIP Owner select config" ON public.vip_owner_config
  FOR SELECT TO authenticated USING (public.is_vip_owner());

CREATE POLICY "VIP Owner modify config" ON public.vip_owner_config
  FOR ALL TO authenticated USING (public.is_vip_owner()) WITH CHECK (public.is_vip_owner());

-- Policies for vip_automation_settings
CREATE POLICY "VIP Owner select automation" ON public.vip_automation_settings
  FOR SELECT TO authenticated USING (public.is_vip_owner());

CREATE POLICY "VIP Owner modify automation" ON public.vip_automation_settings
  FOR ALL TO authenticated USING (public.is_vip_owner()) WITH CHECK (public.is_vip_owner());

-- Policies for vip_supported_systems
CREATE POLICY "VIP Owner select systems" ON public.vip_supported_systems
  FOR SELECT TO authenticated USING (public.is_vip_owner());

-- Policies for vip_operation_history
CREATE POLICY "VIP Owner select history" ON public.vip_operation_history
  FOR SELECT TO authenticated USING (public.is_vip_owner());

CREATE POLICY "VIP Owner insert history" ON public.vip_operation_history
  FOR INSERT TO authenticated WITH CHECK (public.is_vip_owner());

-- Policies for vip_audit_logs
CREATE POLICY "VIP Owner select audit" ON public.vip_audit_logs
  FOR SELECT TO authenticated USING (public.is_vip_owner());

-- 9. RPC Functions: Server-side Owner Verification
CREATE OR REPLACE FUNCTION public.vip_verify_owner_session()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean := false;
  v_config record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'is_authorized', false,
      'reason', 'no_active_session'
    );
  END IF;

  v_is_owner := public.is_vip_owner();

  IF NOT v_is_owner THEN
    -- Record unauthorized access attempt in audit log
    INSERT INTO public.vip_audit_logs (event_type, user_id, details)
    VALUES ('unauthorized_vip_access_attempt', v_uid, jsonb_build_object('time', now()));

    RETURN jsonb_build_object(
      'is_authorized', false,
      'reason', 'not_authorized_owner'
    );
  END IF;

  SELECT * INTO v_config FROM public.vip_owner_config WHERE id = 'default';

  RETURN jsonb_build_object(
    'is_authorized', true,
    'user_id', v_uid,
    'is_verified_owner', COALESCE(v_config.is_verified, false),
    'verified_at', v_config.verified_at,
    'owner_account_identifier', v_config.owner_account_identifier,
    'individual_account_identifier', v_config.individual_account_identifier,
    'relationship_status', v_config.relationship_status
  );
END;
$function$;

-- 10. RPC Function: vip_get_dashboard_data()
CREATE OR REPLACE FUNCTION public.vip_get_dashboard_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_config jsonb;
  v_automation jsonb;
  v_systems jsonb;
  v_recent_ops jsonb;
BEGIN
  IF NOT public.is_vip_owner() THEN
    RAISE EXCEPTION 'Unauthorized: VIP Owner access required.';
  END IF;

  SELECT to_jsonb(c) INTO v_config FROM public.vip_owner_config c WHERE id = 'default';
  SELECT to_jsonb(a) INTO v_automation FROM public.vip_automation_settings a WHERE id = 'default';
  SELECT jsonb_agg(to_jsonb(s) ORDER BY s.display_name) INTO v_systems FROM public.vip_supported_systems s WHERE is_active = true;
  SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb) INTO v_recent_ops
  FROM (
    SELECT * FROM public.vip_operation_history
    ORDER BY created_at DESC
    LIMIT 10
  ) o;

  RETURN jsonb_build_object(
    'success', true,
    'config', v_config,
    'automation', v_automation,
    'supported_systems', COALESCE(v_systems, '[]'::jsonb),
    'recent_operations', v_recent_ops,
    'server_time', now()
  );
END;
$function$;

-- 11. RPC Function: vip_save_account_setup
CREATE OR REPLACE FUNCTION public.vip_save_account_setup(
  p_owner_identifier text,
  p_individual_identifier text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_clean_owner text := NULLIF(TRIM(p_owner_identifier), '');
  v_clean_individual text := NULLIF(TRIM(p_individual_identifier), '');
BEGIN
  IF NOT public.is_vip_owner() THEN
    RAISE EXCEPTION 'Unauthorized: VIP Owner access required.';
  END IF;

  UPDATE public.vip_owner_config
  SET
    owner_account_identifier = v_clean_owner,
    owner_account_status = CASE 
      WHEN v_clean_owner IS NOT NULL THEN 'pending_verification'
      ELSE 'not_connected'
    END,
    individual_account_identifier = v_clean_individual,
    individual_account_status = CASE 
      WHEN v_clean_individual IS NOT NULL THEN 'pending_verification'
      ELSE 'not_connected'
    END,
    relationship_verified = false,
    relationship_status = 'unverified',
    updated_at = now()
  WHERE id = 'default';

  INSERT INTO public.vip_audit_logs (event_type, user_id, details)
  VALUES (
    'vip_accounts_configured',
    auth.uid(),
    jsonb_build_object(
      'owner_set', (v_clean_owner IS NOT NULL),
      'individual_set', (v_clean_individual IS NOT NULL)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'owner_identifier', v_clean_owner,
    'individual_identifier', v_clean_individual
  );
END;
$function$;

-- 12. RPC Function: vip_submit_manual_operation
CREATE OR REPLACE FUNCTION public.vip_submit_manual_operation(
  p_operation_type text,
  p_requested_action text,
  p_plan_id text DEFAULT NULL,
  p_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_config record;
  v_op_id uuid;
BEGIN
  IF NOT public.is_vip_owner() THEN
    RAISE EXCEPTION 'Unauthorized: VIP Owner access required.';
  END IF;

  SELECT * INTO v_config FROM public.vip_owner_config WHERE id = 'default';

  -- PHASE 1 SAFETY RULE:
  -- Operations are created in 'pending_integration' state.
  -- No real carrier mutations take place until integration phase.
  INSERT INTO public.vip_operation_history (
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
    p_operation_type,
    v_config.owner_account_identifier,
    v_config.individual_account_identifier,
    p_requested_action,
    p_plan_id,
    p_amount,
    'pending_integration',
    now(),
    jsonb_build_object(
      'phase', 'phase_1',
      'note', 'العملية مسجلة في سجل النظام وبانتظار اكتمال ربط سكريبت مشغل الاتصالات بالمرحلة القادمة.'
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
      'operation_type', p_operation_type,
      'requested_action', p_requested_action
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'operation_id', v_op_id,
    'status', 'pending_integration',
    'message', 'تم تسجيل طلب العملية بنجاح في سجل العمليات وبانتظار تفعيل الربط المباشر مع مزود الخدمة.'
  );
END;
$function$;

-- 13. RPC Function: vip_update_automation_settings
CREATE OR REPLACE FUNCTION public.vip_update_automation_settings(
  p_enabled boolean,
  p_target_balance integer,
  p_custom_balance integer DEFAULT NULL,
  p_action text DEFAULT 'save'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_state text;
BEGIN
  IF NOT public.is_vip_owner() THEN
    RAISE EXCEPTION 'Unauthorized: VIP Owner access required.';
  END IF;

  -- PHASE 1 SAFETY RULE:
  -- Even if user toggles enabled, real automation remains stopped until integration.
  v_state := CASE 
    WHEN p_action = 'stop' THEN 'stopped'
    WHEN p_action = 'pause' THEN 'paused'
    WHEN p_enabled IS TRUE THEN 'awaiting_integration'
    ELSE 'stopped'
  END;

  UPDATE public.vip_automation_settings
  SET
    automation_enabled = p_enabled,
    operation_state = v_state,
    target_mix_balance = p_target_balance,
    custom_target_balance = p_custom_balance,
    updated_at = now()
  WHERE id = 'default';

  INSERT INTO public.vip_audit_logs (event_type, user_id, details)
  VALUES (
    'vip_automation_settings_updated',
    auth.uid(),
    jsonb_build_object(
      'enabled', p_enabled,
      'target_balance', p_target_balance,
      'state', v_state
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'automation_enabled', p_enabled,
    'operation_state', v_state,
    'target_balance', p_target_balance
  );
END;
$function$;

-- 14. Grants
GRANT EXECUTE ON FUNCTION public.is_vip_owner() TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.vip_verify_owner_session() TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.vip_get_dashboard_data() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vip_save_account_setup(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vip_submit_manual_operation(text, text, text, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vip_update_automation_settings(boolean, integer, integer, text) TO authenticated, service_role;

-- 15. Reload PostgREST Schema Cache
NOTIFY pgrst, 'reload schema';
