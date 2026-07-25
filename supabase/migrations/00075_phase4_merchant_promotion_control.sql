
-- ================================================================
-- PHASE 4: Merchant Promotion & Control Core
-- ADDITIVE ONLY — No existing tables/columns dropped
-- ================================================================

-- 1. أعمدة جديدة في جدول merchants (Additive Only)
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS invite_enabled   boolean       NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invite_status    text          NOT NULL DEFAULT 'active'
    CHECK (invite_status IN ('active', 'disabled', 'expired')),
  ADD COLUMN IF NOT EXISTS balance          numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ops_count        integer       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_seen_at     timestamptz;

-- 2. Index لـ invite_enabled
CREATE INDEX IF NOT EXISTS idx_merchants_invite_enabled ON merchants(invite_enabled);

-- ────────────────────────────────────────────────────────────────
-- 3. RPC: update_merchant_invite_status
--    يغير حالة الدعوة (active / disabled / expired) وinvite_enabled
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_merchant_invite_status(
  p_merchant_id uuid,
  p_status      text,  -- 'active' | 'disabled' | 'expired'
  p_admin_id    uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_status NOT IN ('active', 'disabled', 'expired') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status');
  END IF;

  UPDATE merchants
  SET invite_status  = p_status,
      invite_enabled = (p_status = 'active'),
      updated_at     = now()
  WHERE id = p_merchant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'merchant_not_found');
  END IF;

  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- 4. RPC: update_merchant_status_admin
--    يتحكم في حالة التاجر (active/suspended/disabled/blocked/deleted)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_merchant_status_admin(
  p_merchant_id uuid,
  p_status      text,
  p_admin_id    uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_status NOT IN ('active','suspended','disabled','blocked','deleted') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status');
  END IF;

  UPDATE merchants
  SET status     = p_status::merchant_status,
      updated_at = now()
  WHERE id = p_merchant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'merchant_not_found');
  END IF;

  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- 5. RPC: get_all_merchants_with_stats
--    يُعيد كل التجار مع إحصائيات المستخدمين والعمليات
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_all_merchants_with_stats()
RETURNS TABLE(
  id            uuid,
  name          text,
  status        text,
  invite_code   text,
  invite_enabled boolean,
  invite_status  text,
  notes         text,
  total_points  integer,
  used_points   integer,
  balance       numeric,
  ops_count     integer,
  created_by    uuid,
  created_at    timestamptz,
  updated_at    timestamptz,
  last_seen_at  timestamptz,
  users_count   bigint,
  active_users  bigint,
  blocked_users bigint
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
    SELECT
      m.id,
      m.name,
      m.status::text,
      m.invite_code,
      m.invite_enabled,
      m.invite_status,
      m.notes,
      m.total_points,
      m.used_points,
      m.balance,
      m.ops_count,
      m.created_by,
      m.created_at,
      m.updated_at,
      m.last_seen_at,
      COUNT(p.id)                              AS users_count,
      COUNT(p.id) FILTER (WHERE p.is_active)   AS active_users,
      COUNT(p.id) FILTER (WHERE NOT p.is_active) AS blocked_users
    FROM merchants m
    LEFT JOIN profiles p ON p.merchant_id = m.id
    GROUP BY m.id
    ORDER BY m.created_at DESC;
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- 6. RPC: get_merchant_detail
--    تفاصيل تاجر واحد مع إحصائياته الكاملة
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_merchant_detail(p_merchant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_merchant   merchants%ROWTYPE;
  v_owner_profile jsonb;
  v_stats      jsonb;
  v_ops        bigint := 0;
BEGIN
  SELECT * INTO v_merchant FROM merchants WHERE id = p_merchant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  -- بيانات المالك
  SELECT jsonb_build_object(
    'id',         p.id,
    'username',   p.username,
    'email',      p.email,
    'phone',      p.phone,
    'full_name',  p.full_name,
    'avatar_url', p.avatar_url,
    'role',       p.role::text,
    'is_active',  p.is_active,
    'created_at', p.created_at,
    'last_sign_in_at', (SELECT last_sign_in_at FROM auth.users WHERE id = p.id)
  )
  INTO v_owner_profile
  FROM profiles p
  WHERE p.id = v_merchant.created_by;

  -- إحصائيات المستخدمين
  SELECT jsonb_build_object(
    'total_users',   COUNT(*),
    'active_users',  COUNT(*) FILTER (WHERE is_active),
    'blocked_users', COUNT(*) FILTER (WHERE NOT is_active)
  )
  INTO v_stats
  FROM profiles
  WHERE merchant_id = p_merchant_id;

  -- عدد العمليات
  SELECT COUNT(*) INTO v_ops
  FROM operations
  WHERE user_id = v_merchant.created_by;

  RETURN jsonb_build_object(
    'success',        true,
    'id',             v_merchant.id,
    'name',           v_merchant.name,
    'status',         v_merchant.status::text,
    'invite_code',    v_merchant.invite_code,
    'invite_enabled', v_merchant.invite_enabled,
    'invite_status',  v_merchant.invite_status,
    'notes',          v_merchant.notes,
    'total_points',   v_merchant.total_points,
    'used_points',    v_merchant.used_points,
    'balance',        v_merchant.balance,
    'ops_count',      v_ops,
    'created_by',     v_merchant.created_by,
    'created_at',     v_merchant.created_at,
    'updated_at',     v_merchant.updated_at,
    'last_seen_at',   v_merchant.last_seen_at,
    'owner_profile',  v_owner_profile,
    'stats',          v_stats
  );
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- 7. تحديث validate_invite_code لفحص invite_enabled
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION validate_invite_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_merchant merchants%ROWTYPE;
BEGIN
  SELECT * INTO v_merchant FROM merchants WHERE invite_code = p_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'invalid_code');
  END IF;

  IF v_merchant.status != 'active' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'merchant_inactive');
  END IF;

  IF NOT v_merchant.invite_enabled OR v_merchant.invite_status != 'active' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'invite_disabled');
  END IF;

  RETURN jsonb_build_object(
    'valid',        true,
    'merchant_id',  v_merchant.id,
    'merchant_name', v_merchant.name,
    'invite_code',  v_merchant.invite_code
  );
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- 8. تفعيل Realtime على جدول merchants
-- ────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE merchants;
