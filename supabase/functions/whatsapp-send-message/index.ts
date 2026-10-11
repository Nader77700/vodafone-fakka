// Edge Function: whatsapp-send-message
// إرسال رسائل WhatsApp رسمية عبر Meta Graph API مع تتبع دقيق للحالات
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

function sanitizePhone(phone: string): string {
  // Strip non-digit characters
  let clean = phone.replace(/[^0-9]/g, "");
  // Handle Egyptian local numbers starting with 01
  if (clean.startsWith("01") && clean.length === 11) {
    clean = "20" + clean.substring(1);
  } else if (clean.startsWith("1") && clean.length === 10) {
    clean = "20" + clean;
  }
  return clean;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 1. Verify caller authorization (must be admin)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ success: false, error: "Missing authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const isServiceCall = token === supabaseServiceKey || req.headers.get("x-internal-key") === "vfp_internal_push_2025";
    let callerUserId: string | null = null;

    if (!isServiceCall) {
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) {
        return json({ success: false, error: "Invalid session token" }, 401);
      }

      const { data: profile } = await supabase
        .from("core_profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.role !== "admin" && profile?.role !== "super_admin") {
        return json({ success: false, error: "Unauthorized: Admin access required" }, 403);
      }
      callerUserId = user.id;
    }

    // 2. Parse request body
    const body = await req.json();
    const rawRecipient = body.recipient_phone?.trim();
    const messageType = body.message_type || "text"; // "text" | "template"
    const templateName = body.template_name?.trim();
    const templateLang = body.template_language?.trim() || "ar";
    const templateVariables = Array.isArray(body.template_variables) ? body.template_variables : [];
    const textBody = body.body_text?.trim();

    if (!rawRecipient) {
      return json({ success: false, error: "رقم هاتف المستلم مطلوب" }, 400);
    }

    const recipientPhone = sanitizePhone(rawRecipient);
    if (recipientPhone.length < 8) {
      return json({ success: false, error: "رقم الهاتف غير صالح" }, 400);
    }

    if (messageType === "text" && !textBody) {
      return json({ success: false, error: "نص الرسالة مطلوب" }, 400);
    }

    if (messageType === "template" && !templateName) {
      return json({ success: false, error: "اسم القالب مطلوب" }, 400);
    }

    // 3. Load Meta configuration & secrets
    const { data: config } = await supabase
      .from("whatsapp_business_config")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    const { data: secrets } = await supabase
      .from("whatsapp_business_secrets")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    const accessToken = secrets?.access_token?.trim();
    const phoneNumberId = config?.phone_number_id?.trim();
    const apiVersion = config?.graph_api_version?.trim() || "v20.0";

    if (!accessToken || !phoneNumberId) {
      return json({
        success: false,
        error: "بيانات الاتصال مع Meta غير مكتملة (يرجى حفظ Access Token و Phone Number ID)",
      }, 400);
    }

    // 4. Record initial message in database (status: sending)
    const { data: messageRecord, error: insertError } = await supabase
      .from("whatsapp_messages")
      .insert({
        recipient_phone: recipientPhone,
        message_type: messageType,
        template_name: messageType === "template" ? templateName : null,
        template_language: messageType === "template" ? templateLang : null,
        template_variables: messageType === "template" ? templateVariables : [],
        body_text: messageType === "text" ? textBody : null,
        status: "sending",
        source: body.source || "admin_test",
        created_by: callerUserId,
        send_attempt_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !messageRecord) {
      return json({ success: false, error: "فشل حفظ سجل الرسالة في قاعدة البيانات" }, 500);
    }

    // 5. Build Meta Graph API Payload
    let metaPayload: any = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientPhone,
    };

    if (messageType === "text") {
      metaPayload.type = "text";
      metaPayload.text = { preview_url: false, body: textBody };
    } else if (messageType === "template") {
      metaPayload.type = "template";
      const templateObj: any = {
        name: templateName,
        language: { code: templateLang },
      };

      if (templateVariables.length > 0) {
        templateObj.components = [
          {
            type: "body",
            parameters: templateVariables.map((val: string) => ({
              type: "text",
              text: String(val),
            })),
          },
        ];
      }
      metaPayload.template = templateObj;
    }

    // 6. Send to Meta Graph API
    const metaUrl = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`;
    const metaResponse = await fetch(metaUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(metaPayload),
    });

    const metaData = await metaResponse.json();

    if (!metaResponse.ok) {
      // Failed to send
      const errorCode = String(metaData?.error?.code || metaResponse.status);
      const errorMsg = metaData?.error?.message || "رفضت Meta إرسال الرسالة";

      await supabase
        .from("whatsapp_messages")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          error_code: errorCode,
          error_message: errorMsg,
          meta_response: metaData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", messageRecord.id);

      // Log status history
      await supabase
        .from("whatsapp_message_status_history")
        .insert({
          message_id: messageRecord.id,
          status: "failed",
          raw_event: metaData,
          event_timestamp: new Date().toISOString(),
        });

      return json({
        success: false,
        error: errorMsg,
        error_code: errorCode,
        message_id: messageRecord.id,
      }, 400);
    }

    // Meta accepted the message!
    const wamid = metaData?.messages?.[0]?.id || null;
    const nowIso = new Date().toISOString();

    await supabase
      .from("whatsapp_messages")
      .update({
        status: "accepted",
        wamid: wamid,
        accepted_at: nowIso,
        meta_response: metaData,
        updated_at: nowIso,
      })
      .eq("id", messageRecord.id);

    // Log status history
    await supabase
      .from("whatsapp_message_status_history")
      .insert({
        message_id: messageRecord.id,
        wamid: wamid,
        status: "accepted",
        raw_event: metaData,
        event_timestamp: nowIso,
      });

    return json({
      success: true,
      message_id: messageRecord.id,
      wamid: wamid,
      status: "accepted",
      recipient_phone: recipientPhone,
      timestamp: nowIso,
    });
  } catch (err: any) {
    return json({
      success: false,
      error: err?.message || "Internal server error during message dispatch",
    }, 500);
  }
});
