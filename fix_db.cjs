const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '/workspace/app-ck2v94t1nev5/.env' });
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
// Use service key if needed, or anon key if RLS allows it (anon might not allow update)
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
  await supabase.from('app_config').update({ value: 'false' }).eq('key', 'version_force_update');
  await supabase.from('app_config').update({ value: 'true' }).eq('key', 'ui_announcement_enabled');
  await supabase.from('app_config').update({ value: 'إعلان هام: حدث عطل في تحديث النسخة السابقة. يرجى التواصل مع الإدارة للحصول على رابط النسخة v3.0.314 المباشر.' }).eq('key', 'ui_announcement_text');
  await supabase.from('app_config').update({ value: 'error' }).eq('key', 'ui_announcement_type');
  console.log("Database updated to disable force update and enable announcement.");
}
run();
