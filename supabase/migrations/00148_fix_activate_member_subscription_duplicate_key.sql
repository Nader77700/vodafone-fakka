
-- إصلاح جذري: استبدال 'SUB-'||v_sub_id بـ gen_random_uuid() لمنع duplicate key عند إعادة التفعيل
CREATE OR REPLACE FUNCTION activate_member_subscription(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_days        int,
  p_points      int      DEFAULT 0,
  p_start_date  text     DEFAULT NULL,
  p_admin_id    uuid     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- تحقق رصيد النقاط
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

    -- تحقق صلاحية النقاط
    IF v_wallet.points_expires_at IS NOT NULL AND v_end > v_wallet.points_expires_at THEN
      RETURN jsonb_build_object(
        'success',       false,
        'error',         'مدة الاشتراك المطلوبة تتجاوز مدة صلاحية نقاط التاجر',
        'points_expire', v_wallet.points_expires_at::text,
        'sub_end',       v_end::text
      );
    END IF;
  END IF;

  -- UPSERT: إنشاء أو تحديث الاشتراك (UNIQUE على member_id)
  INSERT INTO public.merchant_member_subscriptions(
    member_id, merchant_id, user_id, status,
    start_date, end_date, expires_at,
    assigned_points, consumed_points, remaining_points
  ) VALUES (
    v_member.id, p_merchant_id, p_user_id, 'active'::subscription_status,
    v_start, v_end, v_end::timestamptz + interval '23 hours 59 minutes',
    p_points, 0, p_points
  )
  ON CONFLICT (member_id) DO UPDATE SET
    status           = 'active'::subscription_status,
    start_date       = v_start,
    end_date         = v_end,
    expires_at       = v_end::timestamptz + interval '23 hours 59 minutes',
    assigned_points  = p_points,
    consumed_points  = 0,
    remaining_points = p_points,
    updated_at       = NOW()
  RETURNING id INTO v_sub_id;

  -- تحديث حالة العضو
  UPDATE public.merchant_members
  SET status            = 'active',
      activated_at      = NOW(),
      expired_at        = v_end::timestamptz + interval '23 hours 59 minutes',
      last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  -- خصم النقاط atomically
  IF p_points > 0 THEN
    UPDATE public.merchant_wallets
    SET current_points    = current_points    - p_points,
        used_points       = used_points       + p_points,
        lifetime_consumed = lifetime_consumed + p_points,
        last_operation_at = NOW(),
        updated_at        = NOW()
    WHERE merchant_id = p_merchant_id;

    -- ✅ FIX: استخدام gen_random_uuid() بدل v_sub_id لتفادي duplicate key عند إعادة التفعيل
    INSERT INTO public.merchant_ledger(
      transaction_id, merchant_id, type, amount, balance_before, balance_after,
      reason, created_by
    ) VALUES (
      'SUB-' || gen_random_uuid()::text,
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
