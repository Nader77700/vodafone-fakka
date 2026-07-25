CREATE OR REPLACE FUNCTION public.atomic_consume_operation(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_sub record;
  v_new_used int;
  v_ops_limit int;
BEGIN
  -- إغلاق الصف لمنع الـ Race Condition
  SELECT * INTO v_sub FROM public.subscriptions 
  WHERE user_id = p_user_id AND status = 'active' 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_active_subscription', 'ops_used', 0, 'ops_limit', 0, 'is_trial', false);
  END IF;

  -- فحص انتهاء الوقت
  IF v_sub.expires_at IS NOT NULL AND v_sub.expires_at < now() THEN
    -- قم بتحويل الحالة إلى منتهي
    UPDATE public.subscriptions SET status = 'expired' WHERE id = v_sub.id;
    RETURN jsonb_build_object('allowed', false, 'reason', 'subscription_expired', 'exhausted', true, 'ops_used', COALESCE(v_sub.ops_count, 0), 'ops_limit', v_sub.ops_limit, 'code_type', v_sub.code_type, 'is_trial', v_sub.code_type = 'trial');
  END IF;

  -- التعامل مع ops_limit (لو 0 أو أقل يعتبر NULL/غير محدود)
  IF v_sub.ops_limit IS NULL OR v_sub.ops_limit <= 0 THEN
    v_ops_limit := NULL;
  ELSE
    v_ops_limit := v_sub.ops_limit;
  END IF;

  -- فحص الحصة التجريبية خصيصاً (إذا كان السقف Null يتم فرض 5 عمليات)
  IF v_sub.code_type = 'trial' AND v_ops_limit IS NULL THEN
    v_ops_limit := 5;
  END IF;

  -- فحص الحصة لو كانت محدودة
  IF v_ops_limit IS NOT NULL AND COALESCE(v_sub.ops_count, 0) >= v_ops_limit THEN
    -- قم بتحويل الحالة إلى منتهي لو كان BY_USAGE
    UPDATE public.subscriptions SET status = 'expired' WHERE id = v_sub.id;
    RETURN jsonb_build_object('allowed', false, 'reason', 'ops_limit_reached', 'exhausted', true, 'ops_used', COALESCE(v_sub.ops_count, 0), 'ops_limit', v_ops_limit, 'code_type', v_sub.code_type, 'is_trial', v_sub.code_type = 'trial');
  END IF;

  -- نجاح: استهلاك العملية
  v_new_used := COALESCE(v_sub.ops_count, 0) + 1;
  UPDATE public.subscriptions SET ops_count = v_new_used WHERE id = v_sub.id;

  RETURN jsonb_build_object(
    'allowed', true, 
    'remaining', CASE WHEN v_ops_limit IS NOT NULL THEN v_ops_limit - v_new_used ELSE NULL END, 
    'exhausted', CASE WHEN v_ops_limit IS NOT NULL THEN v_new_used >= v_ops_limit ELSE false END, 
    'ops_used', v_new_used, 
    'ops_limit', v_ops_limit, 
    'code_type', v_sub.code_type, 
    'is_trial', v_sub.code_type = 'trial'
  );
END;
$function$;