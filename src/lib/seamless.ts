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
//  قائمة client_ids تُجرَّب بالتسلسل مباشرةً من الجهاز
//  المستخدم يطلب فودافون مصر من شبكته المصرية → لا VPN سيرفر
// ══════════════════════════════════════════════════════════════
const SEAMLESS_CLIENT_IDS = [
  'AnaVodafoneAndroid',
  'ana-vodafone-app-seamless',
  'cash-app',
  'vodafone-app',
];

const SEAMLESS_BASE_URL =
  'http://mobile.vodafone.com.eg/checkSeamless/realms/vf-realm/protocol/openid-connect/auth';

const SEAMLESS_HEADERS: Record<string, string> = {
  'User-Agent':              'okhttp/4.12.0',
  'Connection':              'Keep-Alive',
  'x-dynatrace':             'MT_3_5_2386790616_1-0_a556db1b-4506-43f3-854a-1d2527767923_0_21317_157',
  'x-agent-operatingsystem': '16',
  'Accept-Language':         'ar',
  'x-agent-device':          'OPPO CPH2701',
  'x-agent-version':         '2026.7.1',
  'x-agent-build':           '1176',
  'digitalId':               '',
  'device-id':               '',
};

async function tryClientId(
  clientId: string,
  baseUrl: string
): Promise<{ token: string; msisdn: string | null } | null> {
  const url = `${baseUrl}?client_id=${clientId}`;
  try {
    const ctrl    = new AbortController();
    const timerId = setTimeout(() => ctrl.abort(), 7_000);
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      headers: { ...SEAMLESS_HEADERS, clientId },
    });
    clearTimeout(timerId);

    if (res.status !== 200) return null;

    const txt = await res.text();
    let data: Record<string, unknown>;
    try { data = JSON.parse(txt); }
    catch { return null; }

    const token  = data['seamlessToken'] as string | undefined;
    const msisdn = data['msisdn']        as string | undefined;
    if (!token) return null;

    return { token, msisdn: normalizeMsisdn(msisdn ?? null) };
  } catch {
    return null;
  }
}

/**
 * fetchSeamlessToken
 * يجلب Seamless Token مباشرةً من جهاز المستخدم (client-side / APK)
 * لأن فودافون مصر تقبل الطلب فقط من IP مصري (شبكة الجهاز) وليس من سيرفر خارجي.
 *
 * يجرّب 4 client_ids بالتسلسل حتى أول نجاح.
 * clientId و customUrl اختياريان — إذا مُرِّرا يُضافان في المقدمة.
 */
export async function fetchSeamlessToken(
  clientId?: string,
  customUrl?: string
): Promise<{ token: string | null; msisdn: string | null; error?: string }> {
  const baseUrl = customUrl || SEAMLESS_BASE_URL;

  // إذا مُرِّر client_id خاص → جرّبه أولاً ثم القائمة الاحتياطية
  const ids = clientId && !SEAMLESS_CLIENT_IDS.includes(clientId)
    ? [clientId, ...SEAMLESS_CLIENT_IDS]
    : SEAMLESS_CLIENT_IDS;

  const errors: string[] = [];

  for (const id of ids) {
    try {
      const result = await tryClientId(id, baseUrl);
      if (result) return { token: result.token, msisdn: result.msisdn };
      errors.push(`${id}: no token`);
    } catch (e: any) {
      errors.push(`${id}: ${e?.message ?? 'error'}`);
    }
  }

  // كل client_ids فشلت
  return {
    token:  null,
    msisdn: null,
    error:  `تعذّر التعرف على الشبكة (${errors.slice(-1)[0] ?? 'timeout'})`,
  };
}
