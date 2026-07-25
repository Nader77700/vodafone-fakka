ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS duration_days integer DEFAULT NULL;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS custom_duration_days integer DEFAULT NULL;