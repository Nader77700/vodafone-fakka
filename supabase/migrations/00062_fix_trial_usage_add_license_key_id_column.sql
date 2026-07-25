
-- الإصلاح: trial_usage عندها key_id بس RPC بيستخدم license_key_id
-- الحل: إضافة license_key_id كـ alias/column إضافي
ALTER TABLE trial_usage ADD COLUMN IF NOT EXISTS license_key_id UUID REFERENCES license_keys(id) ON DELETE SET NULL;

-- تحديث السجلات الموجودة: نسخ key_id إلى license_key_id
UPDATE trial_usage SET license_key_id = key_id WHERE license_key_id IS NULL AND key_id IS NOT NULL;

-- فهرس سريع
CREATE INDEX IF NOT EXISTS idx_trial_usage_license_key_id ON trial_usage(license_key_id);

-- إضافة expires_at إن لم تكن موجودة (يستخدمها RPC)
ALTER TABLE trial_usage ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
