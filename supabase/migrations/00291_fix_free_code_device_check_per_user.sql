
-- ═══════════════════════════════════════════════════════════════════════
-- MIGRATION 00291: إصلاح نهائي لنظام الأكواد المجانية
--
-- المشاكل المُصلَحة:
-- 1. فحص الجهاز كان يحظر نفس المستخدم على نفس حسابه
--    (SELECT EXISTS بدون user_id != p_user_id)
-- 2. أجهزة مختلفة بنفس المواصفات تعطي نفس hardware_hash
--    → يعتقد النظام أنها جهاز واحد → حظر خاطئ لمستخدمين جدد
--
-- القواعد الصحيحة للكود المجاني:
--   ✅ نفس المستخدم + نفس الجهاز     → مسموح (مستخدم واحد / حساب واحد)
--   ✅ مستخدم جديد + جهاز جديد       → مسموح
--   ❌ مستخدم مختلف + نفس device_fp  → مرفوض (الـ device_fp UUID فريد لكل تثبيت)
--   ❌ نفس الكود مرتين لنفس المستخدم → مرفوض (user already used THIS code)
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION activate_license_key(
  p_user_id        UUID,
  p_code           TEXT,
  p_device_fp      TEXT    DEFAULT NULL,
  p_hardware_hash  TEXT    DEFAULT NULL,
  p_native_id      TEXT    DEFAULT NULL,
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
  SELECT * INTO v_key FROM license_keys WHERE code = p_code AND status = 'active';
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM license_keys WHERE code = p_code AND status = 'used') THEN
      RETURN jsonb_build_object('success', false, 'error', 'هذا الكود مستخدم مسبقاً', 'errorCode', 'USED_CODE');
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'عفواً، كود التفعيل الذي أدخلته غير صحيح.', 'errorCode', 'INVALID_CODE');
  END IF;

  v_is_trial := (v_key.code_type = 'trial');
  v_is_free  := (v_key.code_type IN ('trial', 'gift'));

  -- ══════════════════════════════════════════════════════════════════════
  -- 2. انتهاء صلاحية الكود
  -- ══════════════════════════════════════════════════════════════════════
  IF v_key.expiry_date IS NOT NULL AND v_key.expiry_date < v_now THEN
    RETURN jsonb_build_object('success', false,
      'error', 'هذا الكود منتهي الصلاحية منذ ' || to_char(v_key.expiry_date, 'YYYY-MM-DD'),
      'errorCode', 'EXPIRED_CODE');
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- 3. حد المستخدمين
  -- ══════════════════════════════════════════════════════════════════════
  v_max_allowed := COALESCE(v_key.allowed_users, v_key.max_users);
  IF v_max_allowed IS NOT NULL AND v_key.used_count >= v_max_allowed THEN
    RETURN jsonb_build_object('success', false,
      'error', 'وصل الكود للحد الأقصى من المستخدمين', 'errorCode', 'MAX_USERS_REACHED');
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- 4. حماية الأكواد المجانية من الإساءة
  --
  -- القاعدة: نفس device_fp (UUID فريد لكل تثبيت) لا يمكنه تفعيل
  --          كود مجاني على حساب مختلف.
  --
  -- ✅ نفس المستخدم → دائماً مسموح (المستخدم يفعّل على حسابه الوحيد)
  -- ❌ حساب مختلف + نفس device_fp → مرفوض
  --
  -- لا نعتمد على hardware_hash وحده لأن أجهزة متشابهة المواصفات
  -- قد تعطي نفس الـ hash — نعتمد فقط على device_fp كمعرف رئيسي
  -- لأنه UUID فريد يُولَّد عند التثبيت.
  -- ══════════════════════════════════════════════════════════════════════
  IF v_is_free AND p_admin_override = FALSE THEN

    -- device_fp هو المعرف الرئيسي الموثوق
    IF p_device_fp IS NOT NULL THEN
      SELECT dga.user_id INTO v_device_used_by
      FROM device_gift_activations dga
      WHERE dga.device_fp = p_device_fp
        AND dga.user_id  != p_user_id   -- ← حساب مختلف فقط
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

    -- فحص إضافي: هل نفس المستخدم سبق وفعّل هذا الكود بالذات؟
    IF EXISTS (
      SELECT 1 FROM device_gift_activations
      WHERE user_id = p_user_id
        AND code    = p_code
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'لقد قمت بتفعيل هذا الكود المجاني مسبقاً على حسابك.',
        'errorCode', 'CODE_ALREADY_USED_BY_USER'
      );
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

    IF v_is_trial AND v_sub_is_active THEN
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
  --     نحفظ device_fp كمعرف رئيسي موثوق
  -- ══════════════════════════════════════════════════════════════════════
  IF v_is_free THEN
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
  -- 12. سجل الاشتراكات
  -- ══════════════════════════════════════════════════════════════════════
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
