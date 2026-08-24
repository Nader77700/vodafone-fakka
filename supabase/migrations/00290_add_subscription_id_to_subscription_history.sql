-- P0 Fix: إضافة subscription_id لجدول subscription_history
-- العمود لم يكن موجوداً في الـ schema الأصلي

ALTER TABLE subscription_history
  ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL;

-- Backfill: ربط سجلات التاريخ بالاشتراكات الحالية عبر user_id + تداخل الفترات الزمنية
UPDATE subscription_history sh
SET subscription_id = s.id
FROM subscriptions s
WHERE sh.subscription_id IS NULL
  AND sh.user_id = s.user_id
  AND (
    -- التاريخ يقع داخل فترة الاشتراك
    (sh.activated_at IS NOT NULL AND sh.activated_at BETWEEN s.created_at AND COALESCE(s.expires_at, NOW() + INTERVAL '1 year'))
    OR
    -- أو الاشتراك الحالي للمستخدم (كخطة احتياطية)
    (sh.activated_at IS NULL AND s.status = 'active')
  );

-- Index لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_subscription_history_subscription_id
  ON subscription_history(subscription_id)
  WHERE subscription_id IS NOT NULL;