const { createClient } = require('@supabase/supabase-js');
const sbUrl = 'https://vchmsnavyhripakyvzom.supabase.co';
const sbKey = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjaG1zbmF2eWhyaXBha3l2em9tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjI4Nzg1NSwiZXhwIjoyMDk3ODYzODU1fQ.qGv6iURGQONn7wlG55S8HMCxTfodI2GQfcV4PkpARIo';
const supabase = createClient(sbUrl, sbKey);

async function check() {
  const { data, error } = await supabase.rpc('get_operations_amounts_stats', { target_user_id: null });
  console.log(error || data);
}
check();
