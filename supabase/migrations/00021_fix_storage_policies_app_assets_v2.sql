
-- سياسات التخزين لـ app-assets (بدون ALTER TABLE)
DROP POLICY IF EXISTS "app_assets_public_read"   ON storage.objects;
DROP POLICY IF EXISTS "app_assets_auth_insert"   ON storage.objects;
DROP POLICY IF EXISTS "app_assets_auth_update"   ON storage.objects;
DROP POLICY IF EXISTS "app_assets_auth_delete"   ON storage.objects;

-- قراءة عامة
CREATE POLICY "app_assets_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'app-assets');

-- رفع للمصادقين
CREATE POLICY "app_assets_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'app-assets' AND auth.role() = 'authenticated');

-- تحديث للمصادقين
CREATE POLICY "app_assets_auth_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'app-assets' AND auth.role() = 'authenticated');

-- حذف للمصادقين
CREATE POLICY "app_assets_auth_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'app-assets' AND auth.role() = 'authenticated');

-- إصلاح RLS على جدول app_assets
ALTER TABLE app_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assets_select_public ON app_assets;
DROP POLICY IF EXISTS assets_insert_admin  ON app_assets;
DROP POLICY IF EXISTS assets_update_admin  ON app_assets;
DROP POLICY IF EXISTS assets_delete_admin  ON app_assets;

CREATE POLICY assets_select_public ON app_assets
  FOR SELECT USING (true);

CREATE POLICY assets_insert_admin ON app_assets
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY assets_update_admin ON app_assets
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY assets_delete_admin ON app_assets
  FOR DELETE USING (auth.role() = 'authenticated');
