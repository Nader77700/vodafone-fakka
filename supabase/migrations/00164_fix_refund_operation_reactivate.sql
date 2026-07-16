CREATE OR REPLACE FUNCTION atomic_refund_operation(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub subscriptions%ROWTYPE;
  v_new_ops INTEGER;
BEGIN
  -- جلب أحدث اشتراك تم التعديل عليه
  SELECT * INTO v_sub
  FROM subscriptions
  WHERE user_id = p_user_id
  ORDER BY activated_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;
  
  IF NOT FOUND THEN RETURN; END IF;

  v_new_ops := GREATEST(0, COALESCE(v_sub.ops_count, 1) - 1);

  -- استرداد العملية
  UPDATE subscriptions
  SET ops_count = v_new_ops,
      -- إذا كان الاشتراك انتهى بسبب استنفاد الحصة (in_grace_period = true) وحالياً الحصة رجعت، نرجعه نشط
      status = CASE 
                 WHEN status = 'expired' AND in_grace_period = TRUE AND (ops_limit IS NULL OR v_new_ops < ops_limit)
                 THEN 'active'::subscription_status
                 ELSE status
               END,
      in_grace_period = CASE
                          WHEN status = 'expired' AND in_grace_period = TRUE AND (ops_limit IS NULL OR v_new_ops < ops_limit)
                          THEN FALSE
                          ELSE in_grace_period
                        END
  WHERE id = v_sub.id;

  -- التوافقية
  IF v_sub.license_key_id IS NOT NULL THEN
    UPDATE trial_usage
    SET ops_used = v_new_ops
    WHERE key_id = v_sub.license_key_id AND user_id = p_user_id;
  END IF;
END;
$$;
