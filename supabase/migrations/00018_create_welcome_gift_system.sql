
-- جدول إعدادات صندوق الهدايا الترحيبي
CREATE TABLE public.welcome_gifts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled   boolean NOT NULL DEFAULT false,
  license_key_id uuid REFERENCES public.license_keys(id) ON DELETE SET NULL,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- صف واحد دائماً (singleton)
INSERT INTO public.welcome_gifts (is_enabled) VALUES (false);

-- جدول تتبع من استلم الهدية
CREATE TABLE public.gift_claims (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  license_key_id uuid NOT NULL REFERENCES public.license_keys(id) ON DELETE CASCADE,
  claimed_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- تفعيل RLS
ALTER TABLE public.welcome_gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_claims   ENABLE ROW LEVEL SECURITY;

-- welcome_gifts: الجميع يقرأ، الأدمن فقط يعدّل
CREATE POLICY "welcome_gifts_read_all"
  ON public.welcome_gifts FOR SELECT USING (true);

CREATE POLICY "welcome_gifts_admin_update"
  ON public.welcome_gifts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin','super_admin')
    )
  );

-- gift_claims: المستخدم يقرأ سجله فقط، الأدمن يقرأ الكل
CREATE POLICY "gift_claims_read_own"
  ON public.gift_claims FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "gift_claims_admin_read"
  ON public.gift_claims FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin','super_admin')
    )
  );

CREATE POLICY "gift_claims_insert_own"
  ON public.gift_claims FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- دالة مساعدة: هل المستخدم استلم الهدية؟ (SECURITY DEFINER لتجنب loop)
CREATE OR REPLACE FUNCTION public.user_has_claimed_gift(p_user_id uuid, p_key_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.gift_claims
    WHERE user_id = p_user_id
      AND license_key_id = p_key_id
  );
$$;
