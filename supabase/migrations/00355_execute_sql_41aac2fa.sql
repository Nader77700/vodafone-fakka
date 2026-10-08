select cron.unschedule('vip-red-auto-scan-cron');

select cron.schedule(
  'vip-red-auto-scan-cron',
  '*/10 * * * *',
  $$
  select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/vip-red-auto-scan',
      headers := jsonb_build_object(
        'Content-type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key')
      ),
      body := concat('{"time": "', now(), '"}')::jsonb
  ) as request_id;
  $$
);