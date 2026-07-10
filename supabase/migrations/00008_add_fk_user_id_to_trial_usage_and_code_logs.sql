
-- Add FK from trial_usage.user_id → auth.users (via profiles)
ALTER TABLE trial_usage
  ADD CONSTRAINT fk_trial_usage_user_id
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- Add FK from code_logs.user_id → profiles
ALTER TABLE code_logs
  ADD CONSTRAINT fk_code_logs_user_id
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
