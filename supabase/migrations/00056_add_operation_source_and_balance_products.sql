
-- ══════════════════════════════════════════════════════════════════
-- 1. إضافة حقل operation_source في جدول operations
--    القيمة الافتراضية: 'vodafone_cash' — لا يؤثر على أي بيانات موجودة
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE operations
  ADD COLUMN IF NOT EXISTS operation_source text DEFAULT 'vodafone_cash';

-- ══════════════════════════════════════════════════════════════════
-- 2. جدول balance_products — منتجات نظام "الشحن من الرصيد"
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE balance_products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      text UNIQUE NOT NULL,
  name            text NOT NULL,
  display_name    text NOT NULL,
  category        text NOT NULL DEFAULT 'fakka',  -- fakka | mared
  price           numeric(10,2) NOT NULL,
  net_balance     numeric(10,2) NOT NULL DEFAULT 0,
  units           integer NOT NULL DEFAULT 0,
  product_type    text NOT NULL DEFAULT 'وحدة',   -- وحدة | دقايق | فليكس | سوشيال
  validity        text NOT NULL DEFAULT 'صالح 24 ساعة',
  is_visible      boolean NOT NULL DEFAULT true,
  is_enabled      boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  notes           text,
  usage_count     integer NOT NULL DEFAULT 0,
  success_count   integer NOT NULL DEFAULT 0,
  fail_count      integer NOT NULL DEFAULT 0,
  last_used_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- فهرس للترتيب
CREATE INDEX idx_balance_products_sort ON balance_products (sort_order, category);

-- Trigger: تحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_balance_products_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_balance_products_updated_at
BEFORE UPDATE ON balance_products
FOR EACH ROW EXECUTE FUNCTION update_balance_products_updated_at();

-- ══════════════════════════════════════════════════════════════════
-- 3. RLS على balance_products
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE balance_products ENABLE ROW LEVEL SECURITY;

-- مساعد SECURITY DEFINER لتجنب self-loop
CREATE OR REPLACE FUNCTION is_admin_for_balance()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
      AND is_active = true
  );
$$;

-- SELECT: المستخدمون المفعّلون يرون الكروت الظاهرة فقط
CREATE POLICY "balance_products_select_users"
ON balance_products FOR SELECT
TO authenticated
USING (is_visible = true AND is_enabled = true);

-- SELECT: الأدمن يرى الكل
CREATE POLICY "balance_products_select_admin"
ON balance_products FOR SELECT
TO authenticated
USING (is_admin_for_balance());

-- INSERT/UPDATE/DELETE: الأدمن فقط
CREATE POLICY "balance_products_insert_admin"
ON balance_products FOR INSERT
TO authenticated
WITH CHECK (is_admin_for_balance());

CREATE POLICY "balance_products_update_admin"
ON balance_products FOR UPDATE
TO authenticated
USING (is_admin_for_balance())
WITH CHECK (is_admin_for_balance());

CREATE POLICY "balance_products_delete_admin"
ON balance_products FOR DELETE
TO authenticated
USING (is_admin_for_balance());

-- anon: لا صلاحية
CREATE POLICY "balance_products_no_anon"
ON balance_products FOR SELECT
TO anon
USING (false);

-- ══════════════════════════════════════════════════════════════════
-- 4. Seed: بيانات الكروت الأولية من السكربت الأصلي
-- ══════════════════════════════════════════════════════════════════
INSERT INTO balance_products (product_id, name, display_name, category, price, net_balance, units, product_type, validity, sort_order) VALUES
  ('Fakka_2.5_Unite',     'فكة 2.5 جنيه - 45 وحدة',          'فكة 2.5 جنيه',       'fakka', 2.5,  1.75,  45,   'وحدة', 'صالح 24 ساعة', 10),
  ('Fakka_4.25_Unite',    'فكة 4.25 جنيه - 190 وحدة',         'فكة 4.25 جنيه',      'fakka', 4.25, 2.97,  190,  'وحدة', 'صالح 24 ساعة', 20),
  ('Fakka_5_Unite',       'فكة 5 جنيه - 80 وحدة',             'فكة 5 جنيه',         'fakka', 5,    3.50,  80,   'وحدة', 'صالح 24 ساعة', 30),
  ('Fakka_6_NewUnite',    'فكة 6 جنيه - 225 وحدة',            'فكة 6 جنيه',         'fakka', 6,    4.20,  225,  'وحدة', 'صالح 24 ساعة', 40),
  ('Fakka_7_Unite',       'فكة 7 جنيه - 300 وحدة',            'فكة 7 جنيه',         'fakka', 7,    4.90,  300,  'وحدة', 'صالح 3 أيام',  50),
  ('Fakka_9_Unite',       'فكة 9 جنيه - 400 وحدة',            'فكة 9 جنيه',         'fakka', 9,    6.30,  400,  'وحدة', 'صالح 4 أيام',  60),
  ('Fakka_10_Unite',      'فكة 10 جنيه - 450 وحدة',           'فكة 10 جنيه',        'fakka', 10,   7.00,  450,  'وحدة', 'صالح 7 أيام',  70),
  ('Fakka_10_NewUnite',   'فكة 10 جنيه (new) - 450 وحدة',     'فكة 10 جنيه (new)',  'fakka', 10,   7.00,  450,  'وحدة', 'صالح 7 أيام',  75),
  ('Fakka_10.5_Unite',    'فكة 10.5 جنيه - 400 وحدة',         'فكة 10.5 جنيه',      'fakka', 10.5, 7.35,  400,  'وحدة', 'صالح 7 أيام',  80),
  ('Fakka_11.5_Unite',    'فكة 11.5 جنيه - 450 وحدة',         'فكة 11.5 جنيه',      'fakka', 11.5, 8.05,  450,  'وحدة', 'صالح 7 أيام',  90),
  ('Fakka_12_Unite',      'فكة 12 جنيه - 450 وحدة',           'فكة 12 جنيه',        'fakka', 12,   8.40,  450,  'وحدة', 'صالح 7 أيام',  100),
  ('Fakka_12.5_Unite',    'فكة 12.5 جنيه - 425 وحدة',         'فكة 12.5 جنيه',      'fakka', 12.5, 8.75,  425,  'وحدة', 'صالح 7 أيام',  110),
  ('Fakka_13_Unite',      'فكة 13 جنيه - 650 وحدة',           'فكة 13 جنيه',        'fakka', 13,   9.10,  650,  'وحدة', 'صالح 7 أيام',  120),
  ('Fakka_13.5_Unite',    'فكة 13.5 جنيه - 650 وحدة',         'فكة 13.5 جنيه',      'fakka', 13.5, 9.45,  650,  'وحدة', 'صالح 7 أيام',  130),
  ('Fakka_15_Unite',      'فكة 15 جنيه - 625 وحدة',           'فكة 15 جنيه',        'fakka', 15,   10.50, 625,  'وحدة', 'صالح 7 أيام',  140),
  ('Fakka_15_NewUnite',   'فكة 15 جنيه (new) - 625 وحدة',     'فكة 15 جنيه (new)',  'fakka', 15,   10.50, 625,  'وحدة', 'صالح 7 أيام',  145),
  ('Fakka_15.5_Unite',    'فكة 15.5 جنيه - 625 وحدة',         'فكة 15.5 جنيه',      'fakka', 15.5, 10.85, 625,  'وحدة', 'صالح 7 أيام',  150),
  ('Fakka_16.5_Unite',    'فكة 16.5 جنيه - 425 وحدة',         'فكة 16.5 جنيه',      'fakka', 16.5, 11.55, 425,  'وحدة', 'صالح 6 أيام',  160),
  ('Fakka_17.5_Unite',    'فكة 17.5 جنيه - 650 وحدة',         'فكة 17.5 جنيه',      'fakka', 17.5, 12.25, 650,  'وحدة', 'صالح 10 أيام', 170),
  ('Fakka_19.5_NewUnite', 'فكة 19.5 جنيه - 550 وحدة',         'فكة 19.5 جنيه',      'fakka', 19.5, 13.65, 550,  'وحدة', 'صالح 10 أيام', 180),
  ('Fakka_20_Unite',      'فكة 20 جنيه - 750 وحدة',           'فكة 20 جنيه',        'fakka', 20,   14.00, 750,  'وحدة', 'صالح 10 أيام', 190),
  ('Fakka_26_Unite',      'فكة 26 جنيه - 1300 وحدة',          'فكة 26 جنيه',        'fakka', 26,   18.20, 1300, 'وحدة', 'صالح 10 أيام', 200),
  ('Mared_10_Minuts',     'مارد 10 دقايق - 450 وحدة',         'مارد دقايق',         'mared', 10,   0,     450,  'دقايق',  'صالح 7 أيام', 210),
  ('Mared_10_Flexs',      'مارد 10 فليكس - 450 وحدة',         'مارد فليكس',         'mared', 10,   0,     450,  'فليكس',  'صالح 7 أيام', 220),
  ('Mared_10_Social',     'مارد 10 سوشيال - 450 وحدة',        'مارد سوشيال',        'mared', 10,   0,     450,  'سوشيال', 'صالح 7 أيام', 230);
