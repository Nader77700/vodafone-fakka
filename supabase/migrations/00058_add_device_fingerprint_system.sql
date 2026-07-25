
-- ============================================================
-- نظام بصمة الجهاز: منع استخدام كود الهدية/التجريبي
-- على أكثر من حساب من نفس الجهاز
-- ============================================================

-- 1. إضافة device_fp لجدول profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS device_fp TEXT;
CREATE INDEX IF NOT EXISTS idx_profiles_device_fp ON profiles(device_fp) WHERE device_fp IS NOT NULL;

-- 2. تسجيل تفعيلات الهدايا بالأجهزة (سجل تاريخي)
CREATE TABLE IF NOT EXISTS device_gift_activations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_fp     TEXT        NOT NULL,
  user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  username      TEXT        NOT NULL DEFAULT '',
  license_key_id UUID       REFERENCES license_keys(id) ON DELETE SET NULL,
  code          TEXT        NOT NULL DEFAULT '',
  code_type     TEXT        NOT NULL DEFAULT 'gift',
  activated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- فهرس: بحث سريع بالجهاز
CREATE INDEX IF NOT EXISTS idx_dga_device_fp  ON device_gift_activations(device_fp);
CREATE INDEX IF NOT EXISTS idx_dga_user_id    ON device_gift_activations(user_id);

-- RLS
ALTER TABLE device_gift_activations ENABLE ROW LEVEL SECURITY;

-- المستخدم يقرأ سجلاته فقط
CREATE POLICY "dga_read_own" ON device_gift_activations
  FOR SELECT USING (auth.uid() = user_id);

-- الإدراج عبر SECURITY DEFINER فقط (RPC)
-- الأدمن يقرأ كل شيء
CREATE POLICY "dga_admin_all" ON device_gift_activations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','super_admin')
    )
  );
