DO $$
BEGIN
  -- 1. Add created_by_user_id column to vip_sessions if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'vip_sessions' AND column_name = 'created_by_user_id'
  ) THEN
    ALTER TABLE public.vip_sessions 
    ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  -- 2. Associate existing sessions:
  -- The delegated test session 'sess_781b2d208a' belongs to '0fd64bea-c065-42c1-81b8-28f9d0cfc606' (sos1122@miaoda.com)
  UPDATE public.vip_sessions
  SET created_by_user_id = '0fd64bea-c065-42c1-81b8-28f9d0cfc606'
  WHERE id = 'sess_781b2d208a';

  -- All other sessions belong to owner '1f4bd575-dad6-4011-9864-8759ff771147' (nader77@miaoda.com)
  UPDATE public.vip_sessions
  SET created_by_user_id = '1f4bd575-dad6-4011-9864-8759ff771147'
  WHERE id <> 'sess_781b2d208a' AND (created_by_user_id IS NULL OR created_by_user_id <> '0fd64bea-c065-42c1-81b8-28f9d0cfc606');

  -- 3. Update vip_default_credentials table to support per-user storage
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'vip_default_credentials' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.vip_default_credentials 
    ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  -- Assign Nader's child credentials strictly to Nader's user_id
  UPDATE public.vip_default_credentials
  SET user_id = '1f4bd575-dad6-4011-9864-8759ff771147'
  WHERE id = 'default' OR child_email = 'gozeefnader@gmail.com';

END $$;