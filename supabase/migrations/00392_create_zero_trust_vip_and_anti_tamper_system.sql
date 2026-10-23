-- 1. جدول المستخدمين المفوضين لقسم VIP
CREATE TABLE IF NOT EXISTS public.vip_delegated_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  user_email text,
  user_name text,
  is_active boolean NOT NULL DEFAULT true,
  max_daily_cycles integer NOT NULL DEFAULT 10,
  cycle_count_today integer NOT NULL DEFAULT 0,
  min_cooldown_seconds integer NOT NULL DEFAULT 60,
  last_cycle_at timestamptz,
  assigned_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. جدول سجلات تنفيذ العمليات لـ VIP
CREATE TABLE IF NOT EXISTS public.vip_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text,
  session_id text,
  action_type text NOT NULL DEFAULT 'cycle',
  status text NOT NULL DEFAULT 'success',
  owner_phone text,
  child_phone text,
  mixes_requested integer DEFAULT 50000,
  client_summary text,
  owner_technical_details jsonb,
  execution_time_ms integer DEFAULT 0,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. جدول أحداث كشف التلاعب والحظر التلقائي
CREATE TABLE IF NOT EXISTS public.security_tamper_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  device_id text,
  event_type text NOT NULL,
  details text,
  action_taken text NOT NULL DEFAULT 'device_banned_and_vip_revoked',
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vip_delegated_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_tamper_events ENABLE ROW LEVEL SECURITY;

-- Helper function: is_owner_or_admin
CREATE OR REPLACE FUNCTION public.is_app_owner_or_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT (
    coalesce(auth.jwt() ->> 'email', '') = 'nader77@miaoda.com'
    OR coalesce(auth.jwt() ->> 'email', '') LIKE '%nader%'
    OR coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'admin'
  );
$$;

-- RLS Policies for vip_delegated_users
DROP POLICY IF EXISTS "owner_all_vip_delegated_users" ON public.vip_delegated_users;
CREATE POLICY "owner_all_vip_delegated_users"
  ON public.vip_delegated_users
  FOR ALL
  TO authenticated
  USING (public.is_app_owner_or_admin())
  WITH CHECK (public.is_app_owner_or_admin());

DROP POLICY IF EXISTS "user_view_own_delegation" ON public.vip_delegated_users;
CREATE POLICY "user_view_own_delegation"
  ON public.vip_delegated_users
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for vip_execution_logs
DROP POLICY IF EXISTS "owner_all_vip_execution_logs" ON public.vip_execution_logs;
CREATE POLICY "owner_all_vip_execution_logs"
  ON public.vip_execution_logs
  FOR ALL
  TO authenticated
  USING (public.is_app_owner_or_admin())
  WITH CHECK (public.is_app_owner_or_admin());

DROP POLICY IF EXISTS "user_insert_own_log" ON public.vip_execution_logs;
CREATE POLICY "user_insert_own_log"
  ON public.vip_execution_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_select_own_log" ON public.vip_execution_logs;
CREATE POLICY "user_select_own_log"
  ON public.vip_execution_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for security_tamper_events
DROP POLICY IF EXISTS "owner_all_tamper_events" ON public.security_tamper_events;
CREATE POLICY "owner_all_tamper_events"
  ON public.security_tamper_events
  FOR ALL
  TO authenticated
  USING (public.is_app_owner_or_admin())
  WITH CHECK (public.is_app_owner_or_admin());

DROP POLICY IF EXISTS "allow_insert_tamper_event" ON public.security_tamper_events;
CREATE POLICY "allow_insert_tamper_event"
  ON public.security_tamper_events
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

-- 4. RPC: check_vip_access_server
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

  -- Check Cooldown
  IF v_delegation.last_cycle_at IS NOT NULL THEN
    v_seconds_since_last := EXTRACT(EPOCH FROM (now() - v_delegation.last_cycle_at))::integer;
    IF v_seconds_since_last < v_delegation.min_cooldown_seconds THEN
      v_cooldown_remaining := v_delegation.min_cooldown_seconds - v_seconds_since_last;
      v_can_execute := false;
      v_block_reason := 'cooldown_active';
    END IF;
  END IF;

  -- Check Daily Cycles Limit
  IF v_delegation.cycle_count_today >= v_delegation.max_daily_cycles THEN
    v_can_execute := false;
    v_block_reason := 'daily_limit_reached';
  END IF;

  RETURN jsonb_build_object(
    'is_owner', false,
    'is_delegated', true,
    'can_execute', v_can_execute,
    'block_reason', v_block_reason,
    'max_daily_cycles', v_delegation.max_daily_cycles,
    'cycle_count_today', v_delegation.cycle_count_today,
    'cycles_remaining', GREATEST(0, v_delegation.max_daily_cycles - v_delegation.cycle_count_today),
    'min_cooldown_seconds', v_delegation.min_cooldown_seconds,
    'cooldown_remaining', v_cooldown_remaining,
    'last_cycle_at', v_delegation.last_cycle_at,
    'user_email', v_delegation.user_email
  );
END;
$$;

-- 5. RPC: record_vip_cycle_server (Zero-Trust Validation)
CREATE OR REPLACE FUNCTION public.record_vip_cycle_server(
  p_user_id uuid,
  p_session_id text,
  p_owner_phone text,
  p_child_phone text,
  p_mixes integer,
  p_status text,
  p_client_summary text,
  p_owner_details jsonb,
  p_duration_ms integer
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
BEGIN
  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;
  v_is_owner := (v_user_email = 'nader77@miaoda.com' OR v_user_email LIKE '%nader%');

  -- If not owner, strictly enforce delegation limits on server
  IF NOT v_is_owner THEN
    SELECT * INTO v_delegation FROM public.vip_delegated_users WHERE user_id = p_user_id;
    
    IF NOT FOUND OR v_delegation.is_active IS NOT TRUE THEN
      -- Log tamper/unauthorized attempt
      INSERT INTO public.security_tamper_events (user_id, user_email, event_type, details, action_taken)
      VALUES (p_user_id, v_user_email, 'unauthorized_vip_execution_attempt', 'حساب غير مفوض حاول تشغيل اسكربت VIP', 'access_denied');
      
      RAISE EXCEPTION 'غير مصرح لك بتشغيل دورات VIP';
    END IF;

    -- Enforce Cooldown Server-Side
    IF v_delegation.last_cycle_at IS NOT NULL THEN
      v_seconds_since_last := EXTRACT(EPOCH FROM (now() - v_delegation.last_cycle_at))::integer;
      IF v_seconds_since_last < v_delegation.min_cooldown_seconds THEN
        -- Potential cooldown bypass attempt
        INSERT INTO public.security_tamper_events (user_id, user_email, event_type, details, action_taken)
        VALUES (p_user_id, v_user_email, 'cooldown_bypass_attempt', format('محاولة تجاوز الفاصل الزمني: متبقي %s ثانية', v_delegation.min_cooldown_seconds - v_seconds_since_last), 'request_rejected');
        
        RAISE EXCEPTION 'يرجى الانتظار، الفاصل الزمني الإجباري لم ينتهِ بعد';
      END IF;
    END IF;

    -- Enforce Daily Limit Server-Side
    IF v_delegation.cycle_count_today >= v_delegation.max_daily_cycles THEN
      RAISE EXCEPTION 'لقد استنفدت الحد اليومي المخصص لك من الدورات. تواصل مع المالك لزيادة الحصة';
    END IF;

    -- Update delegation counters
    UPDATE public.vip_delegated_users
    SET cycle_count_today = cycle_count_today + 1,
        last_cycle_at = now(),
        updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  -- Record Execution Log
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
    execution_time_ms
  ) VALUES (
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
    p_duration_ms
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', p_status,
    'message', 'تم تسجيل العملية بنجاح في السيرفر'
  );
END;
$$;

-- 6. RPC: report_and_ban_tamper
CREATE OR REPLACE FUNCTION public.report_and_ban_tamper(
  p_user_id uuid,
  p_device_id text,
  p_event_type text,
  p_details text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_email text;
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;
    -- Revoke VIP delegation
    UPDATE public.vip_delegated_users SET is_active = false WHERE user_id = p_user_id;
  END IF;

  -- Add to security tamper log
  INSERT INTO public.security_tamper_events (
    user_id,
    user_email,
    device_id,
    event_type,
    details,
    action_taken
  ) VALUES (
    p_user_id,
    v_user_email,
    p_device_id,
    p_event_type,
    p_details,
    'auto_banned_and_vip_revoked'
  );

  -- Ban device if device_id provided
  IF p_device_id IS NOT NULL AND length(p_device_id) > 2 THEN
    INSERT INTO public.device_bans (device_id, reason, banned_at)
    VALUES (p_device_id, format('حظر أمني تلقائي من السيرفر: %s', p_event_type), now())
    ON CONFLICT (device_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', true, 'action', 'banned_and_revoked');
END;
$$;