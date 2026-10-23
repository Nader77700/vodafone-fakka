CREATE TABLE IF NOT EXISTS vip_temporary_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT 'رابط مؤقت لقسم اتصالات VIP',
  created_by UUID REFERENCES core_profiles(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  burned_at TIMESTAMPTZ,
  burn_reason TEXT,
  expires_at TIMESTAMPTZ,
  view_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  access_mode TEXT NOT NULL DEFAULT 'view_and_operate',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_vip_temp_links_token ON vip_temporary_links(token);
CREATE INDEX IF NOT EXISTS idx_vip_temp_links_active ON vip_temporary_links(is_active);

-- Enable RLS
ALTER TABLE vip_temporary_links ENABLE ROW LEVEL SECURITY;

-- Allow public read of non-burned, non-expired links
CREATE POLICY "Public can view valid active links"
  ON vip_temporary_links FOR SELECT
  USING (
    is_active = true 
    AND burned_at IS NULL 
    AND (expires_at IS NULL OR expires_at > NOW())
  );

-- Allow authenticated users to manage all links
CREATE POLICY "Auth users can manage links"
  ON vip_temporary_links FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Function to burn link
CREATE OR REPLACE FUNCTION burn_vip_temporary_link(link_token TEXT, reason TEXT DEFAULT 'تم الحرق بواسطة المالك')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_link vip_temporary_links%ROWTYPE;
BEGIN
  UPDATE vip_temporary_links
  SET is_active = false,
      burned_at = NOW(),
      burn_reason = reason,
      updated_at = NOW()
  WHERE token = link_token
  RETURNING * INTO v_link;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الرابط غير موجود');
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'تم حرق الرابط بنجاح وإلغاء صلاحيته فوراً', 'burned_at', v_link.burned_at);
END;
$$;

-- Function to access and increment view count
CREATE OR REPLACE FUNCTION access_vip_temporary_link(link_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_link vip_temporary_links%ROWTYPE;
BEGIN
  SELECT * INTO v_link FROM vip_temporary_links WHERE token = link_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'status', 'not_found', 'message', 'الرابط غير موجود أو غير صالح');
  END IF;

  IF v_link.burned_at IS NOT NULL OR NOT v_link.is_active THEN
    RETURN jsonb_build_object('valid', false, 'status', 'burned', 'message', 'تم حرق هذا الرابط المؤقت وإلغاؤه من قبل المالك', 'burned_at', v_link.burned_at, 'burn_reason', v_link.burn_reason);
  END IF;

  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < NOW() THEN
    RETURN jsonb_build_object('valid', false, 'status', 'expired', 'message', 'انتهت الصلاحية الزمنية المحددة لهذا الرابط المؤقت', 'expires_at', v_link.expires_at);
  END IF;

  UPDATE vip_temporary_links
  SET view_count = view_count + 1,
      last_accessed_at = NOW(),
      updated_at = NOW()
  WHERE token = link_token;

  RETURN jsonb_build_object(
    'valid', true,
    'status', 'active',
    'title', v_link.title,
    'access_mode', v_link.access_mode,
    'expires_at', v_link.expires_at,
    'view_count', v_link.view_count + 1,
    'created_at', v_link.created_at
  );
END;
$$;
