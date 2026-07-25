
-- إصلاح get_merchant_client_data: تصحيح member_status → status
CREATE OR REPLACE FUNCTION public.get_merchant_client_data(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile   profiles%ROWTYPE;
  v_merchant  merchants%ROWTYPE;
  v_member    merchant_members%ROWTYPE;
  v_sub       JSONB := NULL;
  v_sub_row   subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;
  IF v_profile.merchant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_merchant_client');
  END IF;

  SELECT * INTO v_merchant FROM merchants WHERE id = v_profile.merchant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'merchant_not_found');
  END IF;

  SELECT * INTO v_member FROM merchant_members
  WHERE merchant_id = v_profile.merchant_id AND user_id = p_user_id;

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
    'success', true,
    'merchant', jsonb_build_object(
      'id',          v_merchant.id,
      'name',        v_merchant.name,
      'status',      v_merchant.status,
      'brand_color', v_merchant.brand_color,
      'logo_url',    v_merchant.logo_url,
      'welcome_msg', v_merchant.welcome_msg
    ),
    'member', CASE WHEN v_member.user_id IS NOT NULL THEN jsonb_build_object(
      'member_status', v_member.status,
      'joined_at',     v_member.created_at,
      'last_op_at',    v_member.last_operation_at
    ) ELSE NULL END,
    'subscription', v_sub
  );
END;
$$;

-- إعادة إنشاء ensure_merchant_member بعد حذف النسخة القديمة
DROP FUNCTION IF EXISTS public.ensure_merchant_member(uuid, uuid);
CREATE OR REPLACE FUNCTION public.ensure_merchant_member(
  p_merchant_id uuid,
  p_user_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO merchant_members (merchant_id, user_id, status)
  VALUES (p_merchant_id, p_user_id, 'pending')
  ON CONFLICT (merchant_id, user_id) DO NOTHING;
END;
$$;

-- تحديث link_user_to_invite_token ليُنشئ سجل العضو تلقائياً
CREATE OR REPLACE FUNCTION public.link_user_to_invite_token(
  p_user_id uuid,
  p_token   text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invite    merchant_invites%ROWTYPE;
  v_merchant  merchants%ROWTYPE;
  v_profile   profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_invite FROM merchant_invites
  WHERE token = p_token AND status = 'active';
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
    -- مرتبط مسبقاً — أنشئ سجل العضو إن لم يكن موجوداً
    PERFORM ensure_merchant_member(v_invite.merchant_id, p_user_id);
    RETURN jsonb_build_object(
      'success', true, 'duplicate', true,
      'merchant_id', v_invite.merchant_id,
      'merchant_name', v_merchant.name
    );
  END IF;

  -- تحديث profiles.merchant_id
  UPDATE profiles SET merchant_id = v_invite.merchant_id WHERE id = p_user_id;

  -- إنشاء سجل العضو بحالة pending
  PERFORM ensure_merchant_member(v_invite.merchant_id, p_user_id);

  -- تحديث إحصائيات الدعوة
  UPDATE merchant_invites
  SET views = views + 1,
      joins = joins + 1,
      updated_at = now()
  WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'success', true, 'duplicate', false,
    'merchant_id', v_invite.merchant_id,
    'merchant_name', v_merchant.name
  );
END;
$$;
