
-- إصلاح validate_merchant_charge_eligibility
-- المشكلة: كانت تبحث في جدول subscriptions (للمستخدمين العاديين)
-- لكن عملاء التاجر لهم اشتراكات في merchant_member_subscriptions
CREATE OR REPLACE FUNCTION public.validate_merchant_charge_eligibility(
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile  profiles%ROWTYPE;
  v_merchant merchants%ROWTYPE;
  v_member   merchant_members%ROWTYPE;
  v_sub      merchant_member_subscriptions%ROWTYPE;
BEGIN
  -- ── التحقق من المستخدم ─────────────────────────────────────────────────────
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND     THEN RETURN jsonb_build_object('eligible',false,'reason','user_not_found','stage','user'); END IF;
  IF NOT v_profile.is_active THEN RETURN jsonb_build_object('eligible',false,'reason','user_inactive','stage','user'); END IF;
  IF v_profile.merchant_id IS NULL THEN RETURN jsonb_build_object('eligible',false,'reason','not_merchant_client','stage','user'); END IF;

  -- ── التحقق من التاجر ───────────────────────────────────────────────────────
  SELECT * INTO v_merchant FROM merchants WHERE id = v_profile.merchant_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('eligible',false,'reason','merchant_not_found','stage','merchant'); END IF;
  IF v_merchant.status != 'active' THEN
    RETURN jsonb_build_object('eligible',false,'reason','merchant_'||v_merchant.status,
      'stage','merchant','merchant_name',v_merchant.name,'merchant_status',v_merchant.status);
  END IF;

  -- ── التحقق من العضوية ─────────────────────────────────────────────────────
  SELECT * INTO v_member FROM merchant_members
  WHERE merchant_id = v_profile.merchant_id AND user_id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('eligible',false,'reason','member_not_found','stage','member'); END IF;

  -- FIX: استخدم v_member.status بدلاً من v_member.member_status (الاسم الصحيح للعمود)
  IF v_member.status::text NOT IN ('active','pending') THEN
    RETURN jsonb_build_object('eligible',false,'reason','member_'||v_member.status::text,'stage','member');
  END IF;

  -- ── التحقق من الاشتراك — FIX: من merchant_member_subscriptions بدل subscriptions ─
  SELECT * INTO v_sub FROM merchant_member_subscriptions
  WHERE member_id = v_member.id
    AND status IN ('active','grace_period','trial')
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- تحقق ثانوي: هل لديه اشتراك منتهي؟
    RETURN jsonb_build_object('eligible',false,'reason','no_active_subscription','stage','subscription');
  END IF;

  -- FIX: فحص عمليات الاشتراك من ops_used بدل ops_count
  IF v_sub.ops_limit IS NOT NULL AND v_sub.ops_used IS NOT NULL THEN
    DECLARE v_ops_remaining integer := v_sub.ops_limit - v_sub.ops_used;
    BEGIN
      IF v_ops_remaining <= 0 THEN
        RETURN jsonb_build_object('eligible',false,'reason','ops_exhausted','stage','subscription',
          'ops_used',v_sub.ops_used,'ops_limit',v_sub.ops_limit);
      END IF;
      RETURN jsonb_build_object(
        'eligible',true,
        'merchant_id',v_merchant.id,'merchant_name',v_merchant.name,'merchant_status',v_merchant.status::text,
        'member_status',v_member.status::text,
        'sub_status',v_sub.status::text,
        'ops_remaining',v_ops_remaining,'ops_limit',v_sub.ops_limit,'ops_count',v_sub.ops_used
      );
    END;
  END IF;

  RETURN jsonb_build_object(
    'eligible',true,
    'merchant_id',v_merchant.id,'merchant_name',v_merchant.name,'merchant_status',v_merchant.status::text,
    'member_status',v_member.status::text,
    'sub_status',v_sub.status::text,
    'ops_remaining',null,'ops_limit',null,'ops_count',null
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('eligible',false,'reason','rpc_error','stage','system','detail',SQLERRM);
END;
$$;
