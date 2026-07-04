
-- ══════════════════════════════════════════════════════════════════
-- إصلاح الـ trigger: لا يُرسَل الإشعار إلا بعد apk_deployed = true
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trigger_auto_version_notify()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  _url  TEXT := 'https://vchmsnavyhripakyvzom.supabase.co/functions/v1/auto-version-notify';
  _key  TEXT := '${SUPABASE_SERVICE_KEY:-REPLACE_WITH_SERVICE_KEY}';
  _body JSONB;
BEGIN
  IF NEW.is_latest = true
     AND NEW.push_notif_sent = false
     AND NEW.update_type = 'apk'
     AND NEW.apk_deployed = true                          -- ← الإضافة الجوهرية
     AND (
       OLD IS NULL
       OR OLD.is_latest IS DISTINCT FROM true
       OR OLD.apk_deployed IS DISTINCT FROM true          -- ← يُطلق عند تحويل apk_deployed من false→true
     )
  THEN
    _body := jsonb_build_object(
      'version',       NEW.version,
      'version_code',  NEW.version_code,
      'apk_url',       NEW.apk_url,
      'release_notes', NEW.release_notes,
      'version_id',    NEW.id
    );

    PERFORM net.http_post(
      url     := _url,
      body    := _body,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || _key,
        'Content-Type',  'application/json'
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
