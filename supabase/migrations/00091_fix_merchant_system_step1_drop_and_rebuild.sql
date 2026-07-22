
-- ════════════════════════════════════════════════════════════
-- Step 1: DROP duplicate overloaded functions
-- ════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.activate_member_subscription(uuid, uuid, integer, integer, date, uuid);
DROP FUNCTION IF EXISTS public.renew_member_subscription(uuid, uuid, integer, integer, date, uuid);

-- DROP atomic_consume_operation لإعادة بنائه بـ return type جديد
DROP FUNCTION IF EXISTS public.atomic_consume_operation(uuid);

-- ════════════════════════════════════════════════════════════
-- Step 2: إعادة بناء atomic_consume_operation بدعم التجار
-- ════════════════════════════════════════════════════════════
CREATE FUNCTION public.atomic_consume_operation(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merchant_id uuid;
  v_member      merchant_members%ROWTYPE;
  v_msub        merchant_member_subscriptions%ROWTYPE;
  v_sub         subscriptions%ROWTYPE;
  v_key         license_keys%ROWTYPE;
  v_usage       trial_usage%ROWTYPE;
  v_ops_used    INTEGER;
  v_ops_limit   INTEGER;
  v_new_count   INTEGER;
  v_code_type   TEXT;
  v_is_trial    BOOLEAN;
BEGIN
  -- ── تحقق أولاً: هل المستخدم تابع لتاجر؟ ──
  SELECT merchant_id INTO v_merchant_id
  FROM profiles WHERE id = p_user_id;

  IF v_merchant_id IS NOT NULL THEN
    SELECT * INTO v_member
    FROM merchant_members
    WHERE merchant_id = v_merchant_id AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('allowed', false, 'exhausted', false,
        'ops_used', 0, 'ops_limit', 0, 'remaining', 0,
        'code_type', 'merchant', 'is_trial', false, 'error', 'member_not_found');
    END IF;

    IF v_member.status NOT IN ('active') THEN
      RETURN jsonb_build_object('allowed', false, 'exhausted', false,
        'ops_used', 0, 'ops_limit', 0, 'remaining', 0,
        'code_type', 'merchant', 'is_trial', false, 'error', 'member_' || v_member.status);
    END IF;

    SELECT * INTO v_msub
    FROM merchant_member_subscriptions
    WHERE member_id = v_member.id AND status = 'active'
    ORDER BY created_at DESC LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('allowed', false, 'exhausted', false,
        'ops_used', 0, 'ops_limit', 0, 'remaining', 0,
        'code_type', 'merchant', 'is_trial', false, 'error', 'no_active_subscription');
    END IF;

    IF v_msub.remaining_points IS NOT NULL AND v_msub.remaining_points <= 0 THEN
      RETURN jsonb_build_object('allowed', false, 'exhausted', true,
        'ops_used', v_msub.consumed_points, 'ops_limit', v_msub.assigned_points,
        'remaining', 0, 'code_type', 'merchant', 'is_trial', false, 'error', 'ops_exhausted');
    END IF;

    IF v_msub.end_date IS NOT NULL AND v_msub.end_date < CURRENT_DATE THEN
      UPDATE merchant_member_subscriptions SET status = 'expired', updated_at = NOW() WHERE id = v_msub.id;
      RETURN jsonb_build_object('allowed', false, 'exhausted', false,
        'ops_used', 0, 'ops_limit', 0, 'remaining', 0,
        'code_type', 'merchant', 'is_trial', false, 'error', 'subscription_expired');
    END IF;

    -- الخصم يتم في trigger (operations_merchant_post_process) — allowed فقط هنا
    RETURN jsonb_build_object('allowed', true, 'exhausted', false,
      'ops_used',  v_msub.consumed_points,
      'ops_limit', v_msub.assigned_points,
      'remaining', COALESCE(v_msub.remaining_points, 0),
      'code_type', 'merchant', 'is_trial', false);
  END IF;

  -- ── المستخدم العادي: منطق الاشتراك الأصلي ──
  SELECT * INTO v_sub
  FROM subscriptions WHERE user_id = p_user_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'exhausted', false,
      'ops_used', 0, 'ops_limit', 0, 'remaining', 0, 'code_type', 'none', 'is_trial', false);
  END IF;

  IF v_sub.license_key_id IS NULL THEN
    v_new_count := COALESCE(v_sub.ops_count, 0) + 1;
    UPDATE subscriptions SET ops_count = v_new_count WHERE id = v_sub.id;
    RETURN jsonb_build_object('allowed', true, 'exhausted', false,
      'ops_used', v_new_count, 'ops_limit', NULL,
      'remaining', NULL, 'code_type', 'admin', 'is_trial', false);
  END IF;

  SELECT * INTO v_key FROM license_keys WHERE id = v_sub.license_key_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'exhausted', true,
      'ops_used', 0, 'ops_limit', 0, 'remaining', 0, 'code_type', 'unknown', 'is_trial', false);
  END IF;

  v_code_type := v_key.code_type;
  v_is_trial  := (v_code_type = 'trial');
  v_ops_limit := COALESCE(v_key.operations_per_user, v_key.max_ops_per_user, NULL);
  IF v_ops_limit = 0 THEN v_ops_limit := NULL; END IF;

  IF v_is_trial THEN
    SELECT * INTO v_usage
    FROM trial_usage WHERE key_id = v_sub.license_key_id AND user_id = p_user_id
    FOR UPDATE;

    v_ops_used := COALESCE(v_usage.ops_used, 0);
    IF v_ops_limit IS NOT NULL AND v_ops_used >= v_ops_limit THEN
      RETURN jsonb_build_object('allowed', false, 'exhausted', true,
        'ops_used', v_ops_used, 'ops_limit', v_ops_limit,
        'remaining', 0, 'code_type', v_code_type, 'is_trial', true);
    END IF;

    v_new_count := v_ops_used + 1;
    IF FOUND THEN
      UPDATE trial_usage SET ops_used = v_new_count WHERE id = v_usage.id;
    ELSE
      INSERT INTO trial_usage (key_id, user_id, ops_used)
      VALUES (v_sub.license_key_id, p_user_id, v_new_count)
      ON CONFLICT (key_id, user_id) DO UPDATE SET ops_used = trial_usage.ops_used + 1;
    END IF;

    RETURN jsonb_build_object('allowed', true,
      'exhausted', (v_ops_limit IS NOT NULL AND v_new_count >= v_ops_limit),
      'ops_used', v_new_count, 'ops_limit', v_ops_limit,
      'remaining', CASE WHEN v_ops_limit IS NOT NULL THEN v_ops_limit - v_new_count ELSE NULL END,
      'code_type', v_code_type, 'is_trial', true);
  END IF;

  v_ops_used := COALESCE(v_sub.ops_count, 0);
  IF v_ops_limit IS NOT NULL AND v_ops_used >= v_ops_limit THEN
    RETURN jsonb_build_object('allowed', false, 'exhausted', true,
      'ops_used', v_ops_used, 'ops_limit', v_ops_limit,
      'remaining', 0, 'code_type', v_code_type, 'is_trial', false);
  END IF;

  v_new_count := v_ops_used + 1;
  UPDATE subscriptions SET ops_count = v_new_count WHERE id = v_sub.id;

  RETURN jsonb_build_object('allowed', true,
    'exhausted', (v_ops_limit IS NOT NULL AND v_new_count >= v_ops_limit),
    'ops_used', v_new_count, 'ops_limit', v_ops_limit,
    'remaining', CASE WHEN v_ops_limit IS NOT NULL THEN v_ops_limit - v_new_count ELSE NULL END,
    'code_type', v_code_type, 'is_trial', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.atomic_consume_operation(uuid) TO authenticated;
