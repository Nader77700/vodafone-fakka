
-- إصلاح cancel_member_subscription: created_by → p_admin_id فقط (nullable)
CREATE OR REPLACE FUNCTION public.cancel_member_subscription(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_admin_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_member   merchant_members%ROWTYPE;
  v_sub_id   uuid;
BEGIN
  SELECT * INTO v_member FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  -- إلغاء الاشتراكات النشطة
  UPDATE public.merchant_member_subscriptions
  SET status = 'cancelled'::subscription_status, updated_at = NOW()
  WHERE member_id = v_member.id
    AND status IN ('active'::subscription_status, 'grace_period'::subscription_status)
  RETURNING id INTO v_sub_id;

  -- تحديث حالة العضو → pending
  UPDATE public.merchant_members
  SET status            = 'pending',
      last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  -- تسجيل الحركة — created_by: p_admin_id أو NULL
  INSERT INTO public.merchant_member_ledger(
    transaction_id, member_id, merchant_id, user_id,
    type, amount, balance_before, balance_after,
    reason, created_by
  ) VALUES (
    gen_random_uuid(), v_member.id, p_merchant_id, p_user_id,
    'adjustment', 0,
    v_member.remaining_points, v_member.remaining_points,
    'إلغاء اشتراك', p_admin_id
  );

  RETURN jsonb_build_object('success', true, 'cancelled_sub_id', COALESCE(v_sub_id::text, 'none'));
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- إصلاح activate_member_subscription: created_by للـ ledger → p_admin_id فقط
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
  v_member   merchant_members%ROWTYPE;
  v_wallet   merchant_wallets%ROWTYPE;
  v_sub_id   uuid;
  v_start    date;
  v_end      date;
BEGIN
  SELECT * INTO v_member FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  v_start := COALESCE(p_start_date::date, CURRENT_DATE);
  v_end   := v_start + p_days;

  -- PHASE 5: تحقق رصيد النقاط
  IF p_points > 0 THEN
    SELECT * INTO v_wallet FROM public.merchant_wallets
    WHERE merchant_id = p_merchant_id FOR UPDATE;

    IF NOT FOUND OR v_wallet.current_points < p_points THEN
      RETURN jsonb_build_object(
        'success', false,
        'error',   'رصيد نقاط التاجر غير كافٍ',
        'current_balance', COALESCE(v_wallet.current_points, 0)
      );
    END IF;

    -- PHASE 7: تحقق صلاحية النقاط
    IF v_wallet.points_expires_at IS NOT NULL AND v_end > v_wallet.points_expires_at THEN
      RETURN jsonb_build_object(
        'success',       false,
        'error',         'مدة الاشتراك المطلوبة تتجاوز مدة صلاحية نقاط التاجر',
        'points_expire', v_wallet.points_expires_at::text,
        'sub_end',       v_end::text
      );
    END IF;
  END IF;

  v_sub_id := gen_random_uuid();

  -- إلغاء الاشتراكات السابقة
  UPDATE public.merchant_member_subscriptions
  SET status = 'cancelled'::subscription_status, updated_at = NOW()
  WHERE member_id = v_member.id AND status = 'active'::subscription_status;

  -- إنشاء الاشتراك الجديد
  INSERT INTO public.merchant_member_subscriptions(
    id, member_id, merchant_id, user_id, status,
    start_date, end_date, expires_at,
    assigned_points, consumed_points, remaining_points
  ) VALUES (
    v_sub_id, v_member.id, p_merchant_id, p_user_id, 'active'::subscription_status,
    v_start, v_end, v_end::timestamptz + interval '23 hours 59 minutes',
    p_points, 0, p_points
  );

  -- تحديث حالة العضو
  UPDATE public.merchant_members
  SET status            = 'active',
      activated_at      = NOW(),
      expired_at        = v_end::timestamptz + interval '23 hours 59 minutes',
      last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  -- PHASE 6: خصم النقاط atomically
  IF p_points > 0 THEN
    UPDATE public.merchant_wallets
    SET current_points    = current_points    - p_points,
        used_points       = used_points       + p_points,
        lifetime_consumed = lifetime_consumed + p_points,
        last_operation_at = NOW(),
        updated_at        = NOW()
    WHERE merchant_id = p_merchant_id;

    INSERT INTO public.merchant_ledger(
      transaction_id, merchant_id, type, amount, balance_before, balance_after,
      reason, created_by
    ) VALUES (
      'SUB-' || v_sub_id::text,
      p_merchant_id, 'deduct', p_points,
      v_wallet.current_points, v_wallet.current_points - p_points,
      'تفعيل اشتراك — ' || p_user_id::text,
      p_admin_id
    );

    INSERT INTO public.merchant_member_ledger(
      transaction_id, member_id, merchant_id, user_id,
      type, amount, balance_before, balance_after,
      reason, created_by, correlation_id
    ) VALUES (
      gen_random_uuid(), v_member.id, p_merchant_id, p_user_id,
      'subscription_bonus', p_points,
      v_member.remaining_points, v_member.remaining_points + p_points,
      'تفعيل اشتراك', p_admin_id, v_sub_id
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

-- إصلاح renew_member_subscription: created_by للـ ledger → p_admin_id فقط
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
  v_member   merchant_members%ROWTYPE;
  v_sub      merchant_member_subscriptions%ROWTYPE;
  v_wallet   merchant_wallets%ROWTYPE;
  v_new_end  date;
BEGIN
  SELECT * INTO v_member FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  SELECT * INTO v_sub FROM public.merchant_member_subscriptions
  WHERE member_id = v_member.id AND status = 'active'::subscription_status
  ORDER BY created_at DESC LIMIT 1;

  v_new_end := COALESCE(
    CASE WHEN v_sub.end_date > CURRENT_DATE THEN v_sub.end_date ELSE NULL END,
    COALESCE(p_start_date::date, CURRENT_DATE)
  ) + p_days;

  -- PHASE 5: تحقق رصيد النقاط
  IF p_points > 0 THEN
    SELECT * INTO v_wallet FROM public.merchant_wallets
    WHERE merchant_id = p_merchant_id FOR UPDATE;

    IF NOT FOUND OR v_wallet.current_points < p_points THEN
      RETURN jsonb_build_object(
        'success', false,
        'error',   'رصيد نقاط التاجر غير كافٍ',
        'current_balance', COALESCE(v_wallet.current_points, 0)
      );
    END IF;

    -- PHASE 7: تحقق صلاحية النقاط
    IF v_wallet.points_expires_at IS NOT NULL AND v_new_end > v_wallet.points_expires_at THEN
      RETURN jsonb_build_object(
        'success',       false,
        'error',         'مدة الاشتراك المطلوبة تتجاوز مدة صلاحية نقاط التاجر',
        'points_expire', v_wallet.points_expires_at::text,
        'sub_end',       v_new_end::text
      );
    END IF;
  END IF;

  -- تحديث أو إنشاء اشتراك
  IF v_sub.id IS NOT NULL THEN
    UPDATE public.merchant_member_subscriptions
    SET end_date         = v_new_end,
        expires_at       = v_new_end::timestamptz + interval '23 hours 59 minutes',
        assigned_points  = assigned_points  + p_points,
        remaining_points = remaining_points + p_points,
        updated_at       = NOW()
    WHERE id = v_sub.id;
  ELSE
    INSERT INTO public.merchant_member_subscriptions(
      member_id, merchant_id, user_id, status,
      start_date, end_date, expires_at,
      assigned_points, consumed_points, remaining_points
    ) VALUES (
      v_member.id, p_merchant_id, p_user_id, 'active'::subscription_status,
      COALESCE(p_start_date::date, CURRENT_DATE), v_new_end,
      v_new_end::timestamptz + interval '23 hours 59 minutes',
      p_points, 0, p_points
    );
  END IF;

  UPDATE public.merchant_members
  SET status            = 'active',
      expired_at        = v_new_end::timestamptz + interval '23 hours 59 minutes',
      last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  -- PHASE 6: خصم atomically
  IF p_points > 0 THEN
    UPDATE public.merchant_wallets
    SET current_points    = current_points    - p_points,
        used_points       = used_points       + p_points,
        lifetime_consumed = lifetime_consumed + p_points,
        last_operation_at = NOW(),
        updated_at        = NOW()
    WHERE merchant_id = p_merchant_id;

    INSERT INTO public.merchant_ledger(
      transaction_id, merchant_id, type, amount, balance_before, balance_after,
      reason, created_by
    ) VALUES (
      'RNW-' || gen_random_uuid()::text,
      p_merchant_id, 'deduct', p_points,
      v_wallet.current_points, v_wallet.current_points - p_points,
      'تجديد اشتراك — ' || p_user_id::text,
      p_admin_id
    );

    INSERT INTO public.merchant_member_ledger(
      transaction_id, member_id, merchant_id, user_id,
      type, amount, balance_before, balance_after, reason, created_by
    ) VALUES (
      gen_random_uuid(), v_member.id, p_merchant_id, p_user_id,
      'subscription_bonus', p_points,
      v_member.remaining_points, v_member.remaining_points + p_points,
      'تجديد اشتراك', p_admin_id
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
