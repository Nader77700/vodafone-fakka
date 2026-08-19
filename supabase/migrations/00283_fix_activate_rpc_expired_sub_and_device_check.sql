
-- ═══════════════════════════════════════════════════════════════
-- إصلاح activate_license_key:
-- 1) الاشتراك المنتهي (expires_at ≤ now أو status=expired) لا يمنع التفعيل
-- 2) فحص الجهاز (device_gift_activations) يتحقق أن جهازاً آخر بحساب مختلف استخدم الكود المجاني
--    — نفس الحساب (user_id) يظل مسموحاً له بأكواد مجانية إضافية
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION activate_license_key(
  p_user_id       UUID,
  p_code          TEXT,
  p_device_fp     TEXT    DEFAULT NULL,
  p_hardware_hash TEXT    DEFAULT NULL,
  p_native_id     TEXT    DEFAULT NULL,
  p_admin_override BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key              license_keys%ROWTYPE;
  v_current_sub      subscriptions%ROWTYPE;
  v_now              timestamptz := now();
  v_effective_days   integer;
  v_is_trial         boolean;
  v_is_free          boolean;
  v_final_expires    timestamptz;
  v_max_allowed      integer;
  v_device_used_by   uuid;   -- user_id الذي سبق استخدام هذا الجهاز له
  v_device_used      boolean := false;
  v_ops_limit        integer;
  v_sub_is_active    boolean := false;  -- هل الاشتراك الحالي نشط فعلياً
BEGIN
  -- ═══════════════════════════════════════════════════════════
  -- 1. البحث عن الكود
  -- ═══════════════════════════════════════════════════════════
  SELECT * INTO v_key FROM license_keys WHERE code = p_code AND status = 'active';
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM license_keys WHERE code = p_code AND status = 'used') THEN
      RETURN jsonb_build_object('success', false, 'error', 'هذا الكود مستخدم مسبقاً', 'errorCode', 'USED_CODE');
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'عفواً، كود التفعيل الذي أدخلته غير صحيح.', 'errorCode', 'INVALID_CODE');
  END IF;

  v_is_trial := (v_key.code_type = 'trial');
  v_is_free  := (v_key.code_type IN ('trial', 'gift'));

  -- ═══════════════════════════════════════════════════════════
  -- 2. فحص صلاحية الكود (expiry_date)
  -- ═══════════════════════════════════════════════════════════
  IF v_key.expiry_date IS NOT NULL AND v_key.expiry_date < v_now THEN
    RETURN jsonb_build_object('success', false, 'error',
      'هذا الكود منتهي الصلاحية منذ ' || to_char(v_key.expiry_date, 'YYYY-MM-DD'),
      'errorCode', 'EXPIRED_CODE');
  END IF;

  -- ═══════════════════════════════════════════════════════════
  -- 3. فحص حد المستخدمين
  -- ═══════════════════════════════════════════════════════════
  v_max_allowed := COALESCE(v_key.allowed_users, v_key.max_users);
  IF v_max_allowed IS NOT NULL AND v_key.used_count >= v_max_allowed THEN
    RETURN jsonb_build_object('success', false, 'error',
      'وصل الكود للحد الأقصى من المستخدمين', 'errorCode', 'MAX_USERS_REACHED');
  END IF;

  -- ═══════════════════════════════════════════════════════════
  -- 4. حماية الجهاز للأكواد المجانية (عبر حسابات مختلفة فقط)
  --    المنطق الصحيح:
  --    - إذا نفس الجهاز + نفس المستخدم → مسموح (حساب واحد يمكنه أكواد مجانية متعددة)
  --    - إذا نفس الجهاز + مستخدم مختلف  → مرفوض (حماية ضد الإساءة)
  -- ═══════════════════════════════════════════════════════════
  IF v_is_free AND p_admin_override = FALSE THEN
    IF p_device_fp IS NULL AND p_hardware_hash IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error',
        'يجب تحديث التطبيق لتفعيل الأكواد المجانية.', 'errorCode', 'DEVICE_INFO_REQUIRED');
    END IF;

    -- البحث عن أي حساب آخر استخدم هذا الجهاز لكود مجاني/هدية
    SELECT dga.user_id INTO v_device_used_by
    FROM device_gift_activations dga
    WHERE dga.user_id != p_user_id   -- حساب مختلف فقط
      AND (
        (dga.device_fp = p_device_fp AND p_device_fp IS NOT NULL)
        OR (dga.hardware_hash = p_hardware_hash AND p_hardware_hash IS NOT NULL)
        OR (dga.native_id = p_native_id AND p_native_id IS NOT NULL AND p_native_id != '')
      )
    LIMIT 1;

    IF FOUND AND v_device_used_by IS NOT NULL THEN
      -- اجلب اسم المستخدم السابق لإظهاره في الرسالة (مع الحفاظ على الخصوصية)
      DECLARE
        v_prev_username text;
      BEGIN
        SELECT username INTO v_prev_username FROM profiles WHERE id = v_device_used_by;
        RETURN jsonb_build_object(
          'success', false,
          'error', 'هذا الجهاز سبق استخدامه لتفعيل كود مجاني/هدية على حساب آخر (' ||
                   COALESCE('@' || v_prev_username, 'حساب آخر') || '). لا يمكن تفعيل كود مجاني على هذا الجهاز.',
          'errorCode', 'DEVICE_ALREADY_USED',
          'previous_account', COALESCE(v_prev_username, null)
        );
      END;
    END IF;
  END IF;

  -- ═══════════════════════════════════════════════════════════
  -- 5. فحص الاشتراك الحالي
  --    الاشتراك يُعتبر نشطاً فعلياً فقط إذا:
  --      status = 'active' AND expires_at > now()
  --    الاشتراك المنتهي (expires_at ≤ now أو status=expired) = NOT ACTIVE
  -- ═══════════════════════════════════════════════════════════
  SELECT * INTO v_current_sub FROM subscriptions WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 1;

  IF FOUND THEN
    -- الاشتراك نشط فعلياً فقط إذا: status=active AND expires_at > الآن
    v_sub_is_active := (
      v_current_sub.status = 'active'
      AND v_current_sub.expires_at IS NOT NULL
      AND v_current_sub.expires_at > v_now
    );

    -- إذا الاشتراك كان نشطاً في DB لكن وقته انتهى → نصلحه تلقائياً
    IF v_current_sub.status = 'active' AND (
      v_current_sub.expires_at IS NULL OR v_current_sub.expires_at <= v_now
    ) THEN
      UPDATE subscriptions SET status = 'expired', updated_at = v_now WHERE id = v_current_sub.id;
      v_sub_is_active := false;
    END IF;

    -- الكود التجريبي محظور فقط على من لديه اشتراك نشط فعلاً
    IF v_is_trial AND v_sub_is_active THEN
      RETURN jsonb_build_object('success', false,
        'error', 'لديك اشتراك نشط، لا يمكنك تفعيل كود تجريبي.',
        'errorCode', 'ACTIVE_SUB_EXISTS');
    END IF;
  END IF;

  -- ═══════════════════════════════════════════════════════════
  -- 6. حساب المدة والحد
  -- ═══════════════════════════════════════════════════════════
  v_effective_days := COALESCE(v_key.custom_duration_days, v_key.duration_days, 30);
  v_final_expires  := v_now + (v_effective_days || ' days')::interval;
  v_ops_limit      := COALESCE(v_key.operations_per_user, v_key.max_ops_per_user);

  -- ═══════════════════════════════════════════════════════════
  -- 7. تحديث حالة الكود
  -- ═══════════════════════════════════════════════════════════
  UPDATE license_keys
  SET
    status    = CASE
                  WHEN v_is_free AND (v_max_allowed IS NULL OR used_count + 1 < v_max_allowed)
                  THEN 'active'::public.license_key_status
                  ELSE 'used'::public.license_key_status
                END,
    used_by   = p_user_id,
    used_at   = v_now,
    updated_at= v_now,
    used_count= used_count + 1
  WHERE id = v_key.id;

  -- ═══════════════════════════════════════════════════════════
  -- 8. Upsert الاشتراك (استبدل القديم)
  -- ═══════════════════════════════════════════════════════════
  INSERT INTO subscriptions (
    user_id, license_key_id, status, code_type, code_used,
    duration_days, days_remaining,
    ops_limit, ops_remaining, ops_count,
    expires_at, created_at, updated_at,
    in_grace_period, grace_started_at, grace_ends_at
  ) VALUES (
    p_user_id, v_key.id, 'active'::public.subscription_status,
    COALESCE(v_key.code_type, 'paid'), v_key.code,
    v_effective_days, v_effective_days,
    v_ops_limit, v_ops_limit, 0,
    v_final_expires, v_now, v_now,
    false, null, null
  )
  ON CONFLICT (user_id) DO UPDATE SET
    license_key_id  = EXCLUDED.license_key_id,
    status          = 'active'::public.subscription_status,
    code_type       = EXCLUDED.code_type,
    code_used       = EXCLUDED.code_used,
    duration_days   = EXCLUDED.duration_days,
    days_remaining  = EXCLUDED.days_remaining,
    ops_limit       = EXCLUDED.ops_limit,
    ops_remaining   = EXCLUDED.ops_remaining,
    ops_count       = 0,
    expires_at      = EXCLUDED.expires_at,
    updated_at      = EXCLUDED.updated_at,
    in_grace_period = false,
    grace_started_at= null,
    grace_ends_at   = null;

  -- ═══════════════════════════════════════════════════════════
  -- 9. سجل trial_usage إذا كان تجريبياً
  -- ═══════════════════════════════════════════════════════════
  IF v_is_trial THEN
    INSERT INTO trial_usage (user_id, license_key_id, key_id, ops_used, activated_at, expires_at)
    VALUES (p_user_id, v_key.id, v_key.id, 0, v_now, v_final_expires)
    ON CONFLICT (key_id, user_id) DO NOTHING;
  END IF;

  -- ═══════════════════════════════════════════════════════════
  -- 10. تسجيل الجهاز للأكواد المجانية (ربط المستخدم الحالي بالجهاز)
  -- ═══════════════════════════════════════════════════════════
  IF v_is_free AND (p_device_fp IS NOT NULL OR p_hardware_hash IS NOT NULL) THEN
    INSERT INTO device_gift_activations (
      user_id, license_key_id, code, code_type,
      device_fp, hardware_hash, native_id, activated_at
    ) VALUES (
      p_user_id, v_key.id, v_key.code, v_key.code_type,
      p_device_fp, p_hardware_hash, p_native_id, v_now
    ) ON CONFLICT DO NOTHING;
  END IF;

  -- ═══════════════════════════════════════════════════════════
  -- 11. الإشعارات والسجلات
  -- ═══════════════════════════════════════════════════════════
  IF v_sub_is_active THEN
    -- كان هناك اشتراك نشط قبل → استبدال
    INSERT INTO notifications (user_id, title, body, type, is_read, is_global, created_at)
    VALUES (p_user_id,
      'تم استبدال اشتراكك',
      'تم إلغاء اشتراكك السابق وتفعيل الاشتراك الجديد بنجاح. مدة اشتراكك الحالي هي ' || v_effective_days || ' يوم.',
      'system', false, false, v_now);
    INSERT INTO activity_log (user_id, event_type, title, description, created_at)
    VALUES (p_user_id, 'activate_license_key', 'تفعيل كود (استبدال)',
      'تم تفعيل كود ' || COALESCE(v_key.code_type, 'paid') || ' واستبدال اشتراك سابق', v_now);
  ELSE
    -- لا اشتراك سابق أو كان منتهياً → تفعيل جديد
    INSERT INTO notifications (user_id, title, body, type, is_read, is_global, created_at)
    VALUES (p_user_id,
      'تم تفعيل الاشتراك',
      'تم تفعيل الكود بنجاح! مدة اشتراكك هي ' || v_effective_days || ' يوم.',
      'system', false, false, v_now);
    INSERT INTO activity_log (user_id, event_type, title, description, created_at)
    VALUES (p_user_id, 'activate_license_key', 'تفعيل كود',
      'تم تفعيل كود ' || COALESCE(v_key.code_type, 'paid'), v_now);
  END IF;

  -- ═══════════════════════════════════════════════════════════
  -- 12. سجل الاشتراكات (subscription_history)
  -- ═══════════════════════════════════════════════════════════
  INSERT INTO subscription_history (
    user_id, license_key_id, code, code_type, duration_days,
    days_before, days_after, activated_at, expires_at, notes
  ) VALUES (
    p_user_id, v_key.id, v_key.code, COALESCE(v_key.code_type, 'paid'), v_effective_days,
    CASE WHEN v_sub_is_active AND v_current_sub.expires_at > v_now
         THEN EXTRACT(DAY FROM (v_current_sub.expires_at - v_now))::integer ELSE 0 END,
    v_effective_days, v_now, v_final_expires, v_key.notes
  );

  RETURN jsonb_build_object(
    'success', true,
    'isTrial', v_is_trial,
    'daysAfter', v_effective_days,
    'message', CASE
      WHEN v_sub_is_active
      THEN 'تم استبدال اشتراكك السابق بالاشتراك الجديد وتفعيله بنجاح.'
      ELSE 'تم تفعيل الاشتراك بنجاح.'
    END
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false,
    'error', 'حدث خطأ أثناء التفعيل: ' || SQLERRM, 'detail', SQLSTATE);
END;
$$;
