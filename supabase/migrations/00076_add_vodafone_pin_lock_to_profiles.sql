-- ════════════════════════════════════════════════════════════
-- تتبع قفل حساب Vodafone Cash (PIN lock بعد 3 محاولات خاطئة)
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vodafone_pin_locked_at  timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vodafone_lock_reason     text        DEFAULT NULL;

-- index للأداء عند الفحص الجماعي
CREATE INDEX IF NOT EXISTS idx_profiles_vf_pin_locked
  ON public.profiles (vodafone_pin_locked_at)
  WHERE vodafone_pin_locked_at IS NOT NULL;

COMMENT ON COLUMN public.profiles.vodafone_pin_locked_at IS
  'وقت آخر قفل Vodafone Cash (error 1118) — NULL = غير مقفول';
COMMENT ON COLUMN public.profiles.vodafone_lock_reason IS
  'سبب القفل من Vodafone API (رسالة نصية)';
