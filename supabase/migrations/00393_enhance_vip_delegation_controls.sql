-- Migration: Enhance VIP Delegation Controls & Strict Zero-Trust Verification

-- 1. Add extra control columns to vip_delegated_users
ALTER TABLE public.vip_delegated_users
  ADD COLUMN IF NOT EXISTS max_daily_mixes integer NOT NULL DEFAULT 500000,
  ADD COLUMN IF NOT EXISTS mixes_consumed_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allowed_packages jsonb NOT NULL DEFAULT '[50000, 200000]'::jsonb,
  ADD COLUMN IF NOT EXISTS allow_custom_amount boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_concurrent_sessions integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cooldown_seconds integer NOT NULL DEFAULT 60;

-- 2. Add error_reason to vip_execution_logs
ALTER TABLE public.vip_execution_logs
  ADD COLUMN IF NOT EXISTS error_reason text;

-- 3. Update check_vip_access_server
CREATE OR REPLACE FUNCTION public.check_vip_access_server(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_owner boolean;
  v_user_email text;
  v_delegation record;
  v_seconds_since_last integer;
  v_cooldown_remaining integer := 0;
  v_can_execute boolean := true;
  v_block_reason text := null;
  v_cd_target integer;
BEGIN
  -- Get user email
  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;

  -- Check if owner
  IF v_user_email = 'nader77@miaoda.com' OR v_user_email LIKE '%nader%' THEN
    RETURN jsonb_build_object(
      'is_owner', true,
      'is_delegated', true,
      'can_execute', true,
      'max_daily_cycles', 99999,
      'cycle_count_today', 0,
      'cycles_remaining', 99999,
      'max_daily_mixes', 99999999,
      'mixes_consumed_today', 0,
      'mixes_remaining', 99999999,
      'allowed_packages', jsonb_build_array(50000, 100000, 200000, 300000),
      'allow_custom_amount', true,
      'max_concurrent_sessions', 10,
      'cooldown_seconds', 0,
      'min_cooldown_seconds', 0,
      'cooldown_remaining', 0,
      'user_email', v_user_email
    );
  END IF;

  -- Check delegated table
  SELECT * INTO v_delegation FROM public.vip_delegated_users WHERE user_id = p_user_id;

  IF NOT FOUND OR v_delegation.is_active IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'is_owner', false,
      'is_delegated', false,
      'can_execute', false,
      'block_reason', 'not_authorized',
      'user_email', v_user_email
    );
  END IF;

  v_cd_target := COALESCE(v_delegation.cooldown_seconds, v_delegation.min_cooldown_seconds, 60);

  -- Check Cooldown
  IF v_delegation.last_cycle_at IS NOT NULL THEN
    v_seconds_since_last := EXTRACT(EPOCH FROM (now() - v_delegation.last_cycle_at))::integer;
    IF v_seconds_since_last < v_cd_target THEN
      v_cooldown_remaining := v_cd_target - v_seconds_since_last;
      v_can_execute := false;
      v_block_reason := 'cooldown_active';
    END IF;
  END IF;

  -- Check Daily Cycles Limit
  IF v_delegation.cycle_count_today >= v_delegation.max_daily_cycles THEN
    v_can_execute := false;
    v_block_reason := 'daily_limit_reached';
  END IF;

  -- Check Daily Mixes Limit
  IF v_delegation.mixes_consumed_today >= v_delegation.max_daily_mixes THEN
    v_can_execute := false;
    v_block_reason := 'daily_mixes_limit_reached';
  END IF;

  RETURN jsonb_build_object(
    'is_owner', false,
    'is_delegated', true,
    'can_execute', v_can_execute,
    'block_reason', v_block_reason,
    'max_daily_cycles', v_delegation.max_daily_cycles,
    'cycle_count_today', v_delegation.cycle_count_today,
    'cycles_remaining', GREATEST(0, v_delegation.max_daily_cycles - v_delegation.cycle_count_today),
    'max_daily_mixes', v_delegation.max_daily_mixes,
    'mixes_consumed_today', v_delegation.mixes_consumed_today,
    'mixes_remaining', GREATEST(0, v_delegation.max_daily_mixes - v_delegation.mixes_consumed_today),
    'allowed_packages', COALESCE(v_delegation.allowed_packages, '[50000, 200000]'::jsonb),
    'allow_custom_amount', COALESCE(v_delegation.allow_custom_amount, false),
    'max_concurrent_sessions', COALESCE(v_delegation.max_concurrent_sessions, 1),
    'cooldown_seconds', v_cd_target,
    'min_cooldown_seconds', v_cd_target,
    'cooldown_remaining', v_cooldown_remaining,
    'last_cycle_at', v_delegation.last_cycle_at,
    'user_email', v_delegation.user_email
  );
END;
$$;

-- 4. Update record_vip_cycle_server
CREATE OR REPLACE FUNCTION public.record_vip_cycle_server(
  p_user_id uuid,
  p_session_id text,
  p_owner_phone text,
  p_child_phone text,
  p_mixes integer,
  p_status text,
  p_client_summary text,
  p_owner_details jsonb,
  p_duration_ms integer,
  p_error_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_owner boolean;
  v_user_email text;
  v_delegation record;
  v_seconds_since_last integer;
  v_cd_target integer;
  v_is_pkg_allowed boolean := false;
  v_elem jsonb;
BEGIN
  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;
  v_is_owner := (v_user_email = 'nader77@miaoda.com' OR v_user_email LIKE '%nader%');

  -- If not owner, strictly enforce delegation limits on server
  IF NOT v_is_owner THEN
    SELECT * INTO v_delegation FROM public.vip_delegated_users WHERE user_id = p_user_id;
    
    IF NOT FOUND OR v_delegation.is_active IS NOT TRUE THEN
      INSERT INTO public.security_tamper_events (user_id, user_email, event_type, details, action_taken)
      VALUES (p_user_id, v_user_email, 'unauthorized_vip_execution_attempt', 'حساب غير مفوض حاول تشغيل دورة VIP', 'access_denied');
      RAISE EXCEPTION 'غير مصرح لك بتشغيل دورات VIP';
    END IF;

    -- Enforce Package restrictions
    IF v_delegation.allow_custom_amount IS NOT TRUE THEN
      FOR v_elem IN SELECT * FROM jsonb_array_elements(COALESCE(v_delegation.allowed_packages, '[50000, 200000]'::jsonb))
      LOOP
        IF (v_elem::text)::integer = p_mixes THEN
          v_is_pkg_allowed := true;
          EXIT;
        END IF;
      END LOOP;

      IF NOT v_is_pkg_allowed THEN
        INSERT INTO public.security_tamper_events (user_id, user_email, event_type, details, action_taken)
        VALUES (p_user_id, v_user_email, 'unauthorized_package_amount_attempt', 'محاولة إرسال حزمة ميكسات غير مصرح بها: ' || p_mixes, 'rejected');
        RAISE EXCEPTION 'قيمة الحزمة المحددة غير مصرح بها لحسابك';
      END IF;
    END IF;

    -- Enforce Cooldown Server-Side
    v_cd_target := COALESCE(v_delegation.cooldown_seconds, v_delegation.min_cooldown_seconds, 60);
    IF v_delegation.last_cycle_at IS NOT NULL THEN
      v_seconds_since_last := EXTRACT(EPOCH FROM (now() - v_delegation.last_cycle_at))::integer;
      IF v_seconds_since_last < v_cd_target THEN
        RAISE EXCEPTION 'يرجى الانتظار، فترة التهدئة الإجبارية نشطة (% ثانية متبقية)', (v_cd_target - v_seconds_since_last);
      END IF;
    END IF;

    -- Enforce Daily Limits
    IF v_delegation.cycle_count_today >= v_delegation.max_daily_cycles THEN
      RAISE EXCEPTION 'تجاوزت الحد الأقصى للدورات اليومية المسموح بها';
    END IF;

    IF (v_delegation.mixes_consumed_today + p_mixes) > v_delegation.max_daily_mixes THEN
      RAISE EXCEPTION 'تجاوزت الحد الأقصى للميكسات المسموح بها لهذا اليوم';
    END IF;

    -- Update delegation usage on server
    UPDATE public.vip_delegated_users
    SET
      cycle_count_today = cycle_count_today + 1,
      mixes_consumed_today = CASE WHEN p_status = 'success' THEN mixes_consumed_today + p_mixes ELSE mixes_consumed_today END,
      last_cycle_at = now(),
      updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  -- Log execution in database
  INSERT INTO public.vip_execution_logs (
    user_id,
    user_email,
    session_id,
    action_type,
    status,
    owner_phone,
    child_phone,
    mixes_requested,
    client_summary,
    owner_technical_details,
    execution_time_ms,
    error_reason
  )
  VALUES (
    p_user_id,
    v_user_email,
    p_session_id,
    'cycle',
    p_status,
    p_owner_phone,
    p_child_phone,
    p_mixes,
    p_client_summary,
    p_owner_details,
    p_duration_ms,
    p_error_reason
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', p_status,
    'recorded_at', now()
  );
END;
$$;

-- 5. RPC: get_vip_owner_analytics (Owner only)
CREATE OR REPLACE FUNCTION public.get_vip_owner_analytics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_email text;
  v_is_owner boolean;
  v_total_ops integer;
  v_success_ops integer;
  v_failed_ops integer;
  v_reasons_json jsonb;
  v_recent_logs jsonb;
  v_active_delegated_users integer;
BEGIN
  v_caller_email := coalesce(auth.jwt() ->> 'email', '');
  v_is_owner := (v_caller_email = 'nader77@miaoda.com' OR v_caller_email LIKE '%nader%' OR public.is_app_owner_or_admin());

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'غير مصرح لغير المالك بالاطلاع على تحليلات VIP';
  END IF;

  SELECT count(*) INTO v_total_ops FROM public.vip_execution_logs;
  SELECT count(*) INTO v_success_ops FROM public.vip_execution_logs WHERE status = 'success';
  SELECT count(*) INTO v_failed_ops FROM public.vip_execution_logs WHERE status != 'success';
  SELECT count(*) INTO v_active_delegated_users FROM public.vip_delegated_users WHERE is_active = true;

  -- Failure reasons breakdown
  SELECT jsonb_agg(sub) INTO v_reasons_json
  FROM (
    SELECT COALESCE(error_reason, 'فشل غير محدد') as reason, count(*) as count
    FROM public.vip_execution_logs
    WHERE status != 'success'
    GROUP BY COALESCE(error_reason, 'فشل غير محدد')
    ORDER BY count DESC
    LIMIT 10
  ) sub;

  -- Recent logs (last 30)
  SELECT jsonb_agg(l) INTO v_recent_logs
  FROM (
    SELECT id, user_id, user_email, session_id, status, mixes_requested, client_summary, error_reason, execution_time_ms, created_at
    FROM public.vip_execution_logs
    ORDER BY created_at DESC
    LIMIT 30
  ) l;

  RETURN jsonb_build_object(
    'total_ops', COALESCE(v_total_ops, 0),
    'success_ops', COALESCE(v_success_ops, 0),
    'failed_ops', COALESCE(v_failed_ops, 0),
    'active_delegated_users', COALESCE(v_active_delegated_users, 0),
    'failure_reasons', COALESCE(v_reasons_json, '[]'::jsonb),
    'recent_logs', COALESCE(v_recent_logs, '[]'::jsonb)
  );
END;
$$;
