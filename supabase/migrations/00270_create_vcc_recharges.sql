
-- جدول عمليات شحن رصيد فودافون كاش
CREATE TABLE IF NOT EXISTS vcc_recharges (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_number    text NOT NULL,
  sender_number      text NOT NULL DEFAULT '',
  amount             numeric(10, 2) NOT NULL,
  status             text NOT NULL DEFAULT 'pending',   -- pending | completed | failed
  reference_number   text NOT NULL DEFAULT '',
  failure_reason     text,
  execution_time_ms  integer,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE vcc_recharges ENABLE ROW LEVEL SECURITY;

-- كل مستخدم يرى عملياته فقط
CREATE POLICY "users_own_recharges" ON vcc_recharges
  FOR ALL USING (auth.uid() = user_id);

-- Admins يرون كل شيء (نفس نمط vcc_transfers)
CREATE POLICY "admins_all_recharges" ON vcc_recharges
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Index لتسريع الاستعلام
CREATE INDEX IF NOT EXISTS idx_vcc_recharges_user ON vcc_recharges(user_id, created_at DESC);
