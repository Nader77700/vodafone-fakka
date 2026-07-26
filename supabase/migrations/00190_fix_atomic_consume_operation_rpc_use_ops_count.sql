CREATE OR REPLACE FUNCTION atomic_consume_operation(p_user_id UUID, p_is_trial boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub record;
  v_new_used int;
BEGIN
  -- إغلاق الصف لمنع الـ Race Condition مع SKIP LOCKED لتجنب deadlocks
  SELECT * INTO v_sub FROM public.subscriptions 
  WHERE user_id = p_user_id AND status = 'active' 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_active_subscription', 'ops_used', 0, 'ops_limit', 0, 'is_trial', p_is_trial);
  END IF;

  v_new_used := COALESCE(v_sub.ops_count, 0) + 1;

  -- فحص نوع الاشتراك
  IF v_sub.code_type = 'trial' OR p_is_trial THEN
    IF v_sub.ops_count >= COALESCE(v_sub.ops_limit, 5) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'trial_limit_reached', 'exhausted', true, 'is_trial', true, 'ops_used', v_sub.ops_count, 'ops_limit', COALESCE(v_sub.ops_limit, 5), 'code_type', v_sub.code_type);
    END IF;
    
    UPDATE public.subscriptions SET ops_count = v_new_used WHERE id = v_sub.id;
    RETURN jsonb_build_object('allowed', true, 'remaining', COALESCE(v_sub.ops_limit, 5) - v_new_used, 'is_trial', true, 'exhausted', v_new_used >= COALESCE(v_sub.ops_limit, 5), 'ops_used', v_new_used, 'ops_limit', COALESCE(v_sub.ops_limit, 5), 'code_type', v_sub.code_type);
  END IF;

  -- الاشتراكات المدفوعة - إما بالعدد أو بالمدة
  IF v_sub.ops_limit IS NOT NULL THEN
    IF v_sub.ops_count >= v_sub.ops_limit THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'ops_limit_reached', 'exhausted', true, 'ops_used', v_sub.ops_count, 'ops_limit', v_sub.ops_limit, 'code_type', v_sub.code_type, 'is_trial', false);
    END IF;
    UPDATE public.subscriptions SET ops_count = v_new_used WHERE id = v_sub.id;
    RETURN jsonb_build_object('allowed', true, 'remaining', v_sub.ops_limit - v_new_used, 'exhausted', v_new_used >= v_sub.ops_limit, 'ops_used', v_new_used, 'ops_limit', v_sub.ops_limit, 'code_type', v_sub.code_type, 'is_trial', false);
  ELSE
    -- اشتراك مدة مفتوح العمليات
    IF v_sub.expires_at IS NOT NULL AND v_sub.expires_at < now() THEN
       RETURN jsonb_build_object('allowed', false, 'reason', 'subscription_expired', 'exhausted', true, 'ops_used', v_sub.ops_count, 'ops_limit', null, 'code_type', v_sub.code_type, 'is_trial', false);
    END IF;
    UPDATE public.subscriptions SET ops_count = v_new_used WHERE id = v_sub.id;
    RETURN jsonb_build_object('allowed', true, 'remaining', null, 'exhausted', false, 'ops_used', v_new_used, 'ops_limit', null, 'code_type', v_sub.code_type, 'is_trial', false);
  END IF;
END;
$$;