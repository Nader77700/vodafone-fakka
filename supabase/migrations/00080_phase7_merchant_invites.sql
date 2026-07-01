
-- ══════════════════════════════════════════════════════════════════
-- Phase 7: Merchant Invite & Client Routing
-- Tables: merchant_invites, invite_usage_logs
-- RPCs: validate_invite_token, link_user_to_invite_token,
--        get_merchant_invite, regenerate_invite_token, set_invite_token_status
-- ══════════════════════════════════════════════════════════════════

-- ─── Enum ─────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE invite_token_status AS ENUM ('active','disabled','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- helper: generate a 48-char URL-safe token from 24 random bytes
CREATE OR REPLACE FUNCTION _gen_invite_token()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER AS $$
  SELECT translate(rtrim(encode(gen_random_bytes(24),'base64'),'='),'+/','-_');
$$;

-- ─── merchant_invites ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merchant_invites (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID          NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  token           TEXT          NOT NULL UNIQUE,
  status          invite_token_status NOT NULL DEFAULT 'active',
  expires_at      TIMESTAMPTZ   NULL,
  view_count      INTEGER       NOT NULL DEFAULT 0 CHECK (view_count  >= 0),
  join_count      INTEGER       NOT NULL DEFAULT 0 CHECK (join_count  >= 0),
  last_viewed_at  TIMESTAMPTZ   NULL,
  last_joined_at  TIMESTAMPTZ   NULL,
  last_joined_user_id UUID      NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_invites_merchant_id ON merchant_invites(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_invites_token       ON merchant_invites(token);
CREATE INDEX IF NOT EXISTS idx_merchant_invites_status      ON merchant_invites(status);

-- ─── invite_usage_logs ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invite_usage_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id   UUID        NOT NULL REFERENCES merchant_invites(id) ON DELETE CASCADE,
  merchant_id UUID        NOT NULL,
  user_id     UUID        NULL REFERENCES profiles(id) ON DELETE SET NULL,
  action      TEXT        NOT NULL CHECK (action IN ('view','join','reject','duplicate')),
  reject_reason TEXT      NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invite_usage_logs_invite_id   ON invite_usage_logs(invite_id);
CREATE INDEX IF NOT EXISTS idx_invite_usage_logs_merchant_id ON invite_usage_logs(merchant_id);
CREATE INDEX IF NOT EXISTS idx_invite_usage_logs_user_id     ON invite_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_invite_usage_logs_created_at  ON invite_usage_logs(created_at);

-- ─── RLS ──────────────────────────────────────────────────────────
ALTER TABLE merchant_invites    ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_usage_logs   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invite_admin_all" ON merchant_invites FOR ALL TO authenticated
  USING   (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));

CREATE POLICY "invite_merchant_read" ON merchant_invites FOR SELECT TO authenticated
  USING (merchant_id = (SELECT merchant_id FROM profiles WHERE id = auth.uid() AND role = 'merchant'));

CREATE POLICY "invite_log_admin_all" ON invite_usage_logs FOR ALL TO authenticated
  USING   (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));

CREATE POLICY "invite_log_merchant_read" ON invite_usage_logs FOR SELECT TO authenticated
  USING (merchant_id = (SELECT merchant_id FROM profiles WHERE id = auth.uid() AND role = 'merchant'));

-- ─── Seed one invite per existing active merchant ────────────────
INSERT INTO merchant_invites (merchant_id, token, status)
SELECT id, _gen_invite_token(), 'active'
FROM   merchants
WHERE  status = 'active'
  AND  id NOT IN (SELECT merchant_id FROM merchant_invites)
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════════
-- RPC 1: validate_invite_token
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION validate_invite_token(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invite  merchant_invites%ROWTYPE;
  v_merch   merchants%ROWTYPE;
BEGIN
  SELECT * INTO v_invite FROM merchant_invites WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'token_not_found');
  END IF;
  IF v_invite.status = 'disabled' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'invite_disabled');
  END IF;
  IF v_invite.status = 'expired' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'invite_expired');
  END IF;
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < NOW() THEN
    UPDATE merchant_invites SET status = 'expired', updated_at = NOW() WHERE id = v_invite.id;
    RETURN jsonb_build_object('valid', false, 'error', 'invite_expired');
  END IF;
  SELECT * INTO v_merch FROM merchants WHERE id = v_invite.merchant_id;
  IF NOT FOUND OR v_merch.status != 'active' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'merchant_inactive');
  END IF;
  UPDATE merchant_invites
  SET view_count = view_count + 1, last_viewed_at = NOW(), updated_at = NOW()
  WHERE id = v_invite.id;
  INSERT INTO invite_usage_logs(invite_id, merchant_id, user_id, action)
  VALUES (v_invite.id, v_invite.merchant_id, NULL, 'view');
  RETURN jsonb_build_object(
    'valid',         true,
    'invite_id',     v_invite.id,
    'merchant_id',   v_invite.merchant_id,
    'merchant_name', v_merch.business_name,
    'token',         v_invite.token
  );
END; $$;

