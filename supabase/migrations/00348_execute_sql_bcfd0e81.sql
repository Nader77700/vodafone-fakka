DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'vip_red_config' AND policyname = 'Allow select for all authenticated users'
  ) THEN
    CREATE POLICY "Allow select for all authenticated users" 
    ON vip_red_config FOR SELECT 
    USING (true);
  END IF;
END $$;