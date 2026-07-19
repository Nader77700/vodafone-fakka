
-- ══════════════════════════════════════════════════════════════════
-- Phase 6 RPCs: Merchant Members & Subscription System
-- get_merchant_member, assign_points_to_member, increase_member_points,
-- decrease_member_points, activate_member_subscription, renew_member_subscription,
-- set_member_status, delete_merchant_member, get_member_history
-- ALL SECURITY DEFINER — atomic transactions — balance validation
-- ══════════════════════════════════════════════════════════════════

-- ─── 1. get_merchant_member ───────────────────────────────────────
CREATE OR REPLACE FUNCTION get_merchant_member(
  p_merchant_id UUID,
  p_user_id     UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member  merchant_members%ROWTYPE;
  v_sub     merchant_member_subscriptions%ROWTYPE;
  v_profile profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_member
  FROM merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود', 'member', null, 'subscription', null);
  END IF;

  SELECT * INTO v_sub
  FROM merchant_member_subscriptions
  WHERE member_id = v_member.member_id
  ORDER BY created_at DESC LIMIT 1;

  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'member', jsonb_build_object(
      'member_id',          v_member.member_id,
      'merchant_id',        v_member.merchant_id,
      'user_id',            v_member.user_id,
      'member_status',      v_member.member_status,
      'assigned_points',    v_member.assigned_points,
      'consumed_points',    v_member.consumed_points,
      'remaining_points',   v_member.remaining_points,
      'member_created_at',  v_member.created_at,
      'activated_at',       v_member.activated_at,
      'expired_at',         v_member.expired_at,
      'last_operation_at',  v_member.last_operation_at,
      'last_login_at',      v_member.last_login_at,
      'username',           v_profile.username,
      'phone',              v_profile.phone,
      'email',              v_profile.email,
      'sub_status',         v_sub.status,
      'start_date',         v_sub.start_date,
      'end_date',           v_sub.end_date
    ),
    'subscription', CASE WHEN v_sub.id IS NOT NULL THEN jsonb_build_object(
      'id',               v_sub.id,
      'member_id',        v_sub.member_id,
      'status',           v_sub.status,
      'start_date',       v_sub.start_date,
      'end_date',         v_sub.end_date,
      'assigned_points',  v_sub.assigned_points,
      'consumed_points',  v_sub.consumed_points,
      'remaining_points', v_sub.remaining_points,
      'created_at',       v_sub.created_at
    ) ELSE null END
  );
END;
$$;

-- ─── 2. assign_points_to_member ──────────────────────────────────
CREATE OR REPLACE FUNCTION assign_points_to_member(
  p_merchant_id      UUID,
  p_user_id          UUID,
  p_amount           INTEGER,
  p_reason           TEXT    DEFAULT NULL,
  p_notes            TEXT    DEFAULT NULL,
  p_admin_id         UUID    DEFAULT NULL,
  p_idempotency_key  TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member     merchant_members%ROWTYPE;
  v_wallet     merchant_wallets%ROWTYPE;
  v_tx_id      TEXT;
  v_bal_before INTEGER;
  v_bal_after  INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب أن يكون المبلغ أكبر من صفر');
  END IF;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM merchant_member_ledger WHERE transaction_id = p_idempotency_key) THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true);
    END IF;
  END IF;

  -- Lock member
  SELECT * INTO v_member FROM merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  -- Lock wallet
  SELECT * INTO v_wallet FROM merchant_wallets
  WHERE merchant_id = p_merchant_id
  FOR UPDATE;

  IF NOT FOUND OR v_wallet.balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'رصيد المحفظة غير كافٍ');
  END IF;

  v_bal_before := v_member.remaining_points;
  v_bal_after  := v_bal_before + p_amount;
  v_tx_id      := COALESCE(p_idempotency_key, gen_random_uuid()::TEXT);

  -- Deduct from wallet
  UPDATE merchant_wallets
  SET balance = balance - p_amount, updated_at = NOW()
  WHERE merchant_id = p_merchant_id;

  -- Add to member
  UPDATE merchant_members
  SET assigned_points  = assigned_points  + p_amount,
      remaining_points = remaining_points + p_amount,
      last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  -- Ledger entry
  INSERT INTO merchant_member_ledger(
    transaction_id, member_id, merchant_id, user_id,
    type, amount, balance_before, balance_after,
    reason, notes, created_by
  ) VALUES (
    v_tx_id, v_member.member_id, p_merchant_id, p_user_id,
    'assign', p_amount, v_bal_before, v_bal_after,
    p_reason, p_notes, COALESCE(p_admin_id, p_merchant_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'balance_before', v_bal_before,
    'balance_after',  v_bal_after
  );
END;
$$;

-- ─── 3. increase_member_points ───────────────────────────────────
CREATE OR REPLACE FUNCTION increase_member_points(
  p_merchant_id      UUID,
  p_user_id          UUID,
  p_amount           INTEGER,
  p_reason           TEXT    DEFAULT NULL,
  p_notes            TEXT    DEFAULT NULL,
  p_admin_id         UUID    DEFAULT NULL,
  p_idempotency_key  TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member     merchant_members%ROWTYPE;
  v_tx_id      TEXT;
  v_bal_before INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب أن يكون المبلغ أكبر من صفر');
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM merchant_member_ledger WHERE transaction_id = p_idempotency_key) THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true);
    END IF;
  END IF;

  SELECT * INTO v_member FROM merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  v_bal_before := v_member.remaining_points;
  v_tx_id      := COALESCE(p_idempotency_key, gen_random_uuid()::TEXT);

  UPDATE merchant_members
  SET assigned_points  = assigned_points  + p_amount,
      remaining_points = remaining_points + p_amount,
      last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  INSERT INTO merchant_member_ledger(
    transaction_id, member_id, merchant_id, user_id,
    type, amount, balance_before, balance_after, reason, notes, created_by
  ) VALUES (
    v_tx_id, v_member.member_id, p_merchant_id, p_user_id,
    'increase', p_amount, v_bal_before, v_bal_before + p_amount,
    p_reason, p_notes, COALESCE(p_admin_id, p_merchant_id)
  );

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id);
END;
$$;

-- ─── 4. decrease_member_points ───────────────────────────────────
CREATE OR REPLACE FUNCTION decrease_member_points(
  p_merchant_id      UUID,
  p_user_id          UUID,
  p_amount           INTEGER,
  p_reason           TEXT    DEFAULT NULL,
  p_notes            TEXT    DEFAULT NULL,
  p_admin_id         UUID    DEFAULT NULL,
  p_idempotency_key  TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member     merchant_members%ROWTYPE;
  v_tx_id      TEXT;
  v_bal_before INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب أن يكون المبلغ أكبر من صفر');
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM merchant_member_ledger WHERE transaction_id = p_idempotency_key) THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true);
    END IF;
  END IF;

  SELECT * INTO v_member FROM merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  IF v_member.remaining_points < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'رصيد النقاط غير كافٍ');
  END IF;

  v_bal_before := v_member.remaining_points;
  v_tx_id      := COALESCE(p_idempotency_key, gen_random_uuid()::TEXT);

  UPDATE merchant_members
  SET consumed_points  = consumed_points  + p_amount,
      remaining_points = remaining_points - p_amount,
      last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  INSERT INTO merchant_member_ledger(
    transaction_id, member_id, merchant_id, user_id,
    type, amount, balance_before, balance_after, reason, notes, created_by
  ) VALUES (
    v_tx_id, v_member.member_id, p_merchant_id, p_user_id,
    'decrease', -p_amount, v_bal_before, v_bal_before - p_amount,
    p_reason, p_notes, COALESCE(p_admin_id, p_merchant_id)
  );

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id);
END;
$$;

-- ─── 5. activate_member_subscription ────────────────────────────
CREATE OR REPLACE FUNCTION activate_member_subscription(
  p_merchant_id UUID,
  p_user_id     UUID,
  p_days        INTEGER DEFAULT 30,
  p_points      INTEGER DEFAULT 0,
  p_start_date  DATE    DEFAULT NULL,
  p_admin_id    UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member     merchant_members%ROWTYPE;
  v_start      DATE;
  v_end        DATE;
  v_sub_id     UUID;
BEGIN
  SELECT * INTO v_member FROM merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  v_start := COALESCE(p_start_date, CURRENT_DATE);
  v_end   := v_start + p_days;

  -- Deactivate any existing active subscription
  UPDATE merchant_member_subscriptions
  SET status = 'expired', updated_at = NOW()
  WHERE member_id = v_member.member_id AND status = 'active';

  -- Create new subscription
  INSERT INTO merchant_member_subscriptions(
    member_id, merchant_id, status, start_date, end_date,
    assigned_points, remaining_points, consumed_points
  ) VALUES (
    v_member.member_id, p_merchant_id, 'active', v_start, v_end,
    p_points, p_points, 0
  )
  RETURNING id INTO v_sub_id;

  -- Activate member
  UPDATE merchant_members
  SET member_status = 'active', activated_at = NOW(), last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  -- Log in ledger if points assigned
  IF p_points > 0 THEN
    INSERT INTO merchant_member_ledger(
      transaction_id, member_id, merchant_id, user_id,
      type, amount, balance_before, balance_after,
      reason, created_by, correlation_id
    ) VALUES (
      gen_random_uuid()::TEXT, v_member.member_id, p_merchant_id, p_user_id,
      'subscription_bonus', p_points, v_member.remaining_points,
      v_member.remaining_points + p_points,
      'تفعيل اشتراك', COALESCE(p_admin_id, p_merchant_id), v_sub_id::TEXT
    );

    UPDATE merchant_members
    SET assigned_points  = assigned_points  + p_points,
        remaining_points = remaining_points + p_points
    WHERE merchant_id = p_merchant_id AND user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'start_date', v_start,
    'end_date',   v_end
  );
END;
$$;

-- ─── 6. renew_member_subscription ───────────────────────────────
CREATE OR REPLACE FUNCTION renew_member_subscription(
  p_merchant_id UUID,
  p_user_id     UUID,
  p_days        INTEGER DEFAULT 30,
  p_points      INTEGER DEFAULT 0,
  p_start_date  DATE    DEFAULT NULL,
  p_admin_id    UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member  merchant_members%ROWTYPE;
  v_sub     merchant_member_subscriptions%ROWTYPE;
  v_start   DATE;
  v_end     DATE;
BEGIN
  SELECT * INTO v_member FROM merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  -- Extend from current end_date or today
  SELECT * INTO v_sub FROM merchant_member_subscriptions
  WHERE member_id = v_member.member_id ORDER BY created_at DESC LIMIT 1;

  v_start := COALESCE(
    p_start_date,
    CASE WHEN v_sub.end_date IS NOT NULL AND v_sub.end_date > CURRENT_DATE THEN v_sub.end_date ELSE CURRENT_DATE END
  );
  v_end := v_start + p_days;

  -- Update or insert subscription
  IF v_sub.id IS NOT NULL THEN
    UPDATE merchant_member_subscriptions
    SET status = 'active', start_date = v_start, end_date = v_end,
        assigned_points  = assigned_points  + p_points,
        remaining_points = remaining_points + p_points,
        updated_at = NOW()
    WHERE id = v_sub.id;
  ELSE
    INSERT INTO merchant_member_subscriptions(
      member_id, merchant_id, status, start_date, end_date,
      assigned_points, remaining_points, consumed_points
    ) VALUES (
      v_member.member_id, p_merchant_id, 'active', v_start, v_end,
      p_points, p_points, 0
    );
  END IF;

  UPDATE merchant_members
  SET member_status = 'active', last_operation_at = NOW(),
      expired_at = NULL
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  IF p_points > 0 THEN
    INSERT INTO merchant_member_ledger(
      transaction_id, member_id, merchant_id, user_id,
      type, amount, balance_before, balance_after, reason, created_by
    ) VALUES (
      gen_random_uuid()::TEXT, v_member.member_id, p_merchant_id, p_user_id,
      'subscription_bonus', p_points, v_member.remaining_points,
      v_member.remaining_points + p_points,
      'تجديد اشتراك', COALESCE(p_admin_id, p_merchant_id)
    );

    UPDATE merchant_members
    SET assigned_points  = assigned_points  + p_points,
        remaining_points = remaining_points + p_points
    WHERE merchant_id = p_merchant_id AND user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'start_date', v_start, 'end_date', v_end);
END;
$$;

