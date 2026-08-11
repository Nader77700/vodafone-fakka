// Edge Function: الاشتراكات القادمة وإلغاء الاشتراك — أنا فودافون PHASE 2
// المنطق مطابق 100% لـ get_upcoming_subscriptions + cancel_subscription في السكربت المرجعي
// Token يُجلب من DB Server-Side ولا يُرسل للـ Frontend أبداً
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { zeroTrustCheck, CORS_HEADERS } from "../_shared/zero_trust.ts";

const CORS = CORS_HEADERS;

// ثوابت مطابقة للسكربت المرجعي
const DEVICE_ID  = "b61c90c58c612671";
const DIGITAL_ID = "2BD5YKHMAXBTC";

// Headers مشتركة — مطابقة للسكربت
const COMMON_HEADERS: Record<string, string> = {
  "Accept":                  "application/json",
  "Accept-Language":         "ar",
  "Accept-Encoding":         "gzip",
  "Connection":              "Keep-Alive",
  "User-Agent":              "okhttp/4.12.0",
  "x-agent-operatingsystem": "16",
  "clientId":                "AnaVodafoneAndroid",
  "x-agent-device":          "OPPO CPH2737",
  "x-agent-version":         "2026.4.1",
  "x-agent-build":           "1139",
  "digitalId":               DIGITAL_ID,
  "device-id":               DEVICE_ID,
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

// ── extract_subscription_info — مطابق للسكربت ──────────────────
function extractSubscriptionInfo(sub: Record<string, unknown>) {
  const subId   = String(sub.id ?? "");
  const subType = String(sub["@type"] ?? "");
  const status  = String(sub.status ?? "غير مفعلة");

  let description: string | null = null;
  let price: string | null = null;
  let encProductId: string | null = null;

  const productOffering = sub.productOffering as Record<string, unknown> | undefined;
  if (productOffering) {
    encProductId = String(productOffering.encProductId ?? "");
  }

  const productPrice = (sub.productPrice as Record<string, unknown>[]) ?? [];
  for (const p of productPrice) {
    if (p.description) description = String(p.description);
    const priceCharacteristic = (p.priceCharacteristic as Record<string, unknown>[]) ?? [];
    for (const pc of priceCharacteristic) {
      if (pc.name === "bundleFees") price = String(pc.value ?? "");
    }
  }

  return { id: subId, type: subType, status, description, price, enc_product_id: encProductId };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Zero Trust
  const zt = await zeroTrustCheck(req);
  if ("error" in zt) return json({ success: false, error: zt.error }, 200);
  const { user: caller, supabaseAdmin } = zt;

  try {
    // التحقق من الحساب والاشتراك
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("role, is_active").eq("id", caller.id).single();
    if (!prof?.is_active)
      return json({ success: false, error: "حسابك محظور — تواصل مع الإدارة" }, 200);

    const { data: sub } = await supabaseAdmin
      .from("subscriptions").select("status, expires_at").eq("user_id", caller.id).maybeSingle();
    const isAdmin = prof && ["admin", "super_admin"].includes(prof.role);
    const hasActive = isAdmin ||
      (sub && sub.status === "active" && (!sub.expires_at || new Date(sub.expires_at) > new Date()));
    if (!hasActive)
      return json({ success: false, error: "اشتراكك منتهٍ — يرجى تجديد الاشتراك" }, 200);

    // ── جلب الجلسة من DB — Token لا يأتي من Frontend ──
    const { data: sessionRow, error: sessErr } = await supabaseAdmin
      .from("ana_vodafone_sessions")
      .select("access_token, phone, expires_at")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (sessErr || !sessionRow)
      return json({ success: false, error: "لم يتم تسجيل الدخول — يرجى تسجيل الدخول أولاً", code: "NO_SESSION" }, 200);

    if (new Date(sessionRow.expires_at) <= new Date())
      return json({ success: false, error: "انتهت صلاحية الجلسة — يرجى تسجيل الدخول مرة أخرى", code: "SESSION_EXPIRED" }, 200);

    const accessToken = sessionRow.access_token as string;
    const phone       = sessionRow.phone as string;

    // ── تحديد العملية ──
    const body = await req.json() as { action: string; subscription_id?: string; enc_product_id?: string };
    const { action } = body;

    // ══════════════════════════════════════════════════════════
    // ACTION: get_subscriptions — مطابق لـ get_upcoming_subscriptions()
    // ══════════════════════════════════════════════════════════
    if (action === "get_subscriptions") {
      const url = "https://mobile.vodafone.com.eg/services/dxl/pim/product";
      const params = new URLSearchParams({
        "relatedParty.id":   phone,
        "@type":             "AllInOne",
        "relatedParty.name": "SubscriptionManagement",
      });

      console.log("[subscriptions] get_subscriptions for:", phone.slice(0, 6) + "XXXXX");

      const res = await fetchWithTimeout(
        `${url}?${params}`,
        {
          method: "GET",
          headers: {
            ...COMMON_HEADERS,
            "api-host":     "ProductInventoryManagementHost",
            "useCase":      "AllInOne",
            "Authorization": `Bearer ${accessToken}`,
            "api-version":  "v2",
            "msisdn":       phone,
            "Content-Type": "application/json",
            "Host":         "mobile.vodafone.com.eg",
          },
        },
        30
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("[subscriptions] get failed:", res.status, txt.slice(0, 200));
        if (res.status === 401)
          return json({ success: false, error: "انتهت صلاحية الجلسة — يرجى تسجيل الدخول مرة أخرى", code: "SESSION_EXPIRED" }, 200);
        return json({ success: false, error: `فشل جلب الاشتراكات — كود الخطأ: ${res.status}` }, 200);
      }

      const rawData = await res.json() as unknown[];
      const subscriptions = Array.isArray(rawData) ? rawData : [];

      // استخراج بيانات كل اشتراك — مطابق لـ extract_subscription_info()
      const extracted = subscriptions
        .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
        .map(extractSubscriptionInfo);

      console.log("[subscriptions] fetched count:", extracted.length);
      return json({ success: true, subscriptions: extracted });
    }

    // ══════════════════════════════════════════════════════════
    // ACTION: cancel_subscription — مطابق لـ cancel_subscription()
    // ══════════════════════════════════════════════════════════
    if (action === "cancel_subscription") {
      const { subscription_id, enc_product_id } = body;

      if (!subscription_id || !enc_product_id)
        return json({ success: false, error: "بيانات الاشتراك غير مكتملة" }, 200);

      // ── أمان: التحقق أن الاشتراك يخص هذا المستخدم ──
      // نجلب الاشتراكات ونتحقق أن subscription_id موجود فيها
      const verifyUrl = "https://mobile.vodafone.com.eg/services/dxl/pim/product";
      const verifyParams = new URLSearchParams({
        "relatedParty.id":   phone,
        "@type":             "AllInOne",
        "relatedParty.name": "SubscriptionManagement",
      });

      const verifyRes = await fetchWithTimeout(
        `${verifyUrl}?${verifyParams}`,
        {
          method: "GET",
          headers: {
            ...COMMON_HEADERS,
            "api-host":      "ProductInventoryManagementHost",
            "useCase":       "AllInOne",
            "Authorization": `Bearer ${accessToken}`,
            "api-version":   "v2",
            "msisdn":        phone,
            "Content-Type":  "application/json",
            "Host":          "mobile.vodafone.com.eg",
          },
        },
        30
      );

      if (verifyRes.ok) {
        const allSubs = await verifyRes.json() as unknown[];
        const subsArray = Array.isArray(allSubs) ? allSubs : [];
        const owns = subsArray.some((s) => {
          if (typeof s !== "object" || s === null) return false;
          const info = extractSubscriptionInfo(s as Record<string, unknown>);
          return info.id === subscription_id && info.enc_product_id === enc_product_id;
        });
        if (!owns) {
          console.warn("[subscriptions] cancel ownership check failed — sub_id:", subscription_id);
          return json({ success: false, error: "لا يمكن إلغاء هذا الاشتراك — غير مرتبط بهذا الحساب" }, 200);
        }
      }

      // ── تنفيذ الإلغاء — مطابق لـ cancel_subscription() ──
      const cancelUrl = "https://mobile.vodafone.com.eg/services/dxl/pom/productOrder";
      const payload = {
        channel:   { name: "MobileApp" },
        orderItem: [{
          action: "delete",
          id:     subscription_id,
          product: {
            characteristic: [
              { name: "LangId",        value: "en" },
              { name: "ExecutionType", value: "Sync" },
            ],
            encProductId: enc_product_id,
            id:           subscription_id,
            relatedParty: [{ id: phone, name: "MSISDN", role: "Subscriber" }],
          },
        }],
        "@type": "AllInOneOffer",
      };

      console.log("[subscriptions] cancel sub_id:", subscription_id);

      const cancelRes = await fetchWithTimeout(
        cancelUrl,
        {
          method: "POST",
          headers: {
            ...COMMON_HEADERS,
            "api-host":           "ProductOrderingManagement",
            "useCase":            "DataLineAddons",
            "Authorization":      `Bearer ${accessToken}`,
            "api-version":        "v2",
            "msisdn":             phone,
            "Accept":             "application/json",
            "Content-Type":       "application/json; charset=UTF-8",
            "Host":               "mobile.vodafone.com.eg",
          },
          body: JSON.stringify(payload),
        },
        30
      );

      // السكربت يتوقع 201 للنجاح
      if (cancelRes.status !== 201) {
        const errTxt = await cancelRes.text().catch(() => "");
        console.error("[subscriptions] cancel failed:", cancelRes.status, errTxt.slice(0, 200));
        if (cancelRes.status === 401)
          return json({ success: false, error: "انتهت صلاحية الجلسة — يرجى تسجيل الدخول مرة أخرى", code: "SESSION_EXPIRED" }, 200);
        return json({ success: false, error: `فشل إلغاء الاشتراك — كود الخطأ: ${cancelRes.status}` }, 200);
      }

      console.log("[subscriptions] cancel success:", subscription_id);
      return json({ success: true, message: "تم إلغاء الاشتراك بنجاح" });
    }

    return json({ success: false, error: "عملية غير معروفة" }, 200);

  } catch (err) {
    console.error("[subscriptions] fatal:", String(err));
    return json({ success: false, error: "خطأ داخلي في الخادم — يرجى المحاولة مرة أخرى" }, 200);
  }
});
