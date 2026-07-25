-- 1. Unset latest from old versions
UPDATE app_versions SET is_latest = false WHERE is_latest = true;

-- 2. Insert new version
INSERT INTO app_versions (version, version_code, release_notes, is_latest, update_type, apk_url)
VALUES ('3.0.325', 241, 'تحديث إجباري: إصلاح شامل لمشكلة الإغلاق المفاجئ (Crash) على أندرويد 10 وما قبله، وإضافة نظام تتبع الأعطال (Crash Logs).', true, 'apk', 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.325.apk');

-- 3. Update app_config to FORCE UPDATE
INSERT INTO app_config (key, value) VALUES ('version_latest_code', '241') ON CONFLICT (key) DO UPDATE SET value = '241', updated_at = now();
INSERT INTO app_config (key, value) VALUES ('version_latest_name', '3.0.325') ON CONFLICT (key) DO UPDATE SET value = '3.0.325', updated_at = now();
INSERT INTO app_config (key, value) VALUES ('version_min_code', '241') ON CONFLICT (key) DO UPDATE SET value = '241', updated_at = now();
INSERT INTO app_config (key, value) VALUES ('version_min_supported', '241') ON CONFLICT (key) DO UPDATE SET value = '241', updated_at = now();
INSERT INTO app_config (key, value) VALUES ('version_force_update', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now();
INSERT INTO app_config (key, value) VALUES ('version_force_update_msg', 'تحديث إجباري لحل مشكلة الإغلاق المفاجئ (Crash) على بعض الأجهزة. يرجى التحديث فوراً لضمان استقرار التطبيق.') ON CONFLICT (key) DO UPDATE SET value = 'تحديث إجباري لحل مشكلة الإغلاق المفاجئ (Crash) على بعض الأجهزة. يرجى التحديث فوراً لضمان استقرار التطبيق.', updated_at = now();
INSERT INTO app_config (key, value) VALUES ('version_apk_url', 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.325.apk') ON CONFLICT (key) DO UPDATE SET value = 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.325.apk', updated_at = now();
