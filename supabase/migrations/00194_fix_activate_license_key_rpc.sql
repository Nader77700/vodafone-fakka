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
  v_expires_at       timestamptz;
  v_final_expires    timestamptz;
  v_days_before      integer;
  v_days_after       integer;
  v_max_allowed      integer;
  v_is_multi_paid    boolean := false;
BEGIN
  -- 1. التأكد من أن الكود موجود
  SELECT * INTO v_key FROM license_keys WHERE code = p_code;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'عفواً، كود التفعيل الذي أدخلته غير صحيح.');
  END IF;

  -- 2. التحقق من حالة الكود
  IF v_key.status = 'disabled' THEN
    RETURN json_build_object('success', false, 'error', 'عفواً، هذا الكود معطل بواسطة الإدارة.');
  END IF;
  IF v_key.status = 'expired' THEN
    RETURN json_build_object('success', false, 'error', 'عفواً، هذا الكود منتهي الصلاحية.');
  END IF;
  IF v_key.expiry_date IS NOT NULL AND v_key.expiry_date < v_now THEN
    UPDATE license_keys SET status = 'expired' WHERE id = v_key.id;
    RETURN json_build_object('success', false, 'error', 'عفواً، انتهت فترة صلاحية استخدام هذا الكود.');
  END IF;

  v_is_multi_paid := (v_key.code_type = 'paid' OR v_key.code_type IS NULL) AND COALESCE(v_key.allowed_users, v_key.max_users, 1) > 1;
  IF NOT v_is_multi_paid AND (v_key.code_type = 'paid' OR v_key.code_type IS NULL) AND v_key.status = 'used' THEN
    RETURN json_build_object('success', false, 'error', 'عفواً، تم استخدام هذا الكود مسبقاً.');
  END IF;

  -- 3. منع استلام هدايا أو تجريبي أكثر من مرة (إلا لو كان أدمن)
  IF p_admin_override = FALSE AND v_key.code_type IN ('gift', 'trial') THEN
    -- لا تتجاوز الحدود
  END IF;

  -- 4. إعداد الاشتراك القديم
  SELECT * INTO v_current_sub FROM subscriptions WHERE user_id = p_user_id AND status = 'active' LIMIT 1;
  
  -- حساب الأيام والمواعيد
  IF v_current_sub.id IS NOT NULL AND v_current_sub.expires_at > v_now THEN
    v_expires_at := v_current_sub.expires_at;
  ELSE
    v_expires_at := v_now;
  END IF;

  v_effective_days := COALESCE(v_key.custom_duration_days, v_key.duration_days, 1);
  v_final_expires := v_expires_at + (v_effective_days || ' days')::interval;

  IF v_key.expiration_mode = 'BY_DATE' AND v_key.expiry_date IS NOT NULL THEN
    v_final_expires := v_key.expiry_date;
  ELSIF v_key.expiration_mode = 'EARLIEST' AND v_key.expiry_date IS NOT NULL THEN
    IF v_expires_at < v_key.expiry_date THEN v_final_expires := v_expires_at; ELSE v_final_expires := v_key.expiry_date; END IF;
  END IF;

  v_days_before := CASE WHEN v_expires_at > v_now THEN EXTRACT(DAY FROM (v_expires_at - v_now)) ELSE 0 END;
  v_days_after  := EXTRACT(DAY FROM (v_final_expires - v_now));

  -- 5. تحديث الأكواد والاشتراكات
  IF v_key.code_type = 'paid' OR v_key.code_type IS NULL THEN
    
      v_max_allowed := COALESCE(v_key.allowed_users, v_key.max_users, 1);
      IF v_key.used_count >= v_max_allowed THEN
        RETURN json_build_object('success', false, 'error', 'هذا الكود تجاوز الحد الأقصى للمستخدمين.');
      END IF;
      UPDATE license_keys SET used_count = used_count + 1 WHERE id = v_key.id;
      IF v_key.used_count + 1 >= v_max_allowed THEN
        UPDATE license_keys SET status = 'used' WHERE id = v_key.id;
      END IF;

  ELSIF v_key.code_type = 'trial' THEN
    v_max_allowed := COALESCE(v_key.allowed_users, v_key.max_users, NULL);
    IF v_max_allowed IS NOT NULL AND v_key.used_count >= v_max_allowed THEN
      RETURN json_build_object('success', false, 'error', 'تم تجاوز الحد الأقصى لاستخدام الكود التجريبي.');
    END IF;
    IF EXISTS (SELECT 1 FROM trial_usage WHERE user_id = p_user_id AND license_key_id = v_key.id) THEN
       RETURN json_build_object('success', false, 'error', 'لقد استخدمت هذا الكود التجريبي مسبقاً.');
    END IF;
    UPDATE license_keys SET used_count = used_count + 1 WHERE id = v_key.id;
    INSERT INTO trial_usage (user_id, license_key_id, key_id, ops_used, trial_started_at, trial_expires_at)
    VALUES (p_user_id, v_key.id, v_key.id, 0, v_now, v_final_expires) ON CONFLICT DO NOTHING;

  ELSIF v_key.code_type = 'gift' THEN
    v_max_allowed := COALESCE(v_key.allowed_users, v_key.max_users, NULL);
    IF v_max_allowed IS NOT NULL AND v_key.used_count >= v_max_allowed THEN
       RETURN json_build_object('success', false, 'error', 'عفواً، انتهت كمية هذه الهدية.');
    END IF;
    IF EXISTS (SELECT 1 FROM gift_claims WHERE user_id = p_user_id AND license_key_id = v_key.id) THEN
       RETURN json_build_object('success', false, 'error', 'لقد قمت باستلام هذه الهدية مسبقاً.');
    END IF;
    UPDATE license_keys SET used_count = used_count + 1 WHERE id = v_key.id;
    INSERT INTO gift_claims (user_id, license_key_id, code, status) 
    VALUES (p_user_id, v_key.id, v_key.code, 'claimed') ON CONFLICT DO NOTHING;
  END IF;

  IF v_current_sub.id IS NOT NULL THEN
    UPDATE subscriptions
    SET
      expires_at = v_final_expires,
      duration_days = COALESCE(duration_days, 0) + v_effective_days,
      license_key_id = v_key.id,
      code_used = v_key.code,
      code_type = COALESCE(v_key.code_type, 'paid'),
      status = 'active',
      updated_at = v_now,
      in_grace_period = false,
      ops_limit = COALESCE(v_key.operations_per_user, v_key.max_ops_per_user, v_key.uses_per_user, v_current_sub.ops_limit),
      ops_count = CASE WHEN v_key.code_type IN ('trial', 'gift') THEN 0 ELSE v_current_sub.ops_count END,
      grace_started_at = null,
      grace_ends_at = null
    WHERE id = v_current_sub.id;
  ELSE
    INSERT INTO subscriptions (
      user_id, status, license_key_id, code_used,
      code_type, ops_limit, ops_used, duration_days,
      expires_at, created_at, updated_at
    ) VALUES (
      p_user_id, 'active', v_key.id, v_key.code,
      COALESCE(v_key.code_type, 'paid'),
      COALESCE(v_key.operations_per_user, v_key.max_ops_per_user, v_key.uses_per_user), 0, v_days_after,
      v_final_expires, v_now, v_now
    );
  END IF;

  RETURN json_build_object('success', true, 'isTrial', v_key.code_type = 'trial', 'daysAfter', v_days_after);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', 'حدث خطأ أثناء التفعيل: ' || SQLERRM);
END;
$function$