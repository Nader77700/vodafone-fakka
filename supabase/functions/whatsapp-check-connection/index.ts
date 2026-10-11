// Edge Function: whatsapp-check-connection
// فحص الاتصال الفعلي مع Meta Graph API لـ WhatsApp Business Cloud API
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

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
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return json({ success: false, error: "Invalid session token" }, 401);
    }

    // Check if user is admin
    const { data: isAdmin, error: adminErr } = await supabase.rpc("is_current_admin");
    if (adminErr || !isAdmin) {
      // Fallback check core_profiles directly
      const { data: profile } = await supabase
        .from("core_profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      const role = profile?.role;
      if (role !== "admin" && role !== "super_admin") {
        return json({ success: false, error: "Unauthorized: Admin access required" }, 403);
      }
    }

    // 2. Read public config & server secrets
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
    const wabaId = config?.waba_id?.trim();
    const apiVersion = config?.graph_api_version?.trim() || "v20.0";

    const missingFields: string[] = [];
    if (!accessToken) missingFields.push("Access Token");
    if (!phoneNumberId) missingFields.push("Phone Number ID");
    if (!wabaId) missingFields.push("WhatsApp Business Account ID (WABA ID)");

    if (missingFields.length > 0) {
      const details = {
        checked_at: new Date().toISOString(),
        status: "incomplete",
        missing_fields: missingFields,
        message: `الإعدادات غير مكتملة: يرجى توفير ${missingFields.join("، ")}`,
      };

      await supabase
        .from("whatsapp_business_config")
        .update({
          last_connection_test_at: new Date().toISOString(),
          last_connection_status: "incomplete",
          connection_details: details,
          updated_at: new Date().toISOString(),
        })
        .eq("id", "default");

      return json({
        success: false,
        status: "incomplete",
        details,
      });
    }

    // 3. Test Meta Graph API Connectivity
    // Call 1: Check token validity and basic app info
    const meRes = await fetch(`https://graph.facebook.com/${apiVersion}/me?access_token=${encodeURIComponent(accessToken)}`);
    const meData = await meRes.json();

    if (!meRes.ok) {
      const errorMsg = meData?.error?.message || "فشل التحقق من رمز الوصول مع Meta";
      const errorCode = meData?.error?.code || meRes.status;
      const details = {
        checked_at: new Date().toISOString(),
        status: "failed",
        error_code: errorCode,
        error_message: errorMsg,
        meta_error: meData?.error,
      };

      await supabase
        .from("whatsapp_business_config")
        .update({
          last_connection_test_at: new Date().toISOString(),
          last_connection_status: "failed",
          connection_details: details,
          updated_at: new Date().toISOString(),
        })
        .eq("id", "default");

      return json({
        success: false,
        status: "failed",
        details,
      });
    }

    // Call 2: Check Phone Number ID
    let phoneInfo = null;
    let phoneError = null;
    try {
      const phoneRes = await fetch(
        `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}?fields=verified_name,display_phone_number,code_verification_status,quality_rating&access_token=${encodeURIComponent(accessToken)}`
      );
      phoneInfo = await phoneRes.json();
      if (!phoneRes.ok) {
        phoneError = phoneInfo?.error?.message || "تعذر جلب تفاصيل رقم الهاتف";
      }
    } catch (e: any) {
      phoneError = e?.message || "خطأ اتصال أثناء جلب تفاصيل الرقم";
    }

    // Call 3: Check WABA ID
    let wabaInfo = null;
    let wabaError = null;
    try {
      const wabaRes = await fetch(
        `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(wabaId)}?fields=id,name,currency,timezone_id,message_template_namespace&access_token=${encodeURIComponent(accessToken)}`
      );
      wabaInfo = await wabaRes.json();
      if (!wabaRes.ok) {
        wabaError = wabaInfo?.error?.message || "تعذر جلب تفاصيل حساب الأعمال WABA";
      }
    } catch (e: any) {
      wabaError = e?.message || "خطأ اتصال أثناء جلب تفاصيل WABA";
    }

    // Call 4: Fetch Message Templates from Meta WABA
    let metaTemplates: any[] = [];
    let templatesError: string | null = null;
    if (wabaInfo && !wabaError) {
      try {
        const tplRes = await fetch(
          `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(wabaId)}/message_templates?fields=name,status,language,category&limit=100&access_token=${encodeURIComponent(accessToken)}`
        );
        const tplData = await tplRes.json();
        if (tplRes.ok && Array.isArray(tplData?.data)) {
          metaTemplates = tplData.data.map((t: any) => ({
            name: t.name,
            status: t.status,
            language: t.language,
            category: t.category,
          }));
        } else {
          templatesError = tplData?.error?.message || "تعذر جلب قائمة القوالب من Meta";
        }
      } catch (e: any) {
        templatesError = e?.message || "خطأ اتصال أثناء جلب قوالب Meta";
      }
    }

    const isFullSuccess = !phoneError && !wabaError;
    const connectionStatus = isFullSuccess
      ? "success"
      : phoneError?.includes("permission") || wabaError?.includes("permission")
      ? "insufficient_permissions"
      : "partial";

    const connectionDetails = {
      checked_at: new Date().toISOString(),
      status: connectionStatus,
      app_me: {
        id: meData?.id,
        name: meData?.name,
      },
      phone_number: phoneInfo && !phoneError ? {
        id: phoneInfo.id,
        verified_name: phoneInfo.verified_name,
        display_phone_number: phoneInfo.display_phone_number,
        code_verification_status: phoneInfo.code_verification_status,
        quality_rating: phoneInfo.quality_rating,
      } : { error: phoneError },
      waba: wabaInfo && !wabaError ? {
        id: wabaInfo.id,
        name: wabaInfo.name,
        currency: wabaInfo.currency,
        timezone_id: wabaInfo.timezone_id,
        template_namespace: wabaInfo.message_template_namespace,
      } : { error: wabaError },
      templates: {
        count: metaTemplates.length,
        items: metaTemplates,
        error: templatesError,
      },
    };

    // Update public display phone if returned from Meta
    const updatePayload: Record<string, any> = {
      last_connection_test_at: new Date().toISOString(),
      last_connection_status: connectionStatus,
      connection_details: connectionDetails,
      updated_at: new Date().toISOString(),
    };

    if (phoneInfo?.display_phone_number && !phoneError) {
      updatePayload.display_phone_number = phoneInfo.display_phone_number;
    }

    await supabase
      .from("whatsapp_business_config")
      .update(updatePayload)
      .eq("id", "default");

    return json({
      success: isFullSuccess,
      status: connectionStatus,
      details: connectionDetails,
    });
  } catch (err: any) {
    return json({
      success: false,
      status: "failed",
      error: err?.message || "Internal server error during connection check",
    }, 500);
  }
});
