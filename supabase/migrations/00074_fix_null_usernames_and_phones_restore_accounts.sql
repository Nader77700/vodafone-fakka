
-- ================================================================
-- DATA REPAIR: استعادة username و phone للحسابات الناقصة
-- السبب: handle_new_user لا يحفظ username، وخلال فترة RLS المعطلة
-- فشل updateProfile في حفظ username/phone للحسابات الجديدة
-- ================================================================

-- ─── 1. تحديث username من auth metadata لكل profile بدون username ──────────
UPDATE public.profiles p
SET
  username = COALESCE(
    au.raw_user_meta_data->>'username',
    split_part(au.email, '@', 1)   -- fallback: الجزء قبل @ في الإيميل
  ),
  updated_at = now()
FROM auth.users au
WHERE au.id = p.id
  AND (p.username IS NULL OR p.username = '')
  AND au.deleted_at IS NULL;

-- ─── 2. تحديث phone للحسابات التي username-ها رقم هاتف ─────────────────────
-- (أي حساب email = 01XXXXXXXXX@miaoda.com → phone = 01XXXXXXXXX)
UPDATE public.profiles p
SET
  phone = regexp_replace(split_part(p.email, '@', 1), '[^0-9]', '', 'g'),
  updated_at = now()
WHERE (p.phone IS NULL OR p.phone = '')
  AND p.email ~ '^01[0-9]{9}@miaoda\.com$';

-- ─── 3. تحسين handle_new_user: يحفظ username من metadata مباشرة ────────────
-- هذا يمنع تكرار المشكلة لأي مستخدم جديد حتى لو فشل updateProfile
CREATE OR REPLACE FUNCTION handle_new_user()
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

  -- استخراج phone من metadata أو من الإيميل إذا كان رقم هاتف
  _phone := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'phone'), ''),
    CASE
      WHEN NEW.email ~ '^01[0-9]{9}@miaoda\.com$'
      THEN regexp_replace(split_part(NEW.email, '@', 1), '[^0-9]', '', 'g')
      ELSE NULL
    END
  );

  INSERT INTO public.profiles (id, email, username, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    _username,
    _phone,
    'user'::public.user_role
  )
  ON CONFLICT (id) DO UPDATE
    SET
      username   = COALESCE(EXCLUDED.username, profiles.username),
      phone      = COALESCE(EXCLUDED.phone,    profiles.phone),
      updated_at = now();

  RETURN NEW;
END;
$$;
