
-- جدول الإصدارات المحظورة نهائياً (لا يمكن حذفها أو إلغاؤها)
-- الفرق عن version_blocked_codes: هذه لا يمكن "إلغاء الكل" منها
CREATE TABLE IF NOT EXISTS permanent_blocked_versions (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  version_code  integer     NOT NULL UNIQUE,           -- كود الإصدار (مثل 344)
  version_name  text        NOT NULL DEFAULT '',        -- اسم الإصدار (اختياري للعرض)
  reason        text        NOT NULL DEFAULT 'إصدار محظور نهائياً',
  blocked_by    text        NOT NULL DEFAULT 'admin',   -- من أضافه
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS: القراءة للكل (يقرأها التطبيق)، الكتابة للأدمن فقط
ALTER TABLE permanent_blocked_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "permanent_blocked_versions_read_all"
  ON permanent_blocked_versions FOR SELECT
  USING (true);

CREATE POLICY "permanent_blocked_versions_admin_insert"
  ON permanent_blocked_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- لا DELETE ولا UPDATE — الحظر نهائي لا يُلغى
-- الأدمن يضيف فقط، لا يحذف

-- دالة SECURITY DEFINER لإضافة حظر دائم بدون التحقق من RLS
CREATE OR REPLACE FUNCTION add_permanent_block(
  p_version_code integer,
  p_version_name text,
  p_reason       text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO permanent_blocked_versions (version_code, version_name, reason)
  VALUES (p_version_code, p_version_name, p_reason)
  ON CONFLICT (version_code) DO NOTHING; -- إذا موجود مسبقاً لا نرفع خطأ
END;
$$;

-- دالة القراءة العامة (للتطبيق)
CREATE OR REPLACE FUNCTION get_permanent_blocked_versions()
RETURNS TABLE(version_code integer, version_name text, reason text, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT version_code, version_name, reason, created_at
  FROM permanent_blocked_versions
  ORDER BY created_at DESC;
$$;

-- إدراج الإصدارات الموجودة مسبقاً (287,311,325,338,344) كمحظورة نهائياً
INSERT INTO permanent_blocked_versions (version_code, version_name, reason)
VALUES
  (287, '2.x',  'إصدار قديم محظور نهائياً'),
  (311, '2.x',  'إصدار قديم محظور نهائياً'),
  (325, '2.x',  'إصدار قديم محظور نهائياً'),
  (338, '2.x',  'إصدار قديم محظور نهائياً'),
  (344, '2.x',  'إصدار قديم محظور نهائياً')
ON CONFLICT (version_code) DO NOTHING;
