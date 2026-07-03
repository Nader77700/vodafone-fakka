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
    const { product_id, receiver, access_token, msisdn } = await req.json();

    if (!product_id || !receiver || !access_token || !msisdn)
      return json({ success: false, error: "بيانات غير مكتملة — يرجى تسجيل الدخول مجدداً" }, 400);
    if (!receiver.startsWith("01") || receiver.length !== 11)
      return json({ success: false, error: "رقم المستفيد غير صحيح — 11 رقم يبدأ بـ 01" }, 400);

    console.log("[balance-charge] start", { product_id, receiver, msisdn: msisdn.slice(0,6)+"XXXXX" });

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

    if (result?.state === "Completed" || result?.complete === true) {
      return json({ success: true, message: "✅ تم الشحن من الرصيد بنجاح!" });
    }

    // تحليل أكواد الخطأ — مطابق للسكربت المرجعي
    // كود 2252 = رصيد غير كافٍ (كما في السكربت: result.get('code') == "2252")
    const errCode = String(result?.code ?? "");
    const rawErr  = String(result?.message ?? result?.description ?? result?.reason ?? result?.error ?? "");
    let friendly  = "❌ فشل الطلب — تحقق من رصيد حسابك وبيانات تسجيل الدخول";

    if (errCode === "2252" || rawErr.includes("رصيد غير كافٍ")) {
      friendly = "❌ رصيد غير كافٍ";
    } else if (errCode === "6051" || rawErr.toLowerCase().includes("insufficient") || rawErr.includes("رصيد")) {
      friendly = "💳 رصيد حسابك غير كافٍ لإتمام العملية";
    } else if (errCode === "401" || orderRes.status === 401 || rawErr.toLowerCase().includes("token") || rawErr.toLowerCase().includes("expired")) {
      friendly = "🔑 انتهت صلاحية الجلسة — يرجى تسجيل الدخول مجدداً";
    } else if (errCode === "1051" || rawErr.toLowerCase().includes("unregistered")) {
      friendly = "📵 رقمك غير مسجّل في خدمة أنا فودافون — فعّل الخدمة أولاً";
    } else if (rawErr) {
      friendly = `❌ ${rawErr}`;
    }

    const isSessionExpired = errCode === "401" || orderRes.status === 401 || rawErr.toLowerCase().includes("expired") || rawErr.toLowerCase().includes("token");

    return json({
      success: false,
      error: friendly,
      error_code: errCode,
      session_expired: isSessionExpired,
    }, 422);

  } catch (err) {
    console.error("[balance-charge] fatal:", String(err));
    return json({ success: false, error: "خطأ داخلي في الخادم — يرجى المحاولة مرة أخرى" }, 500);
  }
});
