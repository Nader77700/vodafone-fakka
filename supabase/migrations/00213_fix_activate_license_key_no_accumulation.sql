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
  v_final_expires    timestamptz;
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
  SELECT * INTO v_current_sub FROM subscriptions WHERE user_id = p_user_id LIMIT 1;
  IF FOUND AND v_current_sub.status = 'active' THEN
    -- لا نسمح بتفعيل تجريبي إذا كان لديه اشتراك فعال بالفعل
    IF v_is_trial THEN
      RETURN jsonb_build_object('success', false, 'error', 'لديك اشتراك فعال، لا يمكنك تفعيل كود تجريبي.', 'errorCode', 'ACTIVE_SUB_EXISTS');
    END IF;
  END IF;

  -- 4. تحديد الأيام الفعالة وإلغاء تراكم الأيام (الاستبدال الكامل)
  v_effective_days := COALESCE(v_key.custom_duration_days, v_key.duration_days, 30);
  
  -- الاشتراك الجديد يبدأ من الآن دائماً (يتم تجاهل الاشتراك السابق بالكامل)
  v_final_expires := v_now + (v_effective_days || ' days')::interval;

  -- 5. تحديث الكود ليعتبر مستخدماً
  UPDATE license_keys
  SET
    status = CASE WHEN v_is_trial THEN 'active'::public.license_key_status ELSE 'used'::public.license_key_status END,
    used_by = p_user_id,
    used_at = v_now,
    updated_at = v_now,
    used_count = used_count + 1
  WHERE id = v_key.id;

  -- 6. إضافة / تحديث الاشتراك باستخدام ON CONFLICT (استبدال تام للقيم دون إضافة للقديم)
  INSERT INTO subscriptions (
    user_id, license_key_id, status, code_type, code_used, duration_days, days_remaining,
    ops_limit, ops_remaining, ops_count, expires_at, created_at, updated_at,
    in_grace_period, grace_started_at, grace_ends_at
  ) VALUES (
    p_user_id, v_key.id, 'active'::public.subscription_status, COALESCE(v_key.code_type, 'paid'), v_key.code, v_effective_days, v_effective_days,
    v_key.max_ops_per_user, v_key.max_ops_per_user, 0, v_final_expires, v_now, v_now,
    false, null, null
  )
  ON CONFLICT (user_id) DO UPDATE SET
    license_key_id = EXCLUDED.license_key_id,
    status = 'active'::public.subscription_status,
    code_type = EXCLUDED.code_type,
    code_used = EXCLUDED.code_used,
    duration_days = EXCLUDED.duration_days,     -- لا يوجد تراكم
    days_remaining = EXCLUDED.days_remaining,   -- لا يوجد تراكم
    ops_limit = EXCLUDED.ops_limit,             -- لا يوجد تراكم
    ops_remaining = EXCLUDED.ops_remaining,     -- لا يوجد تراكم
    ops_count = 0,                              -- تصفير عداد العمليات للاشتراك الجديد
    expires_at = EXCLUDED.expires_at,
    updated_at = EXCLUDED.updated_at,
    in_grace_period = false,
    grace_started_at = null,
    grace_ends_at = null;

  -- 7. إذا كان تجريبي، إضافة سجل trial_usage
  IF v_is_trial THEN
    INSERT INTO trial_usage (user_id, license_key_id, key_id, ops_used, trial_started_at, trial_expires_at)
    VALUES (p_user_id, v_key.id, v_key.id, 0, v_now, v_final_expires)
    ON CONFLICT (key_id, user_id) DO NOTHING;
  END IF;

  -- 8. ربط الجهاز
  IF p_device_fp IS NOT NULL THEN
    INSERT INTO device_gift_activations (user_id, license_key_id, device_fp, hardware_hash, native_id, activated_at)
    VALUES (p_user_id, v_key.id, p_device_fp, p_hardware_hash, p_native_id, v_now)
    ON CONFLICT DO NOTHING;
  END IF;

  -- 9. إرسال إشعار وتسجيل الحركة إذا تم استبدال اشتراك شغال
  IF FOUND AND v_current_sub.status = 'active' AND v_current_sub.expires_at > v_now THEN
    -- إشعار المستخدم بالاستبدال
    INSERT INTO notifications (user_id, title, body, type, is_read, is_global, created_at)
    VALUES (p_user_id, 'تم استبدال اشتراكك', 'تم إلغاء اشتراكك السابق وتفعيل الاشتراك الجديد بنجاح. مدة اشتراكك الحالي هي ' || v_effective_days || ' يوم.', 'system', false, false, v_now);
    
    INSERT INTO activity_log (user_id, event_type, title, description, created_at)
    VALUES (p_user_id, 'activate_license_key', 'تفعيل كود (استبدال)', 'تم تفعيل كود ' || COALESCE(v_key.code_type, 'paid') || ' واستبدال اشتراك سابق', v_now);
  ELSE
    -- تفعيل عادي
    INSERT INTO notifications (user_id, title, body, type, is_read, is_global, created_at)
    VALUES (p_user_id, 'تم تفعيل الاشتراك', 'تم تفعيل الكود بنجاح! مدة اشتراكك هي ' || v_effective_days || ' يوم.', 'system', false, false, v_now);

    INSERT INTO activity_log (user_id, event_type, title, description, created_at)
    VALUES (p_user_id, 'activate_license_key', 'تفعيل كود', 'تم تفعيل كود ' || COALESCE(v_key.code_type, 'paid'), v_now);
  END IF;

  -- 10. حفظ التاريخ
  INSERT INTO subscription_history (user_id, license_key_id, code, code_type, duration_days,
                                    days_before, days_after, activated_at, expires_at, notes)
  VALUES (p_user_id, v_key.id, v_key.code, COALESCE(v_key.code_type, 'paid'), v_effective_days,
          CASE WHEN v_current_sub.expires_at > v_now THEN EXTRACT(DAY FROM (v_current_sub.expires_at - v_now)) ELSE 0 END,
          v_effective_days, v_now, v_final_expires, v_key.notes);

  RETURN jsonb_build_object(
    'success', true, 
    'isTrial', v_is_trial, 
    'daysAfter', v_effective_days,
    'message', CASE WHEN v_current_sub.status = 'active' AND v_current_sub.expires_at > v_now 
                    THEN 'تم استبدال اشتراكك السابق بالاشتراك الجديد وتفعيله بنجاح.' 
                    ELSE 'تم تفعيل الاشتراك بنجاح.' END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'حدث خطأ أثناء التفعيل: ' || SQLERRM, 'detail', SQLSTATE);
END;
$function$;
