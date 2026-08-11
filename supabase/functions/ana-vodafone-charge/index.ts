// Edge Function: الشحن في قسم عروض واشتراكات فودافون PHASE 3
// المنطق مطابق لـ calculate_total_with_tax() في السكربت المرجعي
// لا يوجد في السكربت مكالمة الشحن — نفذه هو حساب المبلغ الإجمالي مع الضريبة
// كل البيانات الحساسة تبقى على الخادم

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { zeroTrustCheck, CORS_HEADERS } from "../_shared/zero_trust.ts";

const CORS = CORS_HEADERS;

const DEVICE_ID  = "b61c90c58c612671";
const DIGITAL_ID = "2BD5YKHMAXBTC";
const TAX_RATE   = 0.43;

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

function extractSubscriptionInfo(sub: Record<string, unknown>) {
  const subId   = String(sub.id ?? "");
  const subType = String(sub["@type"] ?? "");
  const status  = String(sub.status ?? "");
  let description: string | null = null;
  let price: string | null = null;
  let encProductId: string | null = null;

  const productOffering = sub.productOffering as Record<string, unknown> | undefined;
  if (productOffering) encProductId = String(productOffering.encProductId ?? "");

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

    // التحقق من تشغيل الشحن من الأدمن
    const { data: cfg } = await supabaseAdmin
      .from("core_app_config")
      .select("value")
      .eq("key", "vodafone_offers_charge_enabled")
      .maybeSingle();
    const chargeEnabled = cfg?.value === "true";
    if (!chargeEnabled)
      return json({ success: false, error: "الشحن موقف حاليًا من قبل الإدارة" }, 200);

    // التحقق من البيانات المرسلة
    const body = await req.json() as { subscription_id?: string; enc_product_id?: string; description?: string; price?: string | number; operation_id?: string };
    const { subscription_id, enc_product_id, description, price } = body;
    const operationId = body.operation_id || crypto.randomUUID();

    if (!subscription_id || !enc_product_id || price === undefined || price === null || price === "") {
      return json({ success: false, error: "بيانات الاشتراك غير كاملة" }, 200);
    }

    const basePrice = parseFloat(String(price));
    if (Number.isNaN(basePrice) || basePrice <= 0)
      return json({ success: false, error: "سعر الاشتراك غير صالح" }, 200);

    // التحقق من الجلسة
    const { data: sessionRow } = await supabaseAdmin
      .from("ana_vodafone_sessions")
      .select("access_token, phone, expires_at")
      .eq("user_id", caller.id)
      .maybeSingle();
    if (!sessionRow)
      return json({ success: false, error: "لم يتم تسجيل الدخول — يرجى التسجيل أولاً", code: "SESSION_EXPIRED" }, 200);
    if (new Date(sessionRow.expires_at) <= new Date())
      return json({ success: false, error: "انتهت صلاحية الجلسة — يرجى التسجيل مجدداً", code: "SESSION_EXPIRED" }, 200);

    const phone = sessionRow.phone as string;
    const accessToken = sessionRow.access_token as string;

    // التحقق من ملكية الاشتراك — احرز القيم ومراجعة الوصول
    const url = "https://mobile.vodafone.com.eg/services/dxl/pim/product";
    const params = new URLSearchParams({
      "relatedParty.id":   phone,
      "@type":             "AllInOne",
      "relatedParty.name": "SubscriptionManagement",
    });

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
      const text = await res.text().catch(() => "");
      console.error("[charge] subscription check failed:", res.status, text.slice(0, 200));
      if (res.status === 401)
        return json({ success: false, error: "انتهت صلاحية الجلسة — يرجى التسجيل مجدداً", code: "SESSION_EXPIRED" }, 200);
      return json({ success: false, error: "لا يمكن الوصول إلى الاشتراكات للتحقق" }, 200);
    }

    const rawData = await res.json() as unknown[];
    const subs = Array.isArray(rawData) ? rawData : [];
    const owned = subs.some((s) => {
      if (typeof s !== "object" || s === null) return false;
      const info = extractSubscriptionInfo(s as Record<string, unknown>);
      return info.id === subscription_id && info.enc_product_id === enc_product_id;
    });
    if (!owned)
      return json({ success: false, error: "لا يمكن الشحن — هذا الاشتراك غير مرتبط بالحساب" }, 200);

    // الـاحتساب بالمبلغ الإجمالي مطابق لـ calculate_total_with_tax()
    const taxAmount = parseFloat((basePrice * TAX_RATE).toFixed(2));
    const total = parseFloat((basePrice + taxAmount).toFixed(2));

    // سجل العملية في النظام
    const { error: insertErr } = await supabaseAdmin
      .from("vodafone_charge_logs")
      .insert({
        user_id:         caller.id,
        phone,
        subscription_id,
        enc_product_id,
        description:     description || null,
        base_price:      basePrice,
        tax_rate:        TAX_RATE,
        tax_amount:      taxAmount,
        total_amount:    total,
        operation_id:    operationId,
        status:          "success",
      });

    if (insertErr) {
      console.error("[charge] log insert failed:", insertErr);
      // لن نفشل العملية لمجرد فشل في السجل — لكن نسجل ملاحظة
      return json({ success: false, error: "فشل في تسجيل عملية الشحن — الرجاء المحاولة مرة أخرى" }, 200);
    }

    console.log("[charge] success:", operationId, "phone:", phone.slice(0, 6) + "XXXXX", "total:", total);

    return json({
      success: true,
      message: "تم احتساب المبلغ الإجمالي بنجاح",
      operation_id: operationId,
      breakdown: {
        base_price: basePrice,
        tax_rate:   TAX_RATE,
        tax_amount: taxAmount,
        total:      total,
      },
    });

  } catch (err) {
    console.error("[charge] fatal:", String(err));
    return json({ success: false, error: "خطأ داخلي في الخادم — يرجى المحاولة مرة أخرى" }, 200);
  }
});
