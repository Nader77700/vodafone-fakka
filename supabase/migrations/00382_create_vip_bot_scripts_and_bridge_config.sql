-- 1. Create table for Bot Scripts storage & dynamic updates
CREATE TABLE IF NOT EXISTS public.vip_bot_scripts (
  id TEXT PRIMARY KEY DEFAULT ('script_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
  name TEXT NOT NULL DEFAULT 'اسكريبت اتصالات VIP الرئيسي (Etisalat Bot)',
  version TEXT NOT NULL DEFAULT 'v1.0.0',
  script_code TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Create table for Egyptian Bridge and Device Fingerprints Configuration
CREATE TABLE IF NOT EXISTS public.vip_bridge_config (
  id TEXT PRIMARY KEY DEFAULT 'primary_bridge_config',
  bridge_enabled BOOLEAN NOT NULL DEFAULT false,
  bridge_url TEXT DEFAULT '',
  bridge_mode TEXT NOT NULL DEFAULT 'direct', -- 'direct', 'http_proxy', 'reverse_bridge'
  bridge_auth TEXT DEFAULT '',
  simulated_country TEXT NOT NULL DEFAULT 'EG',
  
  -- Owner Device Fingerprint (CPH2737 / Android 16)
  owner_device_id TEXT NOT NULL DEFAULT 'b61c90c58c612671',
  owner_model_type TEXT NOT NULL DEFAULT 'CPH2737',
  owner_os_version TEXT NOT NULL DEFAULT '16',
  owner_user_agent TEXT NOT NULL DEFAULT 'okhttp/5.0.0-alpha.11',
  owner_simulated_ip TEXT NOT NULL DEFAULT '196.205.142.23',
  
  -- Child Device Fingerprint (Distinct: Galaxy S24 / Android 14)
  child_device_id TEXT NOT NULL DEFAULT 'f28a90d41e7391b5',
  child_model_type TEXT NOT NULL DEFAULT 'SM-S928B',
  child_os_version TEXT NOT NULL DEFAULT '14',
  child_user_agent TEXT NOT NULL DEFAULT 'okhttp/4.12.0',
  child_simulated_ip TEXT NOT NULL DEFAULT '156.204.81.44',

  last_ping_status TEXT DEFAULT 'untested',
  last_ping_ms INTEGER DEFAULT 0,
  last_ping_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure primary record exists
INSERT INTO public.vip_bridge_config (id, bridge_enabled, bridge_mode)
VALUES ('primary_bridge_config', false, 'direct')
ON CONFLICT (id) DO NOTHING;

-- RLS policies: Allow authenticated and service role full access
ALTER TABLE public.vip_bot_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_bridge_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vip_bot_scripts' AND policyname = 'Allow all access to vip_bot_scripts'
  ) THEN
    CREATE POLICY "Allow all access to vip_bot_scripts" ON public.vip_bot_scripts FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vip_bridge_config' AND policyname = 'Allow all access to vip_bridge_config'
  ) THEN
    CREATE POLICY "Allow all access to vip_bridge_config" ON public.vip_bridge_config FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
