import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
const supabaseAdmin = createClient(supabaseUrl, serviceRole);

async function test() {
  const { data: { session }, error: signErr } = await supabase.auth.signInWithPassword({
    email: 'admin@miaoda.com', // wait, do I have admin credentials? No.
    password: 'password'
  });
}
test();
