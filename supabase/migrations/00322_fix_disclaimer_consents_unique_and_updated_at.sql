
-- 1) أضف عمود updated_at إذا مش موجود
ALTER TABLE public.disclaimer_consents
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2) أضف UNIQUE constraint على (user_id, version) — ضروري لعمل upsert صح
-- حذف أي duplicates أولاً قبل إضافة الـ constraint
DELETE FROM public.disclaimer_consents dc1
  USING public.disclaimer_consents dc2
  WHERE dc1.id < dc2.id
    AND dc1.user_id = dc2.user_id
    AND dc1.version = dc2.version;

-- إضافة الـ unique constraint
ALTER TABLE public.disclaimer_consents
  ADD CONSTRAINT disclaimer_consents_user_id_version_key
  UNIQUE (user_id, version);

-- 3) تحديث trigger لـ updated_at تلقائياً
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_disclaimer_consents_updated_at ON public.disclaimer_consents;
CREATE TRIGGER trg_disclaimer_consents_updated_at
  BEFORE UPDATE ON public.disclaimer_consents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
