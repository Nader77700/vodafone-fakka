
-- ══════════════════════════════════════════════════
-- PHASE 5: Fix RLS on app_assets for admin writes
-- ══════════════════════════════════════════════════

-- Drop existing policies if any (be explicit)
DROP POLICY IF EXISTS "admin_manage_assets" ON public.app_assets;
DROP POLICY IF EXISTS "anyone_read_active_assets" ON public.app_assets;
DROP POLICY IF EXISTS "assets_select_public" ON public.app_assets;
DROP POLICY IF EXISTS "assets_upsert_admin" ON public.app_assets;
DROP POLICY IF EXISTS "assets_delete_admin" ON public.app_assets;

-- Allow anyone to read active assets (needed for splash/logo display)
CREATE POLICY "assets_select_public"
  ON public.app_assets FOR SELECT
  USING (is_active = true);

-- Allow admin/super_admin to insert assets
CREATE POLICY "assets_insert_admin"
  ON public.app_assets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- Allow admin/super_admin to update assets
CREATE POLICY "assets_update_admin"
  ON public.app_assets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- Allow admin/super_admin to delete assets
CREATE POLICY "assets_delete_admin"
  ON public.app_assets FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- ══════════════════════════════════════════════════
-- PHASE 4+6: Add splash_image asset key if not present
-- ══════════════════════════════════════════════════
INSERT INTO public.app_assets (asset_key, folder, public_url, is_active, updated_at)
VALUES ('splash_image', 'splash', '', true, now())
ON CONFLICT (asset_key) DO NOTHING;
