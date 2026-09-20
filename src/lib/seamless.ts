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
//  fetchSeamlessToken — v4 (Server-Side via seamless-proxy)
//
//  السبب الجذري لفشل النسخة السابقة (fetch مباشر):
//  • Android 9+ يمنع cleartext HTTP (http://) في WebView افتراضياً
//  • فودافون مصر تقبل الطلب فقط من IP مصري — السيرفر يعوض هذا
//    لأن Supabase Edge Function على سيرفر خارج مصر، لكن
//    seamless-proxy يستخدم fetch من الـ Deno runtime (لا WebView)
//    وهو غير مقيّد بـ cleartext HTTP policy
//
//  الحل: إرسال الطلب عبر seamless-proxy Edge Function بدل fetch مباشر
// ══════════════════════════════════════════════════════════════
import { supabase } from '@/db/supabase';

export async function fetchSeamlessToken(
  _clientId?: string,
  _customUrl?: string
): Promise<{ token: string | null; msisdn: string | null; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke<{
      success: boolean;
      seamlessToken?: string;
      msisdn?: string | null;
      clientIdUsed?: string;
      error?: string;
    }>('seamless-proxy', {
      method: 'POST',
      body: {},
    });

    if (error) {
      const msg = await (error as any)?.context?.text?.().catch(() => '') ?? error.message;
      console.error('[fetchSeamlessToken] edge error:', msg);
      return { token: null, msisdn: null, error: 'خطأ في الاتصال بالخادم — حاول مرة أخرى' };
    }

    if (!data?.success || !data?.seamlessToken) {
      return {
        token:  null,
        msisdn: null,
        error:  data?.error ?? 'تعذّر التعرف على الشبكة — تأكد من تشغيل بيانات فودافون',
      };
    }

    return {
      token:  data.seamlessToken,
      msisdn: normalizeMsisdn(data.msisdn ?? null),
    };
  } catch (e: any) {
    console.error('[fetchSeamlessToken] fatal:', e);
    return { token: null, msisdn: null, error: 'خطأ غير متوقع — حاول مرة أخرى' };
  }
}
