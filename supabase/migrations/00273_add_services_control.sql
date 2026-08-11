-- جدول التحكم في خدمات قسم "خدماتي" من السيرفر
CREATE TABLE IF NOT EXISTS public.services_control (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  visible             BOOLEAN NOT NULL DEFAULT TRUE,
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','maintenance','disabled')),
  access_mode         TEXT NOT NULL DEFAULT 'subscribers_only'
                      CHECK (access_mode IN ('subscribers_only','all')),
  maintenance_message TEXT DEFAULT 'الخدمة في وضع الصيانة. يرجى المحاولة لاحقًا.',
  display_order       INTEGER NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by          TEXT
);

INSERT INTO public.services_control (id, name, visible, status, access_mode, display_order)
VALUES
  ('services_section',     'قسم خدماتي (الكل)',            TRUE, 'active', 'subscribers_only', 0),
  ('legacy-flex',          'أنظمة فليكس القديمة',           TRUE, 'active', 'subscribers_only', 1),
  ('balance-charge',       'الشحن من رصيد Ana Vodafone',    TRUE, 'active', 'subscribers_only', 2),
  ('vodafone-cash-center', 'تحويل الأموال وشحن الرصيد',     TRUE, 'active', 'subscribers_only', 4),
  ('wallet-lines',         'خدمات الخطوط والمحافظ',         TRUE, 'active', 'subscribers_only', 5)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.services_control ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_services_control" ON public.services_control
  FOR SELECT USING (TRUE);

CREATE POLICY "admin_write_services_control" ON public.services_control
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin','super_admin')
    )
  );

CREATE OR REPLACE FUNCTION update_services_control_ts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_services_control_ts ON public.services_control;
CREATE TRIGGER trg_services_control_ts
  BEFORE UPDATE ON public.services_control
  FOR EACH ROW EXECUTE FUNCTION update_services_control_ts();