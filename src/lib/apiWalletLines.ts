/**
 * apiWalletLines.ts — Direct Device Relay Mode (v2)
 *
 * ⚠️ لماذا Direct وليس Edge Function؟
 *  Supabase Edge Functions تعمل على سيرفرات أوروبية/أمريكية.
 *  my.tra.gov.eg يحجب كل IP من خارج مصر → HTTP 500.
 *  الحل: التطبيق على الموبايل (داخل مصر) يتصل مباشرة بـ my.tra.gov.eg
 *  بدون أي وسيط — الـ IP يكون مصرياً فيمر بدون حجب.
 *
 * قواعد الأمان:
 *  - SHA-256 يتم هنا على الجهاز (crypto.subtle) — لا plain password يُرسَل
 *  - loginToken مشفر في sessionStorage — لا يُسجَّل في console أبداً
 *  - الرقم القومي لا يُسجَّل في console أبداً
 *  - deviceId يُولَّد مرة واحدة ويُحفظ في sessionStorage
 */

import type {
  ServiceResult,
  AuthToken,
  WalletLinesResult,
} from '@/lib/walletLinesInterfaces';

const BASE_URL = 'https://my.tra.gov.eg';
const APP_VERSION = '197';
const TIMEOUT_MS = 30_000;

// ── Device ID ─────────────────────────────────────────────────────
function getOrCreateDeviceId(): string {
  const KEY = 'wl_device_id';
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

// ── SHA-256 على الجهاز ────────────────────────────────────────────
async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Headers مطابقة للسكريبت المرجعي ──────────────────────────────
function buildHeaders(deviceId: string, language = 'ar'): Record<string, string> {
  return {
    'User-Agent': 'okhttp/5.3.2',
    'Accept-Encoding': 'gzip',
    'clientType': 'android',
    'deviceId': deviceId,
    'appVersion': APP_VERSION,
    'Accept-language': language,
    'Content-Type': 'application/json; charset=UTF-8',
  };
}

function authenticatedHeaders(deviceId: string, token: string): Record<string, string> {
  return { ...buildHeaders(deviceId, 'ar'), Authorization: `Bearer ${token}` };
}

// ── Fetch مع Timeout ──────────────────────────────────────────────
async function fetchJson(
  url: string,
  options: RequestInit,
): Promise<{ status: number; data: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, { ...options, signal: ctrl.signal });
    clearTimeout(timer);
    let data: unknown = null;
    try { data = await resp.json(); } catch { /* body غير JSON */ }
    return { status: resp.status, data };
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    throw new Error(isAbort ? 'TIMEOUT' : 'CONNECTION_ERROR');
  }
}

// ── Session Token Storage (مشفر في sessionStorage) ────────────────
const SESSION_KEY = 'wl_session_token';

function saveToken(token: string): void {
  // تشفير بسيط بالـ base64 (لمنع الظهور العلني في DevTools)
  sessionStorage.setItem(SESSION_KEY, btoa(unescape(encodeURIComponent(token))));
}

function loadToken(): string | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try { return decodeURIComponent(escape(atob(raw))); } catch { return null; }
}

// ── رسائل الخطأ العربية ───────────────────────────────────────────
function mapError(code: string, fallback = 'حدث خطأ غير متوقع. حاول مجدداً.'): string {
  const MAP: Record<string, string> = {
    CONNECTION_ERROR:    'تعذر الاتصال بالخادم. تأكد من اتصالك بالإنترنت.',
    TIMEOUT:             'انتهت مهلة الاتصال. حاول مجدداً.',
    GEO_BLOCKED:         'الخدمة مقيدة جغرافياً. يجب الاتصال من داخل مصر.',
    INVALID_CREDENTIALS: 'بيانات تسجيل الدخول غير صحيحة. تحقق من رقم الهاتف وكلمة المرور.',
    REGISTER_FAILED:     'فشل إنشاء الحساب. قد يكون رقم الهاتف مسجلاً مسبقاً.',
    OTP_INVALID:         'رمز التحقق غير صحيح. تأكد من الرمز وأعد المحاولة.',
    SESSION_EXPIRED:     'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.',
    UNEXPECTED_ERROR:    fallback,
  };
  return MAP[code] ?? fallback;
}

// ── ترجمة رسائل الخطأ الإنجليزية من الـ API إلى عربي ──────────────
function translateApiError(rawMsg: string): string {
  if (!rawMsg) return '';
  const m = rawMsg.toLowerCase();
  if (m.includes('invalid') && (m.includes('credential') || m.includes('password') || m.includes('username')))
    return 'بيانات تسجيل الدخول غير صحيحة.';
  if (m.includes('not found') || m.includes('no account') || m.includes('user not exist'))
    return 'لا يوجد حساب بهذه البيانات.';
  if (m.includes('password') && m.includes('wrong'))
    return 'كلمة المرور غير صحيحة.';
  if (m.includes('locked') || m.includes('blocked'))
    return 'تم تعليق الحساب مؤقتاً. تواصل مع الدعم.';
  if (m.includes('otp') || m.includes('verification code'))
    return 'رمز التحقق غير صحيح أو منتهي الصلاحية.';
  if (m.includes('already') && m.includes('register'))
    return 'رقم الهاتف مسجل مسبقاً.';
  if (m.includes('national') && m.includes('id'))
    return 'الرقم القومي غير صحيح أو غير مطابق.';
  if (m.includes('expired'))
    return 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.';
  // إذا لم تُعرَّف — نعيد الرسالة الأصلية بدون ترجمة فقط إذا كانت عربية
  const isArabic = /[\u0600-\u06FF]/.test(rawMsg);
  return isArabic ? rawMsg : 'حدث خطأ في تسجيل الدخول. تحقق من بياناتك وأعد المحاولة.';
}

// ══════════════════════════════════════════════════════════════════
// Public API — كل استدعاء مباشر لـ my.tra.gov.eg
// ══════════════════════════════════════════════════════════════════

/**
 * تسجيل الدخول — مباشر من الجهاز بـ IP مصري
 */
export async function apiLogin(
  phone: string,
  password: string,
): Promise<ServiceResult<AuthToken & { name?: string; email?: string }>> {
  const deviceId = getOrCreateDeviceId();
  try {
    const hashedPw = await sha256(password);
    const headers = buildHeaders(deviceId, 'en');
    headers['token_provider_type'] = 'FIREBASE';
    headers['future_firebase_token'] = '0';

    const { status, data } = await fetchJson(
      `${BASE_URL}/usermanagement/api/v1/auth/user/login`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ password: hashedPw, username: phone }),
      },
    );

    if (status === 500) {
      return { success: false, errorCode: 'GEO_BLOCKED', userMessage: mapError('GEO_BLOCKED') };
    }

    const d = data as Record<string, unknown> | null;
    const statusObj = (d?.status ?? {}) as Record<string, unknown>;

    if (status !== 200 || statusObj?.code !== 200) {
      const rawMsg = String(statusObj?.errorMsg ?? statusObj?.message ?? 'بيانات الدخول غير صحيحة.');
      return { success: false, errorCode: 'INVALID_CREDENTIALS', userMessage: translateApiError(rawMsg) };
    }

    const resultData = (d?.result ?? {}) as Record<string, unknown>;
    const token = ((resultData?.token ?? {}) as Record<string, unknown>)
      ?.loginToken as string;
    if (!token) {
      return { success: false, errorCode: 'UNEXPECTED_ERROR', userMessage: 'لم يتم استلام رمز الجلسة.' };
    }

    // حفظ الـ token مشفراً
    saveToken(token);

    return {
      success: true,
      data: {
        token,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        name: resultData?.name as string | undefined,
        email: resultData?.email as string | undefined,
      },
    };
  } catch (err) {
    const code = err instanceof Error ? err.message : 'UNEXPECTED_ERROR';
    return { success: false, errorCode: code, userMessage: mapError(code) };
  }
}

/**
 * إنشاء حساب جديد
 */
export async function apiRegister(
  phone: string,
  name: string,
  email: string,
  password: string,
): Promise<ServiceResult<void>> {
  const deviceId = getOrCreateDeviceId();
  try {
    const hashedPw = await sha256(password);
    const { status, data } = await fetchJson(
      `${BASE_URL}/usermanagement/api/v1/user/registration`,
      {
        method: 'POST',
        headers: buildHeaders(deviceId, 'ar'),
        body: JSON.stringify({ email, name, password: hashedPw, username: phone }),
      },
    );

    if (status === 500) {
      return { success: false, errorCode: 'GEO_BLOCKED', userMessage: mapError('GEO_BLOCKED') };
    }

    const d = data as Record<string, unknown> | null;
    const statusObj = (d?.status ?? {}) as Record<string, unknown>;
    if (status !== 200 || (statusObj?.code !== 200 && statusObj?.code !== null)) {
      const msg = String(statusObj?.errorMsg ?? 'فشل إنشاء الحساب.');
      return { success: false, errorCode: 'REGISTER_FAILED', userMessage: msg };
    }

    return { success: true };
  } catch (err) {
    const code = err instanceof Error ? err.message : 'UNEXPECTED_ERROR';
    return { success: false, errorCode: code, userMessage: mapError(code) };
  }
}

/**
 * تأكيد الحساب بـ OTP
 */
export async function apiVerifyOtp(
  phone: string,
  otp: string,
): Promise<ServiceResult<void>> {
  const deviceId = getOrCreateDeviceId();
  try {
    const { status, data } = await fetchJson(
      `${BASE_URL}/usermanagement/api/v1/user/registration/verification`,
      {
        method: 'POST',
        headers: buildHeaders(deviceId, 'ar'),
        body: JSON.stringify({ otp, username: phone }),
      },
    );

    if (status === 500) {
      return { success: false, errorCode: 'GEO_BLOCKED', userMessage: mapError('GEO_BLOCKED') };
    }

    const d = data as Record<string, unknown> | null;
    const statusObj = (d?.status ?? {}) as Record<string, unknown>;
    if (status !== 200 || (statusObj?.code !== 200 && statusObj?.code !== null)) {
      const msg = String(statusObj?.errorMsg ?? 'رمز التحقق غير صحيح.');
      return { success: false, errorCode: 'OTP_INVALID', userMessage: msg };
    }

    return { success: true };
  } catch (err) {
    const code = err instanceof Error ? err.message : 'UNEXPECTED_ERROR';
    return { success: false, errorCode: code, userMessage: mapError(code) };
  }
}

/**
 * الاستعلام بالرقم القومي — محافظ + خطوط بالتوازي
 * ⚠️ nationalId لا يُسجَّل في console أبداً
 */
export async function apiLookup(
  nationalId: string,
): Promise<ServiceResult<WalletLinesResult>> {
  const deviceId = getOrCreateDeviceId();
  const token = loadToken();

  if (!token) {
    return { success: false, errorCode: 'SESSION_EXPIRED', userMessage: mapError('SESSION_EXPIRED') };
  }

  const authH = authenticatedHeaders(deviceId, token);

  try {
    // استدعاء محافظ وخطوط بالتوازي — تماماً كالسكريبت
    const [walletsRes, linesRes] = await Promise.allSettled([
      fetchJson(`${BASE_URL}/mywallets/api/v1/inquiry/`, {
        method: 'POST',
        headers: authH,
        body: JSON.stringify({ nationalId }),
      }),
      fetchJson(`${BASE_URL}/querynumber/api/v1/LineNumbers`, {
        method: 'POST',
        headers: authH,
        body: JSON.stringify({ nationalId }),
      }),
    ]);

    // ── مساعد: تحديد الشركة من النص ──────────────────────────
    function carrierFromText(text: string): 'vodafone' | 'orange' | 'etisalat' | 'we' | null {
      const t = String(text ?? '').trim().toLowerCase();
      if (t.includes('vodafone')) return 'vodafone';
      if (t.includes('orange'))   return 'orange';
      if (t.includes('etisalat') || t.includes('e&')) return 'etisalat';
      if (t === 'we' || t.includes('telecom egypt')) return 'we';
      return null;
    }

    const CARRIER_NAMES = { vodafone: 'Vodafone', orange: 'Orange', etisalat: 'e& (Etisalat)', we: 'WE' };
    const ALL_CARRIERS = ['vodafone', 'orange', 'etisalat', 'we'] as const;
    type CK = typeof ALL_CARRIERS[number];

    // ── تحليل المحافظ (wallets) ────────────────────────────────
    const walletsMap: Record<CK, { avail: 'loaded' | 'empty' | 'unavailable' | 'no_response' | 'conn_error' | 'invalid'; nums: string[]; name?: string; regDate?: string; status?: string }> = {
      vodafone: { avail: 'no_response', nums: [] },
      orange:   { avail: 'no_response', nums: [] },
      etisalat: { avail: 'no_response', nums: [] },
      we:       { avail: 'no_response', nums: [] },
    };

    if (walletsRes.status === 'rejected') {
      for (const c of ALL_CARRIERS) walletsMap[c].avail = 'conn_error';
    } else {
      const { status: wStatus, data: wData } = walletsRes.value;
      if (wStatus === 401 || wStatus === 403) {
        return { success: false, errorCode: 'SESSION_EXPIRED', userMessage: mapError('SESSION_EXPIRED') };
      }
      if (!wData || typeof wData !== 'object') {
        for (const c of ALL_CARRIERS) walletsMap[c].avail = 'invalid';
      } else {
        const wd = wData as Record<string, unknown>;
        const statusCode = (wd.status as Record<string, unknown>)?.code;
        // قد يكون statusCode null أو 200 عند النجاح
        if (wStatus !== 200 && statusCode !== 200 && statusCode !== null) {
          for (const c of ALL_CARRIERS) walletsMap[c].avail = 'unavailable';
        } else {
          // البنية: result.values = [{ provider, walletNumber/msisdn, name, registrationDate, status }]
          const values = (wd.result as Record<string, unknown> | null)?.values;
          const list = Array.isArray(values) ? values : [];
          for (const c of ALL_CARRIERS) walletsMap[c].avail = list.length === 0 ? 'empty' : 'empty';
          for (const item of list) {
            const w = item as Record<string, unknown>;
            const cKey = carrierFromText(
              String(w.provider ?? w.providerName ?? w.company ?? w.operator ?? w.operatorName ?? '')
            );
            if (!cKey) continue;
            walletsMap[cKey].avail = 'loaded';
            walletsMap[cKey].nums.push(
              String(w.walletNumber ?? w.msisdn ?? w.number ?? w.mobileNumber ?? w.phone ?? '')
            );
            if (!walletsMap[cKey].name)    walletsMap[cKey].name    = String(w.name ?? w.fullName ?? '');
            if (!walletsMap[cKey].regDate) walletsMap[cKey].regDate = String(w.registrationDate ?? w.regDate ?? w.creationDate ?? '');
            if (!walletsMap[cKey].status)  walletsMap[cKey].status  = String(w.status ?? w.walletStatus ?? '');
          }
        }
      }
    }

    // ── تحليل الخطوط (lines) ──────────────────────────────────
    const linesMap: Record<CK, { avail: 'loaded' | 'empty' | 'unavailable' | 'no_response' | 'conn_error' | 'invalid'; nums: string[]; serviceStatus?: string }> = {
      vodafone: { avail: 'no_response', nums: [] },
      orange:   { avail: 'no_response', nums: [] },
      etisalat: { avail: 'no_response', nums: [] },
      we:       { avail: 'no_response', nums: [] },
    };

    if (linesRes.status === 'rejected') {
      for (const c of ALL_CARRIERS) linesMap[c].avail = 'conn_error';
    } else {
      const { status: lStatus, data: lData } = linesRes.value;
      if (!lData || typeof lData !== 'object') {
        for (const c of ALL_CARRIERS) linesMap[c].avail = 'invalid';
      } else {
        const ld = lData as Record<string, unknown>;
        const result = ld.result as Record<string, unknown> | null;
        if (lStatus !== 200 || !result || typeof result !== 'object') {
          for (const c of ALL_CARRIERS) linesMap[c].avail = 'unavailable';
        } else {
          // البنية حسب السكريبت: result = { Vodafone: { count, mobileLines:[...] }, Orange: {...}, ... }
          for (const [key, details] of Object.entries(result)) {
            const cKey = carrierFromText(key);
            if (!cKey) continue;
            const d = details as Record<string, unknown>;
            // محاولة استخراج الأرقام من كل المفاتيح الممكنة
            const rawNums =
              d?.mobileLines ?? d?.lineNumbers ?? d?.lines ?? d?.numbers ?? d?.msisdns ?? [];
            const nums = Array.isArray(rawNums) ? rawNums.filter(Boolean).map(String) : [];
            const count = Number(d?.count ?? d?.totalLines ?? nums.length ?? 0);
            if (count === 0 && nums.length === 0) {
              linesMap[cKey].avail = 'empty';
            } else {
              linesMap[cKey].avail = 'loaded';
              linesMap[cKey].nums = nums;
              linesMap[cKey].serviceStatus = String(d?.status ?? d?.serviceStatus ?? '');
            }
          }
          // الشركات غير الموجودة في الاستجابة → empty (ليس no_response)
          for (const c of ALL_CARRIERS) {
            if (linesMap[c].avail === 'no_response') linesMap[c].avail = 'empty';
          }
        }
      }
    }

    const wallets = ALL_CARRIERS.map((c) => ({
      carrier: c,
      carrierName: CARRIER_NAMES[c],
      availability: walletsMap[c].avail as WalletLinesResult['wallets'][0]['availability'],
      walletNumbers: walletsMap[c].nums,
      walletCount: walletsMap[c].nums.length,
      registeredName: walletsMap[c].name || undefined,
      registrationDate: walletsMap[c].regDate || undefined,
      walletStatus: walletsMap[c].status || undefined,
    }));

    const lines = ALL_CARRIERS.map((c) => ({
      carrier: c,
      carrierName: CARRIER_NAMES[c],
      availability: linesMap[c].avail as WalletLinesResult['lines'][0]['availability'],
      lineNumbers: linesMap[c].nums,
      lineCount: linesMap[c].nums.length,
      serviceStatus: linesMap[c].serviceStatus || undefined,
    }));

    // حساب الإجماليات
    const walletsWithData = wallets.filter(w => w.availability === 'loaded').length;
    const linesWithData = lines.filter(l => l.availability === 'loaded').length;
    void walletsWithData; void linesWithData; // للمراقبة المحلية فقط

    return {
      success: true,
      data: { wallets, lines, fetchedAt: new Date().toISOString() },
    };
  } catch (err) {
    const code = err instanceof Error ? err.message : 'UNEXPECTED_ERROR';
    return { success: false, errorCode: code, userMessage: mapError(code) };
  }
}

/**
 * مسح الجلسة عند الخروج
 */
export function clearWalletLinesSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem('wl_device_id');
}

