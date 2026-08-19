
-- ═══════════════════════════════════════════════════════════════
-- إضافة subscription_id إلى core_operations (الجدول الأساسي)
-- وتحديث view operations لتشمله
-- ═══════════════════════════════════════════════════════════════

-- 1. إضافة العمود إلى الجدول الأساسي
ALTER TABLE public.core_operations
  ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_core_operations_subscription_id
  ON public.core_operations(subscription_id)
  WHERE subscription_id IS NOT NULL;

-- 2. تحديث view لتشمل subscription_id
CREATE OR REPLACE VIEW public.operations AS
  SELECT
    id, user_id, phone_number, card_type, card_data,
    status, error_message, performed_at, created_at,
    operation_number, category, amount, duration_ms,
    api_response, operation_source, idempotency_key,
    correlation_id, execution_layer, retry_count,
    latency_ms, device_fp, hardware_hash, native_id,
    subscription_id
  FROM core_operations;
