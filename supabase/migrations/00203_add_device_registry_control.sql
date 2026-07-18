ALTER TABLE public.device_registry 
ADD COLUMN IF NOT EXISTS is_banned_from_account boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS force_logout boolean DEFAULT false;
