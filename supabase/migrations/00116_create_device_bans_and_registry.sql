
-- ══ جدول حظر الأجهزة ══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS device_bans (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- معرفات الجهاز (يمكن حظر بأي منهم أو كليهما)
  device_fp         text,           -- بصمة الجهاز (localStorage / hardware hash)
  device_id         text,           -- Android Device ID (ثابت حتى factory reset)
  hardware_hash     text,           -- بصمة الأجهزة المحسوبة (canvas/webgl/screen)
  -- بيانات الحظر
  ban_reason        text NOT NULL DEFAULT 'تعدد الحسابات',
  ban_type          text NOT NULL DEFAULT 'both',  -- 'device_fp' | 'device_id' | 'hardware' | 'both'
  is_permanent      boolean NOT NULL DEFAULT true,
  is_active         boolean NOT NULL DEFAULT true,
  -- المستخدمون المرتبطون
  associated_user_ids   text[]  DEFAULT '{}',
  associated_usernames  text[]  DEFAULT '{}',
  -- معلومات الأدمن
  banned_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  banned_by_name    text,
  banned_at         timestamptz NOT NULL DEFAULT now(),
  unbanned_at       timestamptz,
  unbanned_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes             text,
  -- إضافية
  ip_address        text,
  device_model      text,
  platform          text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_bans_device_fp    ON device_bans(device_fp)    WHERE device_fp    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_bans_device_id    ON device_bans(device_id)    WHERE device_id    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_bans_hardware     ON device_bans(hardware_hash) WHERE hardware_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_bans_active       ON device_bans(is_active);

-- ══ جدول سجل الأجهزة (لكشف الحسابات المكررة) ══════════════════════════
CREATE TABLE IF NOT EXISTS device_registry (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_fp       text,
  device_id       text,
  hardware_hash   text,
  ip_address      text,
  device_model    text,
  platform        text,
  app_version     text,
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  seen_count      integer NOT NULL DEFAULT 1,
  UNIQUE (user_id, device_fp)
);

CREATE INDEX IF NOT EXISTS idx_device_registry_user     ON device_registry(user_id);
CREATE INDEX IF NOT EXISTS idx_device_registry_fp       ON device_registry(device_fp) WHERE device_fp IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_registry_device_id ON device_registry(device_id) WHERE device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_registry_hw       ON device_registry(hardware_hash) WHERE hardware_hash IS NOT NULL;

-- ══ RLS ════════════════════════════════════════════════════════════════
ALTER TABLE device_bans     ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_registry ENABLE ROW LEVEL SECURITY;

-- فقط الـ service role يقدر يقرأ/يكتب (Edge Functions)
CREATE POLICY "service_only_bans"     ON device_bans     FOR ALL USING (false);
CREATE POLICY "service_only_registry" ON device_registry FOR ALL USING (false);

-- ══ دالة للبحث عن الحسابات المكررة بسهولة ═════════════════════════════
CREATE OR REPLACE FUNCTION get_duplicate_device_groups()
RETURNS TABLE (
  device_fp       text,
  device_id       text,
  hardware_hash   text,
  user_count      bigint,
  user_ids        text[],
  usernames       text[],
  phones          text[],
  first_seen      timestamptz,
  last_seen       timestamptz
)
LANGUAGE sql SECURITY DEFINER
AS $$
  -- تجميع من device_registry
  SELECT
    dr.device_fp,
    MAX(dr.device_id)    AS device_id,
    MAX(dr.hardware_hash) AS hardware_hash,
    COUNT(DISTINCT dr.user_id) AS user_count,
    ARRAY_AGG(DISTINCT dr.user_id::text)  AS user_ids,
    ARRAY_AGG(DISTINCT p.username)        AS usernames,
    ARRAY_AGG(DISTINCT p.phone)           AS phones,
    MIN(dr.first_seen_at) AS first_seen,
    MAX(dr.last_seen_at)  AS last_seen
  FROM device_registry dr
  LEFT JOIN profiles p ON p.id = dr.user_id
  WHERE dr.device_fp IS NOT NULL
  GROUP BY dr.device_fp
  HAVING COUNT(DISTINCT dr.user_id) > 1
  UNION ALL
  -- تجميع من profiles مباشرة (بيانات قديمة قبل device_registry)
  SELECT
    p.device_fp,
    MAX(p.device_id)     AS device_id,
    NULL                 AS hardware_hash,
    COUNT(*)             AS user_count,
    ARRAY_AGG(DISTINCT p.id::text)     AS user_ids,
    ARRAY_AGG(DISTINCT p.username)     AS usernames,
    ARRAY_AGG(DISTINCT p.phone)        AS phones,
    MIN(p.created_at)    AS first_seen,
    MAX(p.updated_at)    AS last_seen
  FROM profiles p
  WHERE p.device_fp IS NOT NULL
  GROUP BY p.device_fp
  HAVING COUNT(*) > 1
    AND p.device_fp NOT IN (SELECT DISTINCT device_fp FROM device_registry WHERE device_fp IS NOT NULL)
  ORDER BY user_count DESC;
$$;
