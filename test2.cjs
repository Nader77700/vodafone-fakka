const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/workspace/app-ck2v94t1nev5/.env' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
  global: {
    headers: {
      'x-app-build': '350',
      'x-app-secure-token': 'vfp_secure_339_xyz_9988'
    }
  }
});
async function main() {
  const { data, error } = await supabase.rpc('is_valid_app_version');
  console.log('Valid App Version:', data);
  console.log('Error:', error);
}
main();
