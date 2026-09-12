
-- ── جدول موافقات المستخدمين على إخلاء المسؤولية ──────────────────────────
CREATE TABLE IF NOT EXISTS disclaimer_consents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version       int  NOT NULL,
  accepted      boolean NOT NULL DEFAULT false,
  accepted_at   timestamptz,
  rejected_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS disclaimer_consents_user_version_idx
  ON disclaimer_consents (user_id, version);

ALTER TABLE disclaimer_consents ENABLE ROW LEVEL SECURITY;

-- المستخدم يقرأ/يكتب سجلاته فقط
CREATE POLICY "user_own_consent" ON disclaimer_consents
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- الأدمن يقرأ الكل (للإحصائيات)
CREATE POLICY "admin_read_all" ON disclaimer_consents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','super_admin')
    )
  );

-- ── إضافة إعدادات نظام الإخلاء إلى core_app_config ─────────────────────
INSERT INTO core_app_config (key, value, description) VALUES
  ('disclaimer_enabled',       'true',          'تفعيل/تعطيل نظام إخلاء المسؤولية الإجباري'),
  ('disclaimer_version',       '1',             'رقم نسخة إخلاء المسؤولية الحالية'),
  ('disclaimer_title',         'إخلاء مسؤولية','عنوان نافذة إخلاء المسؤولية'),
  ('disclaimer_developer',     'Nader Akram',   'اسم مطور التطبيق في الإخلاء'),
  ('disclaimer_show_policy',   'once_per_version','سياسة ظهور الإخلاء: once_per_version | weekly | monthly | bimonthly | quarterly | always'),
  ('disclaimer_custom_days',   '30',            'عدد الأيام للمدة المخصصة'),
  ('disclaimer_body',          'تطبيق Vodafone Fakka Premium هو تطبيق مستقل يوفر مجموعة من الخدمات والأدوات المتعلقة بخدمات الاتصالات وشحن الرصيد وكروت الفكة والاستعلام عن معلومات الخط وبعض الخدمات المرتبطة بـ Vodafone Cash والتحويلات والخدمات الأخرى المتاحة داخل التطبيق.\n\nالتطبيق غير تابع رسميًا لشركة Vodafone مصر أو أي شركة اتصالات أخرى، ولا يمثلها أو يتحدث باسمها، ما لم يُذكر خلاف ذلك بشكل رسمي وواضح.\n\nجميع الأسماء والشعارات والعلامات التجارية التي قد تظهر داخل التطبيق، بما في ذلك Vodafone وVodafone Cash وغيرها، هي ملك لأصحابها، ويتم استخدامها للإشارة إلى الخدمات أو الشبكات أو المنتجات ذات الصلة فقط، ولا يعني ظهورها وجود شراكة أو اعتماد أو علاقة رسمية بين التطبيق وأصحاب تلك العلامات التجارية.\n\nقد يعتمد بعض ما يقدمه التطبيق من خدمات أو معلومات أو عمليات على خدمات أو أنظمة خارجية تابعة لمزودي خدمات الاتصالات أو الدفع أو غيرهم، ولذلك قد تتأثر بعض الوظائف بتوفر تلك الخدمات أو بتغيير سياساتها أو أنظمتها أو واجهاتها أو شروط استخدامها.\n\nيتحمل المستخدم مسؤولية التأكد من صحة البيانات التي يدخلها قبل تنفيذ أي عملية، وخاصة رقم الهاتف أو رقم المحفظة أو قيمة العملية وأي بيانات أخرى مرتبطة بالخدمة.\n\nفي العمليات المالية أو عمليات الشحن أو التحويل، يجب على المستخدم مراجعة تفاصيل العملية والتأكد منها قبل تأكيدها. التطبيق لا يتحمل مسؤولية الأخطاء الناتجة عن إدخال بيانات غير صحيحة من جانب المستخدم، أو عن انقطاع أو تعطل أو تغيير الخدمات الخارجية التي تعتمد عليها بعض وظائف التطبيق.\n\nلا يُعد عرض أي خدمة أو معلومات داخل التطبيق ضمانًا لاستمرار توفرها، وقد تتغير الخدمات أو شروطها أو آلية عملها وفقًا للجهة المقدمة للخدمة.\n\nباستخدامك لتطبيق Vodafone Fakka Premium، فإنك تقر بأنك قرأت هذا الإخلاء وفهمته، وتوافق على تحمل مسؤولية استخدام الخدمات والبيانات التي تقوم بإدخالها، وعلى مراجعة تفاصيل أي عملية قبل تأكيدها.', 'نص إخلاء المسؤولية الكامل')
ON CONFLICT (key) DO NOTHING;
