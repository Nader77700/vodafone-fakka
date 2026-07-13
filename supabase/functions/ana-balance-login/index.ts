// Edge Function: تسجيل دخول أنا فودافون للشحن من الرصيد
// المرجع: Reference_Script_Instruction.txt — credentials وهيدرات دقيقة كما في السكربت
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-build",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// هيدرات تسجيل الدخول — مطابقة 100% للسكربت المرجعي
const LOGIN_HEADERS: Record<string, string> = {
  "User-Agent":              "okhttp/4.12.0",
  "Accept":                  "application/json, text/plain, */*",
  "Accept-Encoding":         "gzip",
  "silentLogin":             "true",
  "x-agent-operatingsystem": "13",
  "clientId":                "AnaVodafoneAndroid",
  "Accept-Language":         "ar",
  "x-agent-device":          "LENOVO TB310XU",
  "x-agent-version":         "2026.4.1",
  "x-agent-build":           "1139",
  "digitalId":               "25ZQ6VBSZPI1V",
  "device-id":               "e21f808017c900f3",
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

    // التحقق من الاشتراك
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

    // ── استقبال بيانات تسجيل الدخول ──
    const { phone, password } = await req.json();
    if (!phone || !password) return json({ success: false, error: "أدخل رقم الهاتف وكلمة المرور" }, 400);
    if (!phone.startsWith("01") || phone.length !== 11)
      return json({ success: false, error: "رقم الهاتف غير صحيح — 11 رقم يبدأ بـ 01" }, 400);

    console.log("[balance-login] start for:", phone.slice(0, 6) + "XXXXX");

    // ── تسجيل الدخول بأنا فودافون — مطابق 100% للسكربت المرجعي ──
    // client_id=AnaVF, client_secret=dca0..., username=الرقم كاملاً مع الصفر
    const loginRes = await fetchWithTimeout(
      "https://mobile.vodafone.com.eg/auth/realms/vf-realm/protocol/openid-connect/token",
      {
        method: "POST",
        headers: {
          ...LOGIN_HEADERS,
          "msisdn":       phone,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type:    "password",
          username:      phone,
          password:      password,
          client_secret: "dca0pbLUWXVhXR266Gw1iT5rqwvvJQoN",
          client_id:     "AnaVF",
        }).toString(),
      },
      20
    );

    const loginTxt = await loginRes.text();
    console.log("[balance-login] response status:", loginRes.status, loginTxt.slice(0, 200));

    let loginData: Record<string, unknown> = {};
    try { loginData = JSON.parse(loginTxt); } catch { /* ignore */ }

    // فشل تسجيل الدخول
    if (!loginRes.ok || !loginData.access_token) {
      const errDesc = String(loginData.error_description ?? loginData.error ?? "");
      let friendly = "❌ بيانات تسجيل الدخول غير صحيحة";
      if (errDesc.toLowerCase().includes("invalid") || errDesc.toLowerCase().includes("credentials")) {
        friendly = "❌ رقم الهاتف أو كلمة المرور غير صحيحة";
      } else if (errDesc.toLowerCase().includes("locked") || errDesc.toLowerCase().includes("block")) {
        friendly = "🔒 الحساب محظور مؤقتاً — حاول مرة أخرى لاحقاً";
      } else if (errDesc.toLowerCase().includes("network") || loginRes.status >= 500) {
        friendly = "⚠️ خطأ في الاتصال بخوادم فودافون — حاول مرة أخرى";
      } else if (errDesc) {
        friendly = `❌ ${errDesc}`;
      }
      return json({ success: false, error: friendly }, 422);
    }

    // نجاح تسجيل الدخول
    const accessToken = String(loginData.access_token);
    const refreshToken = String(loginData.refresh_token ?? "");
    const expiresIn = Number(loginData.expires_in ?? 3600);
    const expiresAt = Date.now() + expiresIn * 1000;

    console.log("[balance-login] success, expires_in:", expiresIn);

    // msisdn: الرقم كما أُدخل (مع الصفر) — يُستخدم في كل طلبات الشحن
    const msisdn = phone;

    return json({
      success: true,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      msisdn,
      phone,
    });

  } catch (err) {
    console.error("[balance-login] fatal:", String(err));
    return json({ success: false, error: "خطأ داخلي في الخادم — يرجى المحاولة مرة أخرى" }, 500);
  }
});
