
-- استبدال الدالة مباشرة بـ CREATE OR REPLACE (بدون DROP)
-- نغيّر الـ body فقط مع الحفاظ على نفس الـ signature
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- تحقق أولاً من core_profiles (admin + super_admin)
  IF EXISTS (
    SELECT 1 FROM core_profiles
    WHERE id = auth.uid()
      AND role::text IN ('admin', 'super_admin')
  ) THEN
    RETURN true;
  END IF;
  -- fallback: profiles القديم
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role::text IN ('admin', 'super_admin')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated, anon, service_role;
