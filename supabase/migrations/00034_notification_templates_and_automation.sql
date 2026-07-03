
-- ─── قوالب الإشعارات ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  type        text NOT NULL DEFAULT 'info',
  priority    text NOT NULL DEFAULT 'normal',
  action_url  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_manage_templates" ON notification_templates
  USING  (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin','super_admin')))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin','super_admin')));

-- ─── قواعد الإشعارات التلقائية ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_automation_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_event   text NOT NULL,          -- e.g. 'subscription_expiry_7d', 'new_version', 'payment_approved'
  label           text NOT NULL,          -- وصف يُعرض في الواجهة
  enabled         boolean NOT NULL DEFAULT true,
  title_template  text NOT NULL,          -- يدعم {username}, {days}, {version}
  body_template   text NOT NULL,
  type            text NOT NULL DEFAULT 'info',
  priority        text NOT NULL DEFAULT 'normal',
  action_url      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(trigger_event)
);
ALTER TABLE notification_automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_manage_automation" ON notification_automation_rules
  USING  (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin','super_admin')))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin','super_admin')));

-- ─── بيانات أولية: قواعد التشغيل التلقائي الافتراضية ──────────────────────
INSERT INTO notification_automation_rules
  (trigger_event, label, enabled, title_template, body_template, type, priority, action_url)
VALUES
  ('subscription_expiry_7d',  'انتهاء الاشتراك — 7 أيام',      true, 'اشتراكك ينتهي قريباً', 'ينتهي اشتراكك بعد 7 أيام. جدّد الآن للاستمرار في الاستمتاع بالخدمة.', 'subscription_renewal', 'important', '/subscription-history'),
  ('subscription_expiry_3d',  'انتهاء الاشتراك — 3 أيام',      true, 'تنبيه: اشتراكك ينتهي بعد 3 أيام', 'لا تفوّت خدماتك — اشتراكك ينتهي بعد 3 أيام فقط!', 'subscription_renewal', 'important', '/subscription-history'),
  ('subscription_expiry_24h', 'انتهاء الاشتراك — 24 ساعة',    true, 'اشتراكك ينتهي غداً', 'ينتهي اشتراكك خلال 24 ساعة. جدّد الآن!', 'subscription_renewal', 'urgent', '/subscription-history'),
  ('subscription_expiry_6h',  'انتهاء الاشتراك — 6 ساعات',    true, 'اشتراكك ينتهي اليوم!', 'ينتهي اشتراكك خلال 6 ساعات فقط. جدّد الآن!', 'subscription_renewal', 'urgent', '/subscription-history'),
  ('subscription_expiry_1h',  'انتهاء الاشتراك — ساعة واحدة', true, '⚡ آخر ساعة في اشتراكك', 'اشتراكك على وشك الانتهاء. جدّد فوراً!', 'subscription_renewal', 'urgent', '/subscription-history'),
  ('subscription_expired',    'انتهاء الاشتراك — منتهي',       true, 'انتهى اشتراكك', 'انتهى اشتراكك. جدّد الآن لاستعادة الوصول الكامل.', 'subscription_expiry', 'urgent', '/subscription-history'),
  ('subscription_activated',  'اشتراك جديد — ترحيبي',          true, 'مرحباً بك! اشتراكك فعّال', 'تم تفعيل اشتراكك بنجاح. استمتع بجميع المميزات!', 'subscription_activated', 'normal', '/home'),
  ('payment_approved',        'قبول الدفع',                     true, 'تم قبول الدفع', 'تم استلام دفعتك بنجاح وتفعيل اشتراكك.', 'subscription_activated', 'important', '/subscription-history'),
  ('payment_rejected',        'رفض الدفع',                      true, 'تعذّر تأكيد الدفع', 'لم نتمكن من تأكيد دفعتك. يرجى المحاولة مجدداً أو التواصل معنا.', 'subscription_failed', 'urgent', '/home'),
  ('new_version',             'إصدار جديد متاح',                true, 'تحديث جديد متاح!', 'يتوفر إصدار جديد من التطبيق. حدّث الآن للحصول على أحدث الميزات.', 'update_available', 'important', '/build-info'),
  ('daily_limit_reached',     'انتهاء الاستخدام اليومي',       false, 'استنفذت حصتك اليومية', 'لقد استخدمت حصتك اليومية الكاملة. ستعود غداً!', 'info', 'normal', '/home'),
  ('daily_reset',             'عودة الاستخدام اليومي',          false, 'حصتك اليومية جاهزة', 'تجدّدت حصتك اليومية. ابدأ الاستخدام الآن!', 'info', 'normal', '/home'),
  ('balance_added',           'إضافة رصيد',                     false, 'تم إضافة رصيد', 'تمت إضافة رصيد إلى حسابك بنجاح.', 'operation', 'normal', '/home'),
  ('balance_deducted',        'خصم رصيد',                       false, 'تم خصم رصيد', 'تم خصم رصيد من حسابك.', 'operation', 'normal', '/home'),
  ('account_suspended',       'إيقاف الحساب',                   false, 'تم إيقاف حسابك مؤقتاً', 'تم إيقاف حسابك. تواصل مع الدعم للمزيد من المعلومات.', 'security', 'urgent', '/home'),
  ('account_reactivated',     'إعادة تفعيل الحساب',             false, 'تم إعادة تفعيل حسابك', 'يسعدنا إعادتك! حسابك الآن فعّال.', 'system', 'important', '/home'),
  ('maintenance_start',       'بدء الصيانة',                    false, 'سيتوقف التطبيق مؤقتاً للصيانة', 'سيكون التطبيق غير متاح مؤقتاً لأعمال الصيانة.', 'maintenance', 'important', '/home'),
  ('news',                    'أخبار',                           false, 'أخبار جديدة', 'تحقق من آخر الأخبار والتحديثات.', 'announcement', 'normal', '/home'),
  ('offer',                   'عرض خاص',                        false, 'عرض خاص لك!', 'لا تفوّت هذا العرض الحصري المتاح لوقت محدود.', 'offer', 'important', '/home')
ON CONFLICT (trigger_event) DO NOTHING;
