-- إضافة حقلَي status و end_reason إلى سجل الاشتراكات
ALTER TABLE subscription_history
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS end_reason TEXT DEFAULT NULL;

-- تحديث السجلات الموجودة: إذا expires_at مضى → منتهٍ
UPDATE subscription_history
SET status = 'expired', end_reason = 'duration_finished'
WHERE expires_at IS NOT NULL AND expires_at < NOW() AND status = 'active';

-- فهرس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_sub_history_user_status ON subscription_history(user_id, status);

COMMENT ON COLUMN subscription_history.status IS
  'active | expired | cancelled | replaced | pending';
COMMENT ON COLUMN subscription_history.end_reason IS
  'operations_finished | duration_finished | cancelled_by_admin | replaced_by_new_subscription | manual_cancel | trial_finished | NULL (still active)';