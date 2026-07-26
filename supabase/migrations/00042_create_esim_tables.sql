-- eSIM Offers
CREATE TABLE esim_offers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  image         TEXT,
  price         INTEGER NOT NULL DEFAULT 0,
  old_price     INTEGER,
  discount      INTEGER,
  data_size     TEXT NOT NULL DEFAULT '',
  duration      TEXT NOT NULL DEFAULT '30 يوم',
  status        TEXT NOT NULL DEFAULT 'available',
  warranty      BOOLEAN NOT NULL DEFAULT false,
  speed         TEXT NOT NULL DEFAULT '4G/5G',
  country       TEXT NOT NULL DEFAULT 'مصر',
  features      TEXT[] DEFAULT '{}',
  supported_networks TEXT[] DEFAULT '{}',
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT true,
  order_index   INTEGER NOT NULL DEFAULT 0,
  is_featured   BOOLEAN NOT NULL DEFAULT false,
  hidden        BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- eSIM Settings (singleton row)
CREATE TABLE esim_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled             BOOLEAN NOT NULL DEFAULT true,
  section_status      TEXT NOT NULL DEFAULT 'active',
  section_title       TEXT NOT NULL DEFAULT '📶 شرائح eSIM',
  section_description TEXT NOT NULL DEFAULT 'شرائح eSIM إلكترونية جاهزة للتفعيل فوراً',
  maintenance_message TEXT NOT NULL DEFAULT 'نعمل حالياً على تجهيز أفضل عروض شرائح eSIM، يرجى العودة لاحقاً.',
  coming_soon_message TEXT NOT NULL DEFAULT 'ستتوفر العروض قريباً.',
  empty_message       TEXT NOT NULL DEFAULT 'سيتم إضافة عروض جديدة قريباً.',
  whatsapp_number     TEXT NOT NULL DEFAULT '201222692182',
  show_prices         BOOLEAN NOT NULL DEFAULT true,
  show_discounts      BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE esim_offers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE esim_settings ENABLE ROW LEVEL SECURITY;

-- esim_offers: everyone reads visible offers; only admins write
CREATE POLICY "esim_offers_read_public" ON esim_offers
  FOR SELECT USING (true);

CREATE POLICY "esim_offers_write_admin" ON esim_offers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- esim_settings: everyone reads; only admins write
CREATE POLICY "esim_settings_read_public" ON esim_settings
  FOR SELECT USING (true);

CREATE POLICY "esim_settings_write_admin" ON esim_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- Seed settings row
INSERT INTO esim_settings (
  enabled, section_status, section_title, section_description,
  whatsapp_number, show_prices, show_discounts
) VALUES (
  true, 'active', '📶 شرائح eSIM',
  'احصل على شرائح eSIM إلكترونية جاهزة للتفعيل فوراً بسرعات عالية، بدون VPN، مع أفضل تغطية وأداء داخل مصر.',
  '201222692182', true, true
);

-- Seed 2 default offers
INSERT INTO esim_offers (title, description, price, old_price, discount, data_size, duration, status, warranty, speed, country, features, supported_networks, order_index, is_featured)
VALUES
(
  'eSIM 10GB',
  'شريحة eSIM إلكترونية تمنحك 10 جيجابايت لمدة شهر بسرعة عالية بدون VPN وتعمل بأفضل أداء داخل مصر.',
  170, 220, 23, '10GB', '30 يوم', 'available', true, '4G/5G', 'مصر',
  ARRAY['بدون VPN','تفعيل فوري','تغطية شاملة','ضمان الجودة'],
  ARRAY['Vodafone EG','Orange EG','Etisalat EG'],
  0, false
),
(
  'eSIM 20GB',
  'شريحة eSIM إلكترونية تمنحك 20 جيجابايت لمدة شهر بسرعة عالية بدون VPN وتعمل بأفضل أداء داخل مصر.',
  300, 380, 21, '20GB', '30 يوم', 'available', true, '4G/5G', 'مصر',
  ARRAY['بدون VPN','تفعيل فوري','تغطية شاملة','ضمان الجودة'],
  ARRAY['Vodafone EG','Orange EG','Etisalat EG'],
  1, true
);