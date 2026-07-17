CREATE INDEX IF NOT EXISTS idx_license_keys_used_by ON license_keys(used_by) WHERE used_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_license_keys_created_by ON license_keys(created_by) WHERE created_by IS NOT NULL;
