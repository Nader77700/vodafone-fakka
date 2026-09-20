-- تعطيل الـ trigger مؤقتاً ثم تصفير ops_limit/ops_remaining
ALTER TABLE subscriptions DISABLE TRIGGER trg_sync_ops_limit;

UPDATE subscriptions
SET
  expires_at    = NULL,
  ops_limit     = NULL,
  ops_remaining = NULL,
  updated_at    = now()
WHERE
  status    = 'active'
  AND code_type = 'paid';

ALTER TABLE subscriptions ENABLE TRIGGER trg_sync_ops_limit;