CREATE OR REPLACE FUNCTION public.vip_cron_watchdog()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  v_url text;
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'publishable_key';
  
  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT id, target_mix_balance, owner_mix_balance
    FROM public.vip_sessions
    WHERE operation_state = 'running'
      AND automation_enabled = true
      AND (worker_last_heartbeat IS NULL OR worker_last_heartbeat < (now() - interval '90 seconds'))
      AND (owner_mix_balance IS NULL OR target_mix_balance IS NULL OR owner_mix_balance < target_mix_balance)
    LIMIT 3
  LOOP
    UPDATE public.vip_sessions
    SET worker_last_heartbeat = now(),
        updated_at = now()
    WHERE id = r.id;

    PERFORM net.http_post(
      url := v_url || '/functions/v1/etisalat-vip-executor',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-VIP-Secret-Key', 'VFP_VIP_NADER_AKRAM_MASTER_2026',
        'apikey', v_key,
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object(
        'action', 'run_single_cycle',
        'session_id', r.id,
        'is_server_background', true
      ),
      timeout_milliseconds := 60000
    );
  END LOOP;
END;
$$;

-- Unschedule if already exists to ensure clean schedule
SELECT cron.unschedule('vip_247_cloud_watchdog') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'vip_247_cloud_watchdog'
);

-- Schedule every minute
SELECT cron.schedule(
  'vip_247_cloud_watchdog',
  '* * * * *',
  'SELECT public.vip_cron_watchdog();'
);