-- ─── 7. set_member_status ────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_member_status(
  p_merchant_id UUID,
  p_user_id     UUID,
  p_new_status  TEXT,
  p_admin_id    UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member merchant_members%ROWTYPE;
BEGIN
  IF p_new_status NOT IN ('active','pending','suspended','disabled','blocked','expired') THEN
    RETURN jsonb_build_object('success', false, 'error', 'حالة غير صالحة');
  END IF;

  SELECT * INTO v_member FROM merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  UPDATE merchant_members
  SET member_status     = p_new_status::member_status,
      last_operation_at = NOW(),
      expired_at        = CASE WHEN p_new_status = 'expired' THEN NOW() ELSE expired_at END,
      activated_at      = CASE WHEN p_new_status = 'active' AND activated_at IS NULL THEN NOW() ELSE activated_at END
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  INSERT INTO merchant_member_ledger(
    transaction_id, member_id, merchant_id, user_id,
    type, amount, balance_before, balance_after, reason, created_by
  ) VALUES (
    gen_random_uuid()::TEXT, v_member.member_id, p_merchant_id, p_user_id,
    'adjustment', 0, v_member.remaining_points, v_member.remaining_points,
    'تغيير الحالة إلى: ' || p_new_status,
    COALESCE(p_admin_id, p_merchant_id)
  );

  RETURN jsonb_build_object('success', true, 'new_status', p_new_status);
END;
$$;

-- ─── 8. delete_merchant_member ───────────────────────────────────
CREATE OR REPLACE FUNCTION delete_merchant_member(
  p_merchant_id UUID,
  p_user_id     UUID,
  p_admin_id    UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member merchant_members%ROWTYPE;
BEGIN
  SELECT * INTO v_member FROM merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  -- Soft delete: mark as disabled
  UPDATE merchant_members
  SET member_status = 'disabled', last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  INSERT INTO merchant_member_ledger(
    transaction_id, member_id, merchant_id, user_id,
    type, amount, balance_before, balance_after, reason, created_by
  ) VALUES (
    gen_random_uuid()::TEXT, v_member.member_id, p_merchant_id, p_user_id,
    'adjustment', 0, v_member.remaining_points, v_member.remaining_points,
    'حذف العضوية', COALESCE(p_admin_id, p_merchant_id)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ─── 9. get_member_history ───────────────────────────────────────
CREATE OR REPLACE FUNCTION get_member_history(
  p_merchant_id UUID,
  p_user_id     UUID,
  p_limit       INTEGER DEFAULT 50,
  p_offset      INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member  merchant_members%ROWTYPE;
  v_total   INTEGER;
  v_rows    JSONB;
BEGIN
  SELECT * INTO v_member FROM merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'total', 0, 'items', '[]'::JSONB);
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM merchant_member_ledger
  WHERE member_id = v_member.member_id;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::JSONB ORDER BY t.created_at DESC), '[]'::JSONB)
  INTO v_rows
  FROM (
    SELECT
      id, transaction_id, member_id, merchant_id, user_id,
      type, amount, balance_before, balance_after,
      reason, notes, created_by, correlation_id, created_at
    FROM merchant_member_ledger
    WHERE member_id = v_member.member_id
    ORDER BY created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) t;

  RETURN jsonb_build_object('success', true, 'total', v_total, 'items', v_rows);
END;
$$;

-- ─── Grant execute to authenticated ──────────────────────────────
GRANT EXECUTE ON FUNCTION get_merchant_member(UUID,UUID)               TO authenticated;
GRANT EXECUTE ON FUNCTION assign_points_to_member(UUID,UUID,INTEGER,TEXT,TEXT,UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION increase_member_points(UUID,UUID,INTEGER,TEXT,TEXT,UUID,TEXT)  TO authenticated;
GRANT EXECUTE ON FUNCTION decrease_member_points(UUID,UUID,INTEGER,TEXT,TEXT,UUID,TEXT)  TO authenticated;
GRANT EXECUTE ON FUNCTION activate_member_subscription(UUID,UUID,INTEGER,INTEGER,DATE,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION renew_member_subscription(UUID,UUID,INTEGER,INTEGER,DATE,UUID)    TO authenticated;
GRANT EXECUTE ON FUNCTION set_member_status(UUID,UUID,TEXT,UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION delete_merchant_member(UUID,UUID,UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION get_member_history(UUID,UUID,INTEGER,INTEGER) TO authenticated;
