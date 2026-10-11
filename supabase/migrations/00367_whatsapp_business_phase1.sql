-- Migration: whatsapp_business_phase1
-- Phase 1 WhatsApp Business Cloud API Integration Tables, RLS, and Idempotency RPCs

-- Dedicated unambiguous admin check helper
CREATE OR REPLACE FUNCTION public.is_current_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (SELECT true FROM public.core_profiles WHERE id = auth.uid() AND role::text IN ('admin', 'super_admin') LIMIT 1),
    (SELECT true FROM public.profiles WHERE id = auth.uid() AND role::text IN ('admin', 'super_admin') LIMIT 1),
    false
  );
$$;

-- 1. Configuration Table (Public non-sensitive metadata only)
CREATE TABLE IF NOT EXISTS public.whatsapp_business_config (
  id text PRIMARY KEY DEFAULT 'default',
  meta_app_id text,
  waba_id text,
  phone_number_id text,
  display_phone_number text,
  graph_api_version text NOT NULL DEFAULT 'v20.0',
  access_token_configured boolean NOT NULL DEFAULT false,
  app_secret_configured boolean NOT NULL DEFAULT false,
  webhook_verify_token_configured boolean NOT NULL DEFAULT false,
  webhook_url text,
  webhook_verified boolean NOT NULL DEFAULT false,
  webhook_subscribed boolean NOT NULL DEFAULT false,
  last_connection_test_at timestamptz,
  last_connection_status text DEFAULT 'untested',
  connection_details jsonb DEFAULT '{}'::jsonb,
  last_reachability_test_at timestamptz,
  last_reachability_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Server-Only Secrets Table (Never accessible by anon or client authenticated)
CREATE TABLE IF NOT EXISTS public.whatsapp_business_secrets (
  id text PRIMARY KEY DEFAULT 'default',
  access_token text,
  app_secret text,
  webhook_verify_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Messages Log Table
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_phone text NOT NULL,
  message_type text NOT NULL DEFAULT 'text',
  template_name text,
  template_language text DEFAULT 'ar',
  template_variables jsonb DEFAULT '[]'::jsonb,
  body_text text,
  status text NOT NULL DEFAULT 'queued',
  wamid text UNIQUE,
  meta_response jsonb DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  attempt_count integer NOT NULL DEFAULT 1,
  source text NOT NULL DEFAULT 'admin_test',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  send_attempt_at timestamptz,
  accepted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Message Status History Table
CREATE TABLE IF NOT EXISTS public.whatsapp_message_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.whatsapp_messages(id) ON DELETE CASCADE,
  wamid text,
  status text NOT NULL,
  raw_event jsonb,
  event_timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Webhook Events Log Table (with idempotency event_id)
CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  signature_valid boolean NOT NULL DEFAULT false,
  processing_status text NOT NULL DEFAULT 'pending',
  processing_result text,
  attempt_count integer NOT NULL DEFAULT 1,
  error_details text,
  payload jsonb NOT NULL,
  wamid text,
  recipient_or_sender text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON public.whatsapp_messages(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_recipient ON public.whatsapp_messages(recipient_phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON public.whatsapp_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_wamid ON public.whatsapp_messages(wamid);
CREATE INDEX IF NOT EXISTS idx_whatsapp_history_wamid ON public.whatsapp_message_status_history(wamid);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_status ON public.whatsapp_webhook_events(processing_status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_wamid ON public.whatsapp_webhook_events(wamid);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_received ON public.whatsapp_webhook_events(received_at DESC);

-- Enable RLS
ALTER TABLE public.whatsapp_business_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_business_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_message_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "service_role_all_whatsapp_secrets" ON public.whatsapp_business_secrets;
CREATE POLICY "service_role_all_whatsapp_secrets" ON public.whatsapp_business_secrets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_read_whatsapp_config" ON public.whatsapp_business_config;
CREATE POLICY "admin_read_whatsapp_config" ON public.whatsapp_business_config
  FOR SELECT TO authenticated USING (public.is_current_admin());

DROP POLICY IF EXISTS "admin_write_whatsapp_config" ON public.whatsapp_business_config;
CREATE POLICY "admin_write_whatsapp_config" ON public.whatsapp_business_config
  FOR ALL TO authenticated USING (public.is_current_admin()) WITH CHECK (public.is_current_admin());

DROP POLICY IF EXISTS "service_role_whatsapp_config" ON public.whatsapp_business_config;
CREATE POLICY "service_role_whatsapp_config" ON public.whatsapp_business_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_read_whatsapp_messages" ON public.whatsapp_messages;
CREATE POLICY "admin_read_whatsapp_messages" ON public.whatsapp_messages
  FOR SELECT TO authenticated USING (public.is_current_admin());

DROP POLICY IF EXISTS "admin_write_whatsapp_messages" ON public.whatsapp_messages;
CREATE POLICY "admin_write_whatsapp_messages" ON public.whatsapp_messages
  FOR ALL TO authenticated USING (public.is_current_admin()) WITH CHECK (public.is_current_admin());

DROP POLICY IF EXISTS "service_role_whatsapp_messages" ON public.whatsapp_messages;
CREATE POLICY "service_role_whatsapp_messages" ON public.whatsapp_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_read_whatsapp_history" ON public.whatsapp_message_status_history;
CREATE POLICY "admin_read_whatsapp_history" ON public.whatsapp_message_status_history
  FOR SELECT TO authenticated USING (public.is_current_admin());

DROP POLICY IF EXISTS "service_role_whatsapp_history" ON public.whatsapp_message_status_history;
CREATE POLICY "service_role_whatsapp_history" ON public.whatsapp_message_status_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_read_whatsapp_webhook_events" ON public.whatsapp_webhook_events;
CREATE POLICY "admin_read_whatsapp_webhook_events" ON public.whatsapp_webhook_events
  FOR SELECT TO authenticated USING (public.is_current_admin());

DROP POLICY IF EXISTS "service_role_whatsapp_webhook_events" ON public.whatsapp_webhook_events;
CREATE POLICY "service_role_whatsapp_webhook_events" ON public.whatsapp_webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Default row
INSERT INTO public.whatsapp_business_config (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- RPC: Securely save config and secrets
CREATE OR REPLACE FUNCTION public.whatsapp_save_config_and_secrets(
  p_meta_app_id text DEFAULT NULL,
  p_waba_id text DEFAULT NULL,
  p_phone_number_id text DEFAULT NULL,
  p_display_phone text DEFAULT NULL,
  p_graph_api_version text DEFAULT 'v20.0',
  p_access_token text DEFAULT NULL,
  p_app_secret text DEFAULT NULL,
  p_webhook_verify_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_access_token boolean;
  v_has_app_secret boolean;
  v_has_verify_token boolean;
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required.';
  END IF;

  INSERT INTO public.whatsapp_business_secrets (id, access_token, app_secret, webhook_verify_token, updated_at)
  VALUES ('default', p_access_token, p_app_secret, p_webhook_verify_token, now())
  ON CONFLICT (id) DO UPDATE SET
    access_token = CASE WHEN p_access_token IS NOT NULL AND p_access_token <> '' THEN p_access_token ELSE whatsapp_business_secrets.access_token END,
    app_secret = CASE WHEN p_app_secret IS NOT NULL AND p_app_secret <> '' THEN p_app_secret ELSE whatsapp_business_secrets.app_secret END,
    webhook_verify_token = CASE WHEN p_webhook_verify_token IS NOT NULL AND p_webhook_verify_token <> '' THEN p_webhook_verify_token ELSE whatsapp_business_secrets.webhook_verify_token END,
    updated_at = now();

  SELECT 
    (access_token IS NOT NULL AND access_token <> ''),
    (app_secret IS NOT NULL AND app_secret <> ''),
    (webhook_verify_token IS NOT NULL AND webhook_verify_token <> '')
  INTO v_has_access_token, v_has_app_secret, v_has_verify_token
  FROM public.whatsapp_business_secrets
  WHERE id = 'default';

  UPDATE public.whatsapp_business_config
  SET
    meta_app_id = COALESCE(p_meta_app_id, meta_app_id),
    waba_id = COALESCE(p_waba_id, waba_id),
    phone_number_id = COALESCE(p_phone_number_id, phone_number_id),
    display_phone_number = COALESCE(p_display_phone, display_phone_number),
    graph_api_version = COALESCE(NULLIF(p_graph_api_version, ''), 'v20.0'),
    access_token_configured = COALESCE(v_has_access_token, false),
    app_secret_configured = COALESCE(v_has_app_secret, false),
    webhook_verify_token_configured = COALESCE(v_has_verify_token, false),
    updated_at = now()
  WHERE id = 'default';

  RETURN jsonb_build_object(
    'success', true,
    'access_token_configured', v_has_access_token,
    'app_secret_configured', v_has_app_secret,
    'webhook_verify_token_configured', v_has_verify_token
  );
END;
$$;

-- RPC: Update message status idempotently
CREATE OR REPLACE FUNCTION public.whatsapp_update_message_status_idempotent(
  p_wamid text,
  p_new_status text,
  p_event_timestamp timestamptz DEFAULT now(),
  p_raw_event jsonb DEFAULT '{}'::jsonb,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg_id uuid;
  v_current_status text;
  v_current_priority integer := 0;
  v_new_priority integer := 0;
  v_should_update boolean := false;
BEGIN
  SELECT id, status INTO v_msg_id, v_current_status
  FROM public.whatsapp_messages
  WHERE wamid = p_wamid;

  IF v_msg_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'message_not_found', 'wamid', p_wamid);
  END IF;

  v_current_priority := CASE v_current_status
    WHEN 'queued' THEN 1
    WHEN 'sending' THEN 2
    WHEN 'accepted' THEN 3
    WHEN 'sent' THEN 4
    WHEN 'delivered' THEN 5
    WHEN 'read' THEN 6
    WHEN 'failed' THEN 7
    ELSE 0
  END;

  v_new_priority := CASE p_new_status
    WHEN 'queued' THEN 1
    WHEN 'sending' THEN 2
    WHEN 'accepted' THEN 3
    WHEN 'sent' THEN 4
    WHEN 'delivered' THEN 5
    WHEN 'read' THEN 6
    WHEN 'failed' THEN 7
    ELSE 0
  END;

  INSERT INTO public.whatsapp_message_status_history (
    message_id, wamid, status, raw_event, event_timestamp
  ) VALUES (
    v_msg_id, p_wamid, p_new_status, p_raw_event, COALESCE(p_event_timestamp, now())
  );

  IF p_new_status = 'failed' THEN
    v_should_update := (v_current_status != 'read');
  ELSIF v_new_priority >= v_current_priority THEN
    v_should_update := true;
  END IF;

  IF v_should_update THEN
    UPDATE public.whatsapp_messages
    SET
      status = p_new_status,
      sent_at = CASE WHEN p_new_status = 'sent' AND sent_at IS NULL THEN COALESCE(p_event_timestamp, now()) ELSE sent_at END,
      delivered_at = CASE WHEN p_new_status = 'delivered' AND delivered_at IS NULL THEN COALESCE(p_event_timestamp, now()) ELSE delivered_at END,
      read_at = CASE WHEN p_new_status = 'read' AND read_at IS NULL THEN COALESCE(p_event_timestamp, now()) ELSE read_at END,
      failed_at = CASE WHEN p_new_status = 'failed' AND failed_at IS NULL THEN COALESCE(p_event_timestamp, now()) ELSE failed_at END,
      error_code = COALESCE(p_error_code, error_code),
      error_message = COALESCE(p_error_message, error_message),
      updated_at = now()
    WHERE id = v_msg_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message_id', v_msg_id,
    'updated_status', v_should_update,
    'final_status', CASE WHEN v_should_update THEN p_new_status ELSE v_current_status END
  );
END;
$$;
