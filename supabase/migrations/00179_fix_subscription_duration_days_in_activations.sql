CREATE OR REPLACE FUNCTION activate_license_key(p_user_id uuid, p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_key record;
  v_subscription record;
  v_result jsonb;
  v_now timestamptz := now();
BEGIN
  -- 1. Check if user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'المستخدم غير موجود');
  END IF;

  -- 2. Lock and retrieve the key
  SELECT * INTO v_key FROM public.license_keys WHERE code = p_code FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الكود غير صحيح');
  END IF;

  IF v_key.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'الكود غير صالح أو مستخدم مسبقاً');
  END IF;

  IF v_key.expires_at IS NOT NULL AND v_key.expires_at < v_now THEN
    RETURN jsonb_build_object('success', false, 'error', 'الكود منتهي الصلاحية');
  END IF;

  -- 3. Check for existing active subscription
  SELECT * INTO v_subscription FROM public.subscriptions WHERE user_id = p_user_id AND status = 'active' FOR UPDATE;

  -- 4. Mark key as used
  UPDATE public.license_keys
  SET status = 'used', used_by = p_user_id, used_at = v_now
  WHERE id = v_key.id;

  -- 5. Create or update subscription
  IF v_subscription.id IS NOT NULL THEN
    -- Accumulate limits for BY_USAGE
    IF v_key.expiration_mode = 'BY_USAGE' THEN
      UPDATE public.subscriptions
      SET
        ops_limit = CASE WHEN ops_limit IS NULL THEN v_key.operations_limit ELSE ops_limit + v_key.operations_limit END,
        license_key_id = v_key.id,
        code_used = v_key.code,
        code_type = v_key.code_type,
        in_grace_period = false,
        grace_started_at = null,
        grace_ends_at = null
      WHERE id = v_subscription.id;
    ELSE
      -- Extend duration for BY_DATE
      UPDATE public.subscriptions
      SET
        expires_at = COALESCE(expires_at, v_now) + (COALESCE(v_key.duration_days, 30) || ' days')::interval,
        duration_days = COALESCE(duration_days, 0) + COALESCE(v_key.duration_days, 30),
        license_key_id = v_key.id,
        code_used = v_key.code,
        code_type = v_key.code_type,
        in_grace_period = false,
        grace_started_at = null,
        grace_ends_at = null
      WHERE id = v_subscription.id;
    END IF;
  ELSE
    -- Create new subscription
    INSERT INTO public.subscriptions (
      user_id, license_key_id, code_used, code_type, status,
      ops_limit, ops_used, duration_days,
      expires_at, created_at, updated_at
    ) VALUES (
      p_user_id, v_key.id, v_key.code, v_key.code_type, 'active',
      v_key.operations_limit, 0, COALESCE(v_key.duration_days, 30),
      CASE WHEN v_key.expiration_mode = 'BY_DATE' THEN v_now + (COALESCE(v_key.duration_days, 30) || ' days')::interval ELSE null END,
      v_now, v_now
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'تم تفعيل الكود بنجاح');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'حدث خطأ أثناء التفعيل: ' || SQLERRM);
END;
$$;