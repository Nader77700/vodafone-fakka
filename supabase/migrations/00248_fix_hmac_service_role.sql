-- دالة للتحقق من التوقيع
CREATE OR REPLACE FUNCTION verify_request_signature()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_headers jsonb;
  v_signature text;
  v_timestamp text;
  v_secret text := 'VodafoneFakkaPremium2024SecureHMACKey_V9';
  v_expected_signature text;
  v_time_diff integer;
  v_jwt_role text;
BEGIN
  -- Bypass completely if called by service_role (Edge Functions)
  BEGIN
    v_jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;
  
  IF v_jwt_role = 'service_role' THEN
    RETURN true;
  END IF;

  -- جلب الهيدرز من الطلب
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN true; -- إذا لم يكن طلب HTTP (مثلاً يتم تشغيله داخلياً)، نسمح به
  END;

  IF v_headers IS NULL THEN
    RETURN true;
  END IF;

  v_signature := v_headers->>'x-hmac-signature';
  v_timestamp := v_headers->>'x-timestamp';

  IF v_signature IS NULL OR v_timestamp IS NULL THEN
    RETURN false;
  END IF;

  v_time_diff := extract(epoch from now()) - v_timestamp::numeric;
  IF v_time_diff > 300 OR v_time_diff < -300 THEN
    RETURN false;
  END IF;

  v_expected_signature := encode(hmac(v_timestamp, v_secret, 'sha256'), 'hex');

  IF v_expected_signature = v_signature THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;