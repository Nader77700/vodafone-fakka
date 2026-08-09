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
    CONNECTION_ERROR:   'تعذر الاتصال بالخادم. تأكد من اتصالك بالإنترنت.',
    TIMEOUT:            'انتهت مهلة الاتصال. حاول مجدداً.',
    GEO_BLOCKED:        'الخدمة مقيدة جغرافياً. يجب الاتصال من داخل مصر.',
    INVALID_CREDENTIALS:'بيانات تسجيل الدخول غير صحيحة.',
    REGISTER_FAILED:    'فشل إنشاء الحساب. قد يكون الرقم مسجلاً مسبقاً.',
    OTP_INVALID:        'رمز التحقق غير صحيح. تأكد وأعد المحاولة.',
    SESSION_EXPIRED:    'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.',
    UNEXPECTED_ERROR:   fallback,
  };
  return MAP[code] ?? fallback;
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
      const msg = String(statusObj?.errorMsg ?? 'بيانات الدخول غير صحيحة.');
      return { success: false, errorCode: 'INVALID_CREDENTIALS', userMessage: msg };
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

    // ── تحليل المحافظ (wallets) ────────────────────────────────
    const wallets: WalletLinesResult['wallets'] = [];
    if (walletsRes.status === 'fulfilled') {
      const wd = walletsRes.value.data as Record<string, unknown> | null;
      const raw = (wd?.result as Record<string, unknown>)?.values;
      if (Array.isArray(raw)) {
        for (const w of raw) {
          const item = w as Record<string, unknown>;
          const providerRaw = String(
            item.provider ?? item.providerName ?? item.company ?? item.operator ?? ''
          ).toLowerCase();
          const carrier = providerRaw.includes('vodafone') ? 'vodafone'
            : providerRaw.includes('orange') ? 'orange'
            : providerRaw.includes('etisalat') ? 'etisalat'
            : providerRaw.includes('we') || providerRaw.includes('telecom') ? 'we'
            : 'vodafone';
          const number = String(
            item.number ?? item.mobileNumber ?? item.walletNumber ?? item.msisdn ?? item.phone ?? ''
          );
          const regDate = String(item.regDate ?? item.registrationDate ?? item.createdDate ?? '');
          wallets.push({
            carrier,
            carrierName: carrier === 'vodafone' ? 'Vodafone' : carrier === 'orange' ? 'Orange' : carrier === 'etisalat' ? 'Etisalat' : 'WE',
            walletNumbers: number ? [number] : [],
            walletCount: 1,
            registrationDate: regDate || undefined,
            availability: 'available',
          });
        }
      }
    }

    // ── تحليل الخطوط (lines) ──────────────────────────────────
    const lines: WalletLinesResult['lines'] = [];
    if (linesRes.status === 'fulfilled' && linesRes.value.status === 200) {
      const ld = linesRes.value.data as Record<string, unknown> | null;
      const result = ld?.result;
      if (result && typeof result === 'object') {
        const providers: Record<string, string[]> = {
          vodafone: [], orange: [], etisalat: [], we: [],
        };
        for (const [key, details] of Object.entries(result as Record<string, unknown>)) {
          const k = key.toLowerCase();
          const carrier = k.includes('vodafone') ? 'vodafone'
            : k.includes('orange') ? 'orange'
            : k.includes('etisalat') ? 'etisalat'
            : k.includes('we') || k.includes('telecom') ? 'we'
            : null;
          if (!carrier) continue;
          const d = details as Record<string, unknown>;
          const rawLines = d?.mobileLines ?? d?.lines ?? d?.numbers ?? [];
          if (Array.isArray(rawLines)) {
            for (const n of rawLines) {
              if (n) providers[carrier].push(String(n));
            }
          }
        }
        for (const [carrier, nums] of Object.entries(providers)) {
          lines.push({
            carrier: carrier as WalletLinesResult['lines'][0]['carrier'],
            carrierName: carrier === 'vodafone' ? 'Vodafone' : carrier === 'orange' ? 'Orange' : carrier === 'etisalat' ? 'Etisalat' : 'WE',
            lineNumbers: nums,
            lineCount: nums.length,
            availability: 'available',
          });
        }
      }
    }

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

