
-- جدول حفظ أرقام سر محافظ Vodafone Cash مرتبطة بحساب المستخدم
-- يحل محل localStorage الذي يُفقد عند حذف التطبيق أو تسجيل الخروج
CREATE TABLE IF NOT EXISTS public.user_wallet_pins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash    text NOT NULL,        -- مشفَّر XOR (نفس منطق الـ frontend)
  is_default  boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, pin_hash)
);

-- تحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_wallet_pins_updated_at ON public.user_wallet_pins;
CREATE TRIGGER trg_wallet_pins_updated_at
  BEFORE UPDATE ON public.user_wallet_pins
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: كل مستخدم يقرأ ويكتب بياناته فقط
ALTER TABLE public.user_wallet_pins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallet_pins_select_own" ON public.user_wallet_pins;
CREATE POLICY "wallet_pins_select_own"
  ON public.user_wallet_pins FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "wallet_pins_insert_own" ON public.user_wallet_pins;
CREATE POLICY "wallet_pins_insert_own"
  ON public.user_wallet_pins FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "wallet_pins_update_own" ON public.user_wallet_pins;
CREATE POLICY "wallet_pins_update_own"
  ON public.user_wallet_pins FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "wallet_pins_delete_own" ON public.user_wallet_pins;
CREATE POLICY "wallet_pins_delete_own"
  ON public.user_wallet_pins FOR DELETE
  USING (auth.uid() = user_id);
