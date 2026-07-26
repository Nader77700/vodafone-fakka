
-- 1. إضافة عمود update_type لتمييز تحديثات APK عن تحديثات الويب
ALTER TABLE app_versions
  ADD COLUMN IF NOT EXISTS update_type TEXT DEFAULT 'apk' CHECK (update_type IN ('apk', 'web'));

-- 2. تصحيح v2.9.0 — تحديث ويب فقط، version_code يساوي الـ APK المثبَّت (43)
UPDATE app_versions
SET
  update_type  = 'web',
  version_code = 43        -- يطابق APK المثبَّت → لن يظهر بانر التحديث لمن عنده v2.8.1
WHERE version = '2.9.0';
