
-- إصلاح _validate_merchant_active: استخدام قيم الـ enum الصحيحة (disabled بدلاً من inactive)
CREATE OR REPLACE FUNCTION public._validate_merchant_active(
  p_merchant_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_merchant merchants%ROWTYPE;
BEGIN
  SELECT * INTO v_merchant FROM public.merchants WHERE id = p_merchant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'التاجر غير موجود');
  END IF;
  IF v_merchant.status = 'disabled'::merchant_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'حساب التاجر غير نشط');
  END IF;
  IF v_merchant.status = 'suspended'::merchant_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'حساب التاجر موقوف');
  END IF;
  IF v_merchant.status = 'blocked'::merchant_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'حساب التاجر محظور');
  END IF;
  IF v_merchant.status = 'deleted'::merchant_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'حساب التاجر محذوف');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
