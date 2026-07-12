
-- إصلاح signature: إضافة p_start_date لـ activate_member_subscription و renew_member_subscription
-- الفرونتإند يرسل p_start_date لكن الدوال القديمة لا تقبله

CREATE OR REPLACE FUNCTION public.activate_member_subscription(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_days        integer DEFAULT 30,
  p_points      integer DEFAULT 0,
  p_start_date  date    DEFAULT NULL,
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
  v_real_start date;
BEGIN
  -- التحقق من وجود العضو
  SELECT id INTO v_member_id
  FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'العضو غير موجود');
  END IF;

  -- تاريخ البداية: المُحدد أو اليوم
  v_real_start := COALESCE(p_start_date, CURRENT_DATE);
  v_end_date   := v_real_start + p_days;

  -- إلغاء أي اشتراك نشط سابق
  UPDATE public.merchant_member_subscriptions
  SET    status = 'cancelled', updated_at = NOW()
  WHERE  member_id = v_member_id AND status = 'active';

  -- إنشاء الاشتراك الجديد
  INSERT INTO public.merchant_member_subscriptions
    (member_id, merchant_id, user_id, status, start_date, end_date, points_allocated, points_remaining, activated_by)
  VALUES
    (v_member_id, p_merchant_id, p_user_id, 'active', v_real_start, v_end_date,
     p_points, p_points, COALESCE(p_admin_id, p_merchant_id))
  RETURNING id INTO v_sub_id;

  -- تحديث حالة العضو
  UPDATE public.merchant_members
  SET    member_status = 'active',
         remaining_points = remaining_points + p_points,
         assigned_points  = assigned_points  + p_points,
         updated_at = NOW()
  WHERE  id = v_member_id;

  -- تسجيل في الـ ledger إن وُجدت النقاط
  IF p_points > 0 THEN
    INSERT INTO public.merchant_member_ledger
      (member_id, merchant_id, user_id, type, amount, balance_after, reason, created_by)
    VALUES
      (v_member_id, p_merchant_id, p_user_id, 'subscription_bonus', p_points,
       (SELECT remaining_points FROM public.merchant_members WHERE id = v_member_id),
       'نقاط مع تفعيل الاشتراك', COALESCE(p_admin_id, p_merchant_id));
  END IF;

  RETURN jsonb_build_object(
    'success',     true,
    'start_date',  v_real_start::text,
    'end_date',    v_end_date::text
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.renew_member_subscription(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_days        integer DEFAULT 30,
  p_points      integer DEFAULT 0,
  p_start_date  date    DEFAULT NULL,
  p_admin_id    uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id   uuid;
  v_sub_id      uuid;
  v_new_start   date;
  v_new_end     date;
  v_cur_end     date;
BEGIN
  SELECT id INTO v_member_id
  FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'العضو غير موجود');
  END IF;

  -- اختيار نقطة البداية: آخر نهاية للاشتراك إن كانت في المستقبل، وإلا اليوم
  SELECT end_date INTO v_cur_end
  FROM public.merchant_member_subscriptions
  WHERE member_id = v_member_id AND status = 'active'
  ORDER BY end_date DESC LIMIT 1;

  v_new_start := COALESCE(
    p_start_date,
    CASE WHEN v_cur_end > CURRENT_DATE THEN v_cur_end ELSE CURRENT_DATE END
  );
  v_new_end := v_new_start + p_days;

  -- إنشاء سجل تجديد
  INSERT INTO public.merchant_member_subscriptions
    (member_id, merchant_id, user_id, status, start_date, end_date, points_allocated, points_remaining, activated_by)
  VALUES
    (v_member_id, p_merchant_id, p_user_id, 'active', v_new_start, v_new_end,
     p_points, p_points, COALESCE(p_admin_id, p_merchant_id))
  RETURNING id INTO v_sub_id;

  -- تحديث العضو
  UPDATE public.merchant_members
  SET    member_status = 'active',
         remaining_points = remaining_points + p_points,
         assigned_points  = assigned_points  + p_points,
         updated_at = NOW()
  WHERE  id = v_member_id;

  IF p_points > 0 THEN
    INSERT INTO public.merchant_member_ledger
      (member_id, merchant_id, user_id, type, amount, balance_after, reason, created_by)
    VALUES
      (v_member_id, p_merchant_id, p_user_id, 'subscription_bonus', p_points,
       (SELECT remaining_points FROM public.merchant_members WHERE id = v_member_id),
       'نقاط مع تجديد الاشتراك', COALESCE(p_admin_id, p_merchant_id));
  END IF;

  RETURN jsonb_build_object(
    'success',     true,
    'start_date',  v_new_start::text,
    'end_date',    v_new_end::text
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- صلاحيات
GRANT EXECUTE ON FUNCTION public.activate_member_subscription(uuid, uuid, integer, integer, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.renew_member_subscription(uuid, uuid, integer, integer, date, uuid)   TO authenticated;
