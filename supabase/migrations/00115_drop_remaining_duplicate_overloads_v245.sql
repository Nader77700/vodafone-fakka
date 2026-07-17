
-- ══════════════════════════════════════════════════════════════════
-- Migration 00115: حذف باقي النسخ القديمة المكررة
-- ══════════════════════════════════════════════════════════════════

-- decrease_member_points: احذف النسخة القديمة (bigint)
DROP FUNCTION IF EXISTS public.decrease_member_points(uuid, uuid, bigint, text, text, uuid, text);

-- increase_member_points: احذف النسخة القديمة (bigint)
DROP FUNCTION IF EXISTS public.increase_member_points(uuid, uuid, bigint, text, text, uuid, text);

-- renew_member_subscription: احذف النسخة القديمة (بدون date param)
DROP FUNCTION IF EXISTS public.renew_member_subscription(uuid, uuid, integer, integer, uuid);
