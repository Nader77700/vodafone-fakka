
-- إضافة read_at و external_id لجدول الإشعارات
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS read_at     timestamptz,
  ADD COLUMN IF NOT EXISTS external_id text;

-- فهرس لتسريع البحث بـ external_id
CREATE INDEX IF NOT EXISTS idx_notifications_external_id
  ON notifications (external_id)
  WHERE external_id IS NOT NULL;

-- فهرس لتسريع البحث بـ user_id + external_id
CREATE INDEX IF NOT EXISTS idx_notifications_user_external
  ON notifications (user_id, external_id)
  WHERE external_id IS NOT NULL;
