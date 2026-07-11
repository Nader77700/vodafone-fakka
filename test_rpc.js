import { createClient } from '@supabase/supabase-js';
const supabase = createClient("https://vchmsnavyhripakyvzom.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjaG1zbmF2eWhyaXBha3l2em9tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjI4Nzg1NSwiZXhwIjoyMDk3ODYzODU1fQ.qGv6iURGQONn7wlG55S8HMCxTfodI2GQfcV4PkpARIo");

async function run() {
  const { data, error } = await supabase.rpc('activate_license_key_v2', {
    p_user_id: "ff99115b-449c-41f7-8b70-60254c857414",
    p_code: "INVALID_CODE",
    p_device_fp: "test",
    p_hardware_hash: "test",
    p_native_id: "test",
    p_admin_override: false
  });
  console.log("Response:", JSON.stringify({data, error}, null, 2));
}
run();
