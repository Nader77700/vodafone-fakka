CREATE OR REPLACE FUNCTION trg_fn_vip_red_instant_scan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url text;
  v_pub_key text;
BEGIN
  -- جلب رابط المشروع ومفتاح الوصول بأمان من vault
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_pub_key FROM vault.decrypted_secrets WHERE name = 'publishable_key';

  IF v_url IS NOT NULL AND v_pub_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/vip-red-auto-scan',
      headers := jsonb_build_object(
        'Content-type', 'application/json',
        'apikey', v_pub_key,
        'Authorization', 'Bearer ' || v_pub_key,
        'x-internal-key', 'vfp_internal_push_2025'
      ),
      body := jsonb_build_object(
        'phone', NEW.phone_number,
        'execution_source', 'db_trigger_instant'
      ),
      timeout_milliseconds := 60000
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- منع أي خطأ في الاتصال بالشبكة من تعطيل عملية الإدخال الأساسية
  RAISE WARNING 'trg_fn_vip_red_instant_scan error: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vip_red_line_instant_scan ON vip_red_monitored_lines;
CREATE TRIGGER trg_vip_red_line_instant_scan
  AFTER INSERT ON vip_red_monitored_lines
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_vip_red_instant_scan();