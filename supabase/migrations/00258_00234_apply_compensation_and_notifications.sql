-- Apply compensation and insert notifications in one transaction
BEGIN;

-- 1. Create a temp table to hold the state of users BEFORE compensation
CREATE TEMP TABLE user_states AS
SELECT p.id as user_id, s.status, s.ops_limit
FROM profiles p
LEFT JOIN subscriptions s ON s.user_id = p.id;

-- 2. Limited Active Compensation
UPDATE subscriptions
SET ops_limit = ops_limit + 20,
    ops_remaining = ops_remaining + 20
WHERE status = 'active' AND ops_limit IS NOT NULL;

-- 3. Unlimited Active Compensation
UPDATE subscriptions
SET expires_at = expires_at + interval '2 days'
WHERE status = 'active' AND ops_limit IS NULL;

-- 4. Inactive Users (Update existing)
UPDATE subscriptions
SET status = 'active',
    expires_at = now() + interval '1 day',
    ops_limit = NULL,
    ops_remaining = NULL,
    ops_count = 0,
    updated_at = now(),
    code_type = 'trial'
WHERE status != 'active';

-- 5. Inactive Users (Insert new)
INSERT INTO subscriptions (
    user_id, status, expires_at, ops_limit, ops_remaining, ops_count, code_type, created_at, updated_at
)
SELECT 
    id, 'active', now() + interval '1 day', NULL, NULL, 0, 'trial', now(), now()
FROM profiles p
WHERE NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id = p.id);

-- 6. Insert notifications for Limited Active
INSERT INTO notifications (user_id, title, body, type, is_global, priority)
SELECT user_id, '🎁 تعويض انقطاع الخدمة', 'نعتذر عن انقطاع الخدمة مؤخراً. تم تعويضك بإضافة (20 عملية) إلى باقتك.', 'info', false, 'urgent'
FROM user_states
WHERE status = 'active' AND ops_limit IS NOT NULL;

-- 7. Insert notifications for Unlimited Active
INSERT INTO notifications (user_id, title, body, type, is_global, priority)
SELECT user_id, '🎁 تعويض انقطاع الخدمة', 'نعتذر عن انقطاع الخدمة مؤخراً. تم تعويضك بإضافة (يومين) إلى فترة اشتراكك اللامحدود.', 'info', false, 'urgent'
FROM user_states
WHERE status = 'active' AND ops_limit IS NULL;

-- 8. Insert notifications for Inactive
INSERT INTO notifications (user_id, title, body, type, is_global, priority)
SELECT user_id, '🎁 تعويض انقطاع الخدمة', 'نعتذر عن انقطاع الخدمة مؤخراً. تم إعادة تفعيل الفترة التجريبية لحسابك لمدة (24 ساعة) لكي تتمكن من التجربة مرة أخرى.', 'info', false, 'urgent'
FROM user_states
WHERE status != 'active' OR status IS NULL;

COMMIT;