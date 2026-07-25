
-- ================================================================
-- PHASE 3: Merchant User Management — DB fields + RLS + helpers
-- ================================================================

-- 1. New fields on profiles (all nullable / additive)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS merchant_user_status  text     DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS registration_source   text     DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS invite_token          text,
  ADD COLUMN IF NOT EXISTS merchant_created_at   timestamptz,
  ADD COLUMN IF NOT EXISTS merchant_last_seen    timestamptz,
  ADD COLUMN IF NOT EXISTS device_id             text;

-- 2. Index for fast merchant-user queries
CREATE INDEX IF NOT EXISTS idx_profiles_merchant_id_status
  ON profiles(merchant_id, merchant_user_status)
  WHERE merchant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_invite_token
  ON profiles(invite_token)
  WHERE invite_token IS NOT NULL;

-- 3. validate_invite_code(code) — public RPC (no auth needed for join page)
CREATE OR REPLACE FUNCTION validate_invite_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_merchant merchants%ROWTYPE;
BEGIN
  SELECT * INTO v_merchant FROM merchants WHERE invite_code = p_code LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'invalid_code');
  END IF;

  IF v_merchant.status NOT IN ('active') THEN
    RETURN jsonb_build_object('valid', false, 'error', 'merchant_inactive', 'status', v_merchant.status);
  END IF;

  RETURN jsonb_build_object(
    'valid',        true,
    'merchant_id',  v_merchant.id,
    'merchant_name', v_merchant.name,
    'invite_code',  v_merchant.invite_code
  );
END;
$$;

-- 4. assign_user_to_merchant(user_id, merchant_id, invite_code) — atomic
CREATE OR REPLACE FUNCTION assign_user_to_merchant(
  p_user_id    uuid,
  p_merchant_id uuid,
  p_invite_code text DEFAULT NULL,
  p_source      text DEFAULT 'invite_link'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_existing_merchant_id uuid;
BEGIN
  -- Check if already assigned to a different merchant
  SELECT merchant_id INTO v_existing_merchant_id FROM profiles WHERE id = p_user_id;

  IF v_existing_merchant_id IS NOT NULL AND v_existing_merchant_id != p_merchant_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_assigned_to_other_merchant');
  END IF;

  -- Assign (idempotent if same merchant)
  UPDATE profiles
  SET merchant_id          = p_merchant_id,
      invite_token         = p_invite_code,
      merchant_created_at  = COALESCE(merchant_created_at, now()),
      merchant_last_seen   = now(),
      registration_source  = p_source,
      merchant_user_status = COALESCE(merchant_user_status, 'active'),
      updated_at           = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'merchant_id', p_merchant_id);
END;
$$;

-- 5. get_merchant_users — paginated + filtered
CREATE OR REPLACE FUNCTION get_merchant_users(
  p_merchant_id   uuid,
  p_search        text    DEFAULT NULL,
  p_status        text    DEFAULT NULL,
  p_page          int     DEFAULT 1,
  p_page_size     int     DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_offset    int  := (p_page - 1) * p_page_size;
  v_total     int;
  v_rows      jsonb;
BEGIN
  -- Count
  SELECT COUNT(*) INTO v_total
  FROM profiles
  WHERE merchant_id = p_merchant_id
    AND role NOT IN ('admin', 'super_admin', 'merchant')
    AND (p_status IS NULL OR merchant_user_status = p_status)
    AND (p_search IS NULL OR p_search = ''
      OR username ILIKE '%' || p_search || '%'
      OR phone    ILIKE '%' || p_search || '%');

  -- Rows
  SELECT jsonb_agg(row_to_json(t)) INTO v_rows
  FROM (
    SELECT
      id, username, phone, email,
      is_active, role,
      merchant_user_status, registration_source,
      merchant_created_at, merchant_last_seen,
      created_at, updated_at
    FROM profiles
    WHERE merchant_id = p_merchant_id
      AND role NOT IN ('admin', 'super_admin', 'merchant')
      AND (p_status IS NULL OR merchant_user_status = p_status)
      AND (p_search IS NULL OR p_search = ''
        OR username ILIKE '%' || p_search || '%'
        OR phone    ILIKE '%' || p_search || '%')
    ORDER BY created_at DESC
    LIMIT p_page_size OFFSET v_offset
  ) t;

  RETURN jsonb_build_object(
    'data',       COALESCE(v_rows, '[]'::jsonb),
    'total',      v_total,
    'page',       p_page,
    'page_size',  p_page_size,
    'pages',      CEIL(v_total::numeric / p_page_size)
  );
END;
$$;

-- 6. get_merchant_user_stats — counts by status
CREATE OR REPLACE FUNCTION get_merchant_user_stats(p_merchant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total     int; v_active int; v_suspended int;
  v_blocked   int; v_pending  int;
BEGIN
  SELECT COUNT(*) INTO v_total     FROM profiles WHERE merchant_id = p_merchant_id AND role NOT IN ('admin','super_admin','merchant');
  SELECT COUNT(*) INTO v_active    FROM profiles WHERE merchant_id = p_merchant_id AND merchant_user_status = 'active'    AND role NOT IN ('admin','super_admin','merchant');
  SELECT COUNT(*) INTO v_suspended FROM profiles WHERE merchant_id = p_merchant_id AND merchant_user_status = 'suspended' AND role NOT IN ('admin','super_admin','merchant');
  SELECT COUNT(*) INTO v_blocked   FROM profiles WHERE merchant_id = p_merchant_id AND merchant_user_status = 'blocked'   AND role NOT IN ('admin','super_admin','merchant');
  SELECT COUNT(*) INTO v_pending   FROM profiles WHERE merchant_id = p_merchant_id AND merchant_user_status = 'pending'   AND role NOT IN ('admin','super_admin','merchant');

  RETURN jsonb_build_object(
    'total', v_total, 'active', v_active, 'suspended', v_suspended,
    'blocked', v_blocked, 'pending', v_pending
  );
END;
$$;

-- 7. update_merchant_user_status — merchant can only update their own users
CREATE OR REPLACE FUNCTION update_merchant_user_status(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_new_status  text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_owner_merchant_id uuid;
BEGIN
  SELECT merchant_id INTO v_owner_merchant_id FROM profiles WHERE id = p_user_id;

  IF v_owner_merchant_id IS NULL OR v_owner_merchant_id != p_merchant_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  UPDATE profiles
  SET merchant_user_status = p_new_status,
      merchant_last_seen   = now(),
      updated_at           = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 8. RLS: merchant can only read their own users (additive policy)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "merchant_read_own_users" ON profiles;
CREATE POLICY "merchant_read_own_users" ON profiles
  FOR SELECT
  USING (
    auth.uid() = id  -- own profile
    OR (
      EXISTS (
        SELECT 1 FROM profiles AS p
        WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'super_admin')
      )
    )
    OR (
      merchant_id IS NOT NULL
      AND merchant_id IN (
        SELECT m.id FROM merchants m
        WHERE m.created_by = auth.uid()
      )
    )
  );

-- 9. Merchants view enriched with user counts (for admin panel)
CREATE OR REPLACE VIEW merchants_with_stats AS
SELECT
  m.*,
  COUNT(p.id) FILTER (WHERE p.role NOT IN ('admin','super_admin','merchant'))          AS user_count,
  COUNT(p.id) FILTER (WHERE p.merchant_user_status = 'active' AND p.role NOT IN ('admin','super_admin','merchant'))   AS active_user_count,
  MAX(p.merchant_created_at)                                                              AS last_user_registered
FROM merchants m
LEFT JOIN profiles p ON p.merchant_id = m.id
GROUP BY m.id;
