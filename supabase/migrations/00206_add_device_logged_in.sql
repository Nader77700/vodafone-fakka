ALTER TABLE public.device_registry 
ADD COLUMN IF NOT EXISTS is_logged_in boolean DEFAULT true;
