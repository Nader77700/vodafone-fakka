
-- ══════════════════════════════════════════════════════════════════
-- إصلاح validate_invite_token: يقبل merchant_invites.token أو merchants.invite_code
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.validate_invite_token(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invite  merchant_invites%ROWTYPE;
  v_merch   merchants%ROWTYPE;
BEGIN
  -- محاولة 1: البحث في merchant_invites.token
  SELECT * INTO v_invite FROM merchant_invites WHERE token = p_token;

  -- محاولة 2: البحث عبر merchants.invite_code
  IF NOT FOUND THEN
    SELECT mi.* INTO v_invite
    FROM merchant_invites mi
    JOIN merchants m ON m.id = mi.merchant_id
    WHERE m.invite_code = p_token
      AND m.invite_enabled = true
      AND m.invite_status = 'active'
    ORDER BY mi.created_at DESC
    LIMIT 1;
  END IF;

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
  VALUES (v_invite.id, v_invite.merchant_id, NULL, 'view')
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'valid',         true,
    'invite_id',     v_invite.id,
    'merchant_id',   v_invite.merchant_id,
    'merchant_name', v_merch.name,
    'token',         v_invite.token
  );
END;
$function$;

-- ══════════════════════════════════════════════════════════════════
-- إصلاح link_user_to_invite_token: يقبل merchant_invites.token أو merchants.invite_code
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.link_user_to_invite_token(p_user_id uuid, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invite    merchant_invites%ROWTYPE;
  v_merchant  merchants%ROWTYPE;
  v_profile   profiles%ROWTYPE;
BEGIN
  -- محاولة 1: البحث في merchant_invites.token
  SELECT * INTO v_invite FROM merchant_invites
  WHERE token = p_token AND status = 'active';

  -- محاولة 2: البحث عبر merchants.invite_code
  IF NOT FOUND THEN
    SELECT mi.* INTO v_invite
    FROM merchant_invites mi
    JOIN merchants m ON m.id = mi.merchant_id
    WHERE m.invite_code = p_token
      AND mi.status = 'active'
      AND m.invite_enabled = true
      AND m.invite_status = 'active'
    ORDER BY mi.created_at DESC
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invite_expired');
  END IF;

  SELECT * INTO v_merchant FROM merchants WHERE id = v_invite.merchant_id AND status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'merchant_inactive');
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  IF v_profile.merchant_id IS NOT NULL AND v_profile.merchant_id <> v_invite.merchant_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_already_linked_to_other_merchant');
  END IF;

  IF v_profile.merchant_id = v_invite.merchant_id THEN
    PERFORM ensure_merchant_member(v_invite.merchant_id, p_user_id);
    RETURN jsonb_build_object(
      'success', true, 'duplicate', true,
      'merchant_id', v_invite.merchant_id,
      'merchant_name', v_merchant.name
    );
  END IF;

  -- ربط المستخدم بالتاجر
  UPDATE profiles SET merchant_id = v_invite.merchant_id WHERE id = p_user_id;
  PERFORM ensure_merchant_member(v_invite.merchant_id, p_user_id);

  UPDATE merchant_invites
  SET view_count    = view_count + 1,
      join_count    = COALESCE(join_count, 0) + 1,
      last_joined_at = NOW(),
      last_joined_user_id = p_user_id,
      updated_at    = NOW()
  WHERE id = v_invite.id;

  INSERT INTO invite_usage_logs(invite_id, merchant_id, user_id, action)
  VALUES (v_invite.id, v_invite.merchant_id, p_user_id, 'join')
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true, 'duplicate', false,
    'merchant_id', v_invite.merchant_id,
    'merchant_name', v_merchant.name
  );
END;
$function$;
