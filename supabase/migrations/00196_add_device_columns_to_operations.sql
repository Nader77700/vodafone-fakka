ALTER TABLE public.operations
ADD COLUMN IF NOT EXISTS device_fp text,
ADD COLUMN IF NOT EXISTS hardware_hash text,
ADD COLUMN IF NOT EXISTS native_id text;