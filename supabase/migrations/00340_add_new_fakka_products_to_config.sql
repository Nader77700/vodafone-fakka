
-- إضافة الكروت الجديدة في product_config بـ sort_order سالب لتظهر في الأعلى
INSERT INTO product_config (product_id, display_name, category, is_visible, is_enabled, status, price, units, validity, net_balance, profit_margin, sort_order, notes)
VALUES
  ('NewFakka_5_Unite',      'فكة 5 جنيه (جديد)',      'fakka', true, true, 'active',  5.00,  80,  'صالح 2 أيام',  3.50,  1.50, -60, 'كارت جديد — صيف 2026'),
  ('Fakka_15_Unite_v2',     'فكة 15 جنيه (جديد)',     'fakka', true, true, 'active', 15.00, 300,  'صالح 2 أيام', 10.50,  4.50, -50, 'كارت جديد — صيف 2026'),
  ('Fakka_19_Unite',        'فكة 19 جنيه (جديد)',     'fakka', true, true, 'active', 19.00, 425,  'صالح 6 أيام', 13.30,  5.70, -40, 'كارت جديد — صيف 2026'),
  ('Fakka_22.5_Unite',      'فكة 22.5 جنيه (جديد)',   'fakka', true, true, 'active', 22.50, 550,  'صالح 7 أيام', 15.75,  6.75, -30, 'كارت جديد — صيف 2026'),
  ('FakkaCard_29_Summer26', 'فكة 29 جنيه (جديد)',     'fakka', true, true, 'active', 29.00, 800,  'صالح 2 أيام', 20.30,  8.70, -20, 'كارت جديد — صيف 2026'),
  ('Fakka_30_Unite',        'فكة 30 جنيه (جديد)',     'fakka', true, true, 'active', 30.00, 750, 'صالح 10 أيام', 21.00,  9.00, -10, 'كارت جديد — صيف 2026')
ON CONFLICT (product_id) DO UPDATE SET
  display_name   = EXCLUDED.display_name,
  category       = EXCLUDED.category,
  is_visible     = EXCLUDED.is_visible,
  is_enabled     = EXCLUDED.is_enabled,
  status         = EXCLUDED.status,
  price          = EXCLUDED.price,
  units          = EXCLUDED.units,
  validity       = EXCLUDED.validity,
  net_balance    = EXCLUDED.net_balance,
  profit_margin  = EXCLUDED.profit_margin,
  sort_order     = EXCLUDED.sort_order,
  notes          = EXCLUDED.notes,
  updated_at     = now();
