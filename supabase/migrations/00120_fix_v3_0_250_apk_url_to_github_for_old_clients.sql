-- ─── إصلاح عاجل: تحديث apk_url لـ v3.0.249 و v3.0.250 ليكون GitHub URL ──
-- السبب: الكود القديم في التطبيق يتحقق من apkUrl.includes('github.com')
-- إذا الرابط من Supabase → يتجاهله ويستخدم v3.0.235 مُشفَّر
-- الحل: نضع GitHub Release URL في DB → الكود القديم يستخدمه صح

-- v3.0.249 (موجود فعلاً في Supabase)
UPDATE app_versions
SET apk_url = 'https://github.com/Nader77700/vodafone-fakka/releases/download/v3.0.249/VodafoneFakka-v3.0.249.apk'
WHERE version = '3.0.249';

-- v3.0.250 (موجود فعلاً في Supabase)
UPDATE app_versions
SET apk_url = 'https://github.com/Nader77700/vodafone-fakka/releases/download/v3.0.250/VodafoneFakka-v3.0.250.apk'
WHERE version = '3.0.250';

-- تحديث app_config بالرابط الصحيح (v3.0.250 هو is_latest)
UPDATE app_config
SET value = 'https://github.com/Nader77700/vodafone-fakka/releases/download/v3.0.250/VodafoneFakka-v3.0.250.apk'
WHERE key = 'version_apk_url';