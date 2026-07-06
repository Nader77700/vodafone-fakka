
-- ══════════════════════════════════════════════════════════════
-- 1. إصلاح FK على subscription_history → CASCADE بدلاً من NO ACTION
-- ══════════════════════════════════════════════════════════════
ALTER TABLE subscription_history
  DROP CONSTRAINT IF EXISTS subscription_history_license_key_id_fkey;
ALTER TABLE subscription_history
  ADD CONSTRAINT subscription_history_license_key_id_fkey
  FOREIGN KEY (license_key_id) REFERENCES license_keys(id) ON DELETE CASCADE;

-- ══════════════════════════════════════════════════════════════
-- 2. إصلاح FK على subscriptions → CASCADE بدلاً من NO ACTION
-- ══════════════════════════════════════════════════════════════
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_license_key_id_fkey;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_license_key_id_fkey
  FOREIGN KEY (license_key_id) REFERENCES license_keys(id) ON DELETE CASCADE;

-- ══════════════════════════════════════════════════════════════
-- 3. إضافة عمود activation_limit_per_user (= uses_per_user)
-- ══════════════════════════════════════════════════════════════
ALTER TABLE license_keys
  ADD COLUMN IF NOT EXISTS activation_limit_per_user INTEGER DEFAULT 1;

-- مزامنة القيم الموجودة
UPDATE license_keys
  SET activation_limit_per_user = COALESCE(uses_per_user, 1)
  WHERE activation_limit_per_user IS NULL OR activation_limit_per_user = 1;

-- ══════════════════════════════════════════════════════════════
-- 4. إضافة عمود operations_per_user (= max_ops_per_user)
-- ══════════════════════════════════════════════════════════════
ALTER TABLE license_keys
  ADD COLUMN IF NOT EXISTS operations_per_user INTEGER DEFAULT NULL;

UPDATE license_keys
  SET operations_per_user = max_ops_per_user
  WHERE operations_per_user IS NULL AND max_ops_per_user IS NOT NULL;

-- ══════════════════════════════════════════════════════════════
-- 5. إضافة عمود total_operations (محسوب تلقائياً)
-- ══════════════════════════════════════════════════════════════
ALTER TABLE license_keys
  ADD COLUMN IF NOT EXISTS total_operations INTEGER
  GENERATED ALWAYS AS (
    CASE
      WHEN max_users IS NOT NULL AND max_ops_per_user IS NOT NULL
        THEN max_users * max_ops_per_user
      ELSE NULL
    END
  ) STORED;

-- ══════════════════════════════════════════════════════════════
-- 6. إضافة عمود remaining_ops لجدول trial_usage
-- ══════════════════════════════════════════════════════════════
ALTER TABLE trial_usage
  ADD COLUMN IF NOT EXISTS remaining_ops INTEGER DEFAULT NULL;

-- ══════════════════════════════════════════════════════════════
-- 7. إضافة عمود ops_limit + ops_remaining لجدول subscriptions
-- ══════════════════════════════════════════════════════════════
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS ops_limit     INTEGER DEFAULT NULL;
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS ops_remaining INTEGER DEFAULT NULL;

-- ══════════════════════════════════════════════════════════════
-- 8. دالة delete_license_key_cascade المُحدَّثة
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION delete_license_key_cascade(
  p_key_id   UUID,
  p_admin_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code           TEXT;
  v_affected_users INTEGER := 0;
BEGIN
  -- جلب الكود للتسجيل
  SELECT code INTO v_code FROM license_keys WHERE id = p_key_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الكود غير موجود');
  END IF;

  -- عدد المستخدمين المتأثرين
  SELECT COUNT(*) INTO v_affected_users
    FROM subscriptions WHERE license_key_id = p_key_id;

  -- تسجيل الحدث في activity_log
  INSERT INTO activity_log(user_id, event_type, title, description, metadata)
  VALUES (
    p_admin_id,
    'admin_delete_key',
    'حذف كود ترخيص',
    'تم حذف الكود: ' || v_code,
    jsonb_build_object(
      'key_id', p_key_id,
      'key_code', v_code,
      'affected_users', v_affected_users,
      'deleted_at', now()
    )
  );

  -- الحذف التسلسلي (CASCADE يتكفل بالباقي)
  DELETE FROM license_keys WHERE id = p_key_id;

  RETURN jsonb_build_object(
    'success', true,
    'key_code', v_code,
    'affected_users', v_affected_users
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 9. إنشاء جدول system_logs إذا لم يكن موجوداً
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS system_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  level       TEXT NOT NULL DEFAULT 'info',
  action      TEXT NOT NULL,
  message     TEXT,
  metadata    JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_logs_admin_all ON system_logs;
CREATE POLICY system_logs_admin_all ON system_logs
  USING (auth.role() = 'authenticated');

-- فهرس للبحث السريع
CREATE INDEX IF NOT EXISTS system_logs_created_at_idx ON system_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS system_logs_action_idx     ON system_logs(action);
