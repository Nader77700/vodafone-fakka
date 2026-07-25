-- Drop the existing service_only_registry policy
DROP POLICY IF EXISTS "service_only_registry" ON device_registry;

-- Create policies for device_registry
-- 1. Admins can read all devices
CREATE POLICY "device_registry_admin_select" ON device_registry FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- 2. Users can read their own devices
CREATE POLICY "device_registry_user_select" ON device_registry FOR SELECT USING (
  auth.uid() = user_id
);

-- 3. Users can update their own devices (needed for registerDeviceInRegistry upsert?)
-- Wait, the client doesn't upsert directly if RLS blocks insert.
-- Wait, registerDeviceInRegistry uses the client directly?
-- Let's check api.ts registerDeviceInRegistry!
