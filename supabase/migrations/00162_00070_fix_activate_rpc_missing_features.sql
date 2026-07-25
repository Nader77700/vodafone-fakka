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
  -- 1. جلب الكود
  SELECT * INTO v_key FROM license_keys WHERE code = p_code;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'كود التفعيل غير صحيح', 'errorCode', 'INVALID');
  END IF;

  -- 2. التحقق من حالة الكود
  IF v_key.status = 'disabled' THEN
    RETURN json_build_object('success', false, 'error', 'هذا الكود معطّل', 'errorCode', 'DISABLED');
  END IF;
  IF v_key.status = 'expired' THEN
    RETURN json_build_object('success', false, 'error', 'هذا الكود منتهي الصلاحية', 'errorCode', 'EXPIRED');
  END IF;
  IF v_key.expiry_date IS NOT NULL AND v_key.expiry_date < v_now THEN
    RETURN json_build_object('success', false, 'error', 'انتهت صلاحية هذا الكود', 'errorCode', 'EXPIRED');
  END IF;

  v_is_multi_paid := (v_key.code_type = 'paid' OR v_key.code_type IS NULL) AND COALESCE(v_key.allowed_users, v_key.max_users, 1) > 1;
  IF NOT v_is_multi_paid AND (v_key.code_type = 'paid' OR v_key.code_type IS NULL) AND v_key.status = 'used' THEN
    RETURN json_build_object('success', false, 'error', 'هذا الكود مستخدم مسبقاً', 'errorCode', 'USED');
  END IF;

  -- 3. التحقق من بصمة الجهاز للـ Gift/Trial
  IF p_admin_override = FALSE AND v_key.code_type IN ('gift', 'trial') THEN
    IF p_device_fp IS NOT NULL OR p_hardware_hash IS NOT NULL OR p_native_id IS NOT NULL THEN
      SELECT dga.username, dga.user_id
      INTO   v_blocker_username, v_blocker_user_id
      FROM   device_gift_activations dga
      WHERE  dga.user_id <> p_user_id
        AND  (
             (p_native_id IS NOT NULL AND dga.native_id = p_native_id)
          OR (p_hardware_hash IS NOT NULL AND dga.hardware_hash = p_hardware_hash)
          OR (p_device_fp IS NOT NULL AND dga.device_fp = p_device_fp)
        )
      LIMIT 1;

      IF FOUND THEN
        RETURN json_build_object(
          'success', false,
          'error', 'تم استخدام هذا الكود مسبقاً على هذا الجهاز بحساب آخر',
          'errorCode', 'DEVICE_BLOCKED',
          'blockerUsername', COALESCE(v_blocker_username, 'مستخدم آخر')
        );
      END IF;
    END IF;
  END IF;

  -- 4. جلب الاشتراك الحالي
  SELECT * INTO v_current_sub FROM subscriptions WHERE user_id = p_user_id;
  IF FOUND AND v_current_sub.status = 'active' AND v_current_sub.expires_at IS NOT NULL THEN
    v_days_before := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_current_sub.expires_at - v_now)) / 86400));
    v_base_date := v_current_sub.expires_at;
  ELSE
    v_base_date := v_now;
  END IF;

  v_effective_days := COALESCE(v_key.custom_duration_days, v_key.duration_days, 1);
  v_expires_at := v_base_date + (v_effective_days || ' days')::INTERVAL;

  IF v_key.expiration_mode = 'BY_DATE' AND v_key.expiry_date IS NOT NULL THEN
    v_final_expires := v_key.expiry_date;
  ELSIF v_key.expiration_mode = 'EARLIEST' AND v_key.expiry_date IS NOT NULL THEN
    IF v_expires_at < v_key.expiry_date THEN v_final_expires := v_expires_at; ELSE v_final_expires := v_key.expiry_date; END IF;
  ELSE
    v_final_expires := v_expires_at;
  END IF;

  v_days_after := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_final_expires - v_now)) / 86400));

  -- 5. التحديث حسب نوع الكود وإدراج الإشعارات والتاريخ
  IF v_key.code_type = 'paid' OR v_key.code_type IS NULL THEN
    IF v_is_multi_paid THEN
      v_max_allowed := COALESCE(v_key.allowed_users, v_key.max_users, 1);
      IF v_key.used_count >= v_max_allowed THEN
        RETURN json_build_object('success', false, 'error', 'وصل الكود للحد الأقصى', 'errorCode', 'MAX_USERS');
      END IF;
      UPDATE license_keys SET used_count = used_count + 1 WHERE id = v_key.id;
      IF v_key.used_count + 1 >= v_max_allowed THEN
        UPDATE license_keys SET status = 'used' WHERE id = v_key.id;
      END IF;
    ELSE
      UPDATE license_keys SET status = 'used', used_count = 1 WHERE id = v_key.id;
    END IF;

    INSERT INTO subscription_history (user_id, license_key_id, code, code_type, duration_days, days_before, days_after, activated_at, expires_at, notes)
    VALUES (p_user_id, v_key.id, v_key.code, COALESCE(v_key.code_type, 'paid'), v_effective_days, v_days_before, v_days_after, v_now, v_final_expires, v_key.notes);
    
    INSERT INTO notifications (user_id, title, body, type, is_read, is_global)
    VALUES (p_user_id,
      CASE WHEN v_days_before > 0 THEN '🔄 تم تجديد اشتراكك بنجاح' ELSE '✅ تم تفعيل اشتراكك بنجاح' END,
      'الكود: ' || v_key.code || ' ✦ المدة: ' || v_effective_days || ' يوم',
      'subscription_renewal', false, false);

  ELSIF v_key.code_type = 'trial' THEN
    v_max_allowed := COALESCE(v_key.allowed_users, v_key.max_users, NULL);
    IF v_max_allowed IS NOT NULL AND v_key.used_count >= v_max_allowed THEN
      RETURN json_build_object('success', false, 'error', 'انتهت سعة الكود التجريبي', 'errorCode', 'MAX_USERS');
    END IF;
    
    IF p_admin_override = FALSE AND EXISTS (SELECT 1 FROM subscriptions s JOIN license_keys lk ON s.license_key_id = lk.id WHERE s.user_id = p_user_id AND lk.code_type = 'trial') THEN
      RETURN json_build_object('success', false, 'error', 'سبق لك استخدام اشتراك تجريبي', 'errorCode', 'ALREADY_TRIAL');
    END IF;
    
    UPDATE license_keys SET used_count = used_count + 1 WHERE id = v_key.id;

    IF p_device_fp IS NOT NULL OR p_hardware_hash IS NOT NULL OR p_native_id IS NOT NULL THEN
      INSERT INTO device_gift_activations (device_fp, hardware_hash, native_id, user_id, username, license_key_id, code, code_type, activated_at)
      SELECT COALESCE(p_device_fp, ''), p_hardware_hash, p_native_id, p_user_id, COALESCE(pr.username, ''), v_key.id, v_key.code, 'trial', v_now
      FROM profiles pr WHERE pr.id = p_user_id ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO subscription_history (user_id, license_key_id, code, code_type, duration_days, days_before, days_after, activated_at, expires_at, notes)
    VALUES (p_user_id, v_key.id, v_key.code, 'trial', v_effective_days, v_days_before, v_days_after, v_now, v_final_expires, v_key.notes);
    
    INSERT INTO notifications (user_id, title, body, type, is_read, is_global)
    VALUES (p_user_id, '✅ تم تفعيل الكود التجريبي',
            'الكود: ' || v_key.code || ' ✦ المدة: ' || v_effective_days || ' يوم',
            'subscription_renewal', false, false);

  ELSIF v_key.code_type = 'gift' THEN
    v_max_allowed := COALESCE(v_key.allowed_users, v_key.max_users, NULL);
    IF v_max_allowed IS NOT NULL AND v_key.used_count >= v_max_allowed THEN
      RETURN json_build_object('success', false, 'error', 'انتهت سعة كود الهدية', 'errorCode', 'MAX_USERS');
    END IF;

    IF EXISTS (SELECT 1 FROM gift_claims WHERE user_id = p_user_id AND license_key_id = v_key.id) THEN
      RETURN json_build_object('success', false, 'error', 'سبق استخدام هذه الهدية لحسابك', 'errorCode', 'ALREADY_USED');
    END IF;

    UPDATE license_keys SET used_count = used_count + 1 WHERE id = v_key.id;
    INSERT INTO gift_claims (user_id, license_key_id, code_snapshot, status)
    VALUES (p_user_id, v_key.id, v_key.code, 'claimed') ON CONFLICT DO NOTHING;

    IF p_device_fp IS NOT NULL OR p_hardware_hash IS NOT NULL OR p_native_id IS NOT NULL THEN
      INSERT INTO device_gift_activations (device_fp, hardware_hash, native_id, user_id, username, license_key_id, code, code_type, activated_at)
      SELECT COALESCE(p_device_fp, ''), p_hardware_hash, p_native_id, p_user_id, COALESCE(pr.username, ''), v_key.id, v_key.code, 'gift', v_now
      FROM profiles pr WHERE pr.id = p_user_id ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO subscription_history (user_id, license_key_id, code, code_type, duration_days, days_before, days_after, activated_at, expires_at, notes)
    VALUES (p_user_id, v_key.id, v_key.code, 'gift', v_effective_days, v_days_before, v_days_after, v_now, v_final_expires, v_key.notes);
    
    INSERT INTO notifications (user_id, title, body, type, is_read, is_global)
    VALUES (p_user_id, '🎁 تم استلام هديتك الترحيبية!',
            'الكود: ' || v_key.code || ' ✦ المدة: ' || v_effective_days || ' يوم',
            'subscription_renewal', false, false);

  ELSE
    RETURN json_build_object('success', false, 'error', 'نوع كود غير معروف', 'errorCode', 'UNKNOWN_TYPE');
  END IF;

  -- 6. إنشاء أو تحديث الاشتراك
  IF FOUND AND v_current_sub.id IS NOT NULL THEN
    UPDATE subscriptions SET
      status = 'active',
      license_key_id = v_key.id,
      code_used = v_key.code,
      activated_at = v_now,
      expires_at = v_final_expires,
      in_grace_period = false,
      grace_started_at = NULL,
      grace_ends_at = NULL,
      ops_limit = COALESCE(v_key.operations_per_user, v_key.max_ops_per_user, v_key.uses_per_user, v_current_sub.ops_limit),
      ops_count = CASE WHEN v_key.code_type IN ('trial', 'gift') THEN 0 ELSE v_current_sub.ops_count END,
      days_remaining = v_days_after,
      updated_at = v_now
    WHERE id = v_current_sub.id;
  ELSE
    INSERT INTO subscriptions (
      user_id, status, license_key_id, code_used,
      activated_at, expires_at,
      in_grace_period, grace_started_at, grace_ends_at,
      ops_limit, ops_count, days_remaining
    ) VALUES (
      p_user_id, 'active', v_key.id, v_key.code,
      v_now, v_final_expires,
      false, NULL, NULL,
      COALESCE(v_key.operations_per_user, v_key.max_ops_per_user, v_key.uses_per_user), 0, v_days_after
    );
  END IF;

  RETURN json_build_object('success', true, 'isTrial', v_key.code_type = 'trial', 'daysAfter', v_days_after);

EXCEPTION WHEN OTHERS THEN
  INSERT INTO system_logs (user_id, level, action, message)
  VALUES (p_user_id, 'error', 'activate_license_error', 'خطأ غير متوقع: ' || SQLERRM || ' | كود: ' || p_code)
  ON CONFLICT DO NOTHING;
  RETURN json_build_object('success', false, 'error', 'خطأ داخلي في الخادم', 'errorCode', 'SERVER_ERROR');
END;
$$;