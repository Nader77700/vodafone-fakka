import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

serve(async (req) => {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { data: prof } = await supabaseAdmin.from("profiles").select("id").limit(1).single();
  const userId = prof?.id;

  const { data, error } = await supabaseAdmin.from("operations").insert({
    user_id: userId,
    phone_number: "01000000000",
    card_type: "Test",
    category: "فكة",
    amount: 10,
    status: "success",
    error_message: null,
    performed_at: new Date().toISOString(),
    api_response: "Completed",
    operation_source: "vodafone_cash",
    idempotency_key: "test-" + Date.now(),
    correlation_id: "test",
    latency_ms: 100,
    device_fp: "test",
    execution_layer: "edge_function",
    card_data: {}
  }).select().single();

  return new Response(JSON.stringify({ data, error }), { headers: { "Content-Type": "application/json" } });
});
