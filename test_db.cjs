const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '/workspace/app-ck2v94t1nev5/.env' });
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data } = await supabase.from('app_config').select('*').in('key', ['version_latest_name', 'version_force_update', 'version_apk_url']);
  console.log("APP_CONFIG:", data);
  
  const { data: ver } = await supabase.from('app_versions').select('*').order('version_code', { ascending: false }).limit(2);
  console.log("APP_VERSIONS:", ver);
}
run();
