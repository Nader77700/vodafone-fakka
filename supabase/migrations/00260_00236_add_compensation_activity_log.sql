INSERT INTO activity_log (user_id, event_type, title, description, created_at)
SELECT 
  user_id, 
  'admin_set_ops_limit', 
  'تعويض انقطاع الخدمة', 
  'تمت إضافة 20 عملية إضافية للحد اليومي للعمليات', 
  now()
FROM subscriptions
WHERE status = 'active' AND ops_limit IS NOT NULL AND updated_at > now() - interval '40 minutes';