-- 1. Insert missing successful operations from activity_log
INSERT INTO operations (
  user_id,
  phone_number,
  card_type,
  category,
  amount,
  status,
  performed_at,
  created_at,
  operation_number,
  api_response,
  operation_source,
  execution_layer,
  card_data
)
SELECT 
  a.user_id,
  a.metadata->>'phone' as phone_number,
  a.metadata->>'product_id' as card_type,
  CASE WHEN (a.metadata->>'product_id') ILIKE '%mared%' THEN 'مارد' ELSE 'فكة' END as category,
  (regexp_match(a.metadata->>'product_id', '([0-9.]+)'))[1]::numeric as amount,
  'success'::operation_status as status,
  a.created_at as performed_at,
  a.created_at as created_at,
  (a.metadata->>'operation_number')::bigint as operation_number,
  'Recovered from activity_log' as api_response,
  COALESCE(a.metadata->>'operation_source', 'vodafone_cash') as operation_source,
  'server' as execution_layer,
  '{}'::jsonb as card_data
FROM activity_log a
LEFT JOIN operations o ON o.user_id = a.user_id AND o.phone_number = a.metadata->>'phone' AND abs(extract(epoch from (o.performed_at - a.created_at))) < 60
WHERE a.event_type = 'recharge' 
  AND a.created_at > '2026-07-21'
  AND o.id IS NULL;

-- 2. Recalculate ops_count to ensure it includes the recovered operations
WITH last_activation AS (
  SELECT user_id, MAX(activated_at) as last_activated_at
  FROM subscription_history
  GROUP BY user_id
),
ops_stats AS (
  SELECT s.id, s.user_id, s.ops_count, s.ops_limit, s.status, s.expires_at,
         (SELECT COUNT(*) FROM operations o WHERE o.user_id = s.user_id AND o.performed_at >= COALESCE(la.last_activated_at, '1970-01-01'::timestamp)) as real_ops
  FROM subscriptions s
  LEFT JOIN last_activation la ON s.user_id = la.user_id
  WHERE s.status = 'active'
)
UPDATE subscriptions s
SET 
  ops_count = os.real_ops,
  ops_remaining = GREATEST(0, s.ops_limit - os.real_ops)
FROM ops_stats os
WHERE s.id = os.id 
  AND s.ops_count != os.real_ops;

-- 3. Also update trial_usage
WITH last_activation AS (
  SELECT user_id, MAX(activated_at) as last_activated_at
  FROM subscription_history
  GROUP BY user_id
),
ops_stats AS (
  SELECT s.user_id, s.license_key_id,
         (SELECT COUNT(*) FROM operations o WHERE o.user_id = s.user_id AND o.performed_at >= COALESCE(la.last_activated_at, '1970-01-01'::timestamp)) as real_ops
  FROM subscriptions s
  LEFT JOIN last_activation la ON s.user_id = la.user_id
  WHERE s.code_type = 'trial' OR s.code_type = 'gift'
)
UPDATE trial_usage t
SET ops_used = os.real_ops
FROM ops_stats os
WHERE t.user_id = os.user_id AND t.key_id = os.license_key_id
  AND t.ops_used != os.real_ops;

