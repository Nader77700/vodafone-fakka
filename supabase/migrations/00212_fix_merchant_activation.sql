-- ── 4. RPC: activate_license_code_for_member ─────────────────────────────────
-- التاجر يفعّل كوداً لمستخدم معين
CREATE OR REPLACE FUNCTION activate_license_code_for_member(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_code        text,
  p_actor_id    uuid DEFAULT NULL
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

  -- تفعيل الكود على حساب المستخدم (باستخدام الدالة الجديدة)
  SELECT activate_license_key(p_user_id, p_code, NULL, NULL, NULL, FALSE) INTO v_result;

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

-- تنظيف دوال التفعيل القديمة لمنع التداخل مستقبلاً
DROP FUNCTION IF EXISTS public.activate_license_key_v2(p_user_id uuid, p_code text, p_device_fp text, p_hardware_hash text, p_native_id text, p_admin_override boolean);
DROP FUNCTION IF EXISTS public.activate_license_key_v2(p_user_id uuid, p_code text, p_device_fp text);
DROP FUNCTION IF EXISTS public.activate_license_key_v2(p_user_id uuid, p_code text);
