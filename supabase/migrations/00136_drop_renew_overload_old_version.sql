
-- حذف كل إصدارات renew_member_subscription القديمة
DROP FUNCTION IF EXISTS public.renew_member_subscription(uuid, uuid, integer, integer, date, uuid);
DROP FUNCTION IF EXISTS public.renew_member_subscription(uuid, uuid, int, int, date, uuid);
DROP FUNCTION IF EXISTS public.renew_member_subscription(uuid, uuid, integer, integer, timestamptz, uuid);
