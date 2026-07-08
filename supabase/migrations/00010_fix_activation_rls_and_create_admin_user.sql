
-- ══════════════════════════════════════════════════════
-- 1. إضافة سياسة INSERT على trial_usage للمستخدمين
--    (كانت مفقودة تماماً → التفعيل التجريبي يفشل صامتاً)
-- ══════════════════════════════════════════════════════
CREATE POLICY "user_insert_own_trial" ON public.trial_usage
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ══════════════════════════════════════════════════════
-- 2. إضافة سياسة UPDATE على license_keys للمستخدمين
--    (كانت مفقودة → تحديث status/used_by/used_at/used_count يفشل)
-- ══════════════════════════════════════════════════════
CREATE POLICY "users_can_update_license_key_on_activate" ON public.license_keys
  FOR UPDATE TO authenticated
  USING (status = 'active'::public.license_key_status);

-- ══════════════════════════════════════════════════════
-- 3. إنشاء حساب الأدمن Nader77
-- ══════════════════════════════════════════════════════
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_email text := 'nader77@admin.local';
  v_existing uuid;
BEGIN
  -- فحص إذا كان موجود مسبقاً بالإيميل
  SELECT id INTO v_existing FROM auth.users WHERE email = v_email LIMIT 1;
  IF v_existing IS NOT NULL THEN
    v_uid := v_existing;
  ELSE
    -- إنشاء المستخدم في auth.users
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      aud, role, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      v_uid,
      '00000000-0000-0000-0000-000000000000',
      v_email,
      crypt('Nader/200411$@@', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"username":"Nader77"}'::jsonb,
      'authenticated', 'authenticated',
      '', '', '', ''
    );
  END IF;

  -- إنشاء أو تحديث البروفايل بدور super_admin
  INSERT INTO public.profiles (id, email, username, full_name, role, is_active)
  VALUES (v_uid, v_email, 'Nader77', 'Nader Akram', 'super_admin', true)
  ON CONFLICT (id) DO UPDATE
    SET role = 'super_admin', username = 'Nader77', full_name = 'Nader Akram', is_active = true;
END;
$$;
