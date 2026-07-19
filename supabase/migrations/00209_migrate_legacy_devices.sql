-- Populate device_registry with existing devices from profiles
INSERT INTO device_registry (user_id, device_fp, device_id, platform, last_seen_at, is_logged_in)
SELECT 
  id, 
  COALESCE(device_fp, 'legacy-' || id), 
  device_id, 
  'Legacy/Migrated', 
  created_at, 
  false
FROM profiles
WHERE (device_fp IS NOT NULL OR device_id IS NOT NULL)
ON CONFLICT (user_id, device_fp) DO NOTHING;
