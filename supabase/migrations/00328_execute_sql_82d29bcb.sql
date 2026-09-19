CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_username  TEXT;
  v_phone     TEXT;
  v_email     TEXT;
BEGIN
  -- استخراج البيانات
  v_email    := NEW.email;
  v_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );
  v_phone    := NEW.phone;

  -- إذا الهاتف مكرر → نضع NULL لتجنب فشل الإدراج
  IF v_phone IS NOT NULL AND EXISTS (
    SELECT 1 FROM core_profiles WHERE phone = v_phone
  ) THEN
    v_phone := NULL;
  END IF;

  -- إذا اسم المستخدم مكرر → نضيف رقم عشوائي
  IF EXISTS (SELECT 1 FROM core_profiles WHERE username = v_username) THEN
    v_username := v_username || '_' || floor(random() * 9000 + 1000)::text;
  END IF;

  INSERT INTO core_profiles (
    id, username, email, phone,
    role, is_active,
    -- ★ الإصلاح الجذري: كل مستخدم جديد يبدأ بـ 'subscribed' وليس 'preview'
    -- verify-access يعتمد على جدول subscriptions وليس access_mode فقط
    access_mode,
    created_at, updated_at
  ) VALUES (
    NEW.id,
    v_username,
    v_email,
    v_phone,
    'user',
    true,
    'subscribed',   -- ★ كان 'preview' — هذا سبب المشكلة
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;