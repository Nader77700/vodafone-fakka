
-- ══════════════════════════════════════════════════════
-- DROP دالة merchant_wallet_recharge القديمة (oid=19250)
-- تبقى فقط الجديدة (oid=20883) التي تدعم p_points_expires_at
-- ══════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.merchant_wallet_recharge(
  p_merchant_id uuid,
  p_amount integer,
  p_reason text,
  p_notes text,
  p_idempotency_key text,
  p_admin_id uuid
);
