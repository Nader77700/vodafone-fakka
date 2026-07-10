
-- ═══════════════════════════════════════════════════════════
-- جدول باقات Vodafone RED
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS red_packages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  data_gb             INTEGER NOT NULL DEFAULT 0,
  minutes             INTEGER NOT NULL DEFAULT 0,
  base_price          NUMERIC(10,2) NOT NULL DEFAULT 0,
  discounted_price    NUMERIC(10,2) NULL,
  status              TEXT NOT NULL DEFAULT 'available'
                      CHECK (status IN ('available','coming_soon','featured','disabled')),
  sort_order          INTEGER NOT NULL DEFAULT 0,
  is_visible          BOOLEAN NOT NULL DEFAULT true,
  subscription_enabled BOOLEAN NOT NULL DEFAULT true,
  whatsapp_link       TEXT NOT NULL DEFAULT '',
  terms               JSONB NOT NULL DEFAULT '[]',
  features            JSONB NOT NULL DEFAULT '[]',
  requirements        JSONB NOT NULL DEFAULT '[]',
  subscription_method TEXT NOT NULL DEFAULT '',
  image_url           TEXT NOT NULL DEFAULT '',
  color_primary       TEXT NOT NULL DEFAULT '#E60000',
  color_secondary     TEXT NOT NULL DEFAULT '#B30000',
  badge_label         TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── RLS
ALTER TABLE red_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "red_packages_read_all"  ON red_packages FOR SELECT USING (true);
CREATE POLICY "red_packages_admin_all" ON red_packages FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- ── بيانات افتراضية
INSERT INTO red_packages
  (name, description, data_gb, minutes, base_price, discounted_price, status, sort_order, badge_label,
   terms, features, requirements, subscription_method, whatsapp_link)
VALUES
(
  'RED 20 جيجا',
  'باقة مثالية للاستخدام اليومي — إنترنت عالي السرعة ودقائق وافرة',
  20, 1500, 120.00, 99.00, 'available', 1, 'الأكثر طلباً',
  '["الخط يكون أفراد","يكون مسجل باسمك","عدم وجود مديونية أو سلف","توفير رقم الهاتف وباسورد أنا فودافون","عدم تغيير باسورد أنا فودافون طوال الاشتراك","لا يمكن خروج الخط من النظام قبل مرور 6 أشهر"]',
  '["20 جيجا إنترنت عالي السرعة","1500 دقيقة على جميع الشبكات","تجديد تلقائي شهري","دعم فني 24/7"]',
  '["خط فردي مسجل باسمك","رقم هاتف + باسورد أنا فودافون","عدم وجود مديونية"]',
  'التواصل عبر واتساب لتفعيل الباقة',
  'https://wa.me/201000000000?text=أريد الاشتراك في باقة RED 20 جيجا'
),
(
  'RED 30 جيجا',
  'باقة متوازنة للاستخدام المتوسط والمكالمات المطوّلة',
  30, 2000, 160.00, 129.00, 'featured', 2, 'الأفضل قيمة',
  '["الخط يكون أفراد","يكون مسجل باسمك","عدم وجود مديونية أو سلف","توفير رقم الهاتف وباسورد أنا فودافون","عدم تغيير باسورد أنا فودافون طوال الاشتراك","لا يمكن خروج الخط من النظام قبل مرور 6 أشهر"]',
  '["30 جيجا إنترنت عالي السرعة","2000 دقيقة على جميع الشبكات","تجديد تلقائي شهري","دعم فني 24/7","أولوية في خدمة العملاء"]',
  '["خط فردي مسجل باسمك","رقم هاتف + باسورد أنا فودافون","عدم وجود مديونية"]',
  'التواصل عبر واتساب لتفعيل الباقة',
  'https://wa.me/201000000000?text=أريد الاشتراك في باقة RED 30 جيجا'
),
(
  'RED 40 جيجا',
  'باقة للمستخدمين الجادين — إنترنت وفير ودقائق لا محدودة تقريباً',
  40, 3000, 200.00, 169.00, 'available', 3, 'ثقيل الاستخدام',
  '["الخط يكون أفراد","يكون مسجل باسمك","عدم وجود مديونية أو سلف","توفير رقم الهاتف وباسورد أنا فودافون","عدم تغيير باسورد أنا فودافون طوال الاشتراك","لا يمكن خروج الخط من النظام قبل مرور 6 أشهر"]',
  '["40 جيجا إنترنت عالي السرعة","3000 دقيقة على جميع الشبكات","تجديد تلقائي شهري","دعم فني 24/7","أولوية قصوى","مزايا RED الحصرية"]',
  '["خط فردي مسجل باسمك","رقم هاتف + باسورد أنا فودافون","عدم وجود مديونية"]',
  'التواصل عبر واتساب لتفعيل الباقة',
  'https://wa.me/201000000000?text=أريد الاشتراك في باقة RED 40 جيجا'
),
(
  'RED 50 جيجا',
  'الباقة الأقوى — لمن يستحق الأفضل دائماً',
  50, 6000, 260.00, 219.00, 'available', 4, 'Premium',
  '["الخط يكون أفراد","يكون مسجل باسمك","عدم وجود مديونية أو سلف","توفير رقم الهاتف وباسورد أنا فودافون","عدم تغيير باسورد أنا فودافون طوال الاشتراك","لا يمكن خروج الخط من النظام قبل مرور 6 أشهر"]',
  '["50 جيجا إنترنت عالي السرعة","6000 دقيقة على جميع الشبكات","تجديد تلقائي شهري","دعم VIP 24/7","أولوية قصوى","مزايا RED الحصرية","هدايا ومفاجآت شهرية"]',
  '["خط فردي مسجل باسمك","رقم هاتف + باسورد أنا فودافون","عدم وجود مديونية"]',
  'التواصل عبر واتساب لتفعيل الباقة',
  'https://wa.me/201000000000?text=أريد الاشتراك في باقة RED 50 جيجا'
);

-- ═══════════════════════════════════════════════════════════
-- جدول العروض والبانرات
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS promotions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  image_url         TEXT NOT NULL DEFAULT '',
  color_primary     TEXT NOT NULL DEFAULT '#E60000',
  color_secondary   TEXT NOT NULL DEFAULT '#B30000',
  icon              TEXT NOT NULL DEFAULT 'zap',
  sort_order        INTEGER NOT NULL DEFAULT 0,
  priority          INTEGER NOT NULL DEFAULT 0,
  start_date        TIMESTAMPTZ NULL,
  end_date          TIMESTAMPTZ NULL,
  cta_label         TEXT NOT NULL DEFAULT 'اكتشف الآن',
  internal_route    TEXT NOT NULL DEFAULT '',
  external_url      TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','scheduled','ended','draft')),
  display_frequency TEXT NOT NULL DEFAULT 'always'
                    CHECK (display_frequency IN ('always','once','daily','weekly','monthly')),
  dismiss_behavior  TEXT NOT NULL DEFAULT 'permanent'
                    CHECK (dismiss_behavior IN ('permanent','till_tomorrow','hours','always_show')),
  dismiss_hours     INTEGER NOT NULL DEFAULT 24,
  send_push         BOOLEAN NOT NULL DEFAULT false,
  push_sent         BOOLEAN NOT NULL DEFAULT false,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  show_on_home      BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── RLS
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promotions_read_active" ON promotions FOR SELECT USING (is_active = true);
CREATE POLICY "promotions_admin_all"   ON promotions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- ── جدول تتبع حالة مشاهدة العروض لكل مستخدم
CREATE TABLE IF NOT EXISTS promotion_views (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id  UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  view_count    INTEGER NOT NULL DEFAULT 1,
  last_viewed   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed     BOOLEAN NOT NULL DEFAULT false,
  dismissed_at  TIMESTAMPTZ NULL,
  UNIQUE(promotion_id, user_id)
);

ALTER TABLE promotion_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "promotion_views_own" ON promotion_views FOR ALL USING (user_id = auth.uid());
CREATE POLICY "promotion_views_admin" ON promotion_views FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));
