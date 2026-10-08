SELECT cron.alter_job(
  job_id := 4,
  schedule := '*/5 * * * *',
  command := 'select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = ''project_url'') || ''/functions/v1/vip-red-auto-scan'',
      headers := jsonb_build_object(
        ''Content-type'', ''application/json'',
        ''apikey'', (select decrypted_secret from vault.decrypted_secrets where name = ''publishable_key''),
        ''Authorization'', ''Bearer '' || (select decrypted_secret from vault.decrypted_secrets where name = ''publishable_key''),
        ''x-internal-key'', ''vfp_internal_push_2025''
      ),
      body := concat(''{"time": "'', now(), ''"}'')::jsonb
  ) as request_id;'
);