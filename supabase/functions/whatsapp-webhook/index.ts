// Edge Function: whatsapp-webhook
// معالجة Meta Webhook للتحقق (GET challenge) والتحقق من التوقيع الرقمي وتحديث حالات الرسائل (POST)
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// Cryptographic verification for Meta x-hub-signature-256
async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): Promise<boolean> {
  if (!signatureHeader || !appSecret) return false;
  const parts = signatureHeader.split("=");
  if (parts.length !== 2 || parts[0] !== "sha256") return false;
  const expectedHash = parts[1].toLowerCase();

  const encoder = new TextEncoder();
  const keyData = encoder.encode(appSecret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(rawBody)
  );

  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  const actualHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return actualHash === expectedHash;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const url = new URL(req.url);

  // ══════════════════════════════════════════════════════════════
  // 1. GET Request: Meta Webhook Verification Challenge
  // ══════════════════════════════════════════════════════════════
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    // Fetch configured verify token from server secrets
    const { data: secrets } = await supabase
      .from("whatsapp_business_secrets")
      .select("webhook_verify_token")
      .eq("id", "default")
      .maybeSingle();

    const expectedVerifyToken = secrets?.webhook_verify_token?.trim();

    if (mode === "subscribe" && token && expectedVerifyToken && token === expectedVerifyToken) {
      // Mark webhook as verified in config
      await supabase
        .from("whatsapp_business_config")
        .update({
          webhook_verified: true,
          webhook_subscribed: true,
          last_reachability_test_at: new Date().toISOString(),
          last_reachability_status: "verified",
          updated_at: new Date().toISOString(),
        })
        .eq("id", "default");

      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    return new Response("Forbidden: Verification token mismatch", { status: 403 });
  }

  // ══════════════════════════════════════════════════════════════
  // 2. POST Request: Meta Webhook Event Notification
  // ══════════════════════════════════════════════════════════════
  if (req.method === "POST") {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get("x-hub-signature-256");

    // Load server secret
    const { data: secrets } = await supabase
      .from("whatsapp_business_secrets")
      .select("app_secret")
      .eq("id", "default")
      .maybeSingle();

    const appSecret = secrets?.app_secret?.trim();
    let isSigValid = false;

    if (appSecret && signatureHeader) {
      isSigValid = await verifyMetaSignature(rawBody, signatureHeader, appSecret);
    } else if (!appSecret) {
      // If no app secret is set yet, flag signature as unverified
      isSigValid = false;
    }

    let payload: any = null;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Process Entries & Changes
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    const processedEvents: any[] = [];

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const val = change?.value;
        if (!val) continue;

        // A. Handle Status Updates (sent, delivered, read, failed)
        const statuses = Array.isArray(val?.statuses) ? val.statuses : [];
        for (const st of statuses) {
          const wamid = st.id;
          const status = st.status; // "sent", "delivered", "read", "failed"
          const timestamp = st.timestamp ? new Date(Number(st.timestamp) * 1000).toISOString() : new Date().toISOString();
          const recipientId = st.recipient_id;
          const errors = st.errors;

          const errorCode = errors?.[0]?.code ? String(errors[0].code) : null;
          const errorMsg = errors?.[0]?.title || errors?.[0]?.message || null;

          const eventId = `status_${wamid}_${status}_${st.timestamp || Date.now()}`;

          // Log in webhook_events table with idempotency
          const { error: eventInsertErr } = await supabase
            .from("whatsapp_webhook_events")
            .insert({
              event_id: eventId,
              event_type: "message_status",
              signature_valid: isSigValid,
              processing_status: "processed",
              processing_result: `Updated status to ${status}`,
              payload: st,
              wamid: wamid,
              recipient_or_sender: recipientId,
              processed_at: new Date().toISOString(),
            });

          // Update message status via idempotent RPC
          const { data: rpcRes } = await supabase.rpc("whatsapp_update_message_status_idempotent", {
            p_wamid: wamid,
            p_new_status: status,
            p_event_timestamp: timestamp,
            p_raw_event: st,
            p_error_code: errorCode,
            p_error_message: errorMsg,
          });

          processedEvents.push({ eventId, wamid, status, rpcRes });
        }

        // B. Handle Inbound Messages (for logging)
        const messages = Array.isArray(val?.messages) ? val.messages : [];
        for (const msg of messages) {
          const msgId = msg.id;
          const fromPhone = msg.from;
          const eventId = `msg_inbound_${msgId}`;

          await supabase
            .from("whatsapp_webhook_events")
            .insert({
              event_id: eventId,
              event_type: "inbound_message",
              signature_valid: isSigValid,
              processing_status: "processed",
              processing_result: "Inbound message received and logged",
              payload: msg,
              wamid: msgId,
              recipient_or_sender: fromPhone,
              processed_at: new Date().toISOString(),
            });

          processedEvents.push({ eventId, msgId, from: fromPhone, type: "inbound_message" });
        }
      }
    }

    // Always respond 200 OK to Meta to acknowledge delivery
    return new Response(JSON.stringify({ status: "ok", processed: processedEvents.length }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  return new Response("Method not allowed", { status: 405 });
});
