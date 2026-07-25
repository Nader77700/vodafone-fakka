
-- ================================================
-- 1. إضافة حقول نوع الكود التجريبي إلى license_keys
-- ================================================
ALTER TABLE license_keys
  ADD COLUMN IF NOT EXISTS code_type       TEXT NOT NULL DEFAULT 'paid',  -- paid | trial
  ADD COLUMN IF NOT EXISTS max_users       INT  DEFAULT 1,                -- للـ trial
  ADD COLUMN IF NOT EXISTS max_ops_per_user INT DEFAULT NULL,             -- للـ trial
  ADD COLUMN IF NOT EXISTS used_count      INT  NOT NULL DEFAULT 0;       -- عدد مرات الاستخدام

-- ================================================
-- 2. جدول تتبع استخدام الأكواد التجريبية
-- ================================================
CREATE TABLE IF NOT EXISTS trial_usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id        UUID NOT NULL REFERENCES license_keys(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ops_used      INT  NOT NULL DEFAULT 0,
  activated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(key_id, user_id)
);

ALTER TABLE trial_usage ENABLE ROW LEVEL SECURITY;

-- المستخدم يرى سجله فقط
CREATE POLICY "user_read_own_trial" ON trial_usage
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- الأدمن يرى الكل
CREATE POLICY "admin_all_trial" ON trial_usage
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- المستخدم يعدّل سجله فقط (تحديث العمليات)
CREATE POLICY "user_update_own_trial" ON trial_usage
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- ================================================
-- 3. دالة مساعدة: توليد كود عشوائي قوي
-- ================================================
CREATE OR REPLACE FUNCTION generate_nafk_code(prefix TEXT DEFAULT 'NAFK')
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  chars  TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := prefix || '-';
  seg    INT;
  char_i INT;
BEGIN
  FOR seg IN 1..3 LOOP
    FOR char_i IN 1..4 LOOP
      result := result || substr(chars, floor(random()*length(chars)+1)::INT, 1);
    END LOOP;
    IF seg < 3 THEN result := result || '-'; END IF;
  END LOOP;
  RETURN result;
END;
$$;
