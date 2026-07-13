
-- تحديث RPC ليملأ كلا العمودين key_id و license_key_id في trial_usage
CREATE OR REPLACE FUNCTION activate_license_key_v2(
  p_user_id   UUID,
  p_code      TEXT,
  p_device_fp TEXT DEFAULT NULL
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

  -- 2. حالة الكود
  IF v_key.status = 'disabled' THEN
    RETURN json_build_object('success', false, 'error', 'هذا الكود معطّل', 'errorCode', 'DISABLED');
  END IF;
  IF v_key.status = 'expired' THEN
    RETURN json_build_object('success', false, 'error', 'هذا الكود منتهي الصلاحية', 'errorCode', 'EXPIRED');
  END IF;
  IF v_key.expiry_date IS NOT NULL AND v_key.expiry_date < v_now THEN
    UPDATE license_keys SET status = 'expired' WHERE id = v_key.id;
    RETURN json_build_object('success', false, 'error', 'انتهت صلاحية هذا الكود', 'errorCode', 'EXPIRED');
  END IF;

  -- 3. فحص بصمة الجهاز (gift/trial فقط)
  IF p_device_fp IS NOT NULL AND p_device_fp <> '' THEN
    UPDATE profiles SET device_fp = p_device_fp WHERE id = p_user_id;
    IF v_key.code_type IN ('gift', 'trial') THEN
      SELECT dga.username, dga.user_id
      INTO   v_blocker_username, v_blocker_user_id
      FROM   device_gift_activations dga
      WHERE  dga.device_fp = p_device_fp
        AND  dga.user_id <> p_user_id
      LIMIT 1;
      IF FOUND THEN
        RETURN json_build_object(
          'success',         false,
          'error',           'تم استخدام هذا الكود مسبقاً على هذا الجهاز بحساب آخر',
          'errorCode',       'DEVICE_BLOCKED',
          'blockerUsername', COALESCE(v_blocker_username, 'مستخدم آخر')
        );
      END IF;
    END IF;
  END IF;

  -- 4. الاشتراك الحالي + الأيام المتبقية
  SELECT * INTO v_current_sub FROM subscriptions WHERE user_id = p_user_id;
  IF FOUND AND v_current_sub.status = 'active' AND v_current_sub.expires_at IS NOT NULL THEN
    v_days_before := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_current_sub.expires_at - v_now)) / 86400));
  END IF;

  v_effective_days := COALESCE(v_key.custom_duration_days, v_key.duration_days, 1);
  IF v_effective_days < 1 THEN v_effective_days := 1; END IF;

  -- ── PAID ──
  IF v_key.code_type = 'paid' OR v_key.code_type IS NULL THEN
    v_max_allowed   := COALESCE(v_key.allowed_users, v_key.max_users, 1);
    v_is_multi_paid := v_max_allowed > 1;
    IF v_is_multi_paid THEN
      IF FOUND AND v_current_sub.license_key_id = v_key.id AND v_current_sub.status = 'active' THEN
        RETURN json_build_object('success', false, 'error', 'سبق تفعيل هذا الكود على حسابك', 'errorCode', 'ALREADY_USED');
      END IF;
      IF v_key.used_count >= v_max_allowed THEN
        RETURN json_build_object('success', false, 'error', 'وصل الكود للحد الأقصى من المستخدمين', 'errorCode', 'MAX_USERS');
      END IF;
      UPDATE license_keys SET used_count = used_count + 1 WHERE id = v_key.id;
    ELSE
      IF v_key.status = 'used' THEN
        RETURN json_build_object('success', false, 'error', 'هذا الكود مستخدم مسبقاً', 'errorCode', 'USED');
      END IF;
      UPDATE license_keys SET status = 'used', used_by = p_user_id, used_at = v_now, used_count = 1 WHERE id = v_key.id;
    END IF;

    v_base_date     := CASE WHEN v_days_before > 0 AND v_current_sub.expires_at IS NOT NULL THEN v_current_sub.expires_at ELSE v_now END;
    v_expires_at    := v_base_date + (v_effective_days * INTERVAL '1 day');
    v_final_expires := CASE
      WHEN v_key.expiration_mode = 'BY_DATE'  AND v_key.expiry_date IS NOT NULL THEN v_key.expiry_date
      WHEN v_key.expiration_mode = 'EARLIEST' AND v_key.expiry_date IS NOT NULL THEN LEAST(v_expires_at, v_key.expiry_date)
      ELSE v_expires_at END;
    v_days_after := v_days_before + v_effective_days;

    INSERT INTO subscriptions (user_id, license_key_id, status, activated_at, expires_at, in_grace_period, grace_started_at, grace_ends_at)
    VALUES (p_user_id, v_key.id, 'active', COALESCE(v_current_sub.activated_at, v_now), v_final_expires, false, NULL, NULL)
    ON CONFLICT (user_id) DO UPDATE SET
      license_key_id = EXCLUDED.license_key_id, status = 'active',
      expires_at = EXCLUDED.expires_at, in_grace_period = false,
      grace_started_at = NULL, grace_ends_at = NULL;

    INSERT INTO subscription_history (user_id, license_key_id, code, code_type, duration_days, days_before, days_after, activated_at, expires_at, notes)
    VALUES (p_user_id, v_key.id, v_key.code, 'paid', v_effective_days, v_days_before, v_days_after, v_now, v_final_expires, v_key.notes);

    INSERT INTO notifications (user_id, title, body, type, is_read, is_global)
    VALUES (p_user_id,
      CASE WHEN v_days_before > 0 THEN '🔄 تم تجديد اشتراكك بنجاح' ELSE '✅ تم تفعيل اشتراكك بنجاح' END,
      'الكود: ' || v_key.code || ' ✦ المدة: ' || v_effective_days || ' يوم',
      'subscription_renewal', false, false);

    INSERT INTO activity_log (user_id, event_type, title, description, metadata)
    VALUES (p_user_id,
      CASE WHEN v_days_before > 0 THEN 'renewal' ELSE 'activation' END,
      CASE WHEN v_days_before > 0 THEN 'تجديد الاشتراك' ELSE 'تفعيل الاشتراك' END,
      CASE WHEN v_days_before > 0 THEN 'تمت إضافة ' || v_effective_days || ' يوم — الإجمالي ' || v_days_after || ' يوم'
           ELSE 'تم تفعيل اشتراك ' || v_effective_days || ' يوم' END,
      json_build_object('code', v_key.code, 'duration_days', v_effective_days, 'days_before', v_days_before, 'days_after', v_days_after));

    INSERT INTO system_logs (user_id, level, action, message)
    VALUES (p_user_id, 'info', 'activate_license',
      'تم ' || CASE WHEN v_days_before > 0 THEN 'تجديد' ELSE 'تفعيل' END || ' كود مدفوع: ' || p_code || ' — الإجمالي ' || v_days_after || ' يوم');

    RETURN json_build_object('success', true, 'isTrial', false, 'daysAfter', v_days_after);

  -- ── TRIAL ──
  ELSIF v_key.code_type = 'trial' THEN
    v_max_allowed := COALESCE(v_key.allowed_users, v_key.max_users, NULL);
    IF v_max_allowed IS NOT NULL AND v_key.used_count >= v_max_allowed THEN
      RETURN json_build_object('success', false, 'error', 'انتهت سعة هذا الكود التجريبي', 'errorCode', 'MAX_USERS');
    END IF;

    -- فحص: هل المستخدم سبق فعّل هذا الكود؟ (يتحقق من كلا العمودين)
    IF EXISTS (
      SELECT 1 FROM trial_usage
      WHERE user_id = p_user_id
        AND (license_key_id = v_key.id OR key_id = v_key.id)
    ) THEN
      RETURN json_build_object('success', false, 'error', 'سبق تفعيل الكود التجريبي لحسابك', 'errorCode', 'ALREADY_USED');
    END IF;

    v_base_date     := CASE WHEN v_days_before > 0 AND v_current_sub.expires_at IS NOT NULL THEN v_current_sub.expires_at ELSE v_now END;
    v_expires_at    := v_base_date + (v_effective_days * INTERVAL '1 day');
    v_final_expires := CASE
      WHEN v_key.expiration_mode = 'BY_DATE'  AND v_key.expiry_date IS NOT NULL THEN v_key.expiry_date
      WHEN v_key.expiration_mode = 'EARLIEST' AND v_key.expiry_date IS NOT NULL THEN LEAST(v_expires_at, v_key.expiry_date)
      ELSE v_expires_at END;
    v_days_after := v_days_before + v_effective_days;

    UPDATE license_keys SET used_count = used_count + 1 WHERE id = v_key.id;

    -- ★ الإصلاح: نملأ key_id و license_key_id معاً
    INSERT INTO trial_usage (user_id, key_id, license_key_id, activated_at, expires_at)
    VALUES (p_user_id, v_key.id, v_key.id, v_now, v_final_expires)
    ON CONFLICT DO NOTHING;

    INSERT INTO subscriptions (user_id, license_key_id, status, activated_at, expires_at, in_grace_period, grace_started_at, grace_ends_at)
    VALUES (p_user_id, v_key.id, 'active', v_now, v_final_expires, false, NULL, NULL)
    ON CONFLICT (user_id) DO UPDATE SET
      license_key_id = EXCLUDED.license_key_id, status = 'active',
      activated_at = EXCLUDED.activated_at, expires_at = EXCLUDED.expires_at,
      in_grace_period = false, grace_started_at = NULL, grace_ends_at = NULL;

    INSERT INTO subscription_history (user_id, license_key_id, code, code_type, duration_days, days_before, days_after, activated_at, expires_at, notes)
    VALUES (p_user_id, v_key.id, v_key.code, 'trial', v_effective_days, v_days_before, v_days_after, v_now, v_final_expires, v_key.notes);

    INSERT INTO notifications (user_id, title, body, type, is_read, is_global)
    VALUES (p_user_id, '✅ تم تفعيل الكود التجريبي',
            'الكود: ' || v_key.code || ' ✦ المدة: ' || v_effective_days || ' يوم',
            'subscription_renewal', false, false);

    INSERT INTO activity_log (user_id, event_type, title, description, metadata)
    VALUES (p_user_id, 'activation', 'تفعيل تجريبي',
            'تم تفعيل كود تجريبي: ' || p_code || ' — ' || v_effective_days || ' يوم',
            json_build_object('code', v_key.code, 'duration_days', v_effective_days));

    INSERT INTO system_logs (user_id, level, action, message)
    VALUES (p_user_id, 'info', 'activate_trial',
            'تم تفعيل كود تجريبي: ' || p_code || ' — ' || v_effective_days || ' يوم');

    IF p_device_fp IS NOT NULL AND p_device_fp <> '' THEN
      INSERT INTO device_gift_activations (device_fp, user_id, username, license_key_id, code, code_type, activated_at)
      SELECT p_device_fp, p_user_id, COALESCE(pr.username, ''), v_key.id, v_key.code, 'trial', v_now
      FROM profiles pr WHERE pr.id = p_user_id
      ON CONFLICT DO NOTHING;
    END IF;

    RETURN json_build_object('success', true, 'isTrial', true, 'daysAfter', v_days_after);

  -- ── GIFT ──
  ELSIF v_key.code_type = 'gift' THEN
    v_max_allowed := COALESCE(v_key.allowed_users, v_key.max_users, NULL);
    IF v_max_allowed IS NOT NULL AND v_key.used_count >= v_max_allowed THEN
      RETURN json_build_object('success', false, 'error', 'انتهت سعة كود الهدية', 'errorCode', 'MAX_USERS');
    END IF;

    IF EXISTS (SELECT 1 FROM gift_claims WHERE user_id = p_user_id AND license_key_id = v_key.id) THEN
      RETURN json_build_object('success', false, 'error', 'سبق استخدام هذه الهدية لحسابك', 'errorCode', 'ALREADY_USED');
    END IF;

    v_base_date     := CASE WHEN v_days_before > 0 AND v_current_sub.expires_at IS NOT NULL THEN v_current_sub.expires_at ELSE v_now END;
    v_expires_at    := v_base_date + (v_effective_days * INTERVAL '1 day');
    v_final_expires := CASE
      WHEN v_key.expiration_mode = 'BY_DATE'  AND v_key.expiry_date IS NOT NULL THEN v_key.expiry_date
      WHEN v_key.expiration_mode = 'EARLIEST' AND v_key.expiry_date IS NOT NULL THEN LEAST(v_expires_at, v_key.expiry_date)
      ELSE v_expires_at END;
    v_days_after := v_days_before + v_effective_days;

    UPDATE license_keys SET used_count = used_count + 1 WHERE id = v_key.id;

    INSERT INTO gift_claims (user_id, license_key_id, claimed_at)
    VALUES (p_user_id, v_key.id, v_now)
    ON CONFLICT DO NOTHING;

    INSERT INTO subscriptions (user_id, license_key_id, status, activated_at, expires_at, in_grace_period, grace_started_at, grace_ends_at)
    VALUES (p_user_id, v_key.id, 'active', v_now, v_final_expires, false, NULL, NULL)
    ON CONFLICT (user_id) DO UPDATE SET
      license_key_id = EXCLUDED.license_key_id, status = 'active',
      activated_at = EXCLUDED.activated_at, expires_at = EXCLUDED.expires_at,
      in_grace_period = false, grace_started_at = NULL, grace_ends_at = NULL;

    INSERT INTO subscription_history (user_id, license_key_id, code, code_type, duration_days, days_before, days_after, activated_at, expires_at, notes)
    VALUES (p_user_id, v_key.id, v_key.code, 'gift', v_effective_days, v_days_before, v_days_after, v_now, v_final_expires, v_key.notes);

    INSERT INTO notifications (user_id, title, body, type, is_read, is_global)
    VALUES (p_user_id, '🎁 تم استلام هديتك الترحيبية!',
            'الكود: ' || v_key.code || ' ✦ المدة: ' || v_effective_days || ' يوم',
            'subscription_renewal', false, false);

    INSERT INTO activity_log (user_id, event_type, title, description, metadata)
    VALUES (p_user_id, 'activation', 'استلام هدية ترحيبية',
            'تم تفعيل كود هدية: ' || p_code || ' — ' || v_effective_days || ' يوم',
            json_build_object('code', v_key.code, 'duration_days', v_effective_days));

    INSERT INTO system_logs (user_id, level, action, message)
    VALUES (p_user_id, 'info', 'activate_gift',
            'تم تفعيل كود هدية: ' || p_code || ' — ' || v_effective_days || ' يوم');

    IF p_device_fp IS NOT NULL AND p_device_fp <> '' THEN
      INSERT INTO device_gift_activations (device_fp, user_id, username, license_key_id, code, code_type, activated_at)
      SELECT p_device_fp, p_user_id, COALESCE(pr.username, ''), v_key.id, v_key.code, 'gift', v_now
      FROM profiles pr WHERE pr.id = p_user_id
      ON CONFLICT DO NOTHING;
    END IF;

    RETURN json_build_object('success', true, 'isTrial', false, 'daysAfter', v_days_after);

  ELSE
    RETURN json_build_object('success', false, 'error', 'نوع كود غير معروف', 'errorCode', 'UNKNOWN_TYPE');
  END IF;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO system_logs (user_id, level, action, message)
  VALUES (p_user_id, 'error', 'activate_license_error',
          'خطأ غير متوقع: ' || SQLERRM || ' | كود: ' || p_code)
  ON CONFLICT DO NOTHING;
  RETURN json_build_object('success', false, 'error', 'خطأ داخلي في الخادم', 'errorCode', 'SERVER_ERROR');
END;
$$;
