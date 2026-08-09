-- جدول تسجيل أخطاء خدمة الخطوط والمحافظ
CREATE TABLE IF NOT EXISTS wl_error_logs (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  action        TEXT        NOT NULL,           -- login | register | verify_otp | lookup
  error_code    TEXT        NOT NULL,           -- INVALID_CREDENTIALS | SERVICE_UNAVAILABLE | ...
  http_status   INT,                            -- HTTP status من my.tra.gov.eg
  message       TEXT,                           -- رسالة الخطأ
  phone_hint    TEXT,                           -- آخر 4 أرقام فقط لأغراض التشخيص
  device_id     TEXT,
  request_id    TEXT,
  extra         JSONB                           -- أي بيانات إضافية غير حساسة
);

-- فهرس للبحث السريع
CREATE INDEX idx_wl_error_logs_created_at ON wl_error_logs(created_at DESC);
CREATE INDEX idx_wl_error_logs_action     ON wl_error_logs(action);
CREATE INDEX idx_wl_error_logs_error_code ON wl_error_logs(error_code);

-- RLS: الأدمن فقط يقرأ
ALTER TABLE wl_error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_wl_logs"
  ON wl_error_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM core_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Edge Function تكتب بدون RLS عبر service_role
CREATE POLICY "service_insert_wl_logs"
  ON wl_error_logs FOR INSERT
  WITH CHECK (true);

-- حذف السجلات الأقدم من 30 يوم تلقائياً (تشغيل يومي)
CREATE OR REPLACE FUNCTION cleanup_wl_error_logs()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM wl_error_logs WHERE created_at < now() - INTERVAL '30 days';
$$;