-- 1. Insert history for Limited Active
INSERT INTO subscription_history (
  user_id, operation_type, notes, code_type, duration_days, days_before, days_after, activated_at, expires_at, status, performed_by_name, created_at
)
SELECT 
  user_id, 'extension', 'تعويض انقطاع الخدمة: تمت إضافة 20 عملية إضافية للحد المسموح', COALESCE(code_type, 'admin'), 0, 0, 0, now(), expires_at, 'active', 'النظام (المدير)', now()
FROM subscriptions
WHERE status = 'active' AND ops_limit IS NOT NULL AND updated_at > now() - interval '30 minutes';

-- 2. Insert history for Unlimited Active
INSERT INTO subscription_history (
  user_id, operation_type, notes, code_type, duration_days, days_before, days_after, activated_at, expires_at, status, performed_by_name, created_at
)
SELECT 
  user_id, 'extension', 'تعويض انقطاع الخدمة: تمت إضافة 48 ساعة لفترة الاشتراك', COALESCE(code_type, 'admin'), 2, 0, 0, now(), expires_at, 'active', 'النظام (المدير)', now()
FROM subscriptions
WHERE status = 'active' AND ops_limit IS NULL AND updated_at > now() - interval '30 minutes' AND code_type != 'trial';

-- 3. Insert history for Inactive
INSERT INTO subscription_history (
  user_id, operation_type, notes, code_type, duration_days, days_before, days_after, activated_at, expires_at, status, performed_by_name, created_at
)
SELECT 
  user_id, 'activation', 'تعويض انقطاع الخدمة: تفعيل حساب تجريبي مجاني لمدة 24 ساعة', 'trial', 1, 0, 0, now(), expires_at, 'active', 'النظام (المدير)', now()
FROM subscriptions
WHERE status = 'active' AND code_type = 'trial' AND ops_count = 0 AND updated_at > now() - interval '30 minutes';