// Edge Function: عروض فودافون — جلب العروض والاشتراك
// المنطق مطابق 100% لـ get_offers + merge_offers + classify_offers + subscribe_offer في السكربت المرجعي
// Token يُجلب Server-Side من DB ولا يُرسل للـ Frontend أبداً

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { zeroTrustCheck, CORS_HEADERS } from "../_shared/zero_trust.ts";

const CORS = CORS_HEADERS;

const DEVICE_ID  = "b61c90c58c612671";
const DIGITAL_ID = "2BD5YKHMAXBTC";

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

interface RawOffer {
  name?: string;
  description?: string;
  id?: string;
  pattern?: { price?: { value?: number | string } }[];
  characteristics?: { name?: string; value?: string }[];
}

function extractOfferInfo(offer: RawOffer) {
  const name = (offer.name ?? "").trim();
  const description = (offer.description ?? "").trim();
  const offerId = (offer.id ?? "").trim();
  let price: number | string | null = null;
  for (const pattern of offer.pattern ?? []) {
    const p = pattern.price;
    if (p) {
      price = p.value ?? null;
      break;
    }
  }
  let redemptionCode: string | null = null;
  for (const char of offer.characteristics ?? []) {
    if (char.name === "redemptionCode") {
      redemptionCode = char.value ?? null;
      break;
    }
  }
  return { name, description, price, redemption_code: redemptionCode, id: offerId, raw: offer };
}

function classifyOffers(offers: RawOffer[]) {
  const flexOffers: RawOffer[] = [];
  const internetOffers: RawOffer[] = [];
  const otherOffers: RawOffer[] = [];
  const flexKeywords = ["فليكس", "فلێكس", "flex"];
  const internetKeywords = ["ميجا", "نت", "باقة", "plus", "إنترنت", "mb", "gb"];
  for (const offer of offers) {
    if (!offer || typeof offer !== "object") continue;
    const info = extractOfferInfo(offer);
    const text = `${info.name} ${info.description}`.toLowerCase();
    if (flexKeywords.some((kw) => text.includes(kw))) {
      flexOffers.push(offer);
    } else if (internetKeywords.some((kw) => text.includes(kw))) {
      internetOffers.push(offer);
    } else {
      otherOffers.push(offer);
    }
  }
  return { flexOffers, internetOffers, otherOffers };
}

function mergeOffers(...offerLists: RawOffer[][]) {
  const seen = new Set<string>();
  const result: RawOffer[] = [];
  for (const offers of offerLists) {
    if (!Array.isArray(offers)) continue;
    for (const offer of offers) {
      if (!offer || typeof offer !== "object") continue;
      const name = (offer.name ?? "").trim();
      let price: number | string | null = null;
      for (const pattern of offer.pattern ?? []) {
        const p = pattern.price;
        if (p) {
          price = p.value ?? null;
          break;
        }
      }
      const key = `${name}|${price}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(offer);
      }
    }
  }
  return result;
}

async function getOffersRaw(phone: string, accessToken: string) {
  const url = "https://mobile.vodafone.com.eg/services/dxl/promo/promotion";
  const params = new URLSearchParams({
    "@type":             "Promo",
    "$.context.type":    "offerstab",
  });

  const res = await fetchWithTimeout(
    `${url}?${params}`,
    {
      method: "GET",
      headers: {
        ...COMMON_HEADERS,
        "channel":       "MOBILE",
        "useCase":       "Promo",
        "Authorization": `Bearer ${accessToken}`,
        "api-version":   "v2",
        "msisdn":        phone,
        "Content-Type":  "application/json",
        "Host":          "mobile.vodafone.com.eg",
      },
    },
    30
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[offers] getOffers failed:", res.status, text.slice(0, 200));
    throw new Error(`فشل جلب العروض: ${res.status}`);
  }

  const raw = await res.json() as unknown;
  return Array.isArray(raw) ? raw : [];
}

async function subscribeOfferRaw(phone: string, accessToken: string, offerId: string) {
  const url = `https://mobile.vodafone.com.eg/services/dxl/promo/promotion/${offerId}`;
  const payload = {
    channel: { id: "0" },
    characteristics: [{ name: "Param6", value: "0" }],
    context: { type: "offerstabV2" },
    "@type": "Promo",
  };

  const res = await fetchWithTimeout(
    url,
    {
      method: "PATCH",
      headers: {
        ...COMMON_HEADERS,
        "channel":        "MOBILE",
        "useCase":        "Promo",
        "Authorization":  `Bearer ${accessToken}`,
        "api-version":    "v2",
        "msisdn":         phone,
        "Content-Type":   "application/json; charset=UTF-8",
        "Host":           "mobile.vodafone.com.eg",
      },
      body: JSON.stringify(payload),
    },
    30
  );

  if (res.status !== 204) {
    const text = await res.text().catch(() => "");
    console.error("[offers] subscribe failed:", res.status, text.slice(0, 200));
    throw new Error(`فشل الاشتراك: ${res.status}`);
  }
  return true;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const zt = await zeroTrustCheck(req);
  if ("error" in zt) return json({ success: false, error: zt.error }, 200);
  const { user: caller, supabaseAdmin } = zt;

  try {
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
    const phone = sessionRow.phone as string;

    const body = await req.json() as { action: string; offer_id?: string };
    const { action } = body;

    if (action === "get_offers") {
      const [offers1, offers2] = await Promise.all([
        getOffersRaw(phone, accessToken),
        getOffersRaw(phone, accessToken),
      ]);
      const allOffers = mergeOffers(offers1 as RawOffer[], offers2 as RawOffer[]);
      const { flexOffers, internetOffers, otherOffers } = classifyOffers(allOffers);

      return json({
        success: true,
        flex_offers: flexOffers.map(extractOfferInfo),
        internet_offers: internetOffers.map(extractOfferInfo),
        other_offers: otherOffers.map(extractOfferInfo),
      });
    }

    if (action === "subscribe_offer") {
      const offerId = body.offer_id;
      if (!offerId) return json({ success: false, error: "معرف العرض غير موجود" }, 200);
      await subscribeOfferRaw(phone, accessToken, offerId);
      return json({ success: true, message: "تم الاشتراك في العرض بنجاح" });
    }

    return json({ success: false, error: "عملية غير معروفة" }, 200);
  } catch (err) {
    console.error("[offers] fatal:", String(err));
    return json({ success: false, error: "خطأ داخلي في الخادم — يرجى المحاولة مرة أخرى" }, 200);
  }
});
