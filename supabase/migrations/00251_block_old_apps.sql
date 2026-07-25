-- Drop old policies for core_operations
DROP POLICY IF EXISTS "Users can insert own operations" ON core_operations;
DROP POLICY IF EXISTS "Users can view own operations" ON core_operations;

-- Recreate with is_valid_app_version()
CREATE POLICY "Users can insert own operations" ON core_operations
  FOR INSERT
  WITH CHECK (user_id = auth.uid() AND is_valid_app_version());

CREATE POLICY "Users can view own operations" ON core_operations
  FOR SELECT
  USING (user_id = auth.uid() AND is_valid_app_version());

-- Drop old policies for balance_products
DROP POLICY IF EXISTS "balance_products_select_users" ON balance_products;

-- Recreate with is_valid_app_version()
CREATE POLICY "balance_products_select_users" ON balance_products
  FOR SELECT
  USING (is_visible = true AND is_enabled = true AND is_valid_app_version());

-- Drop old policies for app_config
DROP POLICY IF EXISTS "app_config_read" ON app_config;

-- Recreate with is_valid_app_version()
CREATE POLICY "app_config_read" ON app_config
  FOR SELECT
  USING (is_public = true AND is_valid_app_version());

-- Drop old policies for product_config
DROP POLICY IF EXISTS "authenticated_read_product_config" ON product_config;

-- Recreate with is_valid_app_version()
CREATE POLICY "authenticated_read_product_config" ON product_config
  FOR SELECT
  USING (auth.role() = 'authenticated' AND is_valid_app_version());