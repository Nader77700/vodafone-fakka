-- إصلاح نهائي: استخدام الأعمدة الصحيحة لـ license_keys
-- الأعمدة المتاحة: operations_per_user, uses_per_user, max_ops_per_user, duration_days, custom_duration_days
CREATE OR REPLACE FUNCTION public.get_merchant_client_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile       profiles%ROWTYPE;
  v_merchant      merchants%ROWTYPE;
  v_member        merchant_members%ROWTYPE;
  v_sub_row       subscriptions%ROWTYPE;
  v_key           license_keys%ROWTYPE;
  v_days_rem      numeric := 0;
  v_hours_rem     numeric := 0;
  v_ops_success   bigint  := 0;
  v_ops_failed    bigint  := 0;
  v_sub_type      text    := 'unlimited';
  v_code_type     text    := null;
  v_ops_limit_val integer := null;
  v_ops_remaining integer := null;
  v_effective_ops integer := null;
  v_effective_dur integer := null;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND OR v_profile.merchant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_merchant_client');
  END IF;

  SELECT * INTO v_merchant FROM merchants WHERE id = v_profile.merchant_id;
  SELECT * INTO v_member  FROM merchant_members
    WHERE merchant_id = v_profile.merchant_id AND user_id = p_user_id;

  -- إصلاح: status::text لتجنب خطأ grace_period في enum
  SELECT * INTO v_sub_row FROM subscriptions WHERE user_id = p_user_id
  ORDER BY
    CASE status::text WHEN 'active' THEN 1 WHEN 'suspended' THEN 2 WHEN 'pending' THEN 3 ELSE 4 END,
    CASE WHEN in_grace_period = true THEN 0 ELSE 1 END,
    created_at DESC
  LIMIT 1;

  IF FOUND AND v_sub_row.id IS NOT NULL THEN
    IF v_sub_row.license_key_id IS NOT NULL THEN
      SELECT * INTO v_key FROM license_keys WHERE id = v_sub_row.license_key_id;
    END IF;

    IF v_sub_row.expires_at IS NOT NULL THEN
      v_days_rem  := GREATEST(0, EXTRACT(EPOCH FROM (v_sub_row.expires_at - now())) / 86400.0);
      v_hours_rem := GREATEST(0, EXTRACT(EPOCH FROM (v_sub_row.expires_at - now())) / 3600.0);
    END IF;

    -- العمليات من merchant_member_ops
    SELECT
      COALESCE(COUNT(*) FILTER (WHERE status::text = 'success'), 0),
      COALESCE(COUNT(*) FILTER (WHERE status::text = 'failed'),  0)
    INTO v_ops_success, v_ops_failed
    FROM merchant_member_ops WHERE user_id = p_user_id;

    -- fallback من operations العادية
    IF v_ops_success = 0 AND v_ops_failed = 0 THEN
      SELECT
        COALESCE(COUNT(*) FILTER (WHERE status::text = 'success'), 0),
        COALESCE(COUNT(*) FILTER (WHERE status::text = 'failed'),  0)
      INTO v_ops_success, v_ops_failed
      FROM operations WHERE user_id = p_user_id;
    END IF;

    -- sub_type من merchant_member_subscriptions
    SELECT mms.sub_type, mms.ops_limit,
           CASE WHEN mms.ops_limit IS NOT NULL
                THEN GREATEST(0, mms.ops_limit - COALESCE(mms.ops_used, 0))
                ELSE NULL END
    INTO v_sub_type, v_ops_limit_val, v_ops_remaining
    FROM merchant_member_subscriptions mms
    WHERE mms.user_id = p_user_id
    ORDER BY mms.created_at DESC
    LIMIT 1;

    -- fallback: تحديد sub_type من license_key بالأعمدة الصحيحة
    IF v_sub_type IS NULL THEN
      v_effective_ops := COALESCE(v_key.operations_per_user, v_key.uses_per_user, v_key.max_ops_per_user);
      v_effective_dur := COALESCE(v_key.custom_duration_days, v_key.duration_days);
      v_sub_type := CASE
        WHEN v_effective_ops IS NOT NULL AND v_effective_dur IS NOT NULL AND v_effective_dur > 0 THEN 'both_limited'
        WHEN v_effective_ops IS NOT NULL THEN 'ops_limited'
        WHEN v_effective_dur IS NOT NULL AND v_effective_dur > 0 THEN 'time_limited'
        ELSE 'unlimited'
      END;
    END IF;

    v_code_type     := v_key.code_type;
    v_ops_limit_val := COALESCE(v_ops_limit_val, v_sub_row.ops_limit);
    v_ops_remaining := COALESCE(v_ops_remaining,
                         CASE WHEN v_ops_limit_val IS NOT NULL
                              THEN GREATEST(0, v_ops_limit_val - COALESCE(v_sub_row.ops_count,0))
                              ELSE NULL END);

    RETURN jsonb_build_object(
      'merchant', jsonb_build_object(
        'id',          v_merchant.id,
        'name',        v_merchant.name,
        'brand_color', v_merchant.brand_color,
        'logo_url',    v_merchant.logo_url
      ),
      'member', jsonb_build_object(
        'id',       v_member.id,
        'status',   v_member.status,
        'joined_at',v_member.joined_at
      ),
      'subscription', jsonb_build_object(
        'id',              v_sub_row.id,
        'status',          v_sub_row.status,
        'activated_at',    v_sub_row.activated_at,
        'expires_at',      v_sub_row.expires_at,
        'ops_count',       v_sub_row.ops_count,
        'ops_limit',       v_ops_limit_val,
        'ops_remaining',   v_ops_remaining,
        'in_grace_period', v_sub_row.in_grace_period,
        'sub_type',        COALESCE(v_sub_type, 'unlimited'),
        'code_type',       v_code_type,
        'ops_success',     v_ops_success,
        'ops_failed',      v_ops_failed,
        'days_remaining',  v_days_rem,
        'hours_remaining', v_hours_rem
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'merchant', jsonb_build_object(
      'id',          v_merchant.id,
      'name',        v_merchant.name,
      'brand_color', v_merchant.brand_color,
      'logo_url',    v_merchant.logo_url
    ),
    'member', jsonb_build_object(
      'id',       v_member.id,
      'status',   v_member.status,
      'joined_at',v_member.joined_at
    ),
    'subscription', null
  );
END;
$$;