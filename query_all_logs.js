import { createClient } from '@supabase/supabase-js';
const supabase = createClient("https://vchmsnavyhripakyvzom.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjaG1zbmF2eWhyaXBha3l2em9tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjI4Nzg1NSwiZXhwIjoyMDk3ODYzODU1fQ.qGv6iURGQONn7wlG55S8HMCxTfodI2GQfcV4PkpARIo");

async function run() {
  const { data, error } = await supabase
    .from('system_logs')
    .select('level, action, message, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log("Logs:", JSON.stringify(data, null, 2));
}
run();
