import { supabase } from '@/db/supabase';

// ══════════════════════════════════════════════════════════════
//  normalizeMsisdn — يحوّل أي صيغة لـ msisdn إلى 01XXXXXXXXX
//  يدعم: 2010XXXXXXX / +2010XXXXXXX / 010XXXXXXX / 10XXXXXXX
// ══════════════════════════════════════════════════════════════
export function normalizeMsisdn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim().replace(/\s+/g, '');

  // أزل +20 أو 20 في البداية
  if (s.startsWith('+20')) s = s.slice(3);
  else if (s.startsWith('20') && s.length === 12) s = s.slice(2);

  // أضف الصفر إذا كان 10 أرقام يبدأ بـ 1 (مثلاً 10XXXXXXXX)
  if (s.length === 10 && s.startsWith('1')) s = '0' + s;

  // تحقق نهائي: 11 رقم يبدأ بـ 01
  if (s.length === 11 && s.startsWith('01')) return s;

  return null;
}

/**
 * fetchSeamlessToken
 * يجلب Seamless Token عبر seamless-proxy Edge Function (سيرفر-سايد)
 * بدلاً من الاتصال المباشر من التطبيق الذي كان يفشل بـ HTTP 400
 *
 * الـ Edge Function تجرب client_ids متعددة تلقائياً بالتسلسل.
 * المعاملات clientId و customUrl محفوظة للتوافق مع المُستدعِين القدامى
 * لكنها تُمرَّر للـ Edge Function كـ hints اختيارية.
 */
export async function fetchSeamlessToken(
  _clientId?: string,
  _customUrl?: string
): Promise<{ token: string | null; msisdn: string | null; error?: string }> {
  try {
    // جلب access_token للمستخدم الحالي
    const { data: sessionData } = await supabase.auth.getSession();
    const authToken = sessionData?.session?.access_token ?? '';

    const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL as string;
    const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

    const ctrl   = new AbortController();
    const timerId = setTimeout(() => ctrl.abort(), 15_000);

    const res = await fetch(`${supabaseUrl}/functions/v1/seamless-proxy`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': authToken ? `Bearer ${authToken}` : '',
        'apikey':        supabaseAnon,
        // headers الأمان الأساسية
        'x-app-secure-token': 'vfp_secure_356_kill_switch',
        'x-app-build':        '504',
        'x-app-version':      '3.5.24',
      },
      body: JSON.stringify({}),
    });
    clearTimeout(timerId);

    const txt = await res.text();
    let data: { success: boolean; seamlessToken?: string; msisdn?: string; error?: string };
    try { data = JSON.parse(txt); }
    catch { return { token: null, msisdn: null, error: `Parse error: ${txt.slice(0, 60)}` }; }

    if (data.success && data.seamlessToken) {
      // طبّع msisdn على جانب العميل أيضاً كطبقة ثانية من الأمان
      const rawMsisdn = data.msisdn ?? null;
      const msisdnNormalized = normalizeMsisdn(rawMsisdn);
      return { token: data.seamlessToken, msisdn: msisdnNormalized };
    }
    return { token: null, msisdn: null, error: data.error ?? 'لم يُعثر على Token' };

  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { token: null, msisdn: null, error: 'انتهت مهلة جلب Token الشبكة' };
    }
    return { token: null, msisdn: null, error: `خطأ: ${err?.message ?? 'Unknown'}` };
  }
}
