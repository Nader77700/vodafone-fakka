import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const payload = {
    title: '🚀 ميزة التحميل المباشر',
    body: 'تم إضافة ميزة تحميل وتثبيت التحديثات داخلياً في التطبيق! لم تعد بحاجة للخروج إلى المتصفح. توجه إلى صفحة التحديثات الآن.',
    type: 'update',
    priority: 'important',
    is_global: true,
    action_url: '/updates',
    send_push: true
  };
  
  const { data, error } = await supabase.functions.invoke('send-push-notification', { body: payload });
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Success:", data);
  }
}
run();
