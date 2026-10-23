-- Migration: VIP User Audit, Registered Users Search, and Session Edit
-- 1. Function to update session credentials safely
CREATE OR REPLACE FUNCTION public.vip_update_session_credentials(
  p_session_id text,
  p_owner_email text DEFAULT NULL,
  p_owner_password text DEFAULT NULL,
  p_individual_email text DEFAULT NULL,
  p_individual_password text DEFAULT NULL,
  p_dial_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session record;
BEGIN
  SELECT * INTO v_session FROM public.vip_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'الجلسة غير موجودة');
  END IF;

  UPDATE public.vip_sessions
  SET
    owner_email = COALESCE(NULLIF(TRIM(p_owner_email), ''), owner_email),
    owner_account_identifier = COALESCE(NULLIF(TRIM(p_dial_number), ''), owner_account_identifier),
    owner_password_enc = CASE 
      WHEN p_owner_password IS NOT NULL AND p_owner_password <> '' THEN encode(p_owner_password::bytea, 'base64') 
      ELSE owner_password_enc 
    END,
    individual_email = COALESCE(NULLIF(TRIM(p_individual_email), ''), individual_email),
    individual_password_enc = CASE 
      WHEN p_individual_password IS NOT NULL AND p_individual_password <> '' THEN encode(p_individual_password::bytea, 'base64') 
      ELSE individual_password_enc 
    END,
    updated_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true, 'message', 'تم تحديث بيانات الاعتماد للجلسة بنجاح');
END;
$$;

GRANT EXECUTE ON FUNCTION public.vip_update_session_credentials(text, text, text, text, text, text) TO authenticated, service_role, anon;

-- 2. Function to search registered app users for VIP delegation
CREATE OR REPLACE FUNCTION public.vip_search_registered_users(p_search text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res jsonb;
  v_clean text := TRIM(COALESCE(p_search, ''));
BEGIN
  SELECT jsonb_agg(sub) INTO v_res
  FROM (
    SELECT 
      p.id,
      p.email,
      p.phone,
      p.full_name,
      p.username,
      p.role,
      p.is_active,
      p.created_at,
      EXISTS(SELECT 1 FROM public.vip_delegated_users v WHERE v.user_id = p.id AND v.is_active = true) as is_already_delegated
    FROM public.profiles p
    WHERE 
      v_clean = '' 
      OR p.email ILIKE '%' || v_clean || '%'
      OR p.phone ILIKE '%' || v_clean || '%'
      OR p.full_name ILIKE '%' || v_clean || '%'
      OR p.username ILIKE '%' || v_clean || '%'
    ORDER BY p.created_at DESC
    LIMIT 30
  ) sub;

  RETURN COALESCE(v_res, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.vip_search_registered_users(text) TO authenticated, service_role, anon;

-- 3. Comprehensive user audit detail fetcher
CREATE OR REPLACE FUNCTION public.vip_get_user_audit_full(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile jsonb;
  v_delegation jsonb;
  v_sessions jsonb;
  v_logs jsonb;
  v_stats jsonb;
  v_total_ops integer := 0;
  v_success_ops integer := 0;
  v_failed_ops integer := 0;
BEGIN
  -- Profile
  SELECT to_jsonb(p) INTO v_profile FROM public.profiles p WHERE p.id = p_user_id;
  
  -- Delegation
  SELECT to_jsonb(v) INTO v_delegation FROM public.vip_delegated_users v WHERE v.user_id = p_user_id;

  -- Sessions associated (or all active if user is executing them)
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'session_name', s.session_name,
      'dial_number', s.owner_account_identifier,
      'owner_email', s.owner_email,
      'owner_password_revealed', CASE 
        WHEN s.owner_password_enc IS NOT NULL AND s.owner_password_enc <> '' 
        THEN convert_from(decode(s.owner_password_enc, 'base64'), 'UTF8') 
        ELSE NULL 
      END,
      'individual_email', s.individual_email,
      'individual_password_revealed', CASE 
        WHEN s.individual_password_enc IS NOT NULL AND s.individual_password_enc <> '' 
        THEN convert_from(decode(s.individual_password_enc, 'base64'), 'UTF8') 
        ELSE NULL 
      END,
      'operation_state', s.operation_state,
      'worker_status', s.worker_status,
      'current_cycle', s.current_cycle,
      'target_mix_balance', s.target_mix_balance,
      'is_active', s.is_active,
      'created_at', s.created_at,
      'updated_at', s.updated_at
    )
  ) INTO v_sessions
  FROM public.vip_sessions s
  WHERE s.is_active = true;

  -- Logs
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'success'),
    COUNT(*) FILTER (WHERE status = 'failed' OR status = 'limit_reached' OR status = 'cooldown_blocked')
  INTO v_total_ops, v_success_ops, v_failed_ops
  FROM public.vip_execution_logs
  WHERE user_id = p_user_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', l.id,
      'action_type', l.action_type,
      'status', l.status,
      'owner_phone', l.owner_phone,
      'child_phone', l.child_phone,
      'mixes_requested', l.mixes_requested,
      'client_summary', l.client_summary,
      'error_reason', l.error_reason,
      'execution_time_ms', l.execution_time_ms,
      'created_at', l.created_at
    )
  ) INTO v_logs
  FROM (
    SELECT * FROM public.vip_execution_logs 
    WHERE user_id = p_user_id 
    ORDER BY created_at DESC 
    LIMIT 100
  ) l;

  v_stats := jsonb_build_object(
    'total_ops', v_total_ops,
    'success_ops', v_success_ops,
    'failed_ops', v_failed_ops,
    'success_rate', CASE WHEN v_total_ops > 0 THEN ROUND((v_success_ops::numeric / v_total_ops::numeric) * 100, 1) ELSE 100 END
  );

  RETURN jsonb_build_object(
    'profile', COALESCE(v_profile, '{}'::jsonb),
    'delegation', COALESCE(v_delegation, '{}'::jsonb),
    'sessions', COALESCE(v_sessions, '[]'::jsonb),
    'logs', COALESCE(v_logs, '[]'::jsonb),
    'stats', v_stats
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.vip_get_user_audit_full(uuid) TO authenticated, service_role, anon;
