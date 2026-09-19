CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  _username text;
  _phone    text;
  _phone_exists boolean;
BEGIN
  -- استخراج username من metadata أو من الإيميل
  _username := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'username'), ''),
    split_part(NEW.email, '@', 1)
  );

  -- استخراج phone من metadata أو من الإيميل إذا كان رقم مصري
  _phone := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'phone'), ''),
    CASE
      WHEN NEW.email ~ '^01[0-9]{9}@miaoda\.com$'
      THEN regexp_replace(split_part(NEW.email, '@', 1), '[^0-9]', '', 'g')
      ELSE NULL
    END
  );

  -- ★ FIX: فحص duplicate phone قبل الإدراج → نضعه NULL إذا كان مكرراً
  IF _phone IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.core_profiles WHERE phone = _phone
    ) INTO _phone_exists;
    IF _phone_exists THEN
      _phone := NULL;  -- تجنب الرفض الصامت
    END IF;
  END IF;

  -- الكتابة مباشرة على core_profiles
  INSERT INTO public.core_profiles (
    id, email, username, phone, role,
    is_active, access_mode, created_at, updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    _username,
    _phone,
    'user'::public.user_role,
    true,
    'subscribed',
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
    SET
      username   = COALESCE(EXCLUDED.username,  core_profiles.username),
      phone      = COALESCE(EXCLUDED.phone,     core_profiles.phone),
      email      = COALESCE(EXCLUDED.email,     core_profiles.email),
      updated_at = now();

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- تسجيل تحذير بدون كسر عملية التسجيل
  RAISE WARNING 'handle_new_user failed for user % (%): %', NEW.id, NEW.email, SQLERRM;
  RETURN NEW;
END;
$$;