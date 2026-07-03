
-- ════════════════════════════════════════════════════════════
-- إصلاح admin_suspend_all_members: حذف updated_at غير موجود
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_suspend_all_members(
  p_merchant_id uuid,
  p_admin_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE merchant_members
  SET status = 'suspended'
  WHERE merchant_id = p_merchant_id AND status = 'active';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'suspended_count', v_count);
END;
$$;

-- ════════════════════════════════════════════════════════════
-- إصلاح admin_resume_all_members: حذف updated_at غير موجود
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_resume_all_members(
  p_merchant_id uuid,
  p_admin_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE merchant_members
  SET status = 'active'
  WHERE merchant_id = p_merchant_id AND status = 'suspended';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'resumed_count', v_count);
END;
$$;

-- ════════════════════════════════════════════════════════════
-- إصلاح admin_transfer_member: حذف updated_at غير موجود
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_transfer_member(
  p_user_id       uuid,
  p_from_merchant uuid,
  p_to_merchant   uuid,
  p_admin_id      uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- تعطيل اشتراكات المستخدم في التاجر المصدر
  UPDATE merchant_member_subscriptions
  SET status = 'cancelled'
  WHERE user_id = p_user_id AND merchant_id = p_from_merchant AND status = 'active';

  -- نقل السجل إلى التاجر الجديد
  UPDATE merchant_members
  SET merchant_id = p_to_merchant, status = 'pending'
  WHERE user_id = p_user_id AND merchant_id = p_from_merchant;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'member_not_found');
  END IF;

  RETURN jsonb_build_object('success', true, 'new_merchant_id', p_to_merchant);
END;
$$;

-- ════════════════════════════════════════════════════════════
-- إصلاح activate_member_subscription: إضافة activated_at فعلياً
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.activate_member_subscription(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_days        integer DEFAULT 30,
  p_points      integer DEFAULT 0,
  p_admin_id    uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub_id uuid;
  v_expire timestamptz;
BEGIN
  v_expire := now() + (p_days || ' days')::interval;

  -- تحديث حالة العضو إلى active
  UPDATE merchant_members
  SET status = 'active', activated_at = now()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'member_not_found');
  END IF;

  -- إنشاء اشتراك جديد
  INSERT INTO merchant_member_subscriptions
    (merchant_id, user_id, status, points_allocated, points_used, points_remaining, expires_at, activated_at)
  VALUES
    (p_merchant_id, p_user_id, 'active', p_points, 0, p_points, v_expire, now())
  ON CONFLICT (merchant_id, user_id)
  DO UPDATE SET
    status            = 'active',
    points_allocated  = p_points,
    points_used       = 0,
    points_remaining  = p_points,
    expires_at        = v_expire,
    activated_at      = now()
  RETURNING id INTO v_sub_id;

  -- خصم النقاط من محفظة التاجر
  IF p_points > 0 THEN
    UPDATE merchant_wallets
    SET balance = balance - p_points
    WHERE merchant_id = p_merchant_id AND balance >= p_points;
  END IF;

  RETURN jsonb_build_object(
    'success',        true,
    'subscription_id', v_sub_id,
    'expires_at',     v_expire,
    'points',         p_points
  );
END;
$$;

-- ════════════════════════════════════════════════════════════
-- إصلاح renew_member_subscription
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.renew_member_subscription(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_days        integer DEFAULT 30,
  p_points      integer DEFAULT 0,
  p_admin_id    uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_expire timestamptz;
BEGIN
  -- تمديد من الآن أو من الانتهاء الحالي أيهما أبعد
  UPDATE merchant_member_subscriptions
  SET
    expires_at       = GREATEST(now(), expires_at) + (p_days || ' days')::interval,
    points_allocated = points_allocated + p_points,
    points_remaining = points_remaining + p_points,
    status           = 'active'
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id
  RETURNING expires_at INTO v_new_expire;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription_not_found');
  END IF;

  -- تحديث حالة العضو
  UPDATE merchant_members SET status = 'active'
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  -- خصم النقاط من محفظة التاجر
  IF p_points > 0 THEN
    UPDATE merchant_wallets
    SET balance = balance - p_points
    WHERE merchant_id = p_merchant_id AND balance >= p_points;
  END IF;

  RETURN jsonb_build_object(
    'success',    true,
    'expires_at', v_new_expire,
    'points_added', p_points
  );
END;
$$;

-- GRANTS
GRANT EXECUTE ON FUNCTION public.admin_suspend_all_members(uuid, uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resume_all_members(uuid, uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_transfer_member(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_member_subscription(uuid, uuid, integer, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.renew_member_subscription(uuid, uuid, integer, integer, uuid) TO authenticated;
