
-- ══════════════════════════════════════════════════════════════════
-- Migration 00114: حذف النسخ القديمة من الدوال المكررة
-- يبقى فقط أحدث إصدار لكل دالة
-- ══════════════════════════════════════════════════════════════════

-- ── activate_member_subscription: احذف النسخة القديمة (5 params بدون date) ──
DROP FUNCTION IF EXISTS public.activate_member_subscription(uuid, uuid, integer, integer, uuid);

-- ── admin_get_merchants_overview: احذف النسخة القديمة (4 params) ─────────────
DROP FUNCTION IF EXISTS public.admin_get_merchants_overview(text, text, integer, integer);

-- ── assign_points_to_member: احذف النسخة التي تأخذ bigint ────────────────────
DROP FUNCTION IF EXISTS public.assign_points_to_member(uuid, uuid, bigint, text, text, uuid, text);

-- ── update_merchant_settings: احذف النسختين القديمتين ───────────────────────
-- النسخة (uuid, text, text, text, integer) — 5 params القديمة
DROP FUNCTION IF EXISTS public.update_merchant_settings(uuid, text, text, text, integer);
-- النسخة (uuid, text, text, text, text, text) — 6 params القديمة
DROP FUNCTION IF EXISTS public.update_merchant_settings(uuid, text, text, text, text, text);

-- ── التحقق النهائي — نرى ما تبقى ────────────────────────────────────────────
-- (هذا SELECT فقط للتوثيق، لا يؤثر على Migration)
