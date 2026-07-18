CREATE TABLE IF NOT EXISTS version_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_name text UNIQUE NOT NULL,
  ban_reason text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  banned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE version_bans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON version_bans;
CREATE POLICY "Enable read access for all users" ON version_bans FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable insert access for admins" ON version_bans;
CREATE POLICY "Enable insert access for admins" ON version_bans FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM get_own_profile(auth.uid()) WHERE role IN ('admin', 'super_admin'))
);

DROP POLICY IF EXISTS "Enable update access for admins" ON version_bans;
CREATE POLICY "Enable update access for admins" ON version_bans FOR UPDATE USING (
  EXISTS (SELECT 1 FROM get_own_profile(auth.uid()) WHERE role IN ('admin', 'super_admin'))
);

DROP POLICY IF EXISTS "Enable delete access for admins" ON version_bans;
CREATE POLICY "Enable delete access for admins" ON version_bans FOR DELETE USING (
  EXISTS (SELECT 1 FROM get_own_profile(auth.uid()) WHERE role IN ('admin', 'super_admin'))
);

CREATE OR REPLACE FUNCTION update_version_bans_modtime()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_version_bans_modtime ON version_bans;
CREATE TRIGGER update_version_bans_modtime
BEFORE UPDATE ON version_bans
FOR EACH ROW EXECUTE PROCEDURE update_version_bans_modtime();

INSERT INTO version_bans (version_name, ban_reason)
VALUES ('338', 'App Version v3.0.338 is permanently disabled. This device is banned. للتواصل مع المطور الرسمي: واتس آب: 01222692182')
ON CONFLICT (version_name) DO NOTHING;

INSERT INTO version_bans (version_name, ban_reason)
VALUES ('WALED PRO', 'App Version is permanently disabled. This device is banned.')
ON CONFLICT (version_name) DO NOTHING;

CREATE OR REPLACE FUNCTION auto_ban_modded_apk()
RETURNS TRIGGER AS $$
DECLARE
  ban_record record;
BEGIN
  SELECT * INTO ban_record FROM version_bans 
  WHERE is_active = true 
    AND NEW.app_version LIKE '%' || version_name || '%'
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO device_bans (device_fp, device_id, hardware_hash, ban_reason, ban_type, is_permanent, is_active, ip_address, device_model, platform)
    VALUES (NEW.device_fp, NEW.device_id, NEW.hardware_hash, ban_record.ban_reason, 'system', true, true, NEW.ip_address, NEW.device_model, NEW.platform)
    ON CONFLICT DO NOTHING;
    
    UPDATE subscriptions
    SET status = 'cancelled'
    WHERE user_id = NEW.user_id AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
