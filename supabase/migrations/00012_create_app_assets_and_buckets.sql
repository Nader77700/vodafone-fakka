
-- إنشاء جدول الأصول المرئية الديناميكية
CREATE TABLE IF NOT EXISTS app_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_key TEXT NOT NULL UNIQUE,
  folder TEXT NOT NULL DEFAULT 'logos',
  file_name TEXT,
  public_url TEXT NOT NULL,
  mime_type TEXT,
  file_size BIGINT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- تفعيل RLS
ALTER TABLE app_assets ENABLE ROW LEVEL SECURITY;

-- إدراج الأصول الافتراضية
INSERT INTO app_assets (asset_key, folder, public_url, is_active) VALUES
  ('splash_logo',   'splash',  '', true),
  ('header_logo',   'logos',   '', true),
  ('welcome_icon',  'logos',   '', true),
  ('app_logo',      'logos',   '', true),
  ('home_banner',   'banners', '', true)
ON CONFLICT (asset_key) DO NOTHING;

-- فهرس
CREATE INDEX IF NOT EXISTS idx_app_assets_key ON app_assets(asset_key);
CREATE INDEX IF NOT EXISTS idx_app_assets_folder ON app_assets(folder);
