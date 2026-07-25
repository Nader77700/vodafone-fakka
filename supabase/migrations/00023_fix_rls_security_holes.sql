
-- ═══════════════════════════════════════════════════════════
-- FIX 1: Drop overly-permissive system_logs policy
-- (allowed ALL authenticated users to read ALL logs)
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "system_logs_admin_all" ON public.system_logs;

-- ═══════════════════════════════════════════════════════════
-- FIX 2: Drop wildcard activity_log policy
-- (service_write_activity with qual=true = everyone full access)
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "service_write_activity" ON public.activity_log;

-- ═══════════════════════════════════════════════════════════
-- FIX 3: Ensure activity_log has proper INSERT for authenticated users
-- (users_own_activity covers SELECT/INSERT/UPDATE/DELETE for own rows,
--  but INSERT has no USING check — add explicit INSERT policy)
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "activity_log_insert_authenticated" ON public.activity_log;
CREATE POLICY "activity_log_insert_authenticated"
  ON public.activity_log FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- ═══════════════════════════════════════════════════════════
-- FIX 4: system_logs — regular users can INSERT but NOT SELECT
-- Ensure SELECT is admin-only (the existing "Only admins can view system_logs" covers this)
-- But also need to allow authenticated users to INSERT their own logs
-- The existing "Authenticated users can insert logs" covers this — keep it
-- ═══════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- FIX 5: welcome_gifts — add INSERT policy for admins
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "welcome_gifts_admin_insert" ON public.welcome_gifts;
CREATE POLICY "welcome_gifts_admin_insert"
  ON public.welcome_gifts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = ANY(ARRAY['admin'::user_role, 'super_admin'::user_role])
    )
  );

-- ═══════════════════════════════════════════════════════════
-- FIX 6: code_logs — allow authenticated users to INSERT
-- (currently only admins can insert, but insertCodeLog is called from user context during activation)
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "code_logs_insert_authenticated" ON public.code_logs;
CREATE POLICY "code_logs_insert_authenticated"
  ON public.code_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);
