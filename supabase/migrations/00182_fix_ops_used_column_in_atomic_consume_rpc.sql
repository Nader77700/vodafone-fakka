CREATE OR REPLACE FUNCTION atomic_consume_operation(p_user_id UUID, p_is_trial boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub record;
BEGIN
  -- إغلاق الصف لمنع الـ Race Condition
  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = p_user_id AND status = 'active' FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_active_subscription');
  END IF;

  -- فحص نوع الاشتراك
  IF v_sub.code_type = 'trial' OR p_is_trial THEN
    IF v_sub.ops_used >= COALESCE(v_sub.ops_limit, 5) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'trial_limit_reached', 'exhausted', true, 'is_trial', true);
    END IF;
    
    UPDATE public.subscriptions SET ops_used = ops_used + 1 WHERE id = v_sub.id;
    RETURN jsonb_build_object('allowed', true, 'remaining', COALESCE(v_sub.ops_limit, 5) - (v_sub.ops_used + 1), 'is_trial', true, 'exhausted', (v_sub.ops_used + 1) >= COALESCE(v_sub.ops_limit, 5));
  END IF;

  -- الاشتراكات المدفوعة - إما بالعدد أو بالمدة
  IF v_sub.ops_limit IS NOT NULL THEN
    IF v_sub.ops_used >= v_sub.ops_limit THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'ops_limit_reached', 'exhausted', true);
    END IF;
    UPDATE public.subscriptions SET ops_used = ops_used + 1 WHERE id = v_sub.id;
    RETURN jsonb_build_object('allowed', true, 'remaining', v_sub.ops_limit - (v_sub.ops_used + 1), 'exhausted', (v_sub.ops_used + 1) >= v_sub.ops_limit);
  ELSE
    -- اشتراك مدة مفتوح العمليات
    IF v_sub.expires_at IS NOT NULL AND v_sub.expires_at < now() THEN
       RETURN jsonb_build_object('allowed', false, 'reason', 'subscription_expired', 'exhausted', true);
    END IF;
    UPDATE public.subscriptions SET ops_used = COALESCE(ops_used, 0) + 1 WHERE id = v_sub.id;
    RETURN jsonb_build_object('allowed', true, 'remaining', 'unlimited');
  END IF;
END;
$$;