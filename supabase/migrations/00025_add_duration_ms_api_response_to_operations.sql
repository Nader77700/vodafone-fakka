
-- PHASE 1 & 2: Add duration_ms and api_response to operations table
ALTER TABLE operations
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS api_response TEXT;

-- PHASE 7: Fix phone_analytics VIEW - drop and recreate with correct columns
DROP VIEW IF EXISTS phone_analytics;
CREATE VIEW phone_analytics AS
SELECT
  phone_number,
  COUNT(*)                                      AS usage_count,
  COUNT(*) FILTER (WHERE status = 'success')    AS success_count,
  COALESCE(SUM(amount), 0)                      AS total_amount,
  MAX(performed_at)                             AS last_used_at
FROM operations
GROUP BY phone_number;

-- PHASE 3: Indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_operations_user_id      ON operations(user_id);
CREATE INDEX IF NOT EXISTS idx_operations_status        ON operations(status);
CREATE INDEX IF NOT EXISTS idx_operations_performed_at  ON operations(performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_operations_card_type     ON operations(card_type);
