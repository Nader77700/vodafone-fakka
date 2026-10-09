SELECT cron.unschedule('vip-red-auto-scan');
SELECT cron.schedule(
    'vip-red-auto-scan',
    '*/2 * * * *',
    $$SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/vip-red-auto-scan',
      headers := jsonb_build_object(
        'Content-type', 'application/json',
        'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'publishable_key'),
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'publishable_key'),
        'x-internal-key', 'vfp_internal_push_2025'
      ),
      body := concat('{"time": "', now(), '"}')::jsonb,
      timeout_milliseconds := 60000
  ) AS request_id;$$
);