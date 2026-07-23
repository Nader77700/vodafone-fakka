INSERT INTO activity_log (user_id, event_type, title, description, created_at)
SELECT 
  user_id, 
  'admin_extend_subscription', 
  'تعويض انقطاع الخدمة', 
  'تم تمديد الاشتراك بمقدار 48 ساعة إضافية', 
  now()
FROM subscriptions
WHERE status = 'active' AND ops_limit IS NULL AND code_type != 'trial' AND updated_at > now() - interval '40 minutes';

INSERT INTO activity_log (user_id, event_type, title, description, created_at)
SELECT 
  user_id, 
  'admin_activate_trial', 
  'تعويض انقطاع الخدمة', 
  'تم تفعيل فترة تجريبية مجانية لمدة 24 ساعة', 
  now()
FROM subscriptions
WHERE status = 'active' AND code_type = 'trial' AND ops_count = 0 AND updated_at > now() - interval '40 minutes';