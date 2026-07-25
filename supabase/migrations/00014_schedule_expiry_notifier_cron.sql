
-- تفعيل امتداد pg_cron لجدولة المهام
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- حذف الجدولة القديمة إن وجدت
SELECT cron.unschedule('subscription-expiry-notifier') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'subscription-expiry-notifier'
);

-- جدولة الدالة يومياً الساعة 8 صباحاً (UTC)
SELECT cron.schedule(
  'subscription-expiry-notifier',
  '0 8 * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/subscription-expiry-notifier',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);
