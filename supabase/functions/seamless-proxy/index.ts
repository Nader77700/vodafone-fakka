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

    console.log(`[seamless-proxy] ✅ client_id=${clientId} → token OK, msisdn=${msisdn ?? "null"}`);
    return { seamlessToken: token, msisdn: msisdn ?? null, clientIdUsed: clientId };

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
    error:   "تعذر التعرف على الشبكة. تأكد من تشغيل بيانات فودافون.",
    tried:   SEAMLESS_CLIENT_IDS,
  });
});
