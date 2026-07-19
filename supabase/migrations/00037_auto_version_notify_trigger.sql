
-- دالة trigger تستدعي Edge Function عند نشر إصدار جديد
CREATE OR REPLACE FUNCTION trigger_auto_version_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url  TEXT := 'https://vchmsnavyhripakyvzom.supabase.co/functions/v1/auto-version-notify';
  _key  TEXT := '${SUPABASE_SERVICE_KEY:-REPLACE_WITH_SERVICE_KEY}';
  _body TEXT;
BEGIN
  -- فقط عند تحويل is_latest إلى true وعدم إرسال الإشعار من قبل
  IF NEW.is_latest = true
     AND (OLD IS NULL OR OLD.is_latest IS DISTINCT FROM true)
     AND NEW.push_notif_sent = false
  THEN
    _body := json_build_object(
      'version',       NEW.version,
      'version_code',  NEW.version_code,
      'apk_url',       NEW.apk_url,
      'release_notes', NEW.release_notes,
      'version_id',    NEW.id
    )::text;

    PERFORM extensions.http_post(
      _url,
      _body,
      'application/json',
      ARRAY[
        extensions.http_header('Authorization', 'Bearer ' || _key),
        extensions.http_header('Content-Type',  'application/json')
      ]
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ربط الـ trigger
DROP TRIGGER IF EXISTS auto_version_notify_trigger ON app_versions;

CREATE TRIGGER auto_version_notify_trigger
  AFTER INSERT OR UPDATE OF is_latest
  ON app_versions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_auto_version_notify();
