CREATE TABLE IF NOT EXISTS public.vip_default_credentials (
  id text PRIMARY KEY DEFAULT 'default',
  child_email text,
  child_password_enc text,
  child_dial text,
  updated_at timestamptz DEFAULT now()
); ALTER TABLE public.vip_default_credentials 
  ENABLE ROW LEVEL SECURITY; CREATE POLICY vip_default_credentials_access
  ON public.vip_default_credentials
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (
    true
  )
  WITH CHECK (
    true
  ); CREATE OR REPLACE FUNCTION public.vip_get_default_child_credentials() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_rec RECORD;
BEGIN
  SELECT * INTO v_rec FROM public.vip_default_credentials WHERE id = 'default' LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'child_email', '', 'child_password', '', 'child_dial', '');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'child_email', COALESCE(v_rec.child_email, ''),
    'child_password', COALESCE(v_rec.child_password_enc, ''),
    'child_dial', COALESCE(v_rec.child_dial, '')
  );
END;
$$; CREATE OR REPLACE FUNCTION public.vip_save_default_child_credentials(
  p_child_email text,
  p_child_password text,
  p_child_dial text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.vip_default_credentials (id, child_email, child_password_enc, child_dial, updated_at)
  VALUES ('default', TRIM(p_child_email), TRIM(p_child_password), TRIM(COALESCE(p_child_dial, '')), NOW())
  ON CONFLICT (id) DO UPDATE
  SET child_email = EXCLUDED.child_email,
      child_password_enc = EXCLUDED.child_password_enc,
      child_dial = CASE WHEN EXCLUDED.child_dial IS NOT NULL AND EXCLUDED.child_dial <> '' THEN EXCLUDED.child_dial ELSE vip_default_credentials.child_dial END,
      updated_at = NOW();

  RETURN jsonb_build_object('success', true, 'message', 'تم حفظ بيانات الفرد الافتراضية بنجاح.');
END;
$$;