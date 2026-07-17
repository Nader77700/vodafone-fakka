
-- إصلاح: v_merch.business_name → v_merch.name (الحقل الصحيح في جدول merchants)
CREATE OR REPLACE FUNCTION public.validate_invite_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    'merchant_name', v_merch.name,
    'token',         v_invite.token
  );
END;
$$;
