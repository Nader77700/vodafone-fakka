
-- ════════════════════════════════════════════════════════════
-- إصلاح نهائي: balance → current_points في merchant_wallets
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

  -- جلب member_id وقفله
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

  -- خصم النقاط من محفظة التاجر (current_points هو اسم العمود الصحيح)
  IF p_points > 0 THEN
    UPDATE merchant_wallets
    SET
      current_points  = current_points - p_points,
      used_points     = used_points + p_points,
      last_operation_at = now()
    WHERE merchant_id = p_merchant_id AND current_points >= p_points;
  END IF;

  RETURN jsonb_build_object(
    'success',         true,
    'subscription_id', v_sub_id,
    'end_date',        v_end_date,
    'points',          p_points
  );
END;
$$;

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
    SET
      current_points    = current_points - p_points,
      used_points       = used_points + p_points,
      last_operation_at = now()
    WHERE merchant_id = p_merchant_id AND current_points >= p_points;
  END IF;

  RETURN jsonb_build_object(
    'success',      true,
    'end_date',     v_new_end,
    'points_added', p_points
  );
END;
$$;

-- GRANTS
GRANT EXECUTE ON FUNCTION public.activate_member_subscription(uuid, uuid, integer, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.renew_member_subscription(uuid, uuid, integer, integer, uuid)    TO authenticated;
