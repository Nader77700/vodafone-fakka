const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function fix() {
  const { data: configs } = await supabase.from('product_config').select('*');
  let count = 0;
  for (const conf of configs) {
    const { data, error } = await supabase
      .from('operations')
      .update({ 
        amount: conf.price,
        card_type: conf.display_name 
      })
      .eq('card_type', conf.product_id);
    
    if (!error) {
      console.log(`Updated for ${conf.product_id}`);
      count++;
    } else {
      console.error(error);
    }
  }
  console.log("Done updating past records.");
}
fix();
