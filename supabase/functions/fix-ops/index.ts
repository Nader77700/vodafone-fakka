import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { data: configs } = await supabaseAdmin.from('product_config').select('*');
  let count = 0;
  for (const conf of configs || []) {
    const { error } = await supabaseAdmin
      .from('operations')
      .update({ amount: conf.price, card_type: conf.display_name })
      .eq('card_type', conf.product_id);
    if (!error) count++;
  }

  return new Response(`Fixed ${count} configs`, { headers: { "Content-Type": "text/plain" } });
});
