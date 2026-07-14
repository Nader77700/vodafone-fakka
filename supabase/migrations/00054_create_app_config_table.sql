
-- ══════════════════════════════════════════════════════
-- جدول app_config — مصدر الحقيقة الوحيد للإعدادات
-- يعمل مع جميع إصدارات APK القديمة والجديدة
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS app_config (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  key          text        NOT NULL UNIQUE,
  value        text        NOT NULL,
  value_type   text        NOT NULL DEFAULT 'string'
                           CHECK (value_type IN ('string','boolean','number','json')),
  category     text        NOT NULL DEFAULT 'general'
                           CHECK (category IN (
                             'feature_flags','version','security',
                             'business','ui','general'
                           )),
  label        text        NOT NULL DEFAULT '',
  description  text        NOT NULL DEFAULT '',
  is_public    boolean     NOT NULL DEFAULT true,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   text        NOT NULL DEFAULT 'system'
);

-- فهرس سريع على category
CREATE INDEX IF NOT EXISTS idx_app_config_category ON app_config(category);

-- RLS — القراءة مفتوحة للجميع، الكتابة للأدمن فقط
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_config_read"  ON app_config;
DROP POLICY IF EXISTS "app_config_write" ON app_config;

CREATE POLICY "app_config_read"
  ON app_config FOR SELECT
  USING (is_public = true);

CREATE POLICY "app_config_write"
  ON app_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- دالة تحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_app_config_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_config_ts ON app_config;
CREATE TRIGGER trg_app_config_ts
  BEFORE UPDATE ON app_config
  FOR EACH ROW EXECUTE FUNCTION update_app_config_timestamp();

-- ══════════════════════════════════════════════════════
-- البيانات الأساسية — Seed
-- ══════════════════════════════════════════════════════
INSERT INTO app_config (key, value, value_type, category, label, description) VALUES

-- ── Feature Flags ──────────────────────────────────
('ff_recharge_enabled',       'true',  'boolean', 'feature_flags', 'تفعيل خدمة الشحن',           'تشغيل/إيقاف صفحة الشحن بالكامل'),
('ff_esim_enabled',           'true',  'boolean', 'feature_flags', 'تفعيل eSIM',                  'تشغيل/إيقاف صفحة eSIM'),
('ff_vodafone_enabled',       'true',  'boolean', 'feature_flags', 'تفعيل شبكة فودافون',          'إظهار/إخفاء فودافون من الشبكات'),
('ff_orange_enabled',         'true',  'boolean', 'feature_flags', 'تفعيل شبكة أورانج',           'إظهار/إخفاء أورانج من الشبكات'),
('ff_etisalat_enabled',       'true',  'boolean', 'feature_flags', 'تفعيل شبكة إتصالات',          'إظهار/إخفاء إتصالات من الشبكات'),
('ff_we_enabled',             'true',  'boolean', 'feature_flags', 'تفعيل شبكة WE',               'إظهار/إخفاء WE من الشبكات'),
('ff_favorites_enabled',      'true',  'boolean', 'feature_flags', 'تفعيل المفضلة',               'تشغيل/إيقاف ميزة المفضلة'),
('ff_statistics_enabled',     'true',  'boolean', 'feature_flags', 'تفعيل الإحصائيات',            'تشغيل/إيقاف صفحة الإحصائيات'),
('ff_operations_enabled',     'true',  'boolean', 'feature_flags', 'تفعيل سجل العمليات',          'تشغيل/إيقاف سجل العمليات'),
('ff_notifications_enabled',  'true',  'boolean', 'feature_flags', 'تفعيل الإشعارات',             'تشغيل/إيقاف نظام الإشعارات'),
('ff_maintenance_mode',       'false', 'boolean', 'feature_flags', 'وضع الصيانة',                 'إيقاف كامل التطبيق مع رسالة صيانة'),

-- ── Version Control ─────────────────────────────────
('version_min_supported',     '94',    'number',  'version',       'الحد الأدنى للإصدار المدعوم',  'أقل versionCode مسموح بتشغيله'),
('version_latest_code',       '98',    'number',  'version',       'أحدث كود إصدار',               'versionCode لأحدث APK متاح'),
('version_latest_name',       '3.0.45','string',  'version',       'أحدث اسم إصدار',               'versionName لأحدث APK متاح'),
('version_force_update_msg',  'يتوفر تحديث مهم. يرجى تحديث التطبيق للاستمرار.', 'string', 'version', 'رسالة التحديث الإجباري', 'النص الظاهر عند إجبار التحديث'),
('version_blocked_codes',     '[]',    'json',    'version',       'الإصدارات المحجوبة',            'قائمة versionCode المحجوبة نهائياً — JSON array'),
('version_apk_url',           'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/vodafone-fakka-v3.0.45-code98.apk', 'string', 'version', 'رابط APK الحالي', 'رابط تحميل أحدث APK'),

-- ── Security ────────────────────────────────────────
('sec_disabled_endpoints',    '[]',    'json',    'security',      'Endpoints المعطّلة',            'قائمة API endpoints معطّلة — JSON array'),
('sec_disabled_products',     '[]',    'json',    'security',      'المنتجات المعطّلة',             'قائمة product_id معطّلة — JSON array'),
('sec_max_daily_ops',         '100',   'number',  'security',      'الحد الأقصى للعمليات اليومية', 'أقصى عدد عمليات يومياً للمستخدم'),
('sec_require_active_sub',    'true',  'boolean', 'security',      'اشتراك نشط مطلوب',            'تعطيل الخدمة إذا انتهى الاشتراك'),

-- ── Business ────────────────────────────────────────
('biz_default_profit_margin', '5',     'number',  'business',      'هامش الربح الافتراضي %',       'نسبة الربح الافتراضية للمنتجات'),
('biz_max_free_ops',          '3',     'number',  'business',      'الحد المجاني للعمليات',        'عدد العمليات المجانية قبل الاشتراك'),
('biz_trial_days',            '3',     'number',  'business',      'أيام الفترة التجريبية',         'عدد أيام الفترة التجريبية للمستخدم الجديد'),

-- ── UI / Messages ───────────────────────────────────
('ui_maintenance_msg',        'التطبيق تحت الصيانة. نعود قريباً 🔧', 'string', 'ui', 'رسالة الصيانة', 'النص الظاهر في وضع الصيانة'),
('ui_announcement_enabled',   'false', 'boolean', 'ui',            'تفعيل الإعلان',                 'إظهار/إخفاء بانر الإعلان في الأعلى'),
('ui_announcement_text',      '',      'string',  'ui',            'نص الإعلان',                    'نص البانر الظاهر للمستخدمين'),
('ui_announcement_type',      'info',  'string',  'ui',            'نوع الإعلان',                   'info | warning | error | success'),
('ui_support_phone',          '',      'string',  'ui',            'رقم الدعم',                     'رقم هاتف الدعم الفني'),
('ui_support_whatsapp',       '',      'string',  'ui',            'واتساب الدعم',                  'رقم واتساب للدعم الفني')

ON CONFLICT (key) DO NOTHING;

-- ══════════════════════════════════════════════════════
-- دالة RPC للقراءة العامة (بدون auth)
-- ══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_app_config_public()
RETURNS TABLE(key text, value text, value_type text, category text, updated_at timestamptz)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT key, value, value_type, category, updated_at
  FROM app_config
  WHERE is_public = true
  ORDER BY category, key;
$$;

-- دالة upsert للأدمن
CREATE OR REPLACE FUNCTION upsert_app_config(
  p_key        text,
  p_value      text,
  p_value_type text DEFAULT 'string',
  p_category   text DEFAULT 'general',
  p_label      text DEFAULT '',
  p_description text DEFAULT '',
  p_updated_by text DEFAULT 'admin'
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO app_config(key, value, value_type, category, label, description, updated_by)
  VALUES (p_key, p_value, p_value_type, p_category, p_label, p_description, p_updated_by)
  ON CONFLICT(key) DO UPDATE SET
    value       = EXCLUDED.value,
    value_type  = EXCLUDED.value_type,
    category    = EXCLUDED.category,
    label       = EXCLUDED.label,
    description = EXCLUDED.description,
    updated_by  = EXCLUDED.updated_by,
    updated_at  = now();
END;
$$;
