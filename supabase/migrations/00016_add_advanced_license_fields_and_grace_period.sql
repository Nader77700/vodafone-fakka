
-- إضافة الحقول الجديدة لـ license_keys
ALTER TABLE license_keys
  ADD COLUMN IF NOT EXISTS custom_duration_days integer,
  ADD COLUMN IF NOT EXISTS allowed_users integer,
  ADD COLUMN IF NOT EXISTS uses_per_user integer,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS expiration_mode text NOT NULL DEFAULT 'BY_DATE'
    CHECK (expiration_mode IN ('BY_DATE','BY_USAGE','EARLIEST'));

-- إضافة حقول grace period لـ subscriptions
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS grace_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS grace_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS in_grace_period boolean NOT NULL DEFAULT false;

-- تحديث القيم الافتراضية للأعمدة الموجودة في الكودات التجريبية/الهدايا
UPDATE license_keys
  SET allowed_users = max_users,
      uses_per_user = max_ops_per_user
  WHERE code_type IN ('trial','gift')
    AND allowed_users IS NULL;
