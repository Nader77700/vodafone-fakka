-- 1. Create table vip_red_scan_logs
CREATE TABLE IF NOT EXISTS public.vip_red_scan_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id UUID REFERENCES public.vip_red_monitored_lines(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  execution_source TEXT NOT NULL DEFAULT 'server_cron', -- 'server_cron' | 'server_trigger' | 'client_manual'
  status TEXT NOT NULL, -- 'success' | 'failed' | 'ineligible' | 'converted'
  system_detected TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for quick query by line or phone
CREATE INDEX IF NOT EXISTS idx_vip_red_scan_logs_line_id ON public.vip_red_scan_logs(line_id);
CREATE INDEX IF NOT EXISTS idx_vip_red_scan_logs_phone ON public.vip_red_scan_logs(phone_number);
CREATE INDEX IF NOT EXISTS idx_vip_red_scan_logs_created_at ON public.vip_red_scan_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.vip_red_scan_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view logs
CREATE POLICY "Allow authenticated users to read vip_red_scan_logs"
  ON public.vip_red_scan_logs
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow service_role to insert logs
CREATE POLICY "Allow service_role full access to vip_red_scan_logs"
  ON public.vip_red_scan_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Update cron job 4 with 60s timeout
SELECT cron.unschedule(4);

SELECT cron.schedule(
  'vip-red-auto-scan',
  '*/5 * * * *',
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
