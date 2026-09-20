/**
 * seamless-proxy — Edge Function v2
 * تجلب Seamless Token من Vodafone بـ client_ids متعددة بالتسلسل
 * تحلّ مشكلة HTTP 400 الناتجة عن تغيير Vodafone للـ client_id
 * v2: إضافة client_ids جديدة + timeout أطول + retry تلقائي
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { zeroTrustCheck, CORS_HEADERS } from "../_shared/zero_trust.ts";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

// قائمة client_ids تُجرَّب بالتسلسل حتى أول نجاح
// مرتبة من الأحدث للأقدم بناءً على تحديثات Vodafone
const SEAMLESS_CLIENT_IDS = [
  "AnaVodafoneAndroid",
  "vodafone-cash",
  "VF-Cash-Android",
  "cash-app",
  "ana-vodafone-app-seamless",
  "vodafone-app",
  "myvodafone",
];

const SEAMLESS_URLS = [
  "http://mobile.vodafone.com.eg/checkSeamless/realms/vf-realm/protocol/openid-connect/auth",
  "https://mobile.vodafone.com.eg/checkSeamless/realms/vf-realm/protocol/openid-connect/auth",
];

function normalizeMsisdn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim().replace(/\s+/g, "");
  if (s.startsWith("+20")) s = s.slice(3);
  else if (s.startsWith("20") && s.length === 12) s = s.slice(2);
  if (s.length === 10 && s.startsWith("1")) s = "0" + s;
  if (s.length === 11 && s.startsWith("01")) return s;
  console.log(`[seamless-proxy] normalizeMsisdn: لم نتمكن من تطبيع "${raw}" → "${s}"`);
  return null;
}

// User-Agents متعددة لتجنب الحظر
const USER_AGENTS = [
  "okhttp/4.12.0",
  "okhttp/4.9.3",
  "Dalvik/2.1.0 (Linux; U; Android 12; Samsung Galaxy S21)",
  "Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36",
];

const BASE_SEAMLESS_HEADERS = (clientId: string, uaIndex: number): Record<string, string> => ({
  "User-Agent":              USER_AGENTS[uaIndex % USER_AGENTS.length],
  "Connection":              "Keep-Alive",
  "x-dynatrace":             "MT_3_5_2386790616_1-0_a556db1b-4506-43f3-854a-1d2527767923_0_21317_157",
  "x-agent-operatingsystem": "16",
  "clientId":                clientId,
  "Accept-Language":         "ar",
  "x-agent-device":          "Samsung SM-G991B",
  "x-agent-version":         "2026.9.1",
  "x-agent-build":           "1200",
  "digitalId":               "",
  "device-id":               "",
  "Accept":                  "application/json",
});

interface SeamlessResult {
  seamlessToken: string;
  msisdn: string | null;
  clientIdUsed: string;
  urlUsed: string;
}

async function tryOne(clientId: string, baseUrl: string, attempt: number): Promise<SeamlessResult | null> {
  const url = `${baseUrl}?client_id=${clientId}`;
  try {
    const ctrl = new AbortController();
    const id   = setTimeout(() => ctrl.abort(), 8000);
    const res  = await fetch(url, {
      method:  "GET",
      headers: BASE_SEAMLESS_HEADERS(clientId, attempt),
      signal:  ctrl.signal,
      redirect: "follow",
    });
    clearTimeout(id);

    if (res.status !== 200) {
      console.log(`[seamless-proxy] ${clientId}@${baseUrl.slice(0,10)} → HTTP ${res.status}`);
      return null;
    }

    const txt = await res.text();
    let data: Record<string, unknown>;
    try { data = JSON.parse(txt); }
    catch {
      // قد يكون HTML redirect — تجاهل
      console.log(`[seamless-proxy] ${clientId} → parse error (${txt.slice(0, 40)})`);
      return null;
    }

    const token  = (data["seamlessToken"] ?? data["access_token"] ?? data["token"]) as string | undefined;
    const msisdn = (data["msisdn"] ?? data["sub"] ?? data["phoneNumber"]) as string | undefined;

    if (!token) {
      console.log(`[seamless-proxy] ${clientId} → no token in response keys: ${Object.keys(data).join(',')}`);
      return null;
    }

    const normalizedMsisdn = normalizeMsisdn(msisdn ?? null);
    console.log(`[seamless-proxy] ✅ ${clientId} → token OK, msisdn=${normalizedMsisdn ?? "null"}`);
    return { seamlessToken: token, msisdn: normalizedMsisdn, clientIdUsed: clientId, urlUsed: baseUrl };

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[seamless-proxy] ${clientId} → exception: ${msg}`);
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  const zt = await zeroTrustCheck(req);
  if (zt.error) {
    console.error("[seamless-proxy] zero-trust rejected:", zt.error);
    return json({ success: false, error: zt.error }, zt.status ?? 401);
  }

  let customUrl: string | undefined;
  try {
    const body = await req.json() as { custom_url?: string };
    customUrl = body?.custom_url;
  } catch { /* لا body — ok */ }

  const urlsToTry = customUrl ? [customUrl, ...SEAMLESS_URLS] : SEAMLESS_URLS;
  console.log(`[seamless-proxy] start: ${SEAMLESS_CLIENT_IDS.length} client_ids × ${urlsToTry.length} URLs`);

  let attempt = 0;
  for (const baseUrl of urlsToTry) {
    for (const clientId of SEAMLESS_CLIENT_IDS) {
      const result = await tryOne(clientId, baseUrl, attempt++);
      if (result) {
        return json({
          success:       true,
          seamlessToken: result.seamlessToken,
          msisdn:        result.msisdn,
          clientIdUsed:  result.clientIdUsed,
          urlUsed:       result.urlUsed,
          attempts:      attempt,
        });
      }
    }
  }

  console.error(`[seamless-proxy] all ${attempt} attempts failed`);
  return json({
    success:  false,
    error:    "تعذر التعرف على الشبكة — إذا كان الـ VPN مفعّلاً أوقفه ثم أعد المحاولة، وتأكد من تشغيل بيانات فودافون.",
    tried:    SEAMLESS_CLIENT_IDS,
    attempts: attempt,
    hint:     "vpn_or_network",
  });
});
