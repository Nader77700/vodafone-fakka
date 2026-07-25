
-- إصلاح merchant_wallet_recharge ليُنشئ wallet تلقائياً إذا لم تكن موجودة
CREATE OR REPLACE FUNCTION merchant_wallet_recharge(
  p_merchant_id       uuid,
  p_amount            integer,
  p_reason            text    DEFAULT 'admin_direct',
  p_notes             text    DEFAULT NULL,
  p_admin_id          uuid    DEFAULT NULL,
  p_idempotency_key   text    DEFAULT NULL,
  p_points_expires_at date    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id  uuid;
  v_before     integer;
  v_after      integer;
  v_tx_id      text;
  v_now        timestamptz := now();
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'amount_must_be_positive');
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM 1 FROM merchant_ledger WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN jsonb_build_object('success', true, 'idempotent', true); END IF;
  END IF;

  -- محاولة جلب الـ wallet أو إنشاؤها تلقائياً
  SELECT id, current_points INTO v_wallet_id, v_before
  FROM merchant_wallets WHERE merchant_id = p_merchant_id FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    -- إنشاء wallet جديدة للتاجر
    INSERT INTO merchant_wallets(merchant_id, current_points, used_points, lifetime_purchased, created_at, updated_at)
    VALUES (p_merchant_id, 0, 0, 0, v_now, v_now)
    RETURNING id, current_points INTO v_wallet_id, v_before;
  END IF;

  v_after := v_before + p_amount;

  UPDATE merchant_wallets
  SET current_points      = v_after,
      lifetime_purchased  = lifetime_purchased + p_amount,
      last_recharge_at    = v_now,
      updated_at          = v_now,
      points_expires_at   = CASE
        WHEN p_points_expires_at IS NOT NULL THEN
          GREATEST(COALESCE(points_expires_at, p_points_expires_at), p_points_expires_at)
        ELSE points_expires_at
      END
  WHERE id = v_wallet_id;

  v_tx_id := 'RCH-' || gen_random_uuid()::text;

  INSERT INTO merchant_ledger(
    transaction_id, merchant_id, type, amount, balance_before, balance_after,
    reason, notes, created_by, idempotency_key, created_at
  ) VALUES (
    v_tx_id, p_merchant_id, 'recharge', p_amount, v_before, v_after,
    p_reason, p_notes, p_admin_id, p_idempotency_key, v_now
  );

  RETURN jsonb_build_object('success',true,'transaction_id',v_tx_id,'balance_before',v_before,'balance_after',v_after);
END;
$$;
