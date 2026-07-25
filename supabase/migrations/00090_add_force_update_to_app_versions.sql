
-- إضافة عمود force_update في app_versions
ALTER TABLE app_versions
  ADD COLUMN IF NOT EXISTS force_update BOOLEAN NOT NULL DEFAULT false;

-- تفعيل force_update للإصدار الحالي v3.0.233
UPDATE app_versions
SET force_update = true
WHERE is_latest = true;

-- إضافة عمود version_min_supported إن لم يكن موجوداً
ALTER TABLE app_versions
  ADD COLUMN IF NOT EXISTS version_min_supported TEXT;

-- تعيين الحد الأدنى المدعوم (v3.0.102 فأعلى)
UPDATE app_versions
SET version_min_supported = '3.0.102'
WHERE is_latest = true;
