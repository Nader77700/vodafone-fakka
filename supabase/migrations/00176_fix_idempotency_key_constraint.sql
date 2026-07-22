ALTER TABLE public.operations DROP CONSTRAINT IF EXISTS operations_idempotency_key_key;
ALTER TABLE public.operations ADD CONSTRAINT operations_idempotency_key_key UNIQUE (idempotency_key);