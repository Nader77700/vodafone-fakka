
-- إصلاح: حذف overload القديم (date) والإبقاء على timestamptz فقط
DROP FUNCTION IF EXISTS public.activate_member_subscription(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_days        integer,
  p_points      integer,
  p_start_date  date,
  p_admin_id    uuid
);
