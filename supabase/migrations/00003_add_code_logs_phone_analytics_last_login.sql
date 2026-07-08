
-- ====================================================
-- 1. جدول سجلات أكواد التفعيل (Code Activity Log)
-- ====================================================
CREATE TABLE IF NOT EXISTS code_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id       UUID REFERENCES license_keys(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,  -- created | viewed | attempt | activated | failed | expired | disabled
  details       TEXT,
  ip_address    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE code_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_code_logs" ON code_logs
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- ====================================================
-- 2. حقل آخر دخول في profiles
-- ====================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- ====================================================
-- 3. إضافة code في جدول subscriptions للمرجع السريع
-- ====================================================
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS code_used TEXT;

-- ====================================================
-- 4. منظر (View) لتحليل الأرقام
-- ====================================================
CREATE OR REPLACE VIEW phone_analytics AS
SELECT
  user_id,
  phone_number,
  COUNT(*)                                          AS usage_count,
  COUNT(*) FILTER (WHERE status = 'success')        AS success_count,
  COALESCE(SUM(amount), 0)                          AS total_amount,
  MAX(performed_at)                                 AS last_used_at
FROM operations
GROUP BY user_id, phone_number;
