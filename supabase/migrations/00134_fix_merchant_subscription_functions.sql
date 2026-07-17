
-- =====================================================================
-- إصلاح activate_member_subscription: transaction_id UUID لا text
-- =====================================================================
CREATE OR REPLACE FUNCTION public.activate_member_subscription(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_days        int     DEFAULT 30,
  p_points      bigint  DEFAULT 0,
  p_start_date  timestamptz DEFAULT NULL,
  p_admin_id    uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_member         merchant_members%ROWTYPE;
  v_sub_id         uuid;
  v_start          timestamptz;
  v_end            timestamptz;
  v_merchant_owner uuid;
BEGIN
  SELECT created_by INTO v_merchant_owner FROM public.merchants WHERE id = p_merchant_id;

  SELECT * INTO v_member FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  v_start  := COALESCE(p_start_date, NOW());
  v_end    := v_start + (p_days || ' days')::interval;
  v_sub_id := gen_random_uuid();

  -- إلغاء الاشتراكات النشطة السابقة
  UPDATE public.merchant_member_subscriptions
  SET status = 'cancelled', updated_at = NOW()
  WHERE member_id = v_member.id AND status = 'active';

  INSERT INTO public.merchant_member_subscriptions(
    id, member_id, merchant_id, user_id, status,
    start_date, end_date, assigned_points, consumed_points, remaining_points
  ) VALUES (
    v_sub_id, v_member.id, p_merchant_id, p_user_id, 'active',
    v_start, v_end, p_points, 0, p_points
  );

  UPDATE public.merchant_members
  SET status            = 'active',
      activated_at      = v_start,
      expired_at        = v_end,
      last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  IF p_points > 0 THEN
    INSERT INTO public.merchant_member_ledger(
      transaction_id, member_id, merchant_id, user_id,
      type, amount, balance_before, balance_after,
      reason, created_by, correlation_id
    ) VALUES (
      gen_random_uuid(),          -- UUID بدون ::text
      v_member.id, p_merchant_id, p_user_id,
      'subscription_bonus', p_points,
      v_member.remaining_points,
      v_member.remaining_points + p_points,
      'تفعيل اشتراك',
      COALESCE(p_admin_id, v_merchant_owner),
      v_sub_id                    -- UUID بدون ::text
    );

    UPDATE public.merchant_members
    SET assigned_points  = assigned_points  + p_points,
        remaining_points = remaining_points + p_points
    WHERE merchant_id = p_merchant_id AND user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'start_date', v_start, 'end_date', v_end);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- =====================================================================
-- إصلاح renew_member_subscription: transaction_id UUID لا text
-- =====================================================================
CREATE OR REPLACE FUNCTION public.renew_member_subscription(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_days        int     DEFAULT 30,
  p_points      bigint  DEFAULT 0,
  p_start_date  timestamptz DEFAULT NULL,
  p_admin_id    uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_member         merchant_members%ROWTYPE;
  v_sub            merchant_member_subscriptions%ROWTYPE;
  v_new_end        timestamptz;
  v_merchant_owner uuid;
BEGIN
  SELECT created_by INTO v_merchant_owner FROM public.merchants WHERE id = p_merchant_id;

  SELECT * INTO v_member FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  SELECT * INTO v_sub
  FROM public.merchant_member_subscriptions
  WHERE member_id = v_member.id AND status = 'active'
  ORDER BY created_at DESC LIMIT 1;

  v_new_end := COALESCE(
    CASE WHEN v_sub.end_date > NOW() THEN v_sub.end_date ELSE NULL END,
    COALESCE(p_start_date, NOW())
  ) + (p_days || ' days')::interval;

  IF v_sub.id IS NOT NULL THEN
    UPDATE public.merchant_member_subscriptions
    SET end_date         = v_new_end,
        assigned_points  = assigned_points  + p_points,
        remaining_points = remaining_points + p_points,
        updated_at       = NOW()
    WHERE id = v_sub.id;
  ELSE
    INSERT INTO public.merchant_member_subscriptions(
      member_id, merchant_id, user_id, status,
      start_date, end_date, assigned_points, consumed_points, remaining_points
    ) VALUES (
      v_member.id, p_merchant_id, p_user_id, 'active',
      COALESCE(p_start_date, NOW()), v_new_end, p_points, 0, p_points
    );
  END IF;

  UPDATE public.merchant_members
  SET expired_at        = v_new_end,
      last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  IF p_points > 0 THEN
    INSERT INTO public.merchant_member_ledger(
      transaction_id, member_id, merchant_id, user_id,
      type, amount, balance_before, balance_after,
      reason, created_by
    ) VALUES (
      gen_random_uuid(),          -- UUID بدون ::text
      v_member.id, p_merchant_id, p_user_id,
      'subscription_bonus', p_points,
      v_member.remaining_points,
      v_member.remaining_points + p_points,
      'تجديد اشتراك',
      COALESCE(p_admin_id, v_merchant_owner)
    );

    UPDATE public.merchant_members
    SET assigned_points  = assigned_points  + p_points,
        remaining_points = remaining_points + p_points
    WHERE merchant_id = p_merchant_id AND user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'new_end_date', v_new_end);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
