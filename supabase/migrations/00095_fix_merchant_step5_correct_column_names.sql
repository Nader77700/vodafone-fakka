
-- ════════════════════════════════════════════════════════════
-- DROP renew bigint+start_date overload
-- ════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.renew_member_subscription(uuid, uuid, integer, bigint, date, uuid);

-- ════════════════════════════════════════════════════════════
-- إصلاح activate_member_subscription — أعمدة صحيحة
-- merchant_member_subscriptions: member_id, assigned_points, consumed_points, remaining_points, start_date, end_date
-- merchant_members: status, activated_at, assigned_points, remaining_points
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
  v_member_id  uuid;
  v_sub_id     uuid;
  v_end_date   date;
BEGIN
  v_end_date := CURRENT_DATE + p_days;

  -- جلب member_id
  SELECT id INTO v_member_id
  FROM merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'member_not_found');
  END IF;

  -- تحديث حالة العضو
  UPDATE merchant_members
  SET
    status           = 'active',
    activated_at     = now(),
    assigned_points  = COALESCE(assigned_points, 0) + p_points,
    remaining_points = COALESCE(remaining_points, 0) + p_points
  WHERE id = v_member_id;

  -- إنشاء أو تحديث الاشتراك
  INSERT INTO merchant_member_subscriptions
    (member_id, merchant_id, user_id, status, assigned_points, consumed_points, remaining_points, start_date, end_date)
  VALUES
    (v_member_id, p_merchant_id, p_user_id, 'active', p_points, 0, p_points, CURRENT_DATE, v_end_date)
  ON CONFLICT (member_id) DO UPDATE SET
    status           = 'active',
    assigned_points  = merchant_member_subscriptions.assigned_points + p_points,
    remaining_points = merchant_member_subscriptions.remaining_points + p_points,
    start_date       = CURRENT_DATE,
    end_date         = v_end_date,
    renewed_at       = now()
  RETURNING id INTO v_sub_id;

  -- خصم النقاط من محفظة التاجر
  IF p_points > 0 THEN
    UPDATE merchant_wallets
    SET balance = balance - p_points
    WHERE merchant_id = p_merchant_id AND balance >= p_points;
  END IF;

  RETURN jsonb_build_object(
    'success',         true,
    'subscription_id', v_sub_id,
    'end_date',        v_end_date,
    'points',          p_points
  );
END;
$$;

-- ════════════════════════════════════════════════════════════
-- إصلاح renew_member_subscription — أعمدة صحيحة
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
  v_member_id  uuid;
  v_new_end    date;
BEGIN
  SELECT id INTO v_member_id
  FROM merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'member_not_found');
  END IF;

  -- تمديد من اليوم أو من نهاية الاشتراك الحالي أيهما أبعد
  UPDATE merchant_member_subscriptions
  SET
    end_date         = GREATEST(CURRENT_DATE, end_date) + p_days,
    assigned_points  = assigned_points + p_points,
    remaining_points = remaining_points + p_points,
    status           = 'active',
    renewed_at       = now()
  WHERE member_id = v_member_id
  RETURNING end_date INTO v_new_end;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription_not_found');
  END IF;

  -- تحديث حالة العضو
  UPDATE merchant_members
  SET
    status           = 'active',
    assigned_points  = COALESCE(assigned_points, 0) + p_points,
    remaining_points = COALESCE(remaining_points, 0) + p_points
  WHERE id = v_member_id;

  -- خصم النقاط من محفظة التاجر
  IF p_points > 0 THEN
    UPDATE merchant_wallets
    SET balance = balance - p_points
    WHERE merchant_id = p_merchant_id AND balance >= p_points;
  END IF;

  RETURN jsonb_build_object(
    'success',      true,
    'end_date',     v_new_end,
    'points_added', p_points
  );
END;
$$;

-- ════════════════════════════════════════════════════════════
-- إصلاح atomic_consume_operation — أعمدة صحيحة للـ merchant members
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.atomic_consume_operation(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant_id    uuid;
  v_member_status  text;
  v_remaining      bigint;
  v_member_id      uuid;
  v_sub_end        date;
  v_profile        record;
  v_sub_id         uuid;
  v_ops_used       int;
  v_ops_limit      int;
BEGIN
  -- ── فحص هل المستخدم تابع لتاجر ──────────────────────────
  SELECT mm.merchant_id, mm.status, mm.remaining_points, mm.id
  INTO v_merchant_id, v_member_status, v_remaining, v_member_id
  FROM merchant_members mm
  WHERE mm.user_id = p_user_id
  LIMIT 1;

  IF v_merchant_id IS NOT NULL THEN
    -- المستخدم تابع لتاجر
    IF v_member_status != 'active' THEN
      RETURN jsonb_build_object(
        'allowed', false, 'error', 'member_' || v_member_status,
        'code_type', 'merchant', 'is_trial', false,
        'ops_used', 0, 'ops_limit', 0, 'remaining', 0, 'exhausted', false
      );
    END IF;

    -- فحص الاشتراك النشط
    SELECT mms.id, mms.end_date, mms.remaining_points
    INTO v_sub_id, v_sub_end, v_remaining
    FROM merchant_member_subscriptions mms
    WHERE mms.member_id = v_member_id AND mms.status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'allowed', false, 'error', 'no_active_subscription',
        'code_type', 'merchant', 'is_trial', false,
        'ops_used', 0, 'ops_limit', 0, 'remaining', 0, 'exhausted', false
      );
    END IF;

    IF v_sub_end < CURRENT_DATE THEN
      UPDATE merchant_member_subscriptions SET status = 'expired' WHERE id = v_sub_id;
      UPDATE merchant_members SET status = 'expired' WHERE id = v_member_id;
      RETURN jsonb_build_object(
        'allowed', false, 'error', 'subscription_expired',
        'code_type', 'merchant', 'is_trial', false,
        'ops_used', 0, 'ops_limit', 0, 'remaining', 0, 'exhausted', false
      );
    END IF;

    IF v_remaining <= 0 THEN
      RETURN jsonb_build_object(
        'allowed', false, 'error', 'no_points_remaining',
        'code_type', 'merchant', 'is_trial', false,
        'ops_used', 0, 'ops_limit', 0, 'remaining', 0, 'exhausted', true
      );
    END IF;

    -- السماح — الخصم الفعلي للنقطة سيتم عبر trigger عند insert في operations
    RETURN jsonb_build_object(
      'allowed',    true,
      'code_type',  'merchant',
      'is_trial',   false,
      'ops_used',   0,
      'ops_limit',  0,
      'remaining',  v_remaining,
      'exhausted',  false
    );
  END IF;

  -- ── المستخدم عادي (نظام الاشتراكات الأصلي) ──────────────
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'user_not_found',
      'code_type', 'standard', 'is_trial', false, 'ops_used', 0, 'ops_limit', 0, 'remaining', 0, 'exhausted', false);
  END IF;

  -- فحص الاشتراك النشط (subscriptions table)
  SELECT ops_used, ops_limit INTO v_ops_used, v_ops_limit
  FROM subscriptions
  WHERE user_id = p_user_id AND status = 'active' AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_ops_used >= v_ops_limit THEN
      RETURN jsonb_build_object('allowed', false, 'error', 'ops_exhausted',
        'code_type', 'subscription', 'is_trial', false,
        'ops_used', v_ops_used, 'ops_limit', v_ops_limit, 'remaining', 0, 'exhausted', true);
    END IF;
    UPDATE subscriptions SET ops_used = ops_used + 1
    WHERE user_id = p_user_id AND status = 'active' AND expires_at > now();
    RETURN jsonb_build_object('allowed', true, 'code_type', 'subscription', 'is_trial', false,
      'ops_used', v_ops_used + 1, 'ops_limit', v_ops_limit,
      'remaining', v_ops_limit - v_ops_used - 1, 'exhausted', false);
  END IF;

  -- فحص trial
  SELECT trial_ops_used, trial_ops_limit INTO v_ops_used, v_ops_limit
  FROM profiles WHERE id = p_user_id;

  IF v_ops_used >= v_ops_limit THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'trial_exhausted',
      'code_type', 'trial', 'is_trial', true,
      'ops_used', v_ops_used, 'ops_limit', v_ops_limit, 'remaining', 0, 'exhausted', true);
  END IF;

  UPDATE profiles SET trial_ops_used = trial_ops_used + 1 WHERE id = p_user_id;
  RETURN jsonb_build_object('allowed', true, 'code_type', 'trial', 'is_trial', true,
    'ops_used', v_ops_used + 1, 'ops_limit', v_ops_limit,
    'remaining', v_ops_limit - v_ops_used - 1, 'exhausted', false);
END;
$$;

-- ════════════════════════════════════════════════════════════
-- إصلاح admin_transfer_member — أعمدة صحيحة
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
DECLARE
  v_member_id uuid;
BEGIN
  SELECT id INTO v_member_id
  FROM merchant_members
  WHERE user_id = p_user_id AND merchant_id = p_from_merchant;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'member_not_found');
  END IF;

  -- إلغاء الاشتراكات في التاجر المصدر
  UPDATE merchant_member_subscriptions
  SET status = 'cancelled'
  WHERE member_id = v_member_id AND status = 'active';

  -- نقل العضو إلى التاجر الجديد
  UPDATE merchant_members
  SET merchant_id = p_to_merchant, status = 'pending'
  WHERE id = v_member_id;

  RETURN jsonb_build_object('success', true, 'new_merchant_id', p_to_merchant);
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_member_subscription(uuid, uuid, integer, integer, uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.renew_member_subscription(uuid, uuid, integer, integer, uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_consume_operation(uuid)                                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_transfer_member(uuid, uuid, uuid, uuid)                          TO authenticated;
