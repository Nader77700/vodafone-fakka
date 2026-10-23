CREATE TABLE IF NOT EXISTS vip_client_portal_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_token text NOT NULL,
  client_name text,
  owner_dial text NOT NULL,
  owner_email text NOT NULL,
  child_dial text,
  child_email text,
  target_mix int NOT NULL DEFAULT 50000,
  initial_mix int DEFAULT 0,
  final_mix int DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  cycles_run int DEFAULT 0,
  client_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  session_id text
); CREATE INDEX IF NOT EXISTS idx_vip_client_sub_token ON vip_client_portal_submissions (link_token); ALTER TABLE vip_client_portal_submissions 
  ENABLE ROW LEVEL SECURITY; CREATE POLICY "Allow all via active temporary link"
  ON vip_client_portal_submissions
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (
    EXISTS (SELECT 1
    FROM vip_temporary_links
    WHERE
      is_active = true
      AND burned_at IS NULL
      AND (expires_at IS NULL
      OR expires_at > now()))
  )
  WITH CHECK (
    EXISTS (SELECT 1
    FROM vip_temporary_links
    WHERE
      is_active = true
      AND burned_at IS NULL
      AND (expires_at IS NULL
      OR expires_at > now()))
  );