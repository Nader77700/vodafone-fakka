CREATE OR REPLACE FUNCTION atomic_consume_operation(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub         subscriptions%ROWTYPE;
  v_key         license_keys%ROWTYPE;
  v_ops_used    INTEGER;
  v_ops_limit   INTEGER;
  v_new_count   INTEGER;
  v_code_type   TEXT;
BEGIN
  -- ── قفل سطر الاشتراك atomically ──
  SELECT * INTO v_sub
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('allowed', false, 'exhausted', false, 'ops_used', 0, 'ops_limit', 0, 'remaining', 0, 'code_type', 'none', 'is_trial', false);
  END IF;

  v_ops_limit := v_sub.ops_limit;
  v_ops_used  := COALESCE(v_sub.ops_count, 0);

  -- ── حالة: حساب Admin أو لا يوجد كود ──
  IF v_sub.license_key_id IS NULL THEN
    v_new_count := v_ops_used + 1;
    UPDATE subscriptions SET ops_count = v_new_count WHERE id = v_sub.id;
    RETURN json_build_object('allowed', true, 'exhausted', false, 'ops_used', v_new_count, 'ops_limit', NULL, 'remaining', NULL, 'code_type', 'admin', 'is_trial', false);
  END IF;

  SELECT * INTO v_key FROM license_keys WHERE id = v_sub.license_key_id;
  v_code_type := COALESCE(v_key.code_type, 'unknown');

  IF v_ops_limit IS NOT NULL AND v_ops_used >= v_ops_limit THEN
    RETURN json_build_object(
      'allowed',   false, 'exhausted', true,
      'ops_used',  v_ops_used, 'ops_limit', v_ops_limit,
      'remaining', 0, 'code_type', v_code_type, 'is_trial', (v_code_type = 'trial')
    );
  END IF;

  v_new_count := v_ops_used + 1;
  UPDATE subscriptions SET ops_count = v_new_count WHERE id = v_sub.id;

  -- ── التوافقية: تحديث trial_usage إذا كان تجريبي ──
  IF v_code_type = 'trial' THEN
    UPDATE trial_usage SET ops_used = v_new_count WHERE key_id = v_sub.license_key_id AND user_id = p_user_id;
  END IF;

  RETURN json_build_object(
    'allowed',    true,
    'exhausted',  (v_ops_limit IS NOT NULL AND v_new_count >= v_ops_limit),
    'ops_used',   v_new_count,
    'ops_limit',  v_ops_limit,
    'remaining',  CASE WHEN v_ops_limit IS NOT NULL THEN v_ops_limit - v_new_count ELSE NULL END,
    'code_type',  v_code_type,
    'is_trial',   (v_code_type = 'trial')
  );
END;
$$;

CREATE OR REPLACE FUNCTION atomic_refund_operation(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_sub
  FROM subscriptions
  WHERE user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE subscriptions
  SET ops_count = GREATEST(0, COALESCE(ops_count, 1) - 1)
  WHERE id = v_sub.id;

  -- التوافقية
  IF v_sub.license_key_id IS NOT NULL THEN
    UPDATE trial_usage
    SET ops_used = GREATEST(0, COALESCE(ops_used, 1) - 1)
    WHERE key_id = v_sub.license_key_id AND user_id = p_user_id;
  END IF;
END;
$$;
