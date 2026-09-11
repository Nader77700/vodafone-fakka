/**
 * seamless-proxy — Edge Function
 * تجلب Seamless Token من Vodafone بـ client_ids متعددة بالتسلسل
 * تحلّ مشكلة HTTP 400 الناتجة عن تغيير Vodafone للـ client_id
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { zeroTrustCheck, CORS_HEADERS } from "../_shared/zero_trust.ts";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

// قائمة client_ids تُجرَّب بالتسلسل حتى أول نجاح
const SEAMLESS_CLIENT_IDS = [
  "AnaVodafoneAndroid",
  "ana-vodafone-app-seamless",
  "cash-app",
  "vodafone-app",
];

const SEAMLESS_URL =
  "http://mobile.vodafone.com.eg/checkSeamless/realms/vf-realm/protocol/openid-connect/auth";

// ══════════════════════════════════════════════════════════════
//  normalizeMsisdn — يحوّل أي صيغة لـ msisdn إلى 01XXXXXXXXX
//  يدعم: 2010XXXXXXX / +2010XXXXXXX / 010XXXXXXX / 10XXXXXXX
// ══════════════════════════════════════════════════════════════
function normalizeMsisdn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim().replace(/\s+/g, "");

  // أزل +20 أو 20 في البداية
  if (s.startsWith("+20")) s = s.slice(3);
  else if (s.startsWith("20") && s.length === 12) s = s.slice(2);

  // أضف الصفر إذا كان 10 أرقام يبدأ بـ 1 (مثلاً 10XXXXXXXX)
  if (s.length === 10 && s.startsWith("1")) s = "0" + s;

  // تحقق نهائي
  if (s.length === 11 && s.startsWith("01")) return s;

  // لم نتمكن من التطبيع — أعد null
  console.log(`[seamless-proxy] normalizeMsisdn: لم نتمكن من تطبيع "${raw}" → "${s}"`);
  return null;
}

const SEAMLESS_HEADERS: Record<string, string> = {
  "User-Agent":              "okhttp/4.12.0",
  "Connection":              "Keep-Alive",
  "x-dynatrace":             "MT_3_5_2386790616_1-0_a556db1b-4506-43f3-854a-1d2527767923_0_21317_157",
  "x-agent-operatingsystem": "16",
  "clientId":                "AnaVodafoneAndroid",
  "Accept-Language":         "ar",
  "x-agent-device":          "OPPO CPH2701",
  "x-agent-version":         "2026.7.1",
  "x-agent-build":           "1176",
  "digitalId":               "",
  "device-id":               "",
};

interface SeamlessResult {
  seamlessToken: string;
  msisdn: string | null;
  clientIdUsed: string;
}

async function tryClientId(clientId: string, customUrl?: string): Promise<SeamlessResult | null> {
  const base = customUrl || SEAMLESS_URL;
  const url  = `${base}?client_id=${clientId}`;
  try {
    const ctrl = new AbortController();
    const id   = setTimeout(() => ctrl.abort(), 6000);
    const res  = await fetch(url, {
      method: "GET",
      headers: { ...SEAMLESS_HEADERS, "clientId": clientId },
      signal: ctrl.signal,
    });
    clearTimeout(id);

    if (res.status !== 200) {
      console.log(`[seamless-proxy] client_id=${clientId} → HTTP ${res.status}`);
      return null;
    }

    const txt = await res.text();
    let data: Record<string, unknown>;
    try { data = JSON.parse(txt); }
    catch {
      console.log(`[seamless-proxy] client_id=${clientId} → parse error: ${txt.slice(0, 60)}`);
      return null;
    }

    const token  = data["seamlessToken"] as string | undefined;
    const msisdn = data["msisdn"]        as string | undefined;

    if (!token) {
      console.log(`[seamless-proxy] client_id=${clientId} → no token in response`);
      return null;
    }

    // طبّع msisdn إلى 01XXXXXXXXX قبل الإرجاع
    const normalizedMsisdn = normalizeMsisdn(msisdn ?? null);
    console.log(`[seamless-proxy] ✅ client_id=${clientId} → token OK, msisdn_raw=${msisdn ?? "null"} → normalized=${normalizedMsisdn ?? "null"}`);
    return { seamlessToken: token, msisdn: normalizedMsisdn, clientIdUsed: clientId };

  } catch (e) {
    console.log(`[seamless-proxy] client_id=${clientId} → exception:`, e);
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  // Zero-Trust Auth
  const zt = await zeroTrustCheck(req);
  if (zt.error) {
    console.error("[seamless-proxy] zero-trust rejected:", zt.error);
    return json({ success: false, error: zt.error }, zt.status ?? 401);
  }

  // قراءة custom_url اختياري من الطلب
  let customUrl: string | undefined;
  try {
    const body = await req.json() as { custom_url?: string };
    customUrl = body?.custom_url;
  } catch { /* لا body — ok */ }

  console.log("[seamless-proxy] start, trying", SEAMLESS_CLIENT_IDS.length, "client_ids");

  for (const clientId of SEAMLESS_CLIENT_IDS) {
    const result = await tryClientId(clientId, customUrl);
    if (result) {
      return json({
        success:       true,
        seamlessToken: result.seamlessToken,
        msisdn:        result.msisdn,
        clientIdUsed:  result.clientIdUsed,
      });
    }
  }

  console.error("[seamless-proxy] all client_ids failed");
  return json({
    success: false,
    error:   "تعذر التعرف على الشبكة — إذا كان الـ VPN مفعّلاً أوقفه ثم أعد المحاولة، وتأكد من تشغيل بيانات فودافون.",
    tried:   SEAMLESS_CLIENT_IDS,
    hint:    "vpn_or_network",
  });
});
