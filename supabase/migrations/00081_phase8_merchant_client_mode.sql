
-- ══════════════════════════════════════════════════════════════════
-- Phase 8: Merchant Client Mode
-- ── Branding columns on merchants
-- ── get_merchant_client_data(p_user_id) RPC
-- ══════════════════════════════════════════════════════════════════

-- ─── Merchant Branding columns ────────────────────────────────────
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS brand_color   TEXT    NULL,   -- e.g. '#E60000'
  ADD COLUMN IF NOT EXISTS logo_url      TEXT    NULL,   -- URL to merchant logo
  ADD COLUMN IF NOT EXISTS welcome_msg   TEXT    NULL;   -- custom greeting

-- ══════════════════════════════════════════════════════════════════
-- RPC: get_merchant_client_data
-- Returns everything a Merchant Client UI needs in a single call:
--   merchant: id, name/business_name, status, branding
--   member:   member_status, joined_at
--   sub:      status, ops_count, ops_limit, ops_remaining, expires_at, in_grace
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_merchant_client_data(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile   profiles%ROWTYPE;
  v_merchant  merchants%ROWTYPE;
  v_member    merchant_members%ROWTYPE;
  v_sub       JSONB := NULL;
  v_sub_row   subscriptions%ROWTYPE;
BEGIN
  -- 1. Load profile
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  IF v_profile.merchant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_merchant_client');
  END IF;

  -- 2. Load merchant
  SELECT * INTO v_merchant FROM merchants WHERE id = v_profile.merchant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'merchant_not_found');
  END IF;

  -- 3. Load merchant_member record (if exists)
  SELECT * INTO v_member FROM merchant_members
  WHERE merchant_id = v_profile.merchant_id AND user_id = p_user_id;

  -- 4. Load active subscription (most recent non-expired)
  SELECT * INTO v_sub_row FROM subscriptions
  WHERE user_id = p_user_id
  ORDER BY
    CASE status
      WHEN 'active'       THEN 1
      WHEN 'grace_period' THEN 2
      WHEN 'trial'        THEN 3
      ELSE 4
    END,
    created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_sub := jsonb_build_object(
      'id',             v_sub_row.id,
      'status',         v_sub_row.status,
      'ops_count',      v_sub_row.ops_count,
      'ops_limit',      v_sub_row.ops_limit,
      'ops_remaining',  v_sub_row.ops_remaining,
      'expires_at',     v_sub_row.expires_at,
      'in_grace_period',v_sub_row.in_grace_period,
      'activated_at',   v_sub_row.activated_at
    );
  END IF;

  RETURN jsonb_build_object(
    'success',      true,
    'merchant', jsonb_build_object(
      'id',           v_merchant.id,
      'name',         v_merchant.name,
      'status',       v_merchant.status,
      'brand_color',  v_merchant.brand_color,
      'logo_url',     v_merchant.logo_url,
      'welcome_msg',  v_merchant.welcome_msg
    ),
    'member', CASE WHEN v_member.user_id IS NOT NULL THEN jsonb_build_object(
      'member_status',  v_member.member_status,
      'joined_at',      v_member.created_at,
      'last_op_at',     v_member.last_operation_at
    ) ELSE NULL END,
    'subscription', v_sub
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_merchant_client_data(UUID) TO authenticated;
