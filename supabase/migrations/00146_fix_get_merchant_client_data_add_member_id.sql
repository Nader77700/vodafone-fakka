
-- إضافة member_id لاستجابة get_merchant_client_data لتمكين فلتر Realtime الصحيح
CREATE OR REPLACE FUNCTION get_merchant_client_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant   record;
  v_member     record;
  v_sub        record;
BEGIN
  SELECT m.id, m.name, m.status, m.brand_color, m.logo_url, m.welcome_msg,
         m.welcome_instructions, COALESCE(m.instructions_version, 1) AS instructions_version
  INTO v_merchant
  FROM public.merchants m
  JOIN public.profiles p ON p.merchant_id = m.id
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_linked');
  END IF;

  SELECT mm.id, mm.status AS member_status,
         mm.assigned_points, mm.consumed_points, mm.remaining_points,
         mm.created_at AS joined_at, mm.last_operation_at AS last_op_at,
         mm.activated_at
  INTO v_member
  FROM public.merchant_members mm
  WHERE mm.merchant_id = v_merchant.id AND mm.user_id = p_user_id;

  -- جلب البيانات الكاملة من merchant_member_subscriptions
  SELECT ms.id, ms.status, ms.start_date, ms.end_date,
         ms.assigned_points, ms.remaining_points, ms.consumed_points,
         ms.ops_limit, ms.ops_used, ms.sub_type, ms.expires_at,
         GREATEST(0, ms.end_date - CURRENT_DATE) AS days_remaining,
         CASE WHEN ms.ops_limit IS NOT NULL AND ms.ops_used IS NOT NULL
              THEN GREATEST(0, ms.ops_limit - ms.ops_used)
              ELSE NULL END AS ops_remaining
  INTO v_sub
  FROM public.merchant_member_subscriptions ms
  WHERE ms.member_id = v_member.id
  ORDER BY CASE ms.status
             WHEN 'active'       THEN 1
             WHEN 'grace_period' THEN 2
             WHEN 'trial'        THEN 3
             ELSE 4
           END, ms.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'success', true,
    'merchant', jsonb_build_object(
      'id',                   v_merchant.id,
      'name',                 v_merchant.name,
      'status',               v_merchant.status,
      'brand_color',          v_merchant.brand_color,
      'logo_url',             v_merchant.logo_url,
      'welcome_msg',          v_merchant.welcome_msg,
      'welcome_instructions', v_merchant.welcome_instructions,
      'instructions_version', v_merchant.instructions_version
    ),
    'member', CASE WHEN v_member.id IS NOT NULL THEN jsonb_build_object(
      'member_id',         v_member.id,          -- ← جديد: مطلوب للـ Realtime
      'member_status',     v_member.member_status,
      'assigned_points',   v_member.assigned_points,
      'consumed_points',   v_member.consumed_points,
      'remaining_points',  v_member.remaining_points,
      'joined_at',         v_member.joined_at,
      'last_op_at',        v_member.last_op_at,
      'activated_at',      v_member.activated_at
    ) ELSE NULL END,
    'subscription', CASE WHEN v_sub.id IS NOT NULL THEN jsonb_build_object(
      'id',               v_sub.id,
      'status',           v_sub.status,
      'sub_type',         COALESCE(v_sub.sub_type, 'unlimited'),
      'start_date',       v_sub.start_date,
      'end_date',         v_sub.end_date,
      'expires_at',       COALESCE(v_sub.expires_at::text, v_sub.end_date::text),
      'days_remaining',   v_sub.days_remaining,
      'ops_limit',        v_sub.ops_limit,
      'ops_used',         v_sub.ops_used,
      'ops_remaining',    v_sub.ops_remaining,
      'ops_count',        v_sub.ops_used,
      'ops_success',      COALESCE(v_sub.ops_used, 0),
      'ops_failed',       0,
      'assigned_points',  v_sub.assigned_points,
      'remaining_points', v_sub.remaining_points,
      'consumed_points',  v_sub.consumed_points,
      'in_grace_period',  (v_sub.status = 'grace_period')
    ) ELSE NULL END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
