-- 1. Unset latest from old versions
UPDATE app_versions SET is_latest = false WHERE is_latest = true;

-- 2. Insert new version
INSERT INTO app_versions (version, version_code, release_notes, is_latest, update_type, apk_url)
VALUES ('3.0.305', 220, 'تحديث شامل: إصلاح شامل لسجل العمليات، منع الخصم المزدوج، وإصلاح مشكلة رسالة انتهاء الحصة في الاشتراكات.', true, 'apk', 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.305.apk');

-- 3. Update app_config to FORCE UPDATE
INSERT INTO app_config (key, value) VALUES ('version_latest_code', '220') ON CONFLICT (key) DO UPDATE SET value = '220', updated_at = now();
INSERT INTO app_config (key, value) VALUES ('version_latest_name', '3.0.305') ON CONFLICT (key) DO UPDATE SET value = '3.0.305', updated_at = now();
INSERT INTO app_config (key, value) VALUES ('version_min_code', '220') ON CONFLICT (key) DO UPDATE SET value = '220', updated_at = now();
INSERT INTO app_config (key, value) VALUES ('version_min_supported', '220') ON CONFLICT (key) DO UPDATE SET value = '220', updated_at = now();
INSERT INTO app_config (key, value) VALUES ('version_force_update', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now();
INSERT INTO app_config (key, value) VALUES ('version_force_update_msg', 'يوجد تحديث مهم وشامل يتضمن إصلاحات جوهرية لسجل العمليات والاشتراكات. يرجى التحديث الآن.') ON CONFLICT (key) DO UPDATE SET value = 'يوجد تحديث مهم وشامل يتضمن إصلاحات جوهرية لسجل العمليات والاشتراكات. يرجى التحديث الآن.', updated_at = now();
INSERT INTO app_config (key, value) VALUES ('version_apk_url', 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.305.apk') ON CONFLICT (key) DO UPDATE SET value = 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.305.apk', updated_at = now();