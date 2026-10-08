ALTER TABLE public.vip_red_monitored_lines
ADD COLUMN IF NOT EXISTS bundle_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS bundle_renewed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS current_cycle_month text DEFAULT TO_CHAR(NOW(), 'YYYY-MM');

-- تحديث الخطوط المسددة مسبقاً لتكون متجددة بشكل مبدئي
UPDATE public.vip_red_monitored_lines
SET bundle_status = 'renewed',
    bundle_renewed_at = COALESCE(last_payment_date, updated_at, NOW())
WHERE payment_status = 'paid' AND bundle_status IS NULL;
