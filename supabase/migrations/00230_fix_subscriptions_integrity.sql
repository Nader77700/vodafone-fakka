-- 1. Fix operations count for subscriptions affected by the silent insert failure
WITH last_activation AS (
  SELECT user_id, MAX(activated_at) as last_activated_at
  FROM subscription_history
  GROUP BY user_id
),
ops_stats AS (
  SELECT s.id, s.user_id, s.ops_count, s.ops_limit, s.status, s.expires_at,
         (SELECT COUNT(*) FROM operations o WHERE o.user_id = s.user_id AND o.performed_at >= la.last_activated_at) as real_ops
  FROM subscriptions s
  JOIN last_activation la ON s.user_id = la.user_id
  WHERE s.status = 'active'
)
UPDATE subscriptions s
SET 
  ops_count = os.real_ops,
  ops_remaining = GREATEST(0, s.ops_limit - os.real_ops)
FROM ops_stats os
WHERE s.id = os.id 
  AND s.ops_count > os.real_ops;

-- 2. Expire old subscriptions
UPDATE subscriptions
SET status = 'expired'
WHERE status = 'active' AND expires_at < now();

-- 3. Exhaust subscriptions that reached their operations limit
UPDATE subscriptions
SET status = 'exhausted'
WHERE status = 'active' AND ops_count >= ops_limit;

-- 4. Also fix trial_usage table
WITH last_activation AS (
  SELECT user_id, MAX(activated_at) as last_activated_at
  FROM subscription_history
  GROUP BY user_id
),
ops_stats AS (
  SELECT s.user_id, s.license_key_id,
         (SELECT COUNT(*) FROM operations o WHERE o.user_id = s.user_id AND o.performed_at >= la.last_activated_at) as real_ops
  FROM subscriptions s
  JOIN last_activation la ON s.user_id = la.user_id
  WHERE s.code_type = 'trial' OR s.code_type = 'gift'
)
UPDATE trial_usage t
SET ops_used = os.real_ops
FROM ops_stats os
WHERE t.user_id = os.user_id AND t.key_id = os.license_key_id
  AND t.ops_used > os.real_ops;

