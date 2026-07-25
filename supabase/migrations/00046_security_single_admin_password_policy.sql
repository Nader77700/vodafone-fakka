
-- ══════════════════════════════════════════════════════════════
-- الحماية الأمنية: مالك واحد فقط + منع ترقية أدوار جديدة
-- ══════════════════════════════════════════════════════════════

-- دالة: احصل على بريد المالك الحالي (SECURITY DEFINER لتجاوز RLS)
CREATE OR REPLACE FUNCTION get_owner_email()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT email FROM auth.users
  WHERE id IN (
    SELECT id FROM profiles
    WHERE role IN ('admin', 'super_admin')
    LIMIT 1
  )
  LIMIT 1;
$$;

-- trigger function: منع أي ترقية لدور admin/super_admin لأي مستخدم جديد
CREATE OR REPLACE FUNCTION enforce_single_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  owner_id uuid;
BEGIN
  -- جلب معرف المالك الحالي (الأدمن الوحيد المسموح به)
  SELECT id INTO owner_id
  FROM profiles
  WHERE role IN ('admin', 'super_admin')
  LIMIT 1;

  -- إذا كان التعديل يحاول ترقية حساب آخر → ارفض
  IF NEW.role IN ('admin', 'super_admin') THEN
    IF owner_id IS NOT NULL AND NEW.id != owner_id THEN
      RAISE EXCEPTION 'غير مسموح: يوجد مسؤول نظام واحد فقط. لا يمكن ترقية حساب آخر.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ربط الـ trigger بجدول profiles
DROP TRIGGER IF EXISTS trg_enforce_single_admin ON profiles;
CREATE TRIGGER trg_enforce_single_admin
  BEFORE INSERT OR UPDATE OF role ON profiles
  FOR EACH ROW EXECUTE FUNCTION enforce_single_admin();

-- ══════════════════════════════════════════════════════════════
-- تأمين Storage: منع قراءة APKs القديمة من المستخدمين العاديين
-- المستخدمون العاديون يرون فقط أحدث APK
-- ══════════════════════════════════════════════════════════════

-- دالة مساعدة: هل المستخدم أدمن؟
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'super_admin')
  );
$$;

-- دالة مساعدة: هل الملف هو أحدث APK؟
CREATE OR REPLACE FUNCTION is_latest_apk(file_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_versions
    WHERE is_latest = true
    AND apk_url LIKE '%' || file_name
  );
$$;

-- ══════════════════════════════════════════════════════════════
-- حماية جدول app_versions: المستخدمون يرون فقط الإصدار الأحدث
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "users_see_latest_only" ON app_versions;
CREATE POLICY "users_see_latest_only"
  ON app_versions FOR SELECT
  TO authenticated
  USING (
    is_latest = true
    OR is_admin_user()
  );

DROP POLICY IF EXISTS "anon_see_latest_only" ON app_versions;
CREATE POLICY "anon_see_latest_only"
  ON app_versions FOR SELECT
  TO anon
  USING (is_latest = true);

-- الأدمن فقط يستطيع التعديل والإضافة
DROP POLICY IF EXISTS "admin_manage_versions" ON app_versions;
CREATE POLICY "admin_manage_versions"
  ON app_versions FOR ALL
  TO authenticated
  USING (is_admin_user())
  WITH CHECK (is_admin_user());
