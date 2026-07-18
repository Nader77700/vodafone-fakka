CREATE OR REPLACE FUNCTION public.activate_license_key(p_user_id uuid, p_code text, p_device_fp text DEFAULT NULL::text, p_hardware_hash text DEFAULT NULL::text, p_native_id text DEFAULT NULL::text, p_admin_override boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_key              license_keys%ROWTYPE;
  v_current_sub      subscriptions%ROWTYPE;
  v_now              timestamptz := now();
  v_effective_days   integer;
  v_is_trial         boolean;
BEGIN
  -- 1. ابحث عن الكود
  SELECT * INTO v_key FROM license_keys WHERE code = p_code AND status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عفواً، كود التفعيل الذي أدخلته غير صحيح.', 'errorCode', 'INVALID_CODE');
  END IF;

  -- 2. تحقق من صلاحية الكود (expiry_date)
  IF v_key.expiry_date IS NOT NULL AND v_key.expiry_date < v_now THEN
    RETURN jsonb_build_object('success', false, 'error', 'هذا الكود منتهي الصلاحية منذ ' || to_char(v_key.expiry_date, 'YYYY-MM-DD'), 'errorCode', 'EXPIRED_CODE');
  END IF;

  v_is_trial := (v_key.code_type = 'trial');

  -- 3. تحقق من اشتراك المستخدم الحالي
  SELECT * INTO v_current_sub FROM subscriptions WHERE user_id = p_user_id AND status = 'active' LIMIT 1;
  IF FOUND THEN
    -- لا نسمح بتفعيل تجريبي إذا كان لديه اشتراك فعال بالفعل
    IF v_is_trial THEN
      RETURN jsonb_build_object('success', false, 'error', 'لديك اشتراك فعال، لا يمكنك تفعيل كود تجريبي.', 'errorCode', 'ACTIVE_SUB_EXISTS');
    END IF;
  END IF;

  -- 4. تحديد الأيام الفعالة (افتراضي 30 يوم إذا لم يكن محدد)
  v_effective_days := COALESCE(v_key.duration_days, 30);

  -- 5. تحديث الكود ليعتبر مستخدماً
  UPDATE license_keys
  SET
    status = CASE WHEN v_is_trial THEN 'active'::public.license_key_status ELSE 'used'::public.license_key_status END,
    used_by = p_user_id,
    activated_at = v_now,
    updated_at = v_now,
    used_count = used_count + 1
  WHERE id = v_key.id;

  -- 6. إضافة الاشتراك
  INSERT INTO subscriptions (
    user_id, license_key_id, status, plan_type, duration_days, days_remaining,
    ops_limit, ops_remaining, expires_at, created_at, updated_at
  ) VALUES (
    p_user_id, v_key.id, 'active'::public.subscription_status, v_key.code_type::public.plan_type, v_effective_days, v_effective_days,
    v_key.max_ops_per_user, v_key.max_ops_per_user, v_now + (v_effective_days || ' days')::interval, v_now, v_now
  );

  -- 7. إذا كان تجريبي، إضافة سجل trial_usage
  IF v_is_trial THEN
    INSERT INTO trial_usage (user_id, license_key_id, key_id, ops_used, activated_at, expires_at)
    VALUES (p_user_id, v_key.id, v_key.id, 0, v_now, v_now + (v_effective_days || ' days')::interval);
  END IF;

  -- 8. ربط الجهاز
  IF p_device_fp IS NOT NULL THEN
    INSERT INTO device_gift_activations (user_id, device_fp, hardware_hash, native_id, activated_at)
    VALUES (p_user_id, p_device_fp, p_hardware_hash, p_native_id, v_now)
    ON CONFLICT DO NOTHING;
  END IF;

  -- 9. تسجيل الحركة
  INSERT INTO activity_log (user_id, event_type, title, description, created_at)
  VALUES (p_user_id, 'activate_license_key', 'تفعيل كود', 'تم تفعيل كود ' || v_key.code_type, v_now);

  RETURN jsonb_build_object('success', true, 'isTrial', v_is_trial);
END;
$function$;