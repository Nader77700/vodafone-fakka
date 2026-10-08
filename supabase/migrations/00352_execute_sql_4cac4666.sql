ALTER TABLE public.vip_red_monitored_lines 
  ADD COLUMN IF NOT EXISTS customer_name text
    NULL,
  ADD COLUMN IF NOT EXISTS payment_status text
    NOT NULL
    DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'paid', 'cancelled')),
  ADD COLUMN IF NOT EXISTS last_payment_date timestamptz
    NULL,
  ADD COLUMN IF NOT EXISTS renewal_amount numeric(10, 2)
    NULL; CREATE INDEX IF NOT EXISTS idx_vip_red_payment_status ON public.vip_red_monitored_lines (payment_status, activation_day);