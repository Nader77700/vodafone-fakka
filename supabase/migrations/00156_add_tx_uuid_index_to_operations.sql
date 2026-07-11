
-- فهرس على card_data->tx_uuid لتسريع idempotency check
-- يستخدم expression index على JSONB لأداء عالٍ
CREATE INDEX IF NOT EXISTS idx_operations_tx_uuid
  ON operations ((card_data->>'tx_uuid'))
  WHERE card_data->>'tx_uuid' IS NOT NULL;

COMMENT ON INDEX idx_operations_tx_uuid IS
  'فهرس Idempotency — يمنع تسجيل نفس العملية مرتين عبر tx_uuid';
