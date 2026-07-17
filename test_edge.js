import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.functions.invoke('vodafone-execute', {
    headers: {
      'x-app-build': '334',
      'x-app-signature': 'test',
      'x-build-hash': 'test',
      'Authorization': `Bearer ${supabaseKey}` // Not a real user token but let's see
    },
    body: {
      product_id: 'فكة 9',
      receiver: '01011111111',
      pin: '000000',
      sender: '01011111111'
    }
  });
  console.log('data:', data);
  console.log('error:', error);
}

test();