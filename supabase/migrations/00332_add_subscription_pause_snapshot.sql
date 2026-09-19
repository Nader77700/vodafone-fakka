
-- إضافة أعمدة التعليق المؤقت (pause/resume)
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS is_paused          boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paused_at          timestamptz,
  ADD COLUMN IF NOT EXISTS paused_expires_at  timestamptz,   -- قيمة expires_at وقت التعليق
  ADD COLUMN IF NOT EXISTS paused_days_rem    integer,       -- الأيام المتبقية وقت التعليق
  ADD COLUMN IF NOT EXISTS paused_ops_rem     integer,       -- العمليات المتبقية وقت التعليق
  ADD COLUMN IF NOT EXISTS paused_status      text;          -- الـ status الأصلي وقت التعليق

-- index للبحث السريع
CREATE INDEX IF NOT EXISTS idx_subscriptions_is_paused ON subscriptions (is_paused);

COMMENT ON COLUMN subscriptions.is_paused         IS 'true = التطبيق موقوف مؤقتاً، الاشتراك معلّق';
COMMENT ON COLUMN subscriptions.paused_at         IS 'وقت بداية التعليق';
COMMENT ON COLUMN subscriptions.paused_expires_at IS 'نسخة من expires_at قبل التعليق';
COMMENT ON COLUMN subscriptions.paused_days_rem   IS 'نسخة من days_remaining قبل التعليق';
COMMENT ON COLUMN subscriptions.paused_ops_rem    IS 'نسخة من ops_remaining قبل التعليق';
COMMENT ON COLUMN subscriptions.paused_status     IS 'نسخة من status قبل التعليق';
