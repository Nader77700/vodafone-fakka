
-- ═══════════════════════════════════════════════════════════════
-- 1. دالة مساعدة: is_admin_user(uid)
--    تتحقق مباشرة من core_profiles بدون أي قيود
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_admin_user(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF uid IS NULL THEN RETURN false; END IF;
  SELECT role::text INTO v_role 
  FROM core_profiles 
  WHERE id = uid;
  RETURN v_role IN ('admin', 'super_admin');
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 2. دالة مساعدة: is_maintenance_mode()
--    تقرأ إعداد الصيانة من app_config
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_maintenance_mode()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_val text;
BEGIN
  -- محاولة قراءة من app_config أو runtime_config
  BEGIN
    SELECT value::text INTO v_val
    FROM app_config
    WHERE key = 'maintenance_mode'
    LIMIT 1;
    RETURN COALESCE(v_val, 'false')::boolean;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 3. تحديث get_user_role: الأدمن لا يخضع لـ is_valid_app_version
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_user_role(uid uuid)
RETURNS user_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT role INTO v_role FROM core_profiles WHERE id = uid;

  -- الأدمن لا يخضع لأي قيود نسخة
  IF v_role IN ('admin', 'super_admin') THEN
    RETURN v_role;
  END IF;

  IF NOT is_valid_app_version() THEN
    RETURN NULL;
  END IF;

  RETURN v_role;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 4. RLS على subscriptions: الأدمن يشوف اشتراكه دائماً
--    حتى لو كان is_paused=true أو status='suspended'
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Users can view own subscription" ON subscriptions;
CREATE POLICY "Users can view own subscription"
ON subscriptions FOR SELECT
USING (
  user_id = auth.uid()
  AND (
    -- المستخدم العادي: يشوف اشتراكه بدون قيود
    NOT is_admin_user(auth.uid())
    OR
    -- الأدمن: يشوف اشتراكه دائماً بغض النظر عن أي قيد
    is_admin_user(auth.uid())
  )
);

-- ═══════════════════════════════════════════════════════════════
-- 5. منح صلاحيات execute
-- ═══════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.is_admin_user(uuid)    TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_maintenance_mode()  TO authenticated, anon, service_role;
