
-- ═══════════════════════════════════════════════════════
-- PHASE 5: إضافة الحقول الجديدة لجدول red_packages
-- ═══════════════════════════════════════════════════════

ALTER TABLE red_packages
  ADD COLUMN IF NOT EXISTS network_name           TEXT    NOT NULL DEFAULT 'Vodafone',
  ADD COLUMN IF NOT EXISTS short_description      TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS full_description       TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS duration               TEXT    NOT NULL DEFAULT 'شهر',
  ADD COLUMN IF NOT EXISTS renewal_type           TEXT    NOT NULL DEFAULT 'تجديد تلقائي',
  ADD COLUMN IF NOT EXISTS card_color             TEXT    NOT NULL DEFAULT '#E60000',
  ADD COLUMN IF NOT EXISTS bg_color               TEXT    NOT NULL DEFAULT '#1a0000',
  ADD COLUMN IF NOT EXISTS btn_color              TEXT    NOT NULL DEFAULT '#E60000',
  ADD COLUMN IF NOT EXISTS text_color             TEXT    NOT NULL DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS icon                   TEXT    NOT NULL DEFAULT 'wifi',
  ADD COLUMN IF NOT EXISTS subscription_instructions TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pre_subscription_msg   TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS post_subscription_msg  TEXT    NOT NULL DEFAULT 'تم إرسال طلبك بنجاح! سيتم التواصل معك قريباً لتفعيل الباقة.',
  ADD COLUMN IF NOT EXISTS show_fields            JSONB   NOT NULL DEFAULT '{"gb":true,"minutes":true,"duration":true,"renewal":true,"features":true,"requirements":true,"terms":true,"instructions":true,"pre_msg":true,"post_msg":true}',
  ADD COLUMN IF NOT EXISTS whatsapp_number        TEXT    NOT NULL DEFAULT '';

-- تحديث الأسعار الافتراضية للباقات الأربع الموجودة
UPDATE red_packages SET base_price = 150 WHERE name ILIKE '%20%' OR name ILIKE '%red 20%';
UPDATE red_packages SET base_price = 200 WHERE name ILIKE '%30%' OR name ILIKE '%red 30%';
UPDATE red_packages SET base_price = 245 WHERE name ILIKE '%40%' OR name ILIKE '%red 40%';
UPDATE red_packages SET base_price = 290 WHERE name ILIKE '%50%' OR name ILIKE '%red 50%';

-- تحديث الوصف المختصر للباقات الموجودة
UPDATE red_packages SET short_description = 'باقة إنترنت 20 جيجا مع 1500 دقيقة شهرياً'     WHERE name ILIKE '%20%';
UPDATE red_packages SET short_description = 'باقة إنترنت 30 جيجا مع 2000 دقيقة شهرياً'     WHERE name ILIKE '%30%';
UPDATE red_packages SET short_description = 'باقة إنترنت 40 جيجا مع 2500 دقيقة شهرياً'     WHERE name ILIKE '%40%';
UPDATE red_packages SET short_description = 'باقة إنترنت 50 جيجا مع 3000 دقيقة شهرياً'     WHERE name ILIKE '%50%';
