
-- حذف overloads القديمة التي تتعارض مع النسخ الجديدة
-- activate_member_subscription (bigint + start_date) — النسخة القديمة
DROP FUNCTION IF EXISTS public.activate_member_subscription(uuid, uuid, integer, bigint, date, uuid);
DROP FUNCTION IF EXISTS public.activate_member_subscription(p_merchant_id uuid, p_user_id uuid, p_days integer, p_points bigint, p_start_date date, p_admin_id uuid);

-- renew_member_subscription overloads قديمة
DROP FUNCTION IF EXISTS public.renew_member_subscription(uuid, uuid, integer, bigint, uuid);
DROP FUNCTION IF EXISTS public.renew_member_subscription(p_merchant_id uuid, p_user_id uuid, p_days integer, p_points bigint, p_admin_id uuid);
