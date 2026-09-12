
-- ═══════════════════════════════════════════════════════════
--  مركز العروض والتحديثات — Content Cards System
-- ═══════════════════════════════════════════════════════════

-- ── 1. content_cards ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_cards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_type       text NOT NULL CHECK (card_type IN ('offer','feature','section','update','announcement','custom')),
  template_name   text,                  -- اسم القالب المخصص عند card_type = 'custom'
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','active','scheduled','disabled','ended')),

  -- ── محتوى مشترك ────────────────────────────────
  title           text NOT NULL,
  description     text,
  badge_text      text,                  -- نص الـ Badge (جديد / تحديث / عرض...)
  badge_color     text DEFAULT '#E60000',
  icon_name       text,                  -- اسم أيقونة lucide
  image_url       text,

  -- ── حقول خاصة بـ Offer ────────────────────────
  old_price       text,
  new_price       text,
  discount_value  text,                  -- نسبة أو قيمة
  offer_duration  text,                  -- مثلاً "3 أيام فقط"
  details         text,

  -- ── حقول خاصة بـ Feature / Section / Custom ──
  feature_points  jsonb DEFAULT '[]'::jsonb,   -- قائمة النقاط
  section_route   text,                        -- المسار المباشر للقسم

  -- ── حقول خاصة بـ Update ───────────────────────
  version_name    text,
  changelog       jsonb DEFAULT '[]'::jsonb,   -- قائمة التغييرات

  -- ── CTA ───────────────────────────────────────
  cta_label       text DEFAULT 'اكتشف الآن',
  cta_type        text DEFAULT 'none'
                  CHECK (cta_type IN ('internal','whatsapp','external','none')),
  cta_destination text,                  -- route / رقم / URL حسب cta_type

  -- ── جدولة وتكرار ──────────────────────────────
  start_date      timestamptz,
  end_date        timestamptz,
  repeat_policy   text DEFAULT 'once'
                  CHECK (repeat_policy IN ('once','every_open','hourly','daily','weekly','monthly')),
  repeat_value    integer DEFAULT 1,     -- X ساعات / أيام / أسابيع / أشهر
  priority        integer DEFAULT 0,
  sort_order      integer DEFAULT 0,

  -- ── حالة تفعيل ────────────────────────────────
  is_active       boolean DEFAULT true,
  system_enabled  boolean DEFAULT true,  -- تفعيل/تعطيل النظام كله

  -- ── Versioning ────────────────────────────────
  revision        integer DEFAULT 1,
  parent_id       uuid REFERENCES content_cards(id) ON DELETE SET NULL,

  -- ── Custom Template config ────────────────────
  custom_fields   jsonb DEFAULT '{}'::jsonb,  -- config القالب المخصص
  field_values    jsonb DEFAULT '{}'::jsonb,  -- قيم الحقول عند الإنشاء

  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ── 2. card_views — seen/dismissed لكل مستخدم ──────────────
CREATE TABLE IF NOT EXISTS card_views (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id         uuid NOT NULL REFERENCES content_cards(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_revision   integer DEFAULT 1,   -- revision الكارت عند المشاهدة
  view_count      integer DEFAULT 1,
  dismissed       boolean DEFAULT false,
  last_viewed_at  timestamptz DEFAULT now(),
  last_dismissed_at timestamptz,
  UNIQUE(card_id, user_id)
);

-- ── 3. card_templates — قوالب مخصصة من Admin ───────────────
CREATE TABLE IF NOT EXISTS card_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  description     text,
  fields_config   jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active       boolean DEFAULT true,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_content_cards_status     ON content_cards(status);
CREATE INDEX IF NOT EXISTS idx_content_cards_active     ON content_cards(is_active);
CREATE INDEX IF NOT EXISTS idx_content_cards_priority   ON content_cards(priority DESC);
CREATE INDEX IF NOT EXISTS idx_content_cards_type       ON content_cards(card_type);
CREATE INDEX IF NOT EXISTS idx_card_views_user          ON card_views(user_id);
CREATE INDEX IF NOT EXISTS idx_card_views_card          ON card_views(card_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE content_cards   ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_views       ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_templates   ENABLE ROW LEVEL SECURITY;

-- content_cards: Admin يقرأ ويكتب، المستخدم يقرأ النشطة فقط
CREATE POLICY "admin_all_content_cards" ON content_cards
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','super_admin')
    )
  );

CREATE POLICY "user_read_active_content_cards" ON content_cards
  FOR SELECT USING (
    is_active = true
    AND status = 'active'
    AND system_enabled = true
  );

-- card_views: كل مستخدم يقرأ ويكتب سجله فقط
CREATE POLICY "user_own_card_views" ON card_views
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "admin_all_card_views" ON card_views
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','super_admin')
    )
  );

-- card_templates: Admin فقط
CREATE POLICY "admin_all_card_templates" ON card_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','super_admin')
    )
  );

-- ── RPC: upsert_card_view ─────────────────────────────────────
CREATE OR REPLACE FUNCTION upsert_card_view(
  p_card_id    uuid,
  p_user_id    uuid,
  p_revision   integer DEFAULT 1,
  p_dismissed  boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO card_views (card_id, user_id, card_revision, view_count, dismissed, last_viewed_at, last_dismissed_at)
  VALUES (p_card_id, p_user_id, p_revision, 1,
          p_dismissed,
          now(),
          CASE WHEN p_dismissed THEN now() ELSE NULL END)
  ON CONFLICT (card_id, user_id) DO UPDATE SET
    view_count       = card_views.view_count + 1,
    dismissed        = CASE WHEN p_dismissed THEN true ELSE card_views.dismissed END,
    last_viewed_at   = now(),
    last_dismissed_at = CASE WHEN p_dismissed THEN now() ELSE card_views.last_dismissed_at END,
    card_revision    = p_revision;
END;
$$;

-- ── RPC: reset_card_view_for_new_revision ────────────────────
CREATE OR REPLACE FUNCTION reset_card_view_for_revision(
  p_card_id  uuid,
  p_revision integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE card_views
  SET dismissed = false,
      view_count = 0,
      last_viewed_at = now(),
      card_revision = p_revision
  WHERE card_id = p_card_id
    AND card_revision < p_revision;
END;
$$;
