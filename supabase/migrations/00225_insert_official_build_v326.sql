-- Insert the official build signature for v3.0.326 so the app doesn't lock itself out immediately
INSERT INTO build_registry (
  version_code, version_name, build_hash, apk_signature, is_active, 
  release_date, release_notes, created_by
) VALUES (
  242, '3.0.326', 'apk_v3_0_326_code242', 'debug_sig', true, 
  NOW(), 'Official production build with Zero Trust Enforced', NULL
) ON CONFLICT (version_code, build_hash) 
DO UPDATE SET is_active = true, apk_signature = EXCLUDED.apk_signature;
