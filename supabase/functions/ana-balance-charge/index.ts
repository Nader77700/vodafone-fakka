// Edge Function: تنفيذ الشحن من رصيد أنا فودافون
// المرجع: Reference_Script_Instruction.txt — API ودقيقة كما في السكربت
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-build",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// هيدرات الشحن — مطابقة 100% للسكربت المرجعي
const CHARGE_HEADERS: Record<string, string> = {
  "User-Agent":              "okhttp/4.12.0",
  "Connection":              "Keep-Alive",
  "Accept":                  "application/json",
  "Accept-Encoding":         "gzip",
  "api-host":                "ProductOrderingManagement",
  "useCase":                 "FakkaAndMaredProduct",
  "api-version":             "v2",
  "device-id":               "e21f808017c900f3",
  "x-agent-operatingsystem": "13",
  "clientId":                "AnaVodafoneAndroid",
  "x-agent-device":          "LENOVO TB310XU",
  "x-agent-version":         "2026.4.1",
  "x-agent-build":           "1139",
  "Accept-Language":         "ar",
  "Content-Type":            "application/json; charset=UTF-8",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

async function fetchWithTimeout(url: string, opts: RequestInit, timeoutSec: number) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutSec * 1000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const requestStartedAt = Date.now();

  try {
    // ── التحقق من المصادقة ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "غير مصرح — يجب تسجيل الدخول" }, 401);

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !caller) return json({ success: false, error: "جلسة غير صحيحة — يرجى إعادة تسجيل الدخول" }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: prof } = await supabaseAdmin.from("profiles").select("role, is_active").eq("id", caller.id).single();
    if (!prof?.is_active) return json({ success: false, error: "حسابك محظور — تواصل مع الإدارة" }, 403);

    const { data: sub } = await supabaseAdmin
      .from("subscriptions").select("status, expires_at").eq("user_id", caller.id).maybeSingle();
    const isAdmin = prof && ["admin", "super_admin"].includes(prof.role);
    const hasActive = sub && sub.status === "active" && sub.expires_at && new Date(sub.expires_at) > new Date();
    if (!hasActive && !isAdmin) return json({ success: false, error: "اشتراكك منتهٍ — يرجى تجديد الاشتراك" }, 403);

    // ── استقبال بيانات الطلب ──
    const { product_id, receiver, access_token, msisdn, tx_uuid } = await req.json();

    if (!product_id || !receiver || !access_token || !msisdn)
      return json({ success: false, error: "بيانات غير مكتملة — يرجى تسجيل الدخول مجدداً" }, 400);
    if (!receiver.startsWith("01") || receiver.length !== 11)
      return json({ success: false, error: "رقم المستفيد غير صحيح — 11 رقم يبدأ بـ 01" }, 400);

    // ══ IDEMPOTENCY CHECK: إذا كان tx_uuid موجوداً تحقق هل سُجِّلت العملية بالفعل ══
    // يمنع التسجيل المزدوج في حالة retry من العميل
    if (tx_uuid) {
      const { data: existing } = await supabaseAdmin
        .from("operations")
        .select("operation_number, status")
        .contains("card_data", { tx_uuid })
        .eq("user_id", caller.id)
        .maybeSingle();
      if (existing) {
        console.log("[balance-charge] idempotency hit — already registered", { tx_uuid, op: existing.operation_number });
        return json({
          success:          existing.status === "success",
          message:          "✅ العملية مسجّلة بالفعل",
          operation_number: existing.operation_number,
          registered:       true,
          idempotent:       true,
        });
      }
    }

    console.log("[balance-charge] start", { product_id, receiver, msisdn: msisdn.slice(0,6)+"XXXXX", tx_uuid });

    // ── تنفيذ طلب الشحن — مطابق 100% للسكربت المرجعي ──
    // payload بسيط بدون PaymentMethod/USE_EMONEY — كما في get_fakka_cards_dict()
    // @type: "FakkaAndMared", useCase: "FakkaAndMaredProduct"
    const orderPayload = {
      channel: { name: "MobileApp" },
      orderItem: [{
        action: "insert",
        product: {
          id: product_id,
          relatedParty: [{ id: msisdn, name: "MSISDN", role: "Subscriber" }],
        },
        eCode: 0,
      }],
      "@type": "FakkaAndMared",
    };

    const orderRes = await fetchWithTimeout(
      "https://mobile.vodafone.com.eg/services/dxl/pom/productOrder",
      {
        method: "POST",
        headers: {
          ...CHARGE_HEADERS,
          "msisdn":        msisdn,
          "Authorization": `Bearer ${access_token}`,
        },
        body: JSON.stringify(orderPayload),
      },
      25
    );

    const orderTxt = await orderRes.text();
    console.log("[balance-charge] order:", orderRes.status, orderTxt.slice(0, 400));

    let result: Record<string, unknown> = {};
    try { result = JSON.parse(orderTxt); } catch { /* ignore */ }

    const performedAt = new Date().toISOString();
    const latencyMs   = Date.now() - requestStartedAt;

    if (result?.state === "Completed" || result?.complete === true) {
      // ── تسجيل العملية الناجحة سيرفر-سايد فوراً (لا يحتاج إنترنت من المستخدم) ──
      const { data: opData } = await supabaseAdmin
        .from("operations")
        .insert({
          user_id:          caller.id,
          phone_number:     receiver,
          card_type:        product_id,
          category:         "فكة",
          amount:           0,
          status:           "success",
          error_message:    null,
          performed_at:     performedAt,
          api_response:     "Completed",
          operation_source: "ana_vodafone_balance",
          card_data: {
            product_id,
            receiver,
            msisdn,
            via:             "native",
            latency_ms:      latencyMs,
            registered_by:   "edge_function",
            tx_uuid:         tx_uuid ?? null,
          },
        })
        .select("operation_number")
        .maybeSingle();

      const opNumber = (opData as { operation_number?: number } | null)?.operation_number ?? null;
      console.log("[balance-charge] op_insert success, op_number=", opNumber);

      await supabaseAdmin.from("activity_log").insert({
        user_id: caller.id, event_type: "recharge",
        title: `شحن ناجح من الرصيد — ${product_id}`,
        description: `الرقم: ${receiver}${opNumber != null ? ` | #${opNumber}` : ""}`,
        metadata: { product_id, phone: receiver, status: "success", operation_number: opNumber, operation_source: "ana_vodafone_balance" },
      }).then(()=>{}).catch(()=>{});

      await supabaseAdmin.from("notifications").insert({
        user_id: caller.id, title: `✅ تم شحن ${product_id} من الرصيد`,
        body: `الرقم: ${receiver}${opNumber != null ? `\nرقم العملية: #${opNumber}` : ""}\nالحالة: ناجحة`,
        type: "operation", is_global: false, is_read: false,
      }).then(()=>{}).catch(()=>{});

      return json({
        success:          true,
        message:          "✅ تم الشحن من الرصيد بنجاح!",
        operation_number: opNumber,
        performed_at:     performedAt,
        registered:       true,
      });
    }

    // ── تحليل أكواد الخطأ ──
    const errCode = String(result?.code ?? "");
    const rawErr  = String(result?.message ?? result?.description ?? result?.reason ?? result?.error ?? "");
    let friendly  = "❌ فشل الطلب — تحقق من رصيد حسابك وبيانات تسجيل الدخول";

    if (errCode === "2252" || rawErr.includes("رصيد غير كافٍ")) {
      friendly = "❌ رصيد غير كافٍ";
    } else if (errCode === "6051" || rawErr.toLowerCase().includes("insufficient") || rawErr.includes("رصيد")) {
      friendly = "💳 رصيد حسابك غير كافٍ لإتمام العملية";
    } else if (errCode === "3999") {
      friendly = "⚠️ خطأ مؤقت من خوادم فودافون — أعد المحاولة بعد ثوانٍ";
    } else if (errCode === "401" || orderRes.status === 401 || rawErr.toLowerCase().includes("token") || rawErr.toLowerCase().includes("expired")) {
      friendly = "🔑 انتهت صلاحية الجلسة — يرجى تسجيل الدخول مجدداً";
    } else if (errCode === "1051" || rawErr.toLowerCase().includes("unregistered")) {
      friendly = "📵 رقمك غير مسجّل في خدمة أنا فودافون — فعّل الخدمة أولاً";
    } else if (rawErr) {
      friendly = `❌ ${rawErr}`;
    }

    const isSessionExpired = errCode === "401" || orderRes.status === 401 ||
      rawErr.toLowerCase().includes("expired") || rawErr.toLowerCase().includes("token");

    // تسجيل العملية الفاشلة سيرفر-سايد أيضاً
    await supabaseAdmin.from("operations").insert({
      user_id: caller.id, phone_number: receiver, card_type: product_id,
      category: "فكة", amount: 0, status: "failed",
      error_message: friendly.split("\n")[0],
      performed_at: performedAt, api_response: friendly.split("\n")[0],
      operation_source: "ana_vodafone_balance",
      card_data: { product_id, receiver, msisdn, via: "native", error_code: errCode, latency_ms: latencyMs, registered_by: "edge_function" },
    }).then(()=>{}).catch(()=>{});

    return json({
      success:        false,
      error:          friendly,
      error_code:     errCode,
      session_expired:isSessionExpired,
      registered:     true,
    }, 422);

  } catch (err) {
    console.error("[balance-charge] fatal:", String(err));
    return json({ success: false, error: "خطأ داخلي في الخادم — يرجى المحاولة مرة أخرى" }, 500);
  }
});
