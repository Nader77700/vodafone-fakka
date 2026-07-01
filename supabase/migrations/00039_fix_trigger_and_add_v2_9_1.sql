
-- ─── 1. إصلاح دالة الـ trigger — استخدام net.http_post الصحيح ───────────────
CREATE OR REPLACE FUNCTION trigger_auto_version_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url  TEXT := 'https://vchmsnavyhripakyvzom.supabase.co/functions/v1/auto-version-notify';
  _key  TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjaG1zbmF2eWhyaXBha3l2em9tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjI4Nzg1NSwiZXhwIjoyMDk3ODYzODU1fQ.qGv6iURGQONn7wlG55S8HMCxTfodI2GQfcV4PkpARIo';
  _body JSONB;
BEGIN
  IF NEW.is_latest = true
     AND (OLD IS NULL OR OLD.is_latest IS DISTINCT FROM true)
     AND NEW.push_notif_sent = false
     AND NEW.update_type = 'apk'   -- فقط تحديثات APK الحقيقية
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

-- ─── 2. إدراج إصدار v2.9.1 (web fix) ─────────────────────────────────────
UPDATE app_versions SET is_latest = false WHERE is_latest = true;

INSERT INTO app_versions (version, version_code, is_latest, update_type, push_notif_sent, release_notes, apk_url, created_at)
VALUES (
  '2.9.1',
  43,
  true,
  'web',
  true,   -- لا يُرسَل إشعار push لتحديثات الويب
  'إصلاح بانر التحديث — لم يعد يظهر رابط APK قديم عند الضغط على تنزيل · إصلاح اسم الملف عند التنزيل · تمييز تحديثات الويب التلقائية عن تحديثات APK',
  'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v2.8.1.apk',
  now()
);