-- ══════════════════════════════════════════════════════════════════
-- RPC 2: link_user_to_invite_token
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION link_user_to_invite_token(p_user_id UUID, p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invite   merchant_invites%ROWTYPE;
  v_merch    merchants%ROWTYPE;
  v_profile  profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_invite FROM merchant_invites WHERE token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'token_not_found'); END IF;
  IF v_invite.status != 'active' THEN RETURN jsonb_build_object('success', false, 'error', 'invite_not_active'); END IF;
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'invite_expired');
  END IF;
  SELECT * INTO v_merch FROM merchants WHERE id = v_invite.merchant_id;
  IF NOT FOUND OR v_merch.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'merchant_inactive');
  END IF;
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'user_not_found'); END IF;

  -- Already linked to same merchant
  IF v_profile.merchant_id IS NOT NULL AND v_profile.merchant_id = v_invite.merchant_id THEN
    INSERT INTO invite_usage_logs(invite_id, merchant_id, user_id, action, reject_reason)
    VALUES (v_invite.id, v_invite.merchant_id, p_user_id, 'duplicate', 'already_linked_same');
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'merchant_id', v_invite.merchant_id);
  END IF;

  -- Already linked to different merchant
  IF v_profile.merchant_id IS NOT NULL THEN
    INSERT INTO invite_usage_logs(invite_id, merchant_id, user_id, action, reject_reason)
    VALUES (v_invite.id, v_invite.merchant_id, p_user_id, 'reject', 'already_linked_other');
    RETURN jsonb_build_object('success', false, 'error', 'user_already_linked_to_other_merchant');
  END IF;

  -- Link user
  UPDATE profiles SET merchant_id = v_invite.merchant_id, updated_at = NOW() WHERE id = p_user_id;

  INSERT INTO merchant_members(merchant_id, user_id, member_status)
  VALUES (v_invite.merchant_id, p_user_id, 'pending')
  ON CONFLICT (merchant_id, user_id) DO UPDATE
    SET member_status = EXCLUDED.member_status, last_operation_at = NOW();

  UPDATE merchant_invites
  SET join_count = join_count + 1, last_joined_at = NOW(),
      last_joined_user_id = p_user_id, updated_at = NOW()
  WHERE id = v_invite.id;

  INSERT INTO invite_usage_logs(invite_id, merchant_id, user_id, action)
  VALUES (v_invite.id, v_invite.merchant_id, p_user_id, 'join');

  RETURN jsonb_build_object(
    'success', true,
    'merchant_id',   v_invite.merchant_id,
    'merchant_name', v_merch.business_name
  );
END; $$;

-- ══════════════════════════════════════════════════════════════════
-- RPC 3: get_merchant_invite
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_merchant_invite(p_merchant_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invite  merchant_invites%ROWTYPE;
  v_joined  JSONB;
BEGIN
  SELECT * INTO v_invite
  FROM merchant_invites WHERE merchant_id = p_merchant_id
  ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO merchant_invites(merchant_id, token, status)
    VALUES (p_merchant_id, _gen_invite_token(), 'active')
    RETURNING * INTO v_invite;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id',   l.user_id,
    'username',  p.username,
    'phone',     p.phone,
    'joined_at', l.created_at
  ) ORDER BY l.created_at DESC), '[]'::JSONB)
  INTO v_joined
  FROM (
    SELECT * FROM invite_usage_logs
    WHERE invite_id = v_invite.id AND action = 'join'
    ORDER BY created_at DESC LIMIT 5
  ) l
  LEFT JOIN profiles p ON p.id = l.user_id;

  RETURN jsonb_build_object(
    'id',                  v_invite.id,
    'token',               v_invite.token,
    'status',              v_invite.status,
    'expires_at',          v_invite.expires_at,
    'view_count',          v_invite.view_count,
    'join_count',          v_invite.join_count,
    'last_viewed_at',      v_invite.last_viewed_at,
    'last_joined_at',      v_invite.last_joined_at,
    'last_joined_user_id', v_invite.last_joined_user_id,
    'created_at',          v_invite.created_at,
    'recent_joins',        v_joined
  );
END; $$;

-- ══════════════════════════════════════════════════════════════════
-- RPC 4: regenerate_invite_token
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION regenerate_invite_token(p_merchant_id UUID, p_admin_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new_token TEXT;
  v_invite    merchant_invites%ROWTYPE;
BEGIN
  v_new_token := _gen_invite_token();
  UPDATE merchant_invites SET status = 'expired', updated_at = NOW()
  WHERE merchant_id = p_merchant_id AND status = 'active';
  INSERT INTO merchant_invites(merchant_id, token, status)
  VALUES (p_merchant_id, v_new_token, 'active')
  RETURNING * INTO v_invite;
  RETURN jsonb_build_object('success', true, 'token', v_new_token, 'id', v_invite.id);
END; $$;

-- ══════════════════════════════════════════════════════════════════
-- RPC 5: set_invite_token_status
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION set_invite_token_status(p_merchant_id UUID, p_status TEXT, p_admin_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE affected INTEGER;
BEGIN
  IF p_status NOT IN ('active','disabled','expired') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status');
  END IF;
  UPDATE merchant_invites
  SET status = p_status::invite_token_status, updated_at = NOW()
  WHERE id = (SELECT id FROM merchant_invites WHERE merchant_id = p_merchant_id ORDER BY created_at DESC LIMIT 1);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected = 0 THEN RETURN jsonb_build_object('success', false, 'error', 'invite_not_found'); END IF;
  RETURN jsonb_build_object('success', true, 'status', p_status);
END; $$;

-- ─── Grants ───────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION _gen_invite_token()                          TO authenticated;
GRANT EXECUTE ON FUNCTION validate_invite_token(TEXT)                  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION link_user_to_invite_token(UUID, TEXT)        TO authenticated;
GRANT EXECUTE ON FUNCTION get_merchant_invite(UUID)                    TO authenticated;
GRANT EXECUTE ON FUNCTION regenerate_invite_token(UUID, UUID)          TO authenticated;
GRANT EXECUTE ON FUNCTION set_invite_token_status(UUID, TEXT, UUID)    TO authenticated;
