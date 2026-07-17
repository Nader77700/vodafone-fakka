DROP FUNCTION IF EXISTS public.atomic_consume_operation(uuid);

CREATE OR REPLACE FUNCTION atomic_consume_operation(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub         subscriptions%ROWTYPE;
  v_key         license_keys%ROWTYPE;
  v_ops_used    INTEGER;
  v_ops_limit   INTEGER;
  v_new_count   INTEGER;
  v_code_type   TEXT := 'admin';
  v_is_valid_req BOOLEAN;
BEGIN
  -- التحقق من التوقيع المشفر (HMAC) لحماية الطلبات من التلاعب
  v_is_valid_req := verify_request_signature();
  IF NOT v_is_valid_req THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_app_signature', 'code_type', 'none', 'is_trial', false);
  END IF;

  -- ── قفل سطر الاشتراك atomically ──
  SELECT * INTO v_sub
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'exhausted', false, 'ops_used', 0, 'ops_limit', 0, 'remaining', 0, 'code_type', 'none', 'is_trial', false);
  END IF;

  v_ops_limit := v_sub.ops_limit;
  v_ops_used  := COALESCE(v_sub.ops_count, 0);

  IF v_sub.license_key_id IS NOT NULL THEN
    SELECT * INTO v_key FROM license_keys WHERE id = v_sub.license_key_id;
    v_code_type := COALESCE(v_key.code_type, 'unknown');
  END IF;

  -- إزالة الاستثناء الخاص بـ Admin: الجميع يخضع لفحص الحد الأقصى للعمليات
  IF v_ops_limit IS NOT NULL AND v_ops_used >= v_ops_limit THEN
    RETURN jsonb_build_object(
      'allowed',   false, 'exhausted', true,
      'ops_used',  v_ops_used, 'ops_limit', v_ops_limit,
      'remaining', 0, 'code_type', v_code_type, 'is_trial', (v_code_type = 'trial')
    );
  END IF;

  v_new_count := v_ops_used + 1;
  UPDATE subscriptions SET ops_count = v_new_count WHERE id = v_sub.id;

  -- ── التوافقية: تحديث trial_usage إذا كان تجريبي ──
  IF v_code_type = 'trial' THEN
    UPDATE trial_usage SET ops_used = v_new_count WHERE key_id = v_sub.license_key_id AND user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'allowed',    true,
    'exhausted',  (v_ops_limit IS NOT NULL AND v_new_count >= v_ops_limit),
    'ops_used',   v_new_count,
    'ops_limit',  v_ops_limit,
    'remaining',  CASE WHEN v_ops_limit IS NOT NULL THEN v_ops_limit - v_new_count ELSE NULL END,
    'code_type',  v_code_type,
    'is_trial',   (v_code_type = 'trial')
  );
END;
$$;