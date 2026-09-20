// ══════════════════════════════════════════════════════════════
//  normalizeMsisdn — يحوّل أي صيغة لـ msisdn إلى 01XXXXXXXXX
//  يدعم: 2010XXXXXXX / +2010XXXXXXX / 010XXXXXXX / 10XXXXXXX
// ══════════════════════════════════════════════════════════════
export function normalizeMsisdn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim().replace(/\s+/g, '');

  if (s.startsWith('+20')) s = s.slice(3);
  else if (s.startsWith('20') && s.length === 12) s = s.slice(2);

  if (s.length === 10 && s.startsWith('1')) s = '0' + s;

  if (s.length === 11 && s.startsWith('01')) return s;
  return null;
}

// ══════════════════════════════════════════════════════════════
//  fetchSeamlessToken — v5 (Native-First)
//
//  الاستراتيجية:
//  1. على الجهاز (Native APK): CapacitorHttp.request مباشرة
//     - يتجاوز WebView تماماً → cleartext HTTP مسموح
//     - IP المصري محفوظ لأن الطلب من الجهاز ذاته
//     - network_security_config.xml يسمح mobile.vodafone.com.eg
//  2. على الويب: Edge Function كـ fallback (لا يعمل خارج مصر)
//
//  لماذا فشلت v4 (Edge Function):
//  - Supabase server IP خارج مصر → Vodafone ترفض
//  - timeout 84 ثانية = مفيش رد من Vodafone على IPs خارجية
// ══════════════════════════════════════════════════════════════
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { supabase } from '@/db/supabase';

const SEAMLESS_CLIENT_IDS = [
  'AnaVodafoneAndroid',
  'vodafone-cash',
  'VF-Cash-Android',
  'cash-app',
  'ana-vodafone-app-seamless',
  'vodafone-app',
];

const DEFAULT_SEAMLESS_URL =
  'http://mobile.vodafone.com.eg/checkSeamless/realms/vf-realm/protocol/openid-connect/auth';

// ── Native HTTP مباشر من الجهاز ──────────────────────────────
async function tryNative(clientId: string, baseUrl: string): Promise<{ token: string; msisdn: string | null } | null> {
  try {
    const url = `${baseUrl}?client_id=${clientId}`;
    const res = await CapacitorHttp.request({
      method:          'GET',
      url,
      connectTimeout:  8000,
      readTimeout:     8000,
      headers: {
        'User-Agent':              'okhttp/4.12.0',
        'Connection':              'Keep-Alive',
        'clientId':                clientId,
        'Accept-Language':         'ar',
        'x-agent-operatingsystem': '16',
        'x-agent-device':          'Samsung SM-G991B',
        'x-agent-version':         '2026.9.1',
        'x-agent-build':           '1200',
        'digitalId':               '',
        'device-id':               '',
        'Accept':                  'application/json',
      },
    });

    if (res.status !== 200) {
      console.log(`[seamless native] ${clientId} → HTTP ${res.status}`);
      return null;
    }

    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    const token = data?.seamlessToken ?? data?.access_token ?? data?.token;
    if (!token) {
      console.log(`[seamless native] ${clientId} → no token, keys: ${Object.keys(data ?? {}).join(',')}`);
      return null;
    }

    const msisdn = normalizeMsisdn(data?.msisdn ?? data?.sub ?? data?.phoneNumber ?? null);
    console.log(`[seamless native] ✅ ${clientId} → token OK, msisdn=${msisdn ?? 'null'}`);
    return { token, msisdn };
  } catch (e: any) {
    console.log(`[seamless native] ${clientId} → exception: ${e?.message ?? e}`);
    return null;
  }
}

// ── Edge Function fallback (للويب فقط) ───────────────────────
async function tryEdgeFunction(): Promise<{ token: string; msisdn: string | null } | null> {
  try {
    const { data, error } = await supabase.functions.invoke<{
      success: boolean;
      seamlessToken?: string;
      msisdn?: string | null;
      error?: string;
    }>('seamless-proxy', { method: 'POST', body: {} });

    if (error || !data?.success || !data?.seamlessToken) return null;
    return {
      token:  data.seamlessToken,
      msisdn: normalizeMsisdn(data.msisdn ?? null),
    };
  } catch {
    return null;
  }
}

export async function fetchSeamlessToken(
  _clientId?: string,
  customUrl?: string
): Promise<{ token: string | null; msisdn: string | null; error?: string }> {
  const baseUrl = customUrl || DEFAULT_SEAMLESS_URL;
  const isNative = Capacitor.isNativePlatform();

  // ── المسار الأول: Native HTTP مباشر من الجهاز ──
  if (isNative) {
    for (const clientId of SEAMLESS_CLIENT_IDS) {
      const result = await tryNative(clientId, baseUrl);
      if (result) return { token: result.token, msisdn: result.msisdn };
    }
    // محاولة HTTPS أيضاً لو HTTP فشل
    const httpsUrl = baseUrl.replace('http://', 'https://');
    if (httpsUrl !== baseUrl) {
      for (const clientId of SEAMLESS_CLIENT_IDS) {
        const result = await tryNative(clientId, httpsUrl);
        if (result) return { token: result.token, msisdn: result.msisdn };
      }
    }
    return {
      token:  null,
      msisdn: null,
      error:  'تعذّر التعرف على شبكة فودافون — تأكد من تشغيل بيانات فودافون وإيقاف الـ VPN',
    };
  }

  // ── المسار الثاني: Edge Function (ويب / تطوير) ──
  const result = await tryEdgeFunction();
  if (result) return { token: result.token, msisdn: result.msisdn };

  return {
    token:  null,
    msisdn: null,
    error:  'تعذّر التعرف على الشبكة — تأكد من تشغيل بيانات فودافون',
  };
}
