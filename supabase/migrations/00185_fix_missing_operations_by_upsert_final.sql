-- Drop conflicting constraints if any
ALTER TABLE public.operations DROP CONSTRAINT IF EXISTS operations_idempotency_key_key;

-- Add a unique constraint if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'operations_idempotency_key_key'
  ) THEN
    ALTER TABLE public.operations ADD CONSTRAINT operations_idempotency_key_key UNIQUE (idempotency_key);
  END IF;
END $$;
