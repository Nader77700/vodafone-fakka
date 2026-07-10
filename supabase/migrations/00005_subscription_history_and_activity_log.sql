
-- جدول سجل الاشتراكات التاريخي
CREATE TABLE IF NOT EXISTS subscription_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  license_key_id uuid REFERENCES license_keys(id),
  code           text,
  code_type      text DEFAULT 'paid',
  duration_days  int  NOT NULL,
  days_before    int  NOT NULL DEFAULT 0,
  days_after     int  NOT NULL,
  activated_at   timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- جدول سجل النشاط لكل مستخدم
CREATE TABLE IF NOT EXISTS activity_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type  text NOT NULL,  -- 'activation' | 'renewal' | 'expiry' | 'login' | 'recharge' | 'trial_exhausted'
  title       text NOT NULL,
  description text,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE subscription_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_history" ON subscription_history
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "admins_history"    ON subscription_history
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

CREATE POLICY "users_own_activity" ON activity_log
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "admins_activity"    ON activity_log
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- فهارس
CREATE INDEX IF NOT EXISTS idx_sub_history_user  ON subscription_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_user      ON activity_log(user_id, created_at DESC);
