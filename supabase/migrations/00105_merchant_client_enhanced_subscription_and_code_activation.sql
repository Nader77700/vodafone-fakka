
-- ════════════════════════════════════════════════════════
-- 00105: تحسين واجهة عميل التاجر
-- 1. تحديث get_merchant_client_data لإرجاع تفاصيل أوفر
-- 2. إضافة license_key_id لـ merchant_member_subscriptions
-- 3. RPC: preview_license_code_for_member
-- 4. RPC: activate_license_code_for_member
-- 5. إضافة جدول merchant_member_charge_ops لسجل عمليات عضو التاجر
-- ════════════════════════════════════════════════════════

-- ── 1. إضافة license_key_id لـ merchant_member_subscriptions ─────────────────
ALTER TABLE merchant_member_subscriptions
  ADD COLUMN IF NOT EXISTS license_key_id  uuid REFERENCES license_keys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ops_limit       integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ops_used        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expires_at      timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sub_type        text NOT NULL DEFAULT 'points'
    CHECK (sub_type IN ('points','unlimited','ops_limited','time_limited'));

-- ── 2. جدول سجل عمليات عضو التاجر (منفصل عن main operations) ─────────────────
CREATE TABLE IF NOT EXISTS merchant_member_ops (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  member_id     uuid NOT NULL REFERENCES merchant_members(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  phone_number  text NOT NULL,
  card_type     text,
  amount        numeric(10,2),
  status        text NOT NULL DEFAULT 'success' CHECK (status IN ('success','failed','refunded')),
  fail_reason   text,
  source        text NOT NULL DEFAULT 'vodafone_cash',
  operation_ref uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mmo_member   ON merchant_member_ops(member_id);
CREATE INDEX IF NOT EXISTS idx_mmo_user     ON merchant_member_ops(user_id);
CREATE INDEX IF NOT EXISTS idx_mmo_merchant ON merchant_member_ops(merchant_id);
CREATE INDEX IF NOT EXISTS idx_mmo_created  ON merchant_member_ops(created_at DESC);
ALTER TABLE merchant_member_ops ENABLE ROW LEVEL SECURITY;
CREATE POLICY mmo_admin_all     ON merchant_member_ops FOR ALL    USING (is_admin_user());
CREATE POLICY mmo_merchant_read ON merchant_member_ops FOR SELECT USING (caller_owns_merchant(merchant_id));
CREATE POLICY mmo_user_read     ON merchant_member_ops FOR SELECT USING (user_id = auth.uid());

-- ── 3. RPC: preview_license_code_for_member ──────────────────────────────────
-- يُستخدم من التاجر لرؤية تفاصيل الكود قبل تفعيله للمستخدم
CREATE OR REPLACE FUNCTION preview_license_code_for_member(p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_key license_keys%ROWTYPE;
  v_remaining integer;
  v_type text;
BEGIN
  SELECT * INTO v_key FROM license_keys WHERE code = p_code;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الكود غير موجود');
  END IF;
  IF v_key.status = 'disabled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'هذا الكود معطّل');
  END IF;
  IF v_key.status = 'expired' THEN
    RETURN jsonb_build_object('success', false, 'error', 'هذا الكود منتهي الصلاحية');
  END IF;
  IF v_key.expiry_date IS NOT NULL AND v_key.expiry_date < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'انتهت صلاحية هذا الكود');
  END IF;

  -- تحديد نوع الكود
  v_type := COALESCE(v_key.code_type, 'paid');

  -- حساب الاستخدامات المتبقية
  v_remaining := CASE
    WHEN v_key.allowed_users IS NOT NULL THEN v_key.allowed_users - COALESCE(v_key.used_count, 0)
    WHEN v_key.max_users IS NOT NULL     THEN v_key.max_users - COALESCE(v_key.used_count, 0)
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'success',          true,
    'code',             v_key.code,
    'code_type',        v_type,
    'status',           v_key.status,
    'duration_days',    COALESCE(v_key.custom_duration_days, v_key.duration_days),
    'expiry_date',      v_key.expiry_date,
    'expiration_mode',  v_key.expiration_mode,
    'ops_per_user',     COALESCE(v_key.operations_per_user, v_key.max_ops_per_user),
    'allowed_users',    COALESCE(v_key.allowed_users, v_key.max_users),
    'used_count',       COALESCE(v_key.used_count, 0),
    'remaining_uses',   v_remaining,
    'is_multi_use',     (COALESCE(v_key.allowed_users, v_key.max_users, 1) > 1)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION preview_license_code_for_member(text) TO authenticated;

-- ── 4. RPC: activate_license_code_for_member ─────────────────────────────────
-- التاجر يفعّل كوداً لمستخدم معين
CREATE OR REPLACE FUNCTION activate_license_code_for_member(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_code        text,
  p_actor_id    uuid DEFAULT NULL  -- مستخدم التاجر الذي نفّذ العملية
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_merchant  merchants%ROWTYPE;
  v_profile   profiles%ROWTYPE;
  v_member_id uuid;
  v_key       license_keys%ROWTYPE;
  v_actor_id  uuid;
  v_result    jsonb;
BEGIN
  v_actor_id := COALESCE(p_actor_id, auth.uid());

  -- تحقق من أن المنفذ هو تاجر لهذا المتجر أو أدمن
  IF NOT (
    is_admin_user() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = v_actor_id AND merchant_id = p_merchant_id AND role = 'merchant')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح لك بهذه العملية');
  END IF;

  -- تحقق من التاجر
  SELECT * INTO v_merchant FROM merchants WHERE id = p_merchant_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'التاجر غير موجود'); END IF;
  IF v_merchant.status != 'active' THEN RETURN jsonb_build_object('success', false, 'error', 'حساب التاجر غير نشط'); END IF;

  -- تحقق من المستخدم وأنه تابع للتاجر
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'المستخدم غير موجود'); END IF;
  IF v_profile.merchant_id != p_merchant_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'هذا المستخدم ليس من عملاء هذا التاجر');
  END IF;

  -- جلب بيانات الكود
  SELECT * INTO v_key FROM license_keys WHERE code = p_code;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'الكود غير موجود'); END IF;
  IF v_key.status = 'disabled' THEN RETURN jsonb_build_object('success', false, 'error', 'الكود معطّل'); END IF;
  IF v_key.status = 'expired'  THEN RETURN jsonb_build_object('success', false, 'error', 'الكود منتهي الصلاحية'); END IF;
  IF v_key.expiry_date IS NOT NULL AND v_key.expiry_date < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'انتهت صلاحية هذا الكود');
  END IF;

  -- تفعيل الكود على حساب المستخدم (نفس منطق activate_license_key_v2)
  SELECT activate_license_key_v2(p_user_id, p_code) INTO v_result;

  IF NOT (v_result->>'success')::boolean THEN
    RETURN v_result;
  END IF;

  -- تأكد من وجود سجل merchant_member
  v_member_id := ensure_merchant_member(p_merchant_id, p_user_id);

  -- تحديث merchant_member إلى active
  UPDATE merchant_members SET status = 'active', activated_at = COALESCE(activated_at, now())
  WHERE id = v_member_id;

  -- تسجيل في ledger
  INSERT INTO merchant_member_ledger (member_id, merchant_id, user_id, type, amount, balance_before, balance_after, reason, created_by)
  SELECT v_member_id, p_merchant_id, p_user_id, 'subscription_bonus', 0, 0, 0,
    'تفعيل كود اشتراك: ' || p_code, v_actor_id;

  RETURN jsonb_build_object('success', true, 'message', 'تم تفعيل الاشتراك بنجاح');
END;
$$;
GRANT EXECUTE ON FUNCTION activate_license_code_for_member(uuid, uuid, text, uuid) TO authenticated;

-- ── 5. تحديث get_merchant_client_data لإرجاع تفاصيل أوفر ────────────────────
CREATE OR REPLACE FUNCTION public.get_merchant_client_data(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile   profiles%ROWTYPE;
  v_merchant  merchants%ROWTYPE;
  v_member    merchant_members%ROWTYPE;
  v_sub       JSONB := NULL;
  v_sub_row   subscriptions%ROWTYPE;
  v_key       license_keys%ROWTYPE;
  v_ops_today integer := 0;
  v_ops_fail  integer := 0;
  v_ops_succ  integer := 0;
  v_days_rem  numeric := NULL;
  v_hours_rem numeric := NULL;
  v_sub_type  text := 'active';
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','user_not_found'); END IF;
  IF v_profile.merchant_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','not_a_merchant_client'); END IF;

  SELECT * INTO v_merchant FROM merchants WHERE id = v_profile.merchant_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','merchant_not_found'); END IF;

  SELECT * INTO v_member FROM merchant_members WHERE merchant_id = v_profile.merchant_id AND user_id = p_user_id;

  -- جلب الاشتراك النشط
  SELECT * INTO v_sub_row FROM subscriptions WHERE user_id = p_user_id
  ORDER BY CASE status WHEN 'active' THEN 1 WHEN 'grace_period' THEN 2 ELSE 4 END, created_at DESC LIMIT 1;

  IF FOUND AND v_sub_row.id IS NOT NULL THEN
    -- جلب تفاصيل الكود
    IF v_sub_row.license_key_id IS NOT NULL THEN
      SELECT * INTO v_key FROM license_keys WHERE id = v_sub_row.license_key_id;
    END IF;

    -- حساب الأيام / الساعات المتبقية
    IF v_sub_row.expires_at IS NOT NULL THEN
      v_days_rem  := EXTRACT(EPOCH FROM (v_sub_row.expires_at - now())) / 86400.0;
      v_hours_rem := EXTRACT(EPOCH FROM (v_sub_row.expires_at - now())) / 3600.0;
    END IF;

    -- تحديد نوع الاشتراك
    v_sub_type := CASE
      WHEN v_sub_row.ops_limit IS NULL AND v_sub_row.expires_at IS NULL THEN 'unlimited'
      WHEN v_sub_row.ops_limit IS NOT NULL AND v_sub_row.expires_at IS NOT NULL THEN 'both_limited'
      WHEN v_sub_row.ops_limit IS NOT NULL THEN 'ops_limited'
      ELSE 'time_limited'
    END;

    -- إحصائيات العمليات من merchant_operations
    SELECT
      COUNT(*) FILTER (WHERE status = 'success'),
      COUNT(*) FILTER (WHERE status IN ('failed','error','refunded'))
    INTO v_ops_succ, v_ops_fail
    FROM merchant_operations
    WHERE user_id = p_user_id;

    v_sub := jsonb_build_object(
      'id',              v_sub_row.id,
      'status',          v_sub_row.status,
      'sub_type',        v_sub_type,
      'ops_count',       COALESCE(v_sub_row.ops_count, 0),
      'ops_limit',       v_sub_row.ops_limit,
      'ops_remaining',   v_sub_row.ops_remaining,
      'expires_at',      v_sub_row.expires_at,
      'days_remaining',  CASE WHEN v_days_rem IS NOT NULL THEN GREATEST(0, ROUND(v_days_rem::numeric, 1)) ELSE NULL END,
      'hours_remaining', CASE WHEN v_hours_rem IS NOT NULL AND v_hours_rem < 24 THEN GREATEST(0, ROUND(v_hours_rem::numeric, 1)) ELSE NULL END,
      'in_grace_period', v_sub_row.in_grace_period,
      'activated_at',    v_sub_row.activated_at,
      'code_type',       COALESCE(v_key.code_type, 'paid'),
      'ops_success',     v_ops_succ,
      'ops_failed',      v_ops_fail
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'merchant', jsonb_build_object(
      'id',          v_merchant.id,
      'name',        COALESCE(v_merchant.business_name, v_merchant.name),
      'status',      v_merchant.status,
      'brand_color', v_merchant.brand_color,
      'logo_url',    v_merchant.logo_url,
      'welcome_msg', v_merchant.welcome_msg
    ),
    'member', CASE WHEN v_member.user_id IS NOT NULL THEN jsonb_build_object(
      'member_status', v_member.status,
      'joined_at',     v_member.created_at,
      'last_op_at',    v_member.last_operation_at
    ) ELSE NULL END,
    'subscription', v_sub
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_merchant_client_data(uuid) TO authenticated;
