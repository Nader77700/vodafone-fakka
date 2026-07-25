
-- إضافة أعمدة تتبع إشعار الإصدار
ALTER TABLE app_versions
  ADD COLUMN IF NOT EXISTS push_notif_sent       BOOLEAN     DEFAULT false,
  ADD COLUMN IF NOT EXISTS push_notif_sent_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS push_total_devices    INT         DEFAULT 0,
  ADD COLUMN IF NOT EXISTS push_sent_count       INT         DEFAULT 0,
  ADD COLUMN IF NOT EXISTS push_fail_count       INT         DEFAULT 0;

-- تفعيل pg_net
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
