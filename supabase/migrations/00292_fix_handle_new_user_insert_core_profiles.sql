-- ================================================================
-- إصلاح جذري لمشكلة "Database error saving new user"
-- السبب: handle_new_user كانت تكتب على `profiles` وهي VIEW
--         والـ INSERT على view بدون INSTEAD OF trigger يفشل دائماً
-- الحل: الكتابة مباشرة على core_profiles + EXCEPTION handler
-- ================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _username text;
  _phone    text;
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

  -- الكتابة مباشرة على core_profiles (الجدول الفعلي) وليس profiles (view)
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