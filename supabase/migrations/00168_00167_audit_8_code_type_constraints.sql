-- Audit 8: Code Types Constraints (Gift, Trial, Paid)

CREATE OR REPLACE FUNCTION activate_license_key_v2(
  p_user_id       UUID,
  p_code          TEXT,
  p_device_fp     TEXT DEFAULT NULL,
  p_hardware_hash TEXT DEFAULT NULL,
  p_native_id     TEXT DEFAULT NULL,
  p_admin_override BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key              license_keys%ROWTYPE;
  v_current_sub      subscriptions%ROWTYPE;
  v_days_before      INTEGER := 0;
  v_effective_days   INTEGER;
  v_base_date        TIMESTAMPTZ;
  v_expires_at       TIMESTAMPTZ;
  v_final_expires    TIMESTAMPTZ;
  v_days_after       INTEGER;
  v_max_allowed      INTEGER;
  v_is_multi_paid    BOOLEAN;
  v_now              TIMESTAMPTZ := NOW();
  v_blocker_username TEXT;
  v_blocker_user_id  UUID;
BEGIN
  -- 1. Security check first (if not admin override)
  IF NOT p_admin_override THEN
    BEGIN
      PERFORM check_security_constraints(p_user_id, p_device_fp, p_hardware_hash, p_native_id);
    EXCEPTION WHEN OTHERS THEN
      RETURN json_build_object('success', false, 'error', SQLERRM, 'errorCode', 'BANNED');
    END;
  END IF;

  -- 2. جلب الكود
  SELECT * INTO v_key FROM license_keys WHERE code = p_code;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'كود التفعيل غير صحيح', 'errorCode', 'INVALID');
  END IF;

  -- 3. التحقق من حالة الكود
  IF v_key.status = 'disabled' THEN
    RETURN json_build_object('success', false, 'error', 'هذا الكود معطّل', 'errorCode', 'DISABLED');
  END IF;
  IF v_key.status = 'expired' THEN
    RETURN json_build_object('success', false, 'error', 'هذا الكود منتهي الصلاحية', 'errorCode', 'EXPIRED');
  END IF;
  IF v_key.status = 'used' AND v_key.type != 'multi_paid' THEN
    RETURN json_build_object('success', false, 'error', 'هذا الكود مستخدم من قبل', 'errorCode', 'USED');
  END IF;

  -- 4. التحقق الإضافي لأكواد multi_paid 
  v_is_multi_paid := (v_key.type = 'multi_paid');
  IF v_is_multi_paid THEN
    IF v_key.max_users IS NOT NULL AND v_key.current_users >= v_key.max_users THEN
      RETURN json_build_object('success', false, 'error', 'هذا الكود وصل للحد الأقصى للمستخدمين', 'errorCode', 'LIMIT_REACHED');
    END IF;
    IF v_key.expires_at IS NOT NULL AND v_now > v_key.expires_at THEN
      RETURN json_build_object('success', false, 'error', 'صلاحية الكود منتهية زمنياً', 'errorCode', 'EXPIRED_TIME');
    END IF;
    -- التأكد أن المستخدم لم يستخدمه مسبقاً
    IF EXISTS (
      SELECT 1 FROM subscription_history 
      WHERE user_id = p_user_id 
        AND action_type = 'activation' 
        AND details->>'code' = p_code
    ) THEN
      RETURN json_build_object('success', false, 'error', 'لقد قمت باستخدام هذا الكود بالفعل', 'errorCode', 'ALREADY_USED_BY_YOU');
    END IF;
  END IF;

  -- 5. جلب اشتراك المستخدم الحالي
  SELECT * INTO v_current_sub FROM subscriptions WHERE user_id = p_user_id FOR UPDATE;

  IF FOUND THEN
    v_base_date := GREATEST(v_now, COALESCE(v_current_sub.expires_at, v_now));
  ELSE
    v_base_date := v_now;
  END IF;

  -- 6. حساب المدة
  IF v_key.type = 'trial' THEN
    v_effective_days := v_key.trial_duration;
    v_expires_at := v_base_date + (v_effective_days || ' minutes')::INTERVAL;
  ELSE
    v_effective_days := COALESCE(v_key.duration_days, 0);
    v_expires_at := v_base_date + (v_effective_days || ' days')::INTERVAL;
  END IF;

  -- التحقق من الحد الأقصى للمدة
  v_max_allowed := get_system_setting_int('max_subscription_days', 3650);
  IF EXTRACT(DAY FROM (v_expires_at - v_now)) > v_max_allowed AND NOT p_admin_override THEN
    RETURN json_build_object('success', false, 'error', 'المدة تتجاوز الحد الأقصى المسموح (' || v_max_allowed || ' يوم)', 'errorCode', 'MAX_DURATION');
  END IF;
  v_final_expires := v_expires_at;

  -- 7. قيود صارمة على جهاز ومستخدم Trial و Gift
  IF v_key.type IN ('trial', 'gift') AND NOT p_admin_override THEN
    -- A. التأكد أن هذا المستخدم (user_id) لم يستخدم كود من نفس النوع مسبقاً
    IF EXISTS (
      SELECT 1 FROM device_gift_activations
      WHERE user_id = p_user_id AND key_type = v_key.type
    ) THEN
      RETURN json_build_object(
        'success', false, 
        'error', 'لقد قمت بالحصول على ' || (CASE WHEN v_key.type = 'trial' THEN 'تجربة مجانية' ELSE 'هدية مجانية' END) || ' مسبقاً، ولا يمكنك الحصول عليها مرة أخرى.',
        'errorCode', 'USER_ALREADY_USED_TRIAL'
      );
    END IF;

    -- B. التأكد أن هذا الجهاز (device_fp) لم يُستخدم من قبل مستخدم آخر لنفس النوع
    IF EXISTS (
      SELECT 1 FROM device_gift_activations
      WHERE (
        (p_device_fp IS NOT NULL AND device_fp = p_device_fp) OR
        (p_hardware_hash IS NOT NULL AND hardware_hash = p_hardware_hash) OR
        (p_native_id IS NOT NULL AND native_id = p_native_id)
      )
      AND key_type = v_key.type
    ) THEN
      SELECT username, user_id INTO v_blocker_username, v_blocker_user_id 
      FROM profiles 
      WHERE id = (
        SELECT user_id FROM device_gift_activations
        WHERE (
          (p_device_fp IS NOT NULL AND device_fp = p_device_fp) OR
          (p_hardware_hash IS NOT NULL AND hardware_hash = p_hardware_hash) OR
          (p_native_id IS NOT NULL AND native_id = p_native_id)
        )
        AND key_type = v_key.type
        LIMIT 1
      );
      
      RETURN json_build_object(
        'success', false, 
        'error', 'الجهاز مستخدم للحصول على نفس العرض في حساب آخر (' || COALESCE(v_blocker_username, 'مجهول') || ')',
        'errorCode', 'DEVICE_USED'
      );
    END IF;
  END IF;

  -- 8. التحديثات في المعاملة
  IF v_is_multi_paid THEN
    UPDATE license_keys 
    SET current_users = COALESCE(current_users, 0) + 1,
        status = CASE 
          WHEN COALESCE(current_users, 0) + 1 >= max_users THEN 'used'::license_status
          ELSE status 
        END,
        updated_at = NOW()
    WHERE id = v_key.id;
  ELSE
    UPDATE license_keys 
    SET used_by = p_user_id, status = 'used', updated_at = NOW() 
    WHERE id = v_key.id;
  END IF;

  -- تحديث / إنشاء الاشتراك
  IF FOUND AND v_current_sub.id IS NOT NULL THEN
    v_days_before := EXTRACT(DAY FROM (COALESCE(v_current_sub.expires_at, v_now) - v_now))::INTEGER;
    IF v_days_before < 0 THEN v_days_before := 0; END IF;

    UPDATE subscriptions
    SET expires_at = v_final_expires,
        ops_limit = GREATEST(v_current_sub.ops_limit, COALESCE(v_key.ops_limit, 0)),
        ops_remaining = GREATEST(v_current_sub.ops_remaining, COALESCE(v_key.ops_limit, 0)),
        is_active = TRUE,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING EXTRACT(DAY FROM (expires_at - v_now))::INTEGER INTO v_days_after;
  ELSE
    v_days_before := 0;
    INSERT INTO subscriptions (
      user_id, expires_at, ops_limit, ops_remaining, is_active
    ) VALUES (
      p_user_id, v_final_expires, COALESCE(v_key.ops_limit, 1000), COALESCE(v_key.ops_limit, 1000), TRUE
    )
    RETURNING EXTRACT(DAY FROM (expires_at - v_now))::INTEGER INTO v_days_after;
  END IF;

  -- تسجيل في device_gift_activations للأجهزة
  IF v_key.type IN ('trial', 'gift') THEN
    BEGIN
      INSERT INTO device_gift_activations (user_id, device_fp, hardware_hash, native_id, key_type, license_key_id)
      VALUES (p_user_id, p_device_fp, p_hardware_hash, p_native_id, v_key.type, v_key.id);
    EXCEPTION WHEN unique_violation THEN
      NULL; -- تجاهل إذا مسجل مسبقاً
    END;
  END IF;

  -- تسجيل في سجل الاشتراكات
  INSERT INTO subscription_history (
    user_id, action_type, days_added, days_before, days_after, details, created_at
  ) VALUES (
    p_user_id, 'activation', v_effective_days, v_days_before, v_days_after, 
    jsonb_build_object('code', v_key.code, 'type', v_key.type, 'ops_limit', v_key.ops_limit), NOW()
  );

  RETURN json_build_object(
    'success', true,
    'days_added', v_effective_days,
    'new_expires_at', v_final_expires,
    'new_ops_limit', COALESCE(v_key.ops_limit, 1000)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM, 'errorCode', 'INTERNAL_ERROR');
END;
$$;