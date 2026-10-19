-- 1. Create or replace whatsapp_save_admin_config function matching UI signature
CREATE OR REPLACE FUNCTION public.whatsapp_save_admin_config(
  p_meta_app_id text DEFAULT NULL::text,
  p_waba_id text DEFAULT NULL::text,
  p_phone_number_id text DEFAULT NULL::text,
  p_display_phone text DEFAULT NULL::text,
  p_graph_api_version text DEFAULT 'v20.0'::text,
  p_access_token text DEFAULT NULL::text,
  p_app_secret text DEFAULT NULL::text,
  p_webhook_verify_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_has_access_token boolean := false;
  v_has_app_secret boolean := false;
  v_has_verify_token boolean := false;
  v_graph_version text;
BEGIN
  -- Strict Admin and Service Role authorization check
  IF NOT (
    (auth.jwt() ->> 'role' = 'service_role') OR
    (public.is_current_admin()) OR
    (auth.uid() IS NULL AND current_user IN ('postgres', 'supabase_admin'))
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required.';
  END IF;

  v_graph_version := COALESCE(NULLIF(TRIM(p_graph_api_version), ''), 'v20.0');

  -- Upsert into whatsapp_business_secrets (id = 'default')
  -- Only update secret fields if new non-empty value provided
  INSERT INTO public.whatsapp_business_secrets (
    id,
    access_token,
    app_secret,
    webhook_verify_token,
    created_at,
    updated_at
  )
  VALUES (
    'default',
    NULLIF(TRIM(p_access_token), ''),
    NULLIF(TRIM(p_app_secret), ''),
    NULLIF(TRIM(p_webhook_verify_token), ''),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    access_token = CASE
      WHEN p_access_token IS NOT NULL AND TRIM(p_access_token) <> '' THEN TRIM(p_access_token)
      ELSE whatsapp_business_secrets.access_token
    END,
    app_secret = CASE
      WHEN p_app_secret IS NOT NULL AND TRIM(p_app_secret) <> '' THEN TRIM(p_app_secret)
      ELSE whatsapp_business_secrets.app_secret
    END,
    webhook_verify_token = CASE
      WHEN p_webhook_verify_token IS NOT NULL AND TRIM(p_webhook_verify_token) <> '' THEN TRIM(p_webhook_verify_token)
      ELSE whatsapp_business_secrets.webhook_verify_token
    END,
    updated_at = now();

  -- Evaluate secret configuration status without exposing values
  SELECT 
    (access_token IS NOT NULL AND TRIM(access_token) <> ''),
    (app_secret IS NOT NULL AND TRIM(app_secret) <> ''),
    (webhook_verify_token IS NOT NULL AND TRIM(webhook_verify_token) <> '')
  INTO v_has_access_token, v_has_app_secret, v_has_verify_token
  FROM public.whatsapp_business_secrets
  WHERE id = 'default';

  -- Upsert public.whatsapp_business_config metadata
  INSERT INTO public.whatsapp_business_config (
    id,
    meta_app_id,
    waba_id,
    phone_number_id,
    display_phone_number,
    graph_api_version,
    access_token_configured,
    app_secret_configured,
    webhook_verify_token_configured,
    created_at,
    updated_at
  )
  VALUES (
    'default',
    NULLIF(TRIM(p_meta_app_id), ''),
    NULLIF(TRIM(p_waba_id), ''),
    NULLIF(TRIM(p_phone_number_id), ''),
    NULLIF(TRIM(p_display_phone), ''),
    v_graph_version,
    COALESCE(v_has_access_token, false),
    COALESCE(v_has_app_secret, false),
    COALESCE(v_has_verify_token, false),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    meta_app_id = CASE
      WHEN p_meta_app_id IS NOT NULL THEN NULLIF(TRIM(p_meta_app_id), '')
      ELSE whatsapp_business_config.meta_app_id
    END,
    waba_id = CASE
      WHEN p_waba_id IS NOT NULL THEN NULLIF(TRIM(p_waba_id), '')
      ELSE whatsapp_business_config.waba_id
    END,
    phone_number_id = CASE
      WHEN p_phone_number_id IS NOT NULL THEN NULLIF(TRIM(p_phone_number_id), '')
      ELSE whatsapp_business_config.phone_number_id
    END,
    display_phone_number = CASE
      WHEN p_display_phone IS NOT NULL THEN NULLIF(TRIM(p_display_phone), '')
      ELSE whatsapp_business_config.display_phone_number
    END,
    graph_api_version = v_graph_version,
    access_token_configured = COALESCE(v_has_access_token, false),
    app_secret_configured = COALESCE(v_has_app_secret, false),
    webhook_verify_token_configured = COALESCE(v_has_verify_token, false),
    updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'access_token_configured', v_has_access_token,
    'app_secret_configured', v_has_app_secret,
    'webhook_verify_token_configured', v_has_verify_token
  );
END;
$function$;

-- 2. Also alias whatsapp_save_config_and_secrets to whatsapp_save_admin_config for backwards-compatibility
CREATE OR REPLACE FUNCTION public.whatsapp_save_config_and_secrets(
  p_meta_app_id text DEFAULT NULL::text,
  p_waba_id text DEFAULT NULL::text,
  p_phone_number_id text DEFAULT NULL::text,
  p_display_phone text DEFAULT NULL::text,
  p_graph_api_version text DEFAULT 'v20.0'::text,
  p_access_token text DEFAULT NULL::text,
  p_app_secret text DEFAULT NULL::text,
  p_webhook_verify_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.whatsapp_save_admin_config(
    p_meta_app_id => p_meta_app_id,
    p_waba_id => p_waba_id,
    p_phone_number_id => p_phone_number_id,
    p_display_phone => p_display_phone,
    p_graph_api_version => p_graph_api_version,
    p_access_token => p_access_token,
    p_app_secret => p_app_secret,
    p_webhook_verify_token => p_webhook_verify_token
  );
END;
$function$;

-- 3. Explicit permissions
GRANT EXECUTE ON FUNCTION public.whatsapp_save_admin_config(text, text, text, text, text, text, text, text) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_save_config_and_secrets(text, text, text, text, text, text, text, text) TO authenticated, service_role, anon;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
