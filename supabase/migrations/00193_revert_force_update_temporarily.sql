-- Revert the force update immediately so users don't see the 404 page while GitHub Action is building the APK.
-- They will be forced again once the Action finishes successfully.

UPDATE app_config SET value = 'false' WHERE key = 'version_force_update';
UPDATE app_config SET value = '219' WHERE key = 'version_min_code';
UPDATE app_config SET value = '219' WHERE key = 'version_min_supported';
UPDATE app_config SET value = '219' WHERE key = 'version_latest_code';
UPDATE app_config SET value = '3.0.304' WHERE key = 'version_latest_name';
UPDATE app_config SET value = 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.304.apk' WHERE key = 'version_apk_url';