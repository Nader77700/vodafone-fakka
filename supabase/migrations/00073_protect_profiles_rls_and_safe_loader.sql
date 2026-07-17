
-- ================================================================
-- PROTECTION LAYER: بطبقة حماية كاملة لجدول profiles
-- 1. get_own_profile(uid) — SECURITY DEFINER: يتجاوز RLS تماماً
--    التطبيق يستخدمه لقراءة البروفايل الشخصي بأمان مطلق
-- 2. check_rls_policy_safe() — يكشف policies ذاتية الإشارة خطيرة
-- 3. trg_block_recursive_rls — يمنع إضافة policy خطرة على profiles
-- ================================================================

-- ─── 1. دالة آمنة لقراءة البروفايل الشخصي (تتجاوز RLS بالكامل) ─────────────
CREATE OR REPLACE FUNCTION get_own_profile(uid uuid)
RETURNS SETOF profiles
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT * FROM profiles WHERE id = uid LIMIT 1;
$$;

-- منح الإذن لكل مستخدم مصادق
GRANT EXECUTE ON FUNCTION get_own_profile(uuid) TO authenticated;

-- ─── 2. دالة تحقق من سلامة سياسات RLS على profiles ────────────────────────
CREATE OR REPLACE FUNCTION check_rls_policy_safe(p_qual text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  -- كشف أي subquery تشير إلى profiles داخل policy على profiles
  -- هذا هو السبب الجذري لـ Infinite Recursion
  IF p_qual ~* 'from\s+profiles' OR p_qual ~* 'from\s+public\.profiles' THEN
    RETURN false; -- خطرة: تحتوي self-reference
  END IF;
  RETURN true;   -- آمنة
END;
$$;

-- ─── 3. trigger function: يحظر policies الخطرة على profiles ─────────────────
CREATE OR REPLACE FUNCTION trg_fn_block_recursive_rls()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  obj record;
  pol_qual text;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    -- نتحقق فقط عند إنشاء policy على جدول profiles
    IF obj.command_tag = 'CREATE POLICY' THEN
      -- جلب الـ qual للـ policy المنشأة حديثاً
      SELECT qual::text INTO pol_qual
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename  = 'profiles'
        AND (obj.object_identity LIKE '%' || policyname || '%'
             OR obj.object_identity LIKE '%profiles%')
      ORDER BY (pg_policies.policyname) DESC
      LIMIT 1;

      IF pol_qual IS NOT NULL AND NOT check_rls_policy_safe(pol_qual) THEN
        RAISE EXCEPTION
          'BLOCKED: RLS policy on profiles contains self-referencing subquery '
          'which causes Infinite Recursion. Remove the "FROM profiles" subquery. '
          'Use a SECURITY DEFINER helper function instead. (qual: %)', pol_qual;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- تسجيل الـ event trigger
DROP EVENT TRIGGER IF EXISTS block_recursive_profiles_rls;
CREATE EVENT TRIGGER block_recursive_profiles_rls
  ON ddl_command_end
  WHEN TAG IN ('CREATE POLICY')
  EXECUTE FUNCTION trg_fn_block_recursive_rls();
