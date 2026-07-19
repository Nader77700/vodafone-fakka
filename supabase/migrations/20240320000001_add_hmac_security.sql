-- تفعيل إضافة pgcrypto إذا لم تكن مفعلة
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
BEGIN
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

  -- إذا لم يتم إرسال التوقيع (مثلاً من الويب أو أدمن)، يمكنك السماح أو الرفض
  -- لنجعلها صارمة:
  IF v_signature IS NULL OR v_timestamp IS NULL THEN
    -- يمكنك تغيير هذا إلى RETURN true في حال أردت عدم حظر الويب
    RETURN false;
  END IF;

  -- تحقق من أن الوقت لم يمر عليه أكثر من 5 دقائق (300 ثانية) لمنع Replay Attacks
  v_time_diff := extract(epoch from now()) - v_timestamp::numeric;
  IF v_time_diff > 300 OR v_time_diff < -300 THEN
    RETURN false;
  END IF;

  -- حساب التوقيع المتوقع: HMAC_SHA256(timestamp, secret)
  -- نستخدم التايم ستامب فقط للتبسيط لأن قراءة الـ Body في Postgres RLS غير ممكنة
  v_expected_signature := encode(hmac(v_timestamp, v_secret, 'sha256'), 'hex');

  IF v_expected_signature = v_signature THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
