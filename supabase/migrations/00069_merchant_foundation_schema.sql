
-- ================================================================
-- PHASE 1: Merchant Foundation Schema (enum already committed)
-- ================================================================

-- 1. Merchant Status Enum
DO $$ BEGIN
  CREATE TYPE merchant_status AS ENUM ('active', 'suspended', 'disabled', 'blocked', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Merchants Table
CREATE TABLE IF NOT EXISTS merchants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  status        merchant_status NOT NULL DEFAULT 'active',
  invite_code   text UNIQUE NOT NULL DEFAULT substring(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  notes         text,
  total_points  integer NOT NULL DEFAULT 0,
  used_points   integer NOT NULL DEFAULT 0,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 3. Add merchant_id to profiles (nullable — existing users unaffected)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS merchant_id uuid REFERENCES merchants(id) ON DELETE SET NULL;

-- 4. RLS on merchants
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "merchants_admin_all"         ON merchants;
DROP POLICY IF EXISTS "merchants_merchant_read_own" ON merchants;

CREATE POLICY "merchants_admin_all" ON merchants
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "merchants_merchant_read_own" ON merchants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.merchant_id = merchants.id
        AND profiles.role = 'merchant'
    )
  );

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_merchant_id ON profiles(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchants_invite_code ON merchants(invite_code);
CREATE INDEX IF NOT EXISTS idx_merchants_status      ON merchants(status);

-- 6. Updated_at trigger
CREATE OR REPLACE FUNCTION set_merchants_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS merchants_updated_at ON merchants;
CREATE TRIGGER merchants_updated_at
  BEFORE UPDATE ON merchants
  FOR EACH ROW EXECUTE FUNCTION set_merchants_updated_at();

-- 7. get_merchant_stats (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION get_merchant_stats(p_merchant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total   integer := 0;
  v_active  integer := 0;
  v_blocked integer := 0;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE is_active = true),
    count(*) FILTER (WHERE is_active = false)
  INTO v_total, v_active, v_blocked
  FROM profiles WHERE merchant_id = p_merchant_id;

  RETURN jsonb_build_object(
    'total_users',   v_total,
    'active_users',  v_active,
    'blocked_users', v_blocked
  );
END;
$$;

-- 8. get_merchant_by_invite_code
CREATE OR REPLACE FUNCTION get_merchant_by_invite_code(p_code text)
RETURNS TABLE(id uuid, name text, status merchant_status)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
    SELECT m.id, m.name, m.status
    FROM merchants m
    WHERE m.invite_code = p_code AND m.status = 'active';
END;
$$;

-- 9. Merchant members view
CREATE OR REPLACE VIEW merchant_members AS
  SELECT
    p.id           AS user_id,
    p.username,
    p.email,
    p.role,
    p.is_active,
    p.created_at,
    p.merchant_id,
    m.name         AS merchant_name,
    m.status       AS merchant_status
  FROM profiles p
  LEFT JOIN merchants m ON p.merchant_id = m.id;
