
-- حذف النسخة القديمة (integer) لإزالة تعارض overloading
DROP FUNCTION IF EXISTS public.activate_member_subscription(uuid, uuid, integer, integer, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.activate_member_subscription(uuid, uuid, int, int, timestamptz, uuid);

-- إعادة إنشاء الدالة بالأنواع الصحيحة (date للتواريخ، enum للحالة)
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
  v_start          date;
  v_end            date;
  v_merchant_owner uuid;
BEGIN
  SELECT created_by INTO v_merchant_owner FROM public.merchants WHERE id = p_merchant_id;

  SELECT * INTO v_member FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  v_start  := COALESCE(p_start_date::date, CURRENT_DATE);
  v_end    := v_start + p_days;
  v_sub_id := gen_random_uuid();

  -- إلغاء الاشتراكات النشطة السابقة
  UPDATE public.merchant_member_subscriptions
  SET status = 'cancelled'::subscription_status, updated_at = NOW()
  WHERE member_id = v_member.id AND status = 'active'::subscription_status;

  INSERT INTO public.merchant_member_subscriptions(
    id, member_id, merchant_id, user_id, status,
    start_date, end_date, expires_at,
    assigned_points, consumed_points, remaining_points
  ) VALUES (
    v_sub_id, v_member.id, p_merchant_id, p_user_id, 'active'::subscription_status,
    v_start, v_end, v_end::timestamptz + interval '23 hours 59 minutes',
    p_points, 0, p_points
  );

  UPDATE public.merchant_members
  SET status            = 'active',
      activated_at      = NOW(),
      expired_at        = v_end::timestamptz + interval '23 hours 59 minutes',
      last_operation_at = NOW(),
      assigned_points   = assigned_points  + p_points,
      remaining_points  = remaining_points + p_points
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  IF p_points > 0 THEN
    INSERT INTO public.merchant_member_ledger(
      transaction_id, member_id, merchant_id, user_id,
      type, amount, balance_before, balance_after,
      reason, created_by, correlation_id
    ) VALUES (
      gen_random_uuid(),
      v_member.id, p_merchant_id, p_user_id,
      'subscription_bonus', p_points,
      v_member.remaining_points,
      v_member.remaining_points + p_points,
      'تفعيل اشتراك',
      COALESCE(p_admin_id, v_merchant_owner),
      v_sub_id
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'start_date', v_start, 'end_date', v_end);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ─── إصلاح renew_member_subscription (date types) ───────────────────────────
DROP FUNCTION IF EXISTS public.renew_member_subscription(uuid, uuid, integer, integer, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.renew_member_subscription(uuid, uuid, int, int, timestamptz, uuid);

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
  v_new_end        date;
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
  WHERE member_id = v_member.id AND status = 'active'::subscription_status
  ORDER BY created_at DESC LIMIT 1;

  v_new_end := COALESCE(
    CASE WHEN v_sub.end_date > CURRENT_DATE THEN v_sub.end_date ELSE NULL END,
    COALESCE(p_start_date::date, CURRENT_DATE)
  ) + p_days;

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
  SET expired_at        = v_new_end::timestamptz + interval '23 hours 59 minutes',
      last_operation_at = NOW(),
      assigned_points   = assigned_points  + p_points,
      remaining_points  = remaining_points + p_points
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  IF p_points > 0 THEN
    INSERT INTO public.merchant_member_ledger(
      transaction_id, member_id, merchant_id, user_id,
      type, amount, balance_before, balance_after,
      reason, created_by
    ) VALUES (
      gen_random_uuid(),
      v_member.id, p_merchant_id, p_user_id,
      'subscription_bonus', p_points,
      v_member.remaining_points,
      v_member.remaining_points + p_points,
      'تجديد اشتراك',
      COALESCE(p_admin_id, v_merchant_owner)
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'new_end_date', v_new_end);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
