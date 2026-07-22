-- ══ LAYER 3: BUILD FINGERPRINT REGISTRY ═════════════════════════════════════
CREATE TABLE IF NOT EXISTS build_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_code integer NOT NULL,
  app_version text NOT NULL,
  build_hash text NOT NULL,
  apk_signature text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ══ LAYER 5: SESSION SIGNATURE & LAYER 4: DEVICE BINDING ══════════════════
CREATE TABLE IF NOT EXISTS security_sessions (
  session_token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_fp text NOT NULL,
  device_id text,
  hardware_hash text NOT NULL,
  session_secret text NOT NULL, -- Used for HMAC request signing
  is_valid boolean DEFAULT true,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  last_used_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_security_sessions_user ON security_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_security_sessions_device ON security_sessions(device_fp);

-- ══ LAYER 7: NONCE & REPLAY PREVENTION ════════════════════════════════════
CREATE TABLE IF NOT EXISTS security_nonces (
  nonce text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  created_at timestamptz DEFAULT now(),
  used_at timestamptz,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_security_nonces_cleanup ON security_nonces(expires_at);

-- ══ LAYER 12: SERVER LOGGING ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS security_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address text,
  device_fp text,
  app_version text,
  build_hash text,
  apk_signature text,
  action text NOT NULL,
  reason text,
  is_blocked boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_security_logs_user ON security_logs(user_id);

-- RLS
ALTER TABLE build_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_logs ENABLE ROW LEVEL SECURITY;

-- Service role only
CREATE POLICY "service_only_build_registry" ON build_registry FOR ALL USING (false);
CREATE POLICY "service_only_security_sessions" ON security_sessions FOR ALL USING (false);
CREATE POLICY "service_only_security_nonces" ON security_nonces FOR ALL USING (false);
CREATE POLICY "service_only_security_logs" ON security_logs FOR ALL USING (false);

-- Insert dummy active build for transition
INSERT INTO build_registry (id, version_code, app_version, build_hash, apk_signature, is_active)
VALUES (gen_random_uuid(), 242, '3.0.326', 'apk_v3_0_326_code242', 'debug_sig', true)
ON CONFLICT DO NOTHING;