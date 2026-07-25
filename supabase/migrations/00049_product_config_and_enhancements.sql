
-- ══════════════════════════════════════════════════════════════
-- 1. product_config — نظام إدارة الكروت الديناميكي
-- ══════════════════════════════════════════════════════════════
CREATE TYPE product_status AS ENUM (
  'active',
  'maintenance',
  'development',
  'unavailable',
  'disabled_execution'
);

CREATE TABLE product_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      text NOT NULL UNIQUE,   -- matches VodafoneProduct.id
  display_name    text NOT NULL,
  category        text NOT NULL DEFAULT 'fakka',
  is_visible      boolean NOT NULL DEFAULT true,
  is_enabled      boolean NOT NULL DEFAULT true,
  status          product_status NOT NULL DEFAULT 'active',
  price           numeric(10,2),
  units           integer,
  validity        text,
  net_balance     numeric(10,2),
  profit_margin   numeric(10,2),
  sort_order      integer NOT NULL DEFAULT 0,
  api_override    jsonb,                   -- إعدادات API خاصة اختيارية
  notes           text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- فهرس للأداء
CREATE INDEX idx_product_config_product_id ON product_config(product_id);
CREATE INDEX idx_product_config_visible ON product_config(is_visible, is_enabled, status);

-- RLS
ALTER TABLE product_config ENABLE ROW LEVEL SECURITY;

-- المستخدمون المسجلون يقرؤون فقط
CREATE POLICY "authenticated_read_product_config"
  ON product_config FOR SELECT
  TO authenticated
  USING (true);

-- الأدمن فقط يكتب — عبر SECURITY DEFINER helper
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
END;
$$;

CREATE POLICY "admin_manage_product_config"
  ON product_config FOR ALL
  TO authenticated
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

-- Trigger: updated_at تلقائي
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_config_updated_at
  BEFORE UPDATE ON product_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ══════════════════════════════════════════════════════════════
-- 2. بيانات الكروت الابتدائية (seed من products.ts)
-- ══════════════════════════════════════════════════════════════
INSERT INTO product_config (product_id, display_name, category, price, units, validity, net_balance, profit_margin, sort_order) VALUES
  ('Fakka_2.5_Unite',     'فكة 2.5 جنيه',      'fakka', 2.5,  45,   'صالح 24 ساعة',  1.75,  0.75,  1),
  ('Fakka_4.25_Unite',    'فكة 4.25 جنيه',     'fakka', 4.25, 190,  'صالح 24 ساعة',  2.97,  1.28,  2),
  ('Fakka_5_Unite',       'فكة 5 جنيه',        'fakka', 5,    80,   'صالح 24 ساعة',  3.50,  1.50,  3),
  ('Fakka_6_NewUnite',    'فكة 6 جنيه',        'fakka', 6,    225,  'صالح 24 ساعة',  4.20,  1.80,  4),
  ('Fakka_7_Unite',       'فكة 7 جنيه',        'fakka', 7,    300,  'صالح 3 أيام',   4.90,  2.10,  5),
  ('Fakka_9_Unite',       'فكة 9 جنيه',        'fakka', 9,    400,  'صالح 4 أيام',   6.30,  2.70,  6),
  ('Fakka_10_Unite',      'فكة 10 جنيه',       'fakka', 10,   450,  'صالح 7 أيام',   7.00,  3.00,  7),
  ('Fakka_10_NewUnite',   'فكة 10 جنيه (new)', 'fakka', 10,   450,  'صالح 7 أيام',   7.00,  3.00,  8),
  ('Fakka_10.5_Unite',    'فكة 10.5 جنيه',     'fakka', 10.5, 400,  'صالح 7 أيام',   7.35,  3.15,  9),
  ('Fakka_11.5_Unite',    'فكة 11.5 جنيه',     'fakka', 11.5, 450,  'صالح 7 أيام',   8.05,  3.45,  10),
  ('Fakka_12_Unite',      'فكة 12 جنيه',       'fakka', 12,   450,  'صالح 7 أيام',   8.40,  3.60,  11),
  ('Fakka_12.5_Unite',    'فكة 12.5 جنيه',     'fakka', 12.5, 425,  'صالح 7 أيام',   8.75,  3.75,  12),
  ('Fakka_13_Unite',      'فكة 13 جنيه',       'fakka', 13,   650,  'صالح 7 أيام',   9.10,  3.90,  13),
  ('Fakka_13.5_Unite',    'فكة 13.5 جنيه',     'fakka', 13.5, 650,  'صالح 7 أيام',   9.45,  4.05,  14),
  ('Fakka_15_Unite',      'فكة 15 جنيه',       'fakka', 15,   625,  'صالح 7 أيام',   10.50, 4.50,  15),
  ('Fakka_15_NewUnite',   'فكة 15 جنيه (new)', 'fakka', 15,   625,  'صالح 7 أيام',   10.50, 4.50,  16),
  ('Fakka_15.5_Unite',    'فكة 15.5 جنيه',     'fakka', 15.5, 625,  'صالح 7 أيام',   10.85, 4.65,  17),
  ('Fakka_16.5_Unite',    'فكة 16.5 جنيه',     'fakka', 16.5, 425,  'صالح 6 أيام',   11.55, 4.95,  18),
  ('Fakka_17.5_Unite',    'فكة 17.5 جنيه',     'fakka', 17.5, 650,  'صالح 10 أيام',  12.25, 5.25,  19),
  ('Fakka_19.5_NewUnite', 'فكة 19.5 جنيه',     'fakka', 19.5, 550,  'صالح 10 أيام',  13.65, 5.85,  20),
  ('Fakka_20_Unite',      'فكة 20 جنيه',       'fakka', 20,   750,  'صالح 10 أيام',  14.00, 6.00,  21),
  ('Fakka_26_Unite',      'فكة 26 جنيه',       'fakka', 26,   1300, 'صالح 10 أيام',  18.20, 7.80,  22),
  ('Mared_10_Minuts',     'مارد دقايق',        'mared', 10,   450,  'صالح 7 أيام',   0,     0,     23),
  ('Mared_10_Flexs',      'مارد فليكس',        'mared', 10,   450,  'صالح 7 أيام',   0,     0,     24),
  ('Mared_10_Social',     'مارد سوشيال',       'mared', 10,   450,  'صالح 7 أيام',   0,     0,     25)
ON CONFLICT (product_id) DO NOTHING;

-- كارت 26 جنيه: تعطيل تنفيذ (موقف مؤقتاً)
UPDATE product_config SET status = 'disabled_execution' WHERE product_id = 'Fakka_26_Unite';

-- ══════════════════════════════════════════════════════════════
-- 3. RPC: get_product_config — يعيد جميع الكروت المرئية
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_product_config()
RETURNS TABLE (
  product_id    text,
  display_name  text,
  category      text,
  is_visible    boolean,
  is_enabled    boolean,
  status        product_status,
  price         numeric,
  units         integer,
  validity      text,
  net_balance   numeric,
  profit_margin numeric,
  sort_order    integer,
  api_override  jsonb,
  notes         text,
  updated_at    timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT product_id, display_name, category, is_visible, is_enabled, status,
         price, units, validity, net_balance, profit_margin, sort_order,
         api_override, notes, updated_at
  FROM product_config
  ORDER BY sort_order ASC;
$$;

-- ══════════════════════════════════════════════════════════════
-- 4. RPC: update_product_config — الأدمن يعدّل إعدادات كارت
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_product_config(
  p_product_id    text,
  p_is_visible    boolean DEFAULT NULL,
  p_is_enabled    boolean DEFAULT NULL,
  p_status        product_status DEFAULT NULL,
  p_price         numeric DEFAULT NULL,
  p_units         integer DEFAULT NULL,
  p_validity      text DEFAULT NULL,
  p_net_balance   numeric DEFAULT NULL,
  p_profit_margin numeric DEFAULT NULL,
  p_sort_order    integer DEFAULT NULL,
  p_api_override  jsonb DEFAULT NULL,
  p_notes         text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin_user() THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;

  UPDATE product_config SET
    is_visible    = COALESCE(p_is_visible,    is_visible),
    is_enabled    = COALESCE(p_is_enabled,    is_enabled),
    status        = COALESCE(p_status,        status),
    price         = COALESCE(p_price,         price),
    units         = COALESCE(p_units,         units),
    validity      = COALESCE(p_validity,      validity),
    net_balance   = COALESCE(p_net_balance,   net_balance),
    profit_margin = COALESCE(p_profit_margin, profit_margin),
    sort_order    = COALESCE(p_sort_order,    sort_order),
    api_override  = COALESCE(p_api_override,  api_override),
    notes         = COALESCE(p_notes,         notes),
    updated_by    = auth.uid()
  WHERE product_id = p_product_id;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 5. Notifications: تنظيف تلقائي للإشعارات القديمة
-- ══════════════════════════════════════════════════════════════
-- RPC يحذف إشعارات المستخدم الأقدم من 30 يوماً
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM notifications
  WHERE created_at < now() - INTERVAL '30 days'
    AND user_id IS NOT NULL;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 6. RPC: check_notification_seen — منع تكرار الإشعارات
-- ══════════════════════════════════════════════════════════════
-- جدول لتتبع الإشعارات المعروضة (deduplication)
CREATE TABLE notification_seen (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notif_key   text NOT NULL,  -- مفتاح فريد للإشعار (event_type + reference_id)
  seen_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, notif_key)
);

CREATE INDEX idx_notification_seen_user ON notification_seen(user_id);

ALTER TABLE notification_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_notification_seen"
  ON notification_seen FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
