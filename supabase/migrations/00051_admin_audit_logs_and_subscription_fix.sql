-- ══════════════════════════════════════════════════════════════
-- 1. جدول admin_audit_logs — سجل كامل لجميع عمليات الإدارة
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  admin_username TEXT,
  action         TEXT NOT NULL,
  target_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  target_username TEXT,
  details        JSONB DEFAULT '{}',
  success        BOOLEAN NOT NULL DEFAULT true,
  error_msg      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_audit_admin     ON admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_target    ON admin_audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created   ON admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action    ON admin_audit_logs(action);

-- RLS — الأدمن فقط يقرأ / service_role يكتب
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_audit_select" ON admin_audit_logs;
CREATE POLICY "admin_audit_select" ON admin_audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- INSERT عبر SECURITY DEFINER function فقط (لا يحتاج RLS INSERT)
DROP POLICY IF EXISTS "admin_audit_insert_service" ON admin_audit_logs;
CREATE POLICY "admin_audit_insert_service" ON admin_audit_logs
  FOR INSERT WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
-- 2. Function: log_admin_action — تسجيل عملية إدارية
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION log_admin_action(
  p_admin_id       UUID,
  p_action         TEXT,
  p_target_user_id UUID DEFAULT NULL,
  p_details        JSONB DEFAULT '{}',
  p_success        BOOLEAN DEFAULT true,
  p_error_msg      TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin_username TEXT;
  v_target_username TEXT;
BEGIN
  SELECT COALESCE(username, email, id::text) INTO v_admin_username
  FROM profiles WHERE id = p_admin_id;

  IF p_target_user_id IS NOT NULL THEN
    SELECT COALESCE(username, email, id::text) INTO v_target_username
    FROM profiles WHERE id = p_target_user_id;
  END IF;

  INSERT INTO admin_audit_logs
    (admin_id, admin_username, action, target_user_id, target_username, details, success, error_msg)
  VALUES
    (p_admin_id, v_admin_username, p_action, p_target_user_id, v_target_username, p_details, p_success, p_error_msg);
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 3. إصلاح subscriptions: status='expired' لكن expires_at مستقبلي
-- ══════════════════════════════════════════════════════════════
UPDATE subscriptions
SET
  status           = 'active',
  in_grace_period  = false,
  grace_started_at = NULL,
  grace_ends_at    = NULL,
  updated_at       = NOW()
WHERE
  status = 'expired'
  AND expires_at IS NOT NULL
  AND expires_at > NOW()
  AND (ops_limit IS NULL OR ops_count < ops_limit);

-- ══════════════════════════════════════════════════════════════
-- 4. Function: get_user_detail_v2 — جلب كامل بيانات المستخدم
--    يشمل: last_sign_in من auth.users + ops_remaining + subscription_code
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_user_detail_v2(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile          JSONB;
  v_auth_last_sign   TIMESTAMPTZ;
  v_sub              JSONB;
  v_license_code     TEXT;
BEGIN
  -- جلب الملف الشخصي
  SELECT to_jsonb(p) INTO v_profile
  FROM profiles p WHERE id = p_user_id;

  -- جلب آخر تسجيل دخول من auth.users (Service Role فقط)
  SELECT last_sign_in_at INTO v_auth_last_sign
  FROM auth.users WHERE id = p_user_id;

  -- إضافة last_sign_in_at للـ profile
  v_profile := v_profile || jsonb_build_object('auth_last_sign_in', v_auth_last_sign);

  -- جلب الاشتراك + إصلاح تلقائي إذا expired بتاريخ مستقبلي
  SELECT to_jsonb(s) INTO v_sub
  FROM subscriptions s
  WHERE user_id = p_user_id
  ORDER BY created_at DESC LIMIT 1;

  IF v_sub IS NOT NULL THEN
    -- إصلاح فوري: expired + تاريخ مستقبلي + حصة متبقية
    IF (v_sub->>'status') = 'expired'
       AND (v_sub->>'expires_at')::TIMESTAMPTZ > NOW()
       AND (
         v_sub->>'ops_limit' IS NULL
         OR (v_sub->>'ops_count')::INT < (v_sub->>'ops_limit')::INT
       )
    THEN
      UPDATE subscriptions
      SET status = 'active', in_grace_period = false,
          grace_started_at = NULL, grace_ends_at = NULL, updated_at = NOW()
      WHERE user_id = p_user_id
        AND id = (v_sub->>'id')::UUID;

      v_sub := v_sub
        || '{"status":"active","in_grace_period":false}'::JSONB
        || jsonb_build_object('grace_started_at', NULL, 'grace_ends_at', NULL);
    END IF;

    -- جلب كود الترخيص
    IF v_sub->>'license_key_id' IS NOT NULL THEN
      SELECT code INTO v_license_code
      FROM license_keys WHERE id = (v_sub->>'license_key_id')::UUID;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'profile',      v_profile,
    'subscription', v_sub,
    'license_code', v_license_code
  );
END;
$$;