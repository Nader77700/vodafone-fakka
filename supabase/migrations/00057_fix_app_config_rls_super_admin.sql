
-- إصلاح RLS: السماح لـ super_admin بالكتابة على app_config
DROP POLICY IF EXISTS "app_config_write" ON app_config;

CREATE POLICY "app_config_write" ON app_config
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );
