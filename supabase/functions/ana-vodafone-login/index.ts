// Edge Function: تسجيل دخول أنا فودافون — عروض واشتراكات
// المنطق مطابق 100% لـ login_ana_vodafone في السكربت المرجعي
// Token يُحفظ Server-Side ولا يُرسل للـ Frontend أبداً
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { zeroTrustCheck, CORS_HEADERS } from "../_shared/zero_trust.ts";

const CORS = CORS_HEADERS;

// ثوابت مطابقة للسكربت المرجعي
const DEVICE_ID  = "b61c90c58c612671";
const DIGITAL_ID = "2BD5YKHMAXBTC";

const LOGIN_HEADERS: Record<string, string> = {
  "Accept":                  "application/json, text/plain, */*",
  "Connection":              "keep-alive",
  "silentLogin":             "true",
  "x-agent-operatingsystem": "16",
  "clientId":                "AnaVodafoneAndroid",
  "Accept-Language":         "ar",
  "x-agent-device":          "OPPO CPH2737",
  "x-agent-version":         "2026.4.1",
  "x-agent-build":           "1139",
  "digitalId":               DIGITAL_ID,
  "device-id":               DEVICE_ID,
  "Accept-Encoding":         "gzip",
  "User-Agent":              "okhttp/4.12.0",
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

  // Zero Trust — يتحقق من JWT + اشتراك نشط
  const zt = await zeroTrustCheck(req);
  if ("error" in zt) return json({ success: false, error: zt.error }, 200);
  const { user: caller, supabaseAdmin } = zt;

  try {
    // التحقق من أن الحساب نشط ومشترك
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("role, is_active")
      .eq("id", caller.id)
      .single();

    if (!prof?.is_active)
      return json({ success: false, error: "حسابك محظور — تواصل مع الإدارة" }, 200);

    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("status, expires_at")
      .eq("user_id", caller.id)
      .maybeSingle();

    const isAdmin = prof && ["admin", "super_admin"].includes(prof.role);
    const hasActive =
      isAdmin ||
      (sub && sub.status === "active" && (!sub.expires_at || new Date(sub.expires_at) > new Date()));

    if (!hasActive)
      return json({ success: false, error: "اشتراكك منتهٍ — يرجى تجديد الاشتراك" }, 200);

    // استقبال بيانات الدخول
    const body = await req.json();
    const { phone, password } = body as { phone: string; password: string };

    if (!phone || !password)
      return json({ success: false, error: "أدخل رقم الهاتف وكلمة المرور" }, 200);

    if (!phone.startsWith("01") || phone.length !== 11)
      return json({ success: false, error: "رقم الهاتف غير صحيح — 11 رقم يبدأ بـ 01" }, 200);

    console.log("[ana-vodafone-login] start for:", phone.slice(0, 6) + "XXXXX");

    // ── تسجيل الدخول — مطابق تماماً لـ login_ana_vodafone() في السكربت ──
    const loginRes = await fetchWithTimeout(
      "https://mobile.vodafone.com.eg/auth/realms/vf-realm/protocol/openid-connect/token",
      {
        method: "POST",
        headers: {
          ...LOGIN_HEADERS,
          "msisdn":       phone,
          "Content-Type": "application/x-www-form-urlencoded",
          "Host":         "mobile.vodafone.com.eg",
        },
        body: new URLSearchParams({
          grant_type:    "password",
          username:      phone,
          password:      password,
          client_secret: "dca0pbLUWXVhXR266Gw1iT5rqwvvJQoN",
          client_id:     "AnaVF",
        }).toString(),
      },
      30
    );

    const loginTxt = await loginRes.text();
    console.log("[ana-vodafone-login] status:", loginRes.status, loginTxt.slice(0, 150));

    let loginData: Record<string, unknown> = {};
    try { loginData = JSON.parse(loginTxt); } catch { /* ignore */ }

    // ── فشل تسجيل الدخول ──
    if (!loginRes.ok || !loginData.access_token) {
      const errDesc = String(loginData.error_description ?? loginData.error ?? "");
      let friendly = "بيانات تسجيل الدخول غير صحيحة";
      if (errDesc.toLowerCase().includes("invalid") || errDesc.toLowerCase().includes("credentials")) {
        friendly = "رقم الهاتف أو كلمة المرور غير صحيحة";
      } else if (errDesc.toLowerCase().includes("locked") || errDesc.toLowerCase().includes("block")) {
        friendly = "الحساب محظور مؤقتاً — حاول مرة أخرى لاحقاً";
      } else if (loginRes.status >= 500) {
        friendly = "خطأ في الاتصال بخوادم فودافون — حاول مرة أخرى";
      } else if (errDesc) {
        friendly = errDesc;
      }
      return json({ success: false, error: `❌ ${friendly}` }, 200);
    }

    // ── نجاح تسجيل الدخول ──
    const accessToken  = String(loginData.access_token);
    const refreshToken = String(loginData.refresh_token ?? "");
    const expiresIn    = Number(loginData.expires_in ?? 3600);
    const expiresAt    = new Date(Date.now() + expiresIn * 1000).toISOString();

    console.log("[ana-vodafone-login] success, expires_in:", expiresIn);

    // ── حفظ الجلسة Server-Side (upsert) — Token لا يُرسل للـ Frontend ──
    const { error: upsertErr } = await supabaseAdmin
      .from("ana_vodafone_sessions")
      .upsert(
        {
          user_id:       caller.id,
          phone:         phone,
          access_token:  accessToken,
          refresh_token: refreshToken,
          expires_at:    expiresAt,
          updated_at:    new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (upsertErr) {
      console.error("[ana-vodafone-login] upsert error:", upsertErr.message);
      return json({ success: false, error: "خطأ في حفظ الجلسة — حاول مرة أخرى" }, 200);
    }

    // ── الرد للـ Frontend — بدون أي token ──
    return json({
      success: true,
      phone,
      expires_at: expiresAt,
      // معلومات إضافية من JWT payload إن أمكن (بدون token)
      display_name: `0${phone.slice(1)}`.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3'),
    });

  } catch (err) {
    console.error("[ana-vodafone-login] fatal:", String(err));
    return json({ success: false, error: "خطأ داخلي في الخادم — يرجى المحاولة مرة أخرى" }, 200);
  }
});
