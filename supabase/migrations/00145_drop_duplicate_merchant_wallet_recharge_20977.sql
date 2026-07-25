
-- حذف النسخة المكررة (OID 20977) التي تُسبب تعارض الدوال
-- نحتفظ بـ OID 20883 — p_merchant_id, p_amount, p_admin_id, p_reason, ...
DROP FUNCTION IF EXISTS public.merchant_wallet_recharge(
  p_merchant_id       uuid,
  p_amount            integer,
  p_reason            text,
  p_notes             text,
  p_admin_id          uuid,
  p_idempotency_key   text,
  p_points_expires_at date
);
