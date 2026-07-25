-- ================================================================
-- PHASE 5: Merchant Wallet & Points Engine
-- ADDITIVE ONLY — No existing tables/columns/functions dropped
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- 1. Transaction Type Enum
-- ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE merchant_tx_type AS ENUM (
    'recharge',
    'deduct',
    'refund',
    'adjustment',
    'subscription_bonus',
    'admin_grant',
    'admin_remove',
    'transfer_to_user'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────────
-- 2. Merchant Wallets Table
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merchant_wallets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id        uuid NOT NULL UNIQUE REFERENCES merchants(id) ON DELETE CASCADE,
  current_points     integer NOT NULL DEFAULT 0 CHECK (current_points >= 0),
  used_points        integer NOT NULL DEFAULT 0 CHECK (used_points >= 0),
  reserved_points    integer NOT NULL DEFAULT 0 CHECK (reserved_points >= 0),
  lifetime_consumed  integer NOT NULL DEFAULT 0 CHECK (lifetime_consumed >= 0),
  lifetime_purchased integer NOT NULL DEFAULT 0 CHECK (lifetime_purchased >= 0),
  monthly_consumed   integer NOT NULL DEFAULT 0 CHECK (monthly_consumed >= 0),
  daily_consumed     integer NOT NULL DEFAULT 0 CHECK (daily_consumed >= 0),
  last_operation_at  timestamptz,
  last_recharge_at   timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_merchant_wallets_merchant_id ON merchant_wallets(merchant_id);

-- ────────────────────────────────────────────────────────────────
-- 3. Merchant Ledger Table (Append Only)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merchant_ledger (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id   text UNIQUE NOT NULL,
  merchant_id      uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  type             merchant_tx_type NOT NULL,
  amount           integer NOT NULL,
  balance_before   integer NOT NULL,
  balance_after    integer NOT NULL,
  reason           text,
  notes            text,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  correlation_id   text,
  idempotency_key  text UNIQUE,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ledger_merchant_id ON merchant_ledger(merchant_id);
CREATE INDEX IF NOT EXISTS idx_ledger_created_at  ON merchant_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_type        ON merchant_ledger(type);
CREATE INDEX IF NOT EXISTS idx_ledger_tx_id       ON merchant_ledger(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_idempotency ON merchant_ledger(idempotency_key);

-- ────────────────────────────────────────────────────────────────
-- 4. RLS Policies
-- ────────────────────────────────────────────────────────────────
ALTER TABLE merchant_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_ledger   ENABLE ROW LEVEL SECURITY;

-- merchant_wallets policies
DROP POLICY IF EXISTS "mw_admin_all"         ON merchant_wallets;
DROP POLICY IF EXISTS "mw_merchant_read_own" ON merchant_wallets;

CREATE POLICY "mw_admin_all" ON merchant_wallets
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "mw_merchant_read_own" ON merchant_wallets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.merchant_id = merchant_wallets.merchant_id
        AND profiles.role = 'merchant'
    )
  );

-- merchant_ledger policies
DROP POLICY IF EXISTS "ml_admin_all"         ON merchant_ledger;
DROP POLICY IF EXISTS "ml_merchant_read_own" ON merchant_ledger;

CREATE POLICY "ml_admin_all" ON merchant_ledger
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "ml_merchant_read_own" ON merchant_ledger
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.merchant_id = merchant_ledger.merchant_id
        AND profiles.role = 'merchant'
    )
  );

-- ────────────────────────────────────────────────────────────────
-- 5. Triggers
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_merchant_wallets_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS merchant_wallets_updated_at ON merchant_wallets;
CREATE TRIGGER merchant_wallets_updated_at
  BEFORE UPDATE ON merchant_wallets
  FOR EACH ROW EXECUTE FUNCTION set_merchant_wallets_updated_at();

-- ────────────────────────────────────────────────────────────────
-- 6. Helper: ensure wallet row exists for a merchant
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ensure_merchant_wallet(p_merchant_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wallet_id uuid;
BEGIN
  SELECT id INTO v_wallet_id FROM merchant_wallets WHERE merchant_id = p_merchant_id;
  IF v_wallet_id IS NULL THEN
    INSERT INTO merchant_wallets (merchant_id)
    VALUES (p_merchant_id)
    RETURNING id INTO v_wallet_id;
  END IF;
  RETURN v_wallet_id;
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- 7. RPC: merchant_wallet_recharge (Atomic)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION merchant_wallet_recharge(
  p_merchant_id    uuid,
  p_amount         integer,
  p_reason         text DEFAULT NULL,
  p_notes          text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_admin_id       uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wallet_id      uuid;
  v_before         integer;
  v_after          integer;
  v_tx_id          text;
  v_now            timestamptz := now();
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'amount_must_be_positive');
  END IF;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM 1 FROM merchant_ledger WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('success', true, 'idempotent', true);
    END IF;
  END IF;

  -- Lock wallet row
  SELECT id, current_points INTO v_wallet_id, v_before
  FROM merchant_wallets
  WHERE merchant_id = p_merchant_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    v_before := 0;
    INSERT INTO merchant_wallets (merchant_id, current_points, lifetime_purchased, last_recharge_at, last_operation_at)
    VALUES (p_merchant_id, p_amount, p_amount, v_now, v_now)
    RETURNING id INTO v_wallet_id;
    v_after := p_amount;
  ELSE
    v_after := v_before + p_amount;
    UPDATE merchant_wallets
    SET current_points     = v_after,
        lifetime_purchased = lifetime_purchased + p_amount,
        last_recharge_at   = v_now,
        last_operation_at  = v_now,
        updated_at         = v_now
    WHERE id = v_wallet_id;
  END IF;

  v_tx_id := 'RCH-' || gen_random_uuid()::text;

  INSERT INTO merchant_ledger (
    transaction_id, merchant_id, type, amount, balance_before, balance_after,
    reason, notes, created_by, idempotency_key, created_at
  ) VALUES (
    v_tx_id, p_merchant_id, 'recharge', p_amount, v_before, v_after,
    p_reason, p_notes, p_admin_id, p_idempotency_key, v_now
  );

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id, 'balance_before', v_before, 'balance_after', v_after);
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- 8. RPC: merchant_wallet_deduct (Atomic — rejects if insufficient)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION merchant_wallet_deduct(
  p_merchant_id     uuid,
  p_amount          integer,
  p_reason          text DEFAULT NULL,
  p_notes           text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_admin_id        uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wallet_id      uuid;
  v_before         integer;
  v_after          integer;
  v_tx_id          text;
  v_now            timestamptz := now();
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'amount_must_be_positive');
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM 1 FROM merchant_ledger WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('success', true, 'idempotent', true);
    END IF;
  END IF;

  SELECT id, current_points INTO v_wallet_id, v_before
  FROM merchant_wallets
  WHERE merchant_id = p_merchant_id
  FOR UPDATE;

  IF v_wallet_id IS NULL OR v_before < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance', 'current_balance', COALESCE(v_before, 0));
  END IF;

  v_after := v_before - p_amount;

  UPDATE merchant_wallets
  SET current_points    = v_after,
      used_points       = used_points + p_amount,
      lifetime_consumed = lifetime_consumed + p_amount,
      monthly_consumed  = monthly_consumed + p_amount,
      daily_consumed    = daily_consumed + p_amount,
      last_operation_at = v_now,
      updated_at        = v_now
  WHERE id = v_wallet_id;

  v_tx_id := 'DED-' || gen_random_uuid()::text;

  INSERT INTO merchant_ledger (
    transaction_id, merchant_id, type, amount, balance_before, balance_after,
    reason, notes, created_by, idempotency_key, created_at
  ) VALUES (
    v_tx_id, p_merchant_id, 'deduct', p_amount, v_before, v_after,
    p_reason, p_notes, p_admin_id, p_idempotency_key, v_now
  );

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id, 'balance_before', v_before, 'balance_after', v_after);
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- 9. RPC: merchant_wallet_refund (Atomic)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION merchant_wallet_refund(
  p_merchant_id     uuid,
  p_amount          integer,
  p_reason          text DEFAULT NULL,
  p_notes           text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_admin_id        uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wallet_id      uuid;
  v_before         integer;
  v_after          integer;
  v_tx_id          text;
  v_now            timestamptz := now();
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'amount_must_be_positive');
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM 1 FROM merchant_ledger WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('success', true, 'idempotent', true);
    END IF;
  END IF;

  SELECT id, current_points INTO v_wallet_id, v_before
  FROM merchant_wallets
  WHERE merchant_id = p_merchant_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    v_before := 0;
    INSERT INTO merchant_wallets (merchant_id, current_points, last_operation_at)
    VALUES (p_merchant_id, p_amount, v_now)
    RETURNING id INTO v_wallet_id;
    v_after := p_amount;
  ELSE
    v_after := v_before + p_amount;
    UPDATE merchant_wallets
    SET current_points    = v_after,
        last_operation_at = v_now,
        updated_at        = v_now
    WHERE id = v_wallet_id;
  END IF;

  v_tx_id := 'RFD-' || gen_random_uuid()::text;

  INSERT INTO merchant_ledger (
    transaction_id, merchant_id, type, amount, balance_before, balance_after,
    reason, notes, created_by, idempotency_key, created_at
  ) VALUES (
    v_tx_id, p_merchant_id, 'refund', p_amount, v_before, v_after,
    p_reason, p_notes, p_admin_id, p_idempotency_key, v_now
  );

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id, 'balance_before', v_before, 'balance_after', v_after);
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- 10. RPC: merchant_wallet_adjust (Atomic — can add or remove)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION merchant_wallet_adjust(
  p_merchant_id     uuid,
  p_amount          integer,
  p_reason          text DEFAULT NULL,
  p_notes           text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_admin_id        uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wallet_id      uuid;
  v_before         integer;
  v_after          integer;
  v_tx_id          text;
  v_now            timestamptz := now();
BEGIN
  IF p_amount = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'amount_cannot_be_zero');
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM 1 FROM merchant_ledger WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('success', true, 'idempotent', true);
    END IF;
  END IF;

  SELECT id, current_points INTO v_wallet_id, v_before
  FROM merchant_wallets
  WHERE merchant_id = p_merchant_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    v_before := 0;
    IF p_amount < 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance', 'current_balance', 0);
    END IF;
    INSERT INTO merchant_wallets (merchant_id, current_points, last_operation_at)
    VALUES (p_merchant_id, p_amount, v_now)
    RETURNING id INTO v_wallet_id;
    v_after := p_amount;
  ELSE
    v_after := v_before + p_amount;
    IF v_after < 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance', 'current_balance', v_before);
    END IF;
    UPDATE merchant_wallets
    SET current_points    = v_after,
        last_operation_at = v_now,
        updated_at        = v_now
    WHERE id = v_wallet_id;
  END IF;

  v_tx_id := 'ADJ-' || gen_random_uuid()::text;

  INSERT INTO merchant_ledger (
    transaction_id, merchant_id, type, amount, balance_before, balance_after,
    reason, notes, created_by, idempotency_key, created_at
  ) VALUES (
    v_tx_id, p_merchant_id, 'adjustment', p_amount, v_before, v_after,
    p_reason, p_notes, p_admin_id, p_idempotency_key, v_now
  );

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id, 'balance_before', v_before, 'balance_after', v_after);
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- 11. RPC: get_merchant_wallet
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_merchant_wallet(p_merchant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_rec record;
BEGIN
  SELECT * INTO v_rec FROM merchant_wallets WHERE merchant_id = p_merchant_id;
  IF v_rec IS NULL THEN
    RETURN jsonb_build_object('success', true, 'wallet', null);
  END IF;
  RETURN jsonb_build_object('success', true, 'wallet', jsonb_build_object(
    'id', v_rec.id,
    'merchant_id', v_rec.merchant_id,
    'current_points', v_rec.current_points,
    'used_points', v_rec.used_points,
    'reserved_points', v_rec.reserved_points,
    'remaining_points', v_rec.current_points - v_rec.reserved_points,
    'lifetime_consumed', v_rec.lifetime_consumed,
    'lifetime_purchased', v_rec.lifetime_purchased,
    'monthly_consumed', v_rec.monthly_consumed,
    'daily_consumed', v_rec.daily_consumed,
    'last_operation_at', v_rec.last_operation_at,
    'last_recharge_at', v_rec.last_recharge_at,
    'created_at', v_rec.created_at,
    'updated_at', v_rec.updated_at
  ));
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- 12. RPC: get_merchant_ledger
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_merchant_ledger(
  p_merchant_id uuid,
  p_limit       integer DEFAULT 50,
  p_offset      integer DEFAULT 0,
  p_type        text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total integer;
  v_items jsonb;
BEGIN
  SELECT count(*) INTO v_total FROM merchant_ledger WHERE merchant_id = p_merchant_id
    AND (p_type IS NULL OR type = p_type::merchant_tx_type);

  SELECT jsonb_agg(jsonb_build_object(
    'id', l.id,
    'transaction_id', l.transaction_id,
    'merchant_id', l.merchant_id,
    'type', l.type,
    'amount', l.amount,
    'balance_before', l.balance_before,
    'balance_after', l.balance_after,
    'reason', l.reason,
    'notes', l.notes,
    'created_by', l.created_by,
    'correlation_id', l.correlation_id,
    'idempotency_key', l.idempotency_key,
    'created_at', l.created_at
  ) ORDER BY l.created_at DESC)
  INTO v_items
  FROM merchant_ledger l
  WHERE l.merchant_id = p_merchant_id
    AND (p_type IS NULL OR l.type = p_type::merchant_tx_type)
  LIMIT p_limit OFFSET p_offset;

  RETURN jsonb_build_object('success', true, 'total', v_total, 'items', COALESCE(v_items, '[]'::jsonb));
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- 13. Backfill: create wallet rows for existing merchants
-- ────────────────────────────────────────────────────────────────
INSERT INTO merchant_wallets (merchant_id, current_points, used_points)
SELECT m.id, m.total_points, m.used_points
FROM merchants m
LEFT JOIN merchant_wallets w ON w.merchant_id = m.id
WHERE w.id IS NULL
ON CONFLICT (merchant_id) DO NOTHING;