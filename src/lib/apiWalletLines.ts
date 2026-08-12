/**
 * apiWalletLines.ts — Direct Device Relay Mode (v2) + Session Persistence (v3)
 *
 * ⚠️ لماذا Direct وليس Edge Function؟
 *  Supabase Edge Functions تعمل على سيرفرات أوروبية/أمريكية.
 *  my.tra.gov.eg يحجب كل IP من خارج مصر → HTTP 500.
 *  الحل: التطبيق على الموبايل (داخل مصر) يتصل مباشرة بـ my.tra.gov.eg
 *  بدون أي وسيط — الـ IP يكون مصرياً فيمر بدون حجب.
 *
 * Session Persistence (v3):
 *  - تخزين token و deviceId و nationalId في localStorage (تبقى بعد إغلاق التطبيق)
 *  - وظيفة isSessionActive() للتحقق من وجود جلسة صالحة
 *  - clearWalletLinesSession() لحذف الجلسة عند تسجيل الخروج
 *
 * قواعد الأمان:
 *  - SHA-256 يتم هنا على الجهاز (crypto.subtle) — لا plain password يُرسَل
 *  - loginToken مشفر بـ base64 في localStorage — لا يُسجَّل في console أبداً
 *  - الرقم القومي لا يُسجَّل في console أبداً
 *  - deviceId يُولَّد مرة واحدة ويُحفظ في localStorage
 */

import type {
  ServiceResult,
  AuthToken,
  WalletLinesResult,
} from '@/lib/walletLinesInterfaces';

const BASE_URL = 'https://my.tra.gov.eg';
const APP_VERSION = '86';
const USER_AGENT = 'okhttp/5.0.0-alpha.2';
// السكريبت المرجعي للأرقام الكاملة (my_ntra_tool_otp.py) يستخدم UA مختلف لـ OTP
const FULL_NUMBERS_USER_AGENT = 'okhttp/5.3.2';
const FUTURE_FIREBASE_TOKEN = 'c1m9CX6aTauToKNTgZOJiE:APA91bGAu43OyKTqv_GrD4xQBl_e_U0JTZDG4r3bS54H2EOK4PsKl87qNgvYB6x8UhAHGSHnVWnQa5YDFg7bL4Z8DN9IKd1KUnv8g62opKOGxzv8RLyYI_0';
const TIMEOUT_MS = 30_000;

// ── Device ID (localStorage — غير حساس ويبقى بعد إغلاق التطبيق) ───────────
function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    localStorage.setItem(DEVICE_ID_KEY, id);
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
    'User-Agent': USER_AGENT,
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

// ── Session Storage Keys ───────────────────────────────────────────
const USERNAME_KEY    = 'wl_username';
const FULL_NAME_KEY   = 'wl_full_name';
const EMAIL_KEY       = 'wl_email';
const LAST_RESULT_KEY = 'wl_last_result';
const OTP_SENT_AT_KEY = 'wl_otp_sent_at';   // timestamp آخر إرسال OTP

// ── Change Password Flow state ────────────────────────────────────
const CP_PHONE_KEY       = 'wl_cp_phone';
const CP_ATTEMPTS_KEY    = 'wl_cp_attempts';
const CP_LOCKOUT_KEY     = 'wl_cp_lockout_until';
const DEVICE_ID_KEY   = 'wl_device_id';

// بيانات حساسة تُحفظ في الذاكرة فقط — لا تُخزَّن في LocalStorage
let currentToken: string | null = null;
let currentNationalId: string | null = null;

// token حساس — يُحفظ في الذاكرة فقط
function saveToken(token: string): void {
  currentToken = token;
}

function loadToken(): string | null {
  return currentToken;
}

/** حفظ الرقم القومي في الذاكرة فقط */
export function saveNationalId(nationalId: string): void {
  currentNationalId = nationalId;
}

/** تحميل الرقم القومي المحفوظ */
export function loadNationalId(): string | null {
  return currentNationalId;
}

/** حفظ اسم المستخدم (رقم الهاتف) */
export function saveUsername(username: string): void {
  localStorage.setItem(USERNAME_KEY, username);
}

/** تحميل اسم المستخدم */
export function loadUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

/** حفظ الاسم الكامل للمستخدم */
export function saveFullName(name: string): void {
  localStorage.setItem(FULL_NAME_KEY, name);
}

/** تحميل الاسم الكامل المحفوظ */
export function loadFullName(): string | null {
  return localStorage.getItem(FULL_NAME_KEY);
}

/** حفظ البريد الإلكتروني للمستخدم */
export function saveEmail(email: string): void {
  localStorage.setItem(EMAIL_KEY, email);
}

/** تحميل البريد الإلكتروني المحفوظ */
export function loadEmail(): string | null {
  return localStorage.getItem(EMAIL_KEY);
}

/** هل توجد جلسة محفوظة صالحة؟ */
export function isSessionActive(): boolean {
  return !!loadToken();
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
    const headers = buildHeaders(deviceId, 'ar');
    headers['appVersion'] = '87';
    headers['future_firebase_token'] = FUTURE_FIREBASE_TOKEN;

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
 * التحقق من الرقم القومي — مطابق للسكريبت المرجعي
 * Endpoint: /complainmanagement/api/v1/complaint/national/id/validation
 * يُرجع: code=200 نجاح، code=34012 عدم تطابق، وأي كود آخر خطأ.
 */
export async function apiVerifyNationalId(
  nationalId: string,
): Promise<ServiceResult<void>> {
  const deviceId = getOrCreateDeviceId();
  const token = loadToken();

  if (!token) {
    return { success: false, errorCode: 'SESSION_EXPIRED', userMessage: mapError('SESSION_EXPIRED') };
  }

  const headers: Record<string, string> = {
    ...authenticatedHeaders(deviceId, token),
    'Connection': 'Keep-Alive',
    'Host': 'my.tra.gov.eg',
  };

  try {
    const { status, data } = await fetchJson(
      `${BASE_URL}/complainmanagement/api/v1/complaint/national/id/validation`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ nationalId }),
      },
    );

    if (status === 401 || status === 403) {
      return { success: false, errorCode: 'SESSION_EXPIRED', userMessage: mapError('SESSION_EXPIRED') };
    }

    const d = data as Record<string, unknown> | null;
    const statusObj = (d?.status ?? {}) as Record<string, unknown>;
    const code = statusObj?.code;

    if (status === 200 && code === 200) {
      return { success: true };
    }

    if (code === 34012) {
      const msg = String(statusObj?.errorMsg ?? 'الرقم القومي غير مطابق مع الحساب.');
      return { success: false, errorCode: 'NATIONAL_ID_MISMATCH', userMessage: msg };
    }

    const msg = String(statusObj?.errorMsg ?? statusObj?.message ?? 'فشل التحقق من الرقم القومي.');
    return { success: false, errorCode: 'NATIONAL_ID_INVALID', userMessage: msg };
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
 * apiSendOtp — طلب OTP للحصول على الأرقام كاملة
 * مباشر من الجهاز (IP مصري) — appVersion=86
 * Endpoint: /querynumber/api/v2/request/LineNumbers
 */
export async function apiSendOtp(
  nationalId: string,
): Promise<ServiceResult<void>> {
  const deviceId = getOrCreateDeviceId();
  const token = loadToken();
  if (!token) {
    return { success: false, errorCode: 'SESSION_EXPIRED', userMessage: mapError('SESSION_EXPIRED') };
  }
  // Headers مطابقة تمامًا للسكريبت المرجعي (my_ntra_tool_otp.py → _otp_headers)
  const headers: Record<string, string> = {
    'User-Agent':      FULL_NUMBERS_USER_AGENT,
    'Accept-Encoding': 'gzip',
    'clientType':      'android',
    'deviceId':        deviceId,
    'appVersion':      '86',
    'Accept-language': 'ar',
    'Content-Type':    'application/json; charset=UTF-8',
    'Authorization':   `Bearer ${token}`,
  };
  const endpoint = `${BASE_URL}/querynumber/api/v2/request/LineNumbers`;
  // تسجيل للمطور فقط — بدون رقم قومي/Token/OTP
  console.log('[FullNumbers] Sending OTP request', endpoint);
  try {
    const { status, data } = await fetchJson(
      endpoint,
      { method: 'POST', headers, body: JSON.stringify({ nationalId }) },
    );
    if (status === 401 || status === 403) {
      console.log('[FullNumbers] OTP response', { status, errorCode: 'SESSION_EXPIRED' });
      return { success: false, errorCode: 'SESSION_EXPIRED', userMessage: mapError('SESSION_EXPIRED') };
    }
    const d = data as Record<string, unknown> | null;
    const statusObj = (d?.status ?? {}) as Record<string, unknown>;
    const code = statusObj?.code;
    // نجاح: code === 200 أو null أو undefined
    const ok = status === 200 && (code === 200 || code === null || code === undefined);
    console.log('[FullNumbers] OTP response', { status, serverCode: code, ok });
    if (!ok) {
      const msg = String(statusObj?.errorMsg ?? statusObj?.message ?? 'فشل إرسال رمز التحقق.');
      return { success: false, errorCode: 'SEND_OTP_FAILED', userMessage: msg };
    }
    return { success: true };
  } catch (err) {
    const code = err instanceof Error ? err.message : 'UNEXPECTED_ERROR';
    console.log('[FullNumbers] OTP request failed', { errorCode: code });
    return { success: false, errorCode: code, userMessage: mapError(code) };
  }
}

export interface FullNumbersData {
  vodafone: { count: number; mobileLines: string[] };
  orange:   { count: number; mobileLines: string[] };
  etisalat: { count: number; mobileLines: string[] };
  we:       { count: number; mobileLines: string[] };
}

/**
 * apiGetFullNumbers — جلب الأرقام الكاملة غير المشفرة بعد التحقق بـ OTP
 * Endpoint: /querynumber/api/v2/verify/LineNumbers
 */
export async function apiGetFullNumbers(
  nationalId: string,
  otp: string,
): Promise<ServiceResult<FullNumbersData>> {
  const deviceId = getOrCreateDeviceId();
  const token = loadToken();
  if (!token) {
    return { success: false, errorCode: 'SESSION_EXPIRED', userMessage: mapError('SESSION_EXPIRED') };
  }
  // Headers مطابقة تمامًا للسكريبت المرجعي (my_ntra_tool_otp.py → _otp_headers)
  const headers: Record<string, string> = {
    'User-Agent':      FULL_NUMBERS_USER_AGENT,
    'Accept-Encoding': 'gzip',
    'clientType':      'android',
    'deviceId':        deviceId,
    'appVersion':      '86',
    'Accept-language': 'ar',
    'Content-Type':    'application/json; charset=UTF-8',
    'Authorization':   `Bearer ${token}`,
  };
  const endpoint = `${BASE_URL}/querynumber/api/v2/verify/LineNumbers`;
  // تسجيل للمطور فقط — بدون رقم قومي/Token/OTP
  console.log('[FullNumbers] Verifying OTP', endpoint);
  try {
    const { status, data } = await fetchJson(
      endpoint,
      { method: 'POST', headers, body: JSON.stringify({ nationalId, otp }) },
    );
    const d = data as Record<string, unknown> | null;
    const statusObj = (d?.status ?? {}) as Record<string, unknown>;
    const serverCode = statusObj?.code;

    // مطابقة السكريبت المرجعي: 401 = OTP خطأ، 403 = OTP منتهي
    if (status === 401) {
      console.log('[FullNumbers] Verify response', { status, serverCode, errorCode: 'OTP_INVALID' });
      return { success: false, errorCode: 'OTP_INVALID', userMessage: 'رمز التحقق غير صحيح.' };
    }
    if (status === 403) {
      console.log('[FullNumbers] Verify response', { status, serverCode, errorCode: 'OTP_EXPIRED' });
      return { success: false, errorCode: 'OTP_EXPIRED', userMessage: 'انتهت صلاحية رمز التحقق. اطلب رمزًا جديدًا.' };
    }
    const ok = status === 200 && (serverCode === 200 || serverCode === null || serverCode === undefined);
    console.log('[FullNumbers] Verify response', { status, serverCode, ok });
    if (!ok) {
      const msg = String(statusObj?.errorMsg ?? statusObj?.message ?? 'رمز التحقق غير صحيح أو منتهي الصلاحية.');
      return { success: false, errorCode: 'OTP_INVALID', userMessage: msg };
    }
    // result البنية: { vodafone: { count, mobileLines:[...] }, orange: {...}, ... }
    const rawResult = (d?.result ?? {}) as Record<string, unknown>;
    const carriers = ['vodafone', 'orange', 'etisalat', 'we'] as const;

    function pKey(text: string): typeof carriers[number] | null {
      const t = text.toLowerCase();
      if (t.includes('vodafone')) return 'vodafone';
      if (t.includes('orange'))   return 'orange';
      if (t.includes('etisalat') || t.includes('e&')) return 'etisalat';
      if (t === 'we' || t.includes('telecom')) return 'we';
      return null;
    }

    const result: FullNumbersData = {
      vodafone: { count: 0, mobileLines: [] },
      orange:   { count: 0, mobileLines: [] },
      etisalat: { count: 0, mobileLines: [] },
      we:       { count: 0, mobileLines: [] },
    };
    for (const [key, val] of Object.entries(rawResult)) {
      const ck = pKey(key);
      if (!ck) continue;
      const pd = val as Record<string, unknown>;
      const rawLines = pd?.mobileLines ?? pd?.lineNumbers ?? pd?.lines ?? pd?.numbers ?? [];
      const lines = Array.isArray(rawLines) ? rawLines.filter(Boolean).map(String) : [];
      result[ck] = { count: Number(pd?.count ?? lines.length), mobileLines: lines };
    }
    return { success: true, data: result };
  } catch (err) {
    const code = err instanceof Error ? err.message : 'UNEXPECTED_ERROR';
    return { success: false, errorCode: code, userMessage: mapError(code) };
  }
}

/** حفظ آخر نتيجة استعلام مشفرة */
export function saveLastResult(result: unknown): void {
  try {
    localStorage.setItem(LAST_RESULT_KEY, btoa(unescape(encodeURIComponent(JSON.stringify(result)))));
  } catch { /* تجاهل أخطاء الحفظ */ }
}

/** تحميل آخر نتيجة استعلام */
export function loadLastResult<T = unknown>(): T | null {
  try {
    const raw = localStorage.getItem(LAST_RESULT_KEY);
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(escape(atob(raw)))) as T;
  } catch { return null; }
}

/** حفظ وقت آخر إرسال OTP */
export function saveOtpSentAt(): void {
  localStorage.setItem(OTP_SENT_AT_KEY, String(Date.now()));
}

/** الوقت المتبقي (ثانية) قبل السماح بإعادة الإرسال — 0 يعني مسموح */
export function getOtpResendCooldown(cooldownSeconds = 60): number {
  const raw = localStorage.getItem(OTP_SENT_AT_KEY);
  if (!raw) return 0;
  const elapsed = Math.floor((Date.now() - Number(raw)) / 1000);
  return Math.max(0, cooldownSeconds - elapsed);
}

/**
 * مسح الجلسة عند الخروج
 */
export function clearWalletLinesSession(): void {
  currentToken = null;
  currentNationalId = null;
  localStorage.removeItem(USERNAME_KEY);
  localStorage.removeItem(FULL_NAME_KEY);
  localStorage.removeItem(EMAIL_KEY);
  localStorage.removeItem(LAST_RESULT_KEY);
  localStorage.removeItem(OTP_SENT_AT_KEY);
  clearPasswordResetState();
  // نحتفظ بـ device_id لأنه غير حساس ومطلوب للاستعلامات القادمة
}

// ══════════════════════════════════════════════════════════════════
// Change Password Flow — Helpers
// ══════════════════════════════════════════════════════════════════

/** استخراج مدة الحظر (ثوانٍ) من رسالة الخادم */
function parseLockoutSeconds(message: string): number {
  if (!message) return 300;
  // البحث عن رقم + وحدة زمنية
  const m = message.match(/(\d+)\s*(?:دقيقة|دقائق|minute|minutes|ثانية|ثواني|second|seconds)/i);
  if (!m) return 300;
  const value = parseInt(m[1], 10);
  const isSeconds = /ثانية|ثواني|second|seconds/i.test(m[0]);
  return isSeconds ? value : value * 60;
}

function formatLockoutMessage(seconds: number): string {
  if (seconds <= 0) return 'يمكنك المحاولة الآن.';
  const minutes = Math.ceil(seconds / 60);
  return `تم تجاوز الحد الأقصى للمحاولات. يرجى الانتظار ${minutes} دقيقة قبل المحاولة مرة أخرى.`;
}

export function savePasswordResetPhone(phone: string): void {
  localStorage.setItem(CP_PHONE_KEY, phone);
}

export function loadPasswordResetPhone(): string | null {
  return localStorage.getItem(CP_PHONE_KEY);
}

export function savePasswordResetAttempts(attempts: number): void {
  localStorage.setItem(CP_ATTEMPTS_KEY, String(attempts));
}

export function loadPasswordResetAttempts(): number {
  const raw = localStorage.getItem(CP_ATTEMPTS_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isNaN(n) ? 0 : n;
}

export function savePasswordResetLockoutUntil(until: number | null): void {
  if (until === null) localStorage.removeItem(CP_LOCKOUT_KEY);
  else localStorage.setItem(CP_LOCKOUT_KEY, String(until));
}

export function loadPasswordResetLockoutUntil(): number | null {
  const raw = localStorage.getItem(CP_LOCKOUT_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

export function isPasswordResetLockedOut(): boolean {
  const until = loadPasswordResetLockoutUntil();
  if (!until) return false;
  return Date.now() < until;
}

export function getPasswordResetLockoutRemaining(): number {
  const until = loadPasswordResetLockoutUntil();
  if (!until) return 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

export function clearPasswordResetState(): void {
  localStorage.removeItem(CP_PHONE_KEY);
  localStorage.removeItem(CP_ATTEMPTS_KEY);
  localStorage.removeItem(CP_LOCKOUT_KEY);
}

/**
 * 1. طلب OTP لتغيير كلمة السر
 * GET /usermanagement/api/v1/user/reset/password/{phone}
 */
export async function apiRequestPasswordResetOtp(
  phone: string,
): Promise<ServiceResult<void>> {
  const deviceId = getOrCreateDeviceId();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'clientType': 'android',
    'Accept-language': 'ar',
    'deviceId': deviceId,
    'appVersion': APP_VERSION,
    'Host': 'my.tra.gov.eg',
    'Connection': 'Keep-Alive',
    'Accept-Encoding': 'gzip',
    'User-Agent': USER_AGENT,
  };

  try {
    const { status, data } = await fetchJson(
      `${BASE_URL}/usermanagement/api/v1/user/reset/password/${encodeURIComponent(phone)}`,
      { method: 'GET', headers },
    );

    if (status !== 200) {
      return { success: false, errorCode: 'OTP_SEND_FAILED', userMessage: 'فشل إرسال رمز التحقق. يرجى المحاولة لاحقًا.' };
    }

    const d = data as Record<string, unknown> | null;
    const statusObj = (d?.status ?? {}) as Record<string, unknown>;
    const code = statusObj?.code;

    if (code === 200) {
      return { success: true };
    }

    if (code === 24511) {
      const msg = String(statusObj?.errorMsg ?? '');
      const seconds = parseLockoutSeconds(msg);
      savePasswordResetLockoutUntil(Date.now() + seconds * 1000);
      return { success: false, errorCode: 'OTP_LOCKED_OUT', userMessage: `${msg || formatLockoutMessage(seconds)}` };
    }

    const msg = String(statusObj?.errorMsg ?? 'فشل إرسال رمز التحقق.');
    return { success: false, errorCode: 'OTP_SEND_FAILED', userMessage: msg };
  } catch (err) {
    const code = err instanceof Error ? err.message : 'UNEXPECTED_ERROR';
    return { success: false, errorCode: code, userMessage: mapError(code) };
  }
}

/**
 * 2. التحقق من OTP لتغيير كلمة السر
 * POST /usermanagement/api/v1/user/reset/password/verification
 * Body: { otp, username }
 */
export async function apiVerifyPasswordResetOtp(
  phone: string,
  otp: string,
): Promise<ServiceResult<{ verificationKey: string }>> {
  const deviceId = getOrCreateDeviceId();
  const headers: Record<string, string> = {
    'clientType': 'android',
    'Accept-language': 'ar',
    'deviceId': deviceId,
    'appVersion': APP_VERSION,
    'Content-Type': 'application/json; charset=UTF-8',
    'Host': 'my.tra.gov.eg',
    'Connection': 'Keep-Alive',
    'Accept-Encoding': 'gzip',
    'User-Agent': USER_AGENT,
  };

  try {
    const { status, data } = await fetchJson(
      `${BASE_URL}/usermanagement/api/v1/user/reset/password/verification`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ otp, username: phone }),
      },
    );

    if (status !== 200) {
      return { success: false, errorCode: 'OTP_INVALID', userMessage: 'فشل التحقق من رمز التحقق. يرجى المحاولة مرة أخرى.' };
    }

    const d = data as Record<string, unknown> | null;
    const statusObj = (d?.status ?? {}) as Record<string, unknown>;
    const code = statusObj?.code;

    if (code === 200) {
      const result = (d?.result ?? {}) as Record<string, unknown>;
      const key = result?.verificationKey;
      if (typeof key !== 'string' || !key) {
        return { success: false, errorCode: 'OTP_INVALID', userMessage: 'فشل استلام مفتاح التحقق. يرجى المحاولة لاحقًا.' };
      }
      return { success: true, data: { verificationKey: key } };
    }

    if (code === 24511) {
      const msg = String(statusObj?.errorMsg ?? '');
      const seconds = parseLockoutSeconds(msg);
      savePasswordResetLockoutUntil(Date.now() + seconds * 1000);
      return { success: false, errorCode: 'OTP_LOCKED_OUT', userMessage: `${msg || formatLockoutMessage(seconds)}` };
    }

    const msg = String(statusObj?.errorMsg ?? 'رمز التحقق غير صحيح.');
    return { success: false, errorCode: 'OTP_INVALID', userMessage: msg };
  } catch (err) {
    const code = err instanceof Error ? err.message : 'UNEXPECTED_ERROR';
    return { success: false, errorCode: code, userMessage: mapError(code) };
  }
}

/**
 * 3. تغيير كلمة السر
 * PUT /usermanagement/api/v1/user/reset/password/confirmation
 * Body: { password: sha256, username, verificationKey }
 */
export async function apiResetPassword(
  phone: string,
  password: string,
  verificationKey: string,
): Promise<ServiceResult<void>> {
  const deviceId = getOrCreateDeviceId();
  const headers: Record<string, string> = {
    'clientType': 'android',
    'Accept-language': 'ar',
    'deviceId': deviceId,
    'appVersion': APP_VERSION,
    'Content-Type': 'application/json; charset=UTF-8',
    'Host': 'my.tra.gov.eg',
    'Connection': 'Keep-Alive',
    'Accept-Encoding': 'gzip',
    'User-Agent': USER_AGENT,
  };

  try {
    const hashedPassword = await sha256(password);
    const { status, data } = await fetchJson(
      `${BASE_URL}/usermanagement/api/v1/user/reset/password/confirmation`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({ password: hashedPassword, username: phone, verificationKey }),
      },
    );

    if (status !== 200) {
      return { success: false, errorCode: 'RESET_FAILED', userMessage: 'فشل تغيير كلمة السر. يرجى المحاولة لاحقًا.' };
    }

    const d = data as Record<string, unknown> | null;
    const statusObj = (d?.status ?? {}) as Record<string, unknown>;
    if (statusObj?.code === 200) {
      return { success: true };
    }

    const msg = String(statusObj?.errorMsg ?? 'فشل تغيير كلمة السر.');
    return { success: false, errorCode: 'RESET_FAILED', userMessage: msg };
  } catch (err) {
    const code = err instanceof Error ? err.message : 'UNEXPECTED_ERROR';
    return { success: false, errorCode: code, userMessage: mapError(code) };
  }
}

