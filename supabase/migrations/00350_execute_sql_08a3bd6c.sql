CREATE TABLE IF NOT EXISTS vip_red_merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  user_id uuid REFERENCES auth.users (id)
    ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users (id)
    ON DELETE SET NULL,
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
); ALTER TABLE vip_red_monitored_lines 
  ADD COLUMN IF NOT EXISTS merchant_id uuid
    REFERENCES vip_red_merchants (id)
      ON DELETE SET NULL; ALTER TABLE vip_red_monitored_lines 
  ADD COLUMN IF NOT EXISTS activation_day smallint; DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vip_red_activation_day_check'
  ) THEN
    ALTER TABLE vip_red_monitored_lines 
    ADD CONSTRAINT vip_red_activation_day_check 
    CHECK (activation_day IS NULL OR activation_day IN (7, 11, 25));
  END IF;
END $$; CREATE UNIQUE INDEX IF NOT EXISTS vip_red_monitored_lines_phone_unique ON vip_red_monitored_lines (phone_number); ALTER TABLE vip_red_merchants 
  ENABLE ROW LEVEL SECURITY; DROP POLICY IF EXISTS Allow authenticated users to read merchants ON vip_red_merchants; CREATE POLICY "Allow authenticated users to read merchants"
  ON vip_red_merchants
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    true
  ); DROP POLICY IF EXISTS Allow authenticated users to insert merchants ON vip_red_merchants; CREATE POLICY "Allow authenticated users to insert merchants"
  ON vip_red_merchants
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    true
  ); DROP POLICY IF EXISTS Allow authenticated users to update merchants ON vip_red_merchants; CREATE POLICY "Allow authenticated users to update merchants"
  ON vip_red_merchants
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    true
  ); DROP POLICY IF EXISTS Allow authenticated users to delete merchants ON vip_red_merchants; CREATE POLICY "Allow authenticated users to delete merchants"
  ON vip_red_merchants
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    true
  );