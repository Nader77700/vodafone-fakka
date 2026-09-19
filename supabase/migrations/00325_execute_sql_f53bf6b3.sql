CREATE OR REPLACE FUNCTION public.activate_license_key(
  p_user_id uuid,
  p_code text,
  p_device_fp text DEFAULT NULL,
  p_hardware_hash text DEFAULT NULL,
  p_native_id text DEFAULT NULL,
  p_admin_override boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_key              license_keys%ROWTYPE;
  v_current_sub      subscriptions%ROWTYPE;
  v_now              timestamptz := now();
  v_effective_days   integer;
  v_is_trial         boolean;
  v_is_free          boolean;
  v_final_expires    timestamptz;
  v_max_allowed      integer;
  v_device_used_by   uuid;
  v_ops_limit        integer;
  v_sub_is_active    boolean := false;
  v_prev_username    text;
BEGIN
  -- ── تطبيع: نتجاهل القيم الفارغة أو الـ fallback المشتركة ──────────
  IF p_device_fp     = '' OR p_device_fp     = 'hw-fallback' THEN p_device_fp     := NULL; END IF;
  IF p_hardware_hash = '' OR p_hardware_hash = 'hw-fallback' THEN p_hardware_hash := NULL; END IF;
  IF p_native_id     = '' OR p_native_id     = 'hw-fallback' THEN p_native_id     := NULL; END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- 1. البحث عن الكود
  -- ══════════════════════════════════════════════════════════════════════
  IF p_admin_override THEN
    SELECT * INTO v_key FROM license_keys WHERE code = p_code;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'كود التفعيل غير موجود في النظام', 'errorCode', 'INVALID_CODE');
    END IF;
  ELSE
    SELECT * INTO v_key FROM license_keys WHERE code = p_code AND status = 'active';
    IF NOT FOUND THEN
      IF EXISTS (SELECT 1 FROM license_keys WHERE code = p_code AND status = 'used') THEN
        RETURN jsonb_build_object('success', false, 'error', 'هذا الكود مستخدم مسبقاً', 'errorCode', 'USED_CODE');
      END IF;
      RETURN jsonb_build_object('success', false, 'error', 'عفواً، كود التفعيل الذي أدخلته غير صحيح.', 'errorCode', 'INVALID_CODE');
    END IF;
  END IF;

  v_is_trial := (v_key.code_type = 'trial');
  v_is_free  := (v_key.code_type IN ('trial', 'gift'));

  -- ══════════════════════════════════════════════════════════════════════
  -- 2. انتهاء صلاحية الكود
  -- ══════════════════════════════════════════════════════════════════════
  IF NOT p_admin_override THEN
    IF v_key.expiry_date IS NOT NULL AND v_key.expiry_date < v_now THEN
      RETURN jsonb_build_object('success', false,
        'error', 'هذا الكود منتهي الصلاحية منذ ' || to_char(v_key.expiry_date, 'YYYY-MM-DD'),
        'errorCode', 'EXPIRED_CODE');
    END IF;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- 3. حد المستخدمين
  -- ══════════════════════════════════════════════════════════════════════
  IF NOT p_admin_override THEN
    v_max_allowed := COALESCE(v_key.allowed_users, v_key.max_users);
    IF v_max_allowed IS NOT NULL AND v_key.used_count >= v_max_allowed THEN
      RETURN jsonb_build_object('success', false,
        'error', 'وصل الكود للحد الأقصى من المستخدمين', 'errorCode', 'MAX_USERS_REACHED');
    END IF;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- 4. حماية الأكواد المجانية
  -- ══════════════════════════════════════════════════════════════════════
  IF v_is_free AND p_admin_override = FALSE THEN

    -- فحص device_fp
    IF p_device_fp IS NOT NULL THEN
      SELECT dga.user_id INTO v_device_used_by
      FROM device_gift_activations dga
      WHERE dga.device_fp = p_device_fp
        AND dga.user_id  != p_user_id
      LIMIT 1;

      IF FOUND AND v_device_used_by IS NOT NULL THEN
        SELECT username INTO v_prev_username FROM profiles WHERE id = v_device_used_by;
        RETURN jsonb_build_object(
          'success', false,
          'error', 'هذا الجهاز سبق استخدامه لتفعيل كود مجاني على حساب آخر' ||
                   COALESCE(' (' || '@' || v_prev_username || ')', '') ||
                   '. لا يمكن تفعيل كود مجاني على هذا الجهاز.',
          'errorCode', 'DEVICE_ALREADY_USED',
          'previous_account', COALESCE(v_prev_username, null)
        );
      END IF;
    END IF;

    -- ★ FIX v2: منع نفس المستخدم من تفعيل نفس الكود المجاني مرتين
    --   لكن فقط إذا كان الاشتراك لا يزال نشطاً أو منتهياً بشكل طبيعي
    --   (تجاهل سجلات replaced التي أنشأها bulk-gift تلقائياً بدون طلب المستخدم)
    IF EXISTS (
      SELECT 1 FROM device_gift_activations
      WHERE user_id = p_user_id
        AND code    = p_code
    ) THEN
      -- التحقق: هل الاشتراك الحالي للمستخدم هو نفسه الكود أو مختلف؟
      -- إذا اشتراكه الحالي هو نفس الكود → رفض (فعّله فعلاً)
      -- إذا اشتراكه الحالي مختلف (replaced بهدية مثلاً) → السماح بإعادة التفعيل
      IF EXISTS (
        SELECT 1 FROM subscriptions
        WHERE user_id   = p_user_id
          AND code_used = p_code
          AND status    = 'active'
      ) THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'لقد قمت بتفعيل هذا الكود المجاني مسبقاً على حسابك.',
          'errorCode', 'CODE_ALREADY_USED_BY_USER'
        );
      END IF;
      -- الكود مسجّل في device_gift_activations لكن الاشتراك الحالي مختلف
      -- (مثلاً: استُبدل بهدية من الأدمن) → نسمح بالتفعيل ونحذف السجل القديم
      DELETE FROM device_gift_activations
      WHERE user_id = p_user_id AND code = p_code;
    END IF;

    -- ★ FIX v2: فحص subscription_history كطبقة ثانية
    --   نرفض فقط إذا كان لديه سجل نشط أو منتهي (ليس replaced بهدية من الأدمن)
    --   replaced_by_new_subscription = استُبدل بهدية → نسمح بالتفعيل
    IF EXISTS (
      SELECT 1 FROM subscription_history
      WHERE user_id = p_user_id
        AND code    = p_code
        AND status NOT IN ('replaced')
        AND end_reason IS DISTINCT FROM 'replaced_by_new_subscription'
    ) THEN
      -- تحقق إضافي: هل الاشتراك الحالي يستخدم نفس الكود فعلاً؟
      IF EXISTS (
        SELECT 1 FROM subscriptions
        WHERE user_id   = p_user_id
          AND code_used = p_code
          AND status    = 'active'
      ) THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'لقد قمت بتفعيل هذا الكود المجاني مسبقاً.',
          'errorCode', 'CODE_ALREADY_USED_BY_USER'
        );
      END IF;
    END IF;

  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- 5. الاشتراك الحالي
  -- ══════════════════════════════════════════════════════════════════════
  SELECT * INTO v_current_sub
  FROM subscriptions WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 1;

  IF FOUND THEN
    v_sub_is_active := (
      v_current_sub.status = 'active'
      AND v_current_sub.expires_at IS NOT NULL
      AND v_current_sub.expires_at > v_now
    );
    -- إصلاح تلقائي لاشتراك منتهي الوقت لكن status لا يزال active
    IF v_current_sub.status = 'active' AND (
      v_current_sub.expires_at IS NULL OR v_current_sub.expires_at <= v_now
    ) THEN
      UPDATE subscriptions SET status = 'expired', updated_at = v_now WHERE id = v_current_sub.id;
      v_sub_is_active := false;
    END IF;

    IF v_is_trial AND v_sub_is_active AND NOT p_admin_override THEN
      RETURN jsonb_build_object('success', false,
        'error', 'لديك اشتراك نشط، لا يمكنك تفعيل كود تجريبي.',
        'errorCode', 'ACTIVE_SUB_EXISTS');
    END IF;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- 6. حساب المدة والحد
  -- ══════════════════════════════════════════════════════════════════════
  v_effective_days := COALESCE(v_key.custom_duration_days, v_key.duration_days, 30);
  v_final_expires  := v_now + (v_effective_days || ' days')::interval;
  v_ops_limit      := COALESCE(v_key.operations_per_user, v_key.max_ops_per_user);

  -- ══════════════════════════════════════════════════════════════════════
  -- 7. تحديث الكود
  -- ══════════════════════════════════════════════════════════════════════
  v_max_allowed := COALESCE(v_key.allowed_users, v_key.max_users);
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

  -- ══════════════════════════════════════════════════════════════════════
  -- 8. Upsert الاشتراك
  -- ══════════════════════════════════════════════════════════════════════
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
    license_key_id   = EXCLUDED.license_key_id,
    status           = 'active'::public.subscription_status,
    code_type        = EXCLUDED.code_type,
    code_used        = EXCLUDED.code_used,
    duration_days    = EXCLUDED.duration_days,
    days_remaining   = EXCLUDED.days_remaining,
    ops_limit        = EXCLUDED.ops_limit,
    ops_remaining    = EXCLUDED.ops_remaining,
    ops_count        = 0,
    expires_at       = EXCLUDED.expires_at,
    updated_at       = EXCLUDED.updated_at,
    in_grace_period  = false,
    grace_started_at = null,
    grace_ends_at    = null;

  -- ══════════════════════════════════════════════════════════════════════
  -- 9. trial_usage
  -- ══════════════════════════════════════════════════════════════════════
  IF v_is_trial THEN
    INSERT INTO trial_usage (user_id, license_key_id, key_id, ops_used, activated_at, expires_at)
    VALUES (p_user_id, v_key.id, v_key.id, 0, v_now, v_final_expires)
    ON CONFLICT (key_id, user_id) DO NOTHING;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- 10. ربط الجهاز (device_gift_activations)
  --     Admin Override: لا نسجّل في device_gift_activations
  -- ══════════════════════════════════════════════════════════════════════
  IF v_is_free AND NOT p_admin_override THEN
    INSERT INTO device_gift_activations (
      user_id, license_key_id, code, code_type,
      device_fp, hardware_hash, native_id, activated_at
    ) VALUES (
      p_user_id, v_key.id, v_key.code, v_key.code_type,
      p_device_fp, p_hardware_hash, p_native_id, v_now
    ) ON CONFLICT DO NOTHING;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- 11. الإشعارات والسجلات
  -- ══════════════════════════════════════════════════════════════════════
  IF v_sub_is_active THEN
    INSERT INTO notifications (user_id, title, body, type, is_read, is_global, created_at)
    VALUES (p_user_id, 'تم استبدال اشتراكك',
      'تم إلغاء اشتراكك السابق وتفعيل الاشتراك الجديد بنجاح. مدة اشتراكك الحالي هي ' || v_effective_days || ' يوم.',
      'system', false, false, v_now);
    INSERT INTO activity_log (user_id, event_type, title, description, created_at)
    VALUES (p_user_id, 'activate_license_key', 'تفعيل كود (استبدال)',
      'تم تفعيل كود ' || COALESCE(v_key.code_type, 'paid') || ' واستبدال اشتراك سابق', v_now);
  ELSE
    INSERT INTO notifications (user_id, title, body, type, is_read, is_global, created_at)
    VALUES (p_user_id, 'تم تفعيل الاشتراك',
      'تم تفعيل الكود بنجاح! مدة اشتراكك هي ' || v_effective_days || ' يوم.',
      'system', false, false, v_now);
    INSERT INTO activity_log (user_id, event_type, title, description, created_at)
    VALUES (p_user_id, 'activate_license_key', 'تفعيل كود',
      'تم تفعيل كود ' || COALESCE(v_key.code_type, 'paid'), v_now);
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- 12. سجل الاشتراكات — dedup قوي
  -- ══════════════════════════════════════════════════════════════════════
  IF NOT EXISTS (
    SELECT 1 FROM subscription_history
    WHERE user_id        = p_user_id
      AND code           = v_key.code
      AND license_key_id = v_key.id
      AND ABS(EXTRACT(EPOCH FROM (activated_at - v_now))) < 10
  ) THEN
    INSERT INTO subscription_history (
      user_id, license_key_id, code, code_type, duration_days,
      days_before, days_after, activated_at, expires_at, notes
    ) VALUES (
      p_user_id, v_key.id, v_key.code, COALESCE(v_key.code_type, 'paid'), v_effective_days,
      CASE WHEN v_sub_is_active AND v_current_sub.expires_at > v_now
           THEN EXTRACT(DAY FROM (v_current_sub.expires_at - v_now))::integer ELSE 0 END,
      v_effective_days, v_now, v_final_expires,
      CASE WHEN p_admin_override THEN 'تفعيل إجباري بواسطة الأدمن' ELSE v_key.notes END
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'isTrial', v_is_trial,
    'daysAfter', v_effective_days,
    'message', CASE
      WHEN p_admin_override AND v_sub_is_active
      THEN 'تم التفعيل الإجباري بنجاح — اشتراك جديد نشط لمدة ' || v_effective_days || ' يوم.'
      WHEN p_admin_override
      THEN 'تم التفعيل الإجباري بنجاح لمدة ' || v_effective_days || ' يوم.'
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