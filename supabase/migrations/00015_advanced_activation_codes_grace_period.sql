
-- ================================================================
-- Phase 4-7: Advanced activation code fields + grace period
-- ================================================================

-- 1. Add new fields to license_keys
ALTER TABLE license_keys
  ADD COLUMN IF NOT EXISTS allowed_users      int          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uses_per_user      int          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS expiry_date        timestamptz  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS expiration_mode    text         DEFAULT 'BY_DATE'
    CHECK (expiration_mode IN ('BY_DATE','BY_USAGE','EARLIEST')),
  ADD COLUMN IF NOT EXISTS custom_duration_days int        DEFAULT NULL;

-- Backfill: for trial codes, allowed_users = max_users, uses_per_user = max_ops_per_user
UPDATE license_keys
SET
  allowed_users  = COALESCE(max_users, 100),
  uses_per_user  = COALESCE(max_ops_per_user, 2),
  expiration_mode = 'BY_USAGE'
WHERE code_type = 'trial';

-- For gift codes: expiration_mode = BY_DATE
UPDATE license_keys SET expiration_mode = 'BY_DATE' WHERE code_type = 'gift';

-- For paid codes: expiration_mode = BY_DATE
UPDATE license_keys SET expiration_mode = 'BY_DATE' WHERE code_type = 'paid' OR code_type IS NULL;

-- 2. Add grace period fields to subscriptions
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS grace_started_at   timestamptz  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS grace_ends_at      timestamptz  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS in_grace_period    boolean      DEFAULT false;

-- 3. Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_license_keys_expiry_date    ON license_keys(expiry_date);
CREATE INDEX IF NOT EXISTS idx_license_keys_exp_mode       ON license_keys(expiration_mode);
CREATE INDEX IF NOT EXISTS idx_subscriptions_grace         ON subscriptions(user_id, in_grace_period);
