-- 1. إصلاح subscriptions: كل اشتراك status='active' لكن expires_at انتهى → expired
UPDATE subscriptions
SET status = 'expired',
    updated_at = NOW()
WHERE status = 'active'
  AND expires_at IS NOT NULL
  AND expires_at < NOW();

-- 2. إصلاح subscription_history: كل سجل لمستخدم ليس لديه اشتراك active فعلي
UPDATE subscription_history sh
SET status = 'expired',
    end_reason = COALESCE(sh.end_reason, 'duration_finished')
WHERE sh.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = sh.user_id
      AND s.status = 'active'
      AND (s.expires_at IS NULL OR s.expires_at > NOW())
  );

-- 3. تحقق من النتيجة
SELECT
  (SELECT COUNT(*) FROM subscriptions WHERE status='active' AND expires_at < NOW()) AS stale_active_remaining,
  (SELECT COUNT(*) FROM subscription_history WHERE status='active') AS history_active_count;