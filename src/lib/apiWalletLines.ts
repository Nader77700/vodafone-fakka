/**
 * apiWalletLines.ts — API Client Layer
 * يستدعي Edge Function wallet-lines-proxy فقط.
 * لا اتصال مباشر بـ my.tra.gov.eg من Frontend.
 *
 * قواعد:
 *  - كلمة المرور تُرسل plain text للـ Edge Function (HTTPS) — SHA-256 يتم هناك
 *  - loginToken لا يصل للـ Frontend — يُعاد sessionKey بدلاً منه
 *  - الرقم القومي يُرسل للـ Edge Function فقط عبر HTTPS — لا يُسجَّل في console
 *  - deviceId يُولَّد مرة واحدة ويُحفظ في sessionStorage
 */

import type {
  ServiceResult,
  AuthToken,
  WalletLinesResult,
} from '@/lib/walletLinesInterfaces';

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

// ── Edge Function URL ─────────────────────────────────────────────
const EDGE_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wallet-lines-proxy`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// ── استدعاء Edge Function (fetch مباشر — أكثر موثوقية من invoke) ──
async function callProxy<T>(
  action: string,
  payload: Record<string, unknown>,
): Promise<ServiceResult<T>> {
  try {
    const resp = await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ action, deviceId: getOrCreateDeviceId(), ...payload }),
    });

    let parsed: { ok?: boolean; error?: string; message?: string; [key: string]: unknown } = {};
    try { parsed = await resp.json(); } catch { /* body غير JSON */ }

    if (!parsed.ok) {
      return {
        success: false,
        errorCode: (parsed.error as string) ?? 'UNEXPECTED_ERROR',
        userMessage: (parsed.message as string) ?? 'حدث خطأ غير متوقع.',
      };
    }

    return { success: true, data: parsed as unknown as T };
  } catch {
    return {
      success: false,
      errorCode: 'CONNECTION_ERROR',
      userMessage: 'تعذر الاتصال بالخادم. تأكد من الإنترنت.',
    };
  }
}

// ── تعيين رسائل خطأ عربية ─────────────────────────────────────────
function mapErrorCode(code: string, fallback: string): string {
  const MAP: Record<string, string> = {
    CONNECTION_ERROR: 'تعذر الاتصال بالخادم. تأكد من اتصالك بالإنترنت.',
    TIMEOUT: 'انتهت مهلة الاتصال بالخادم. حاول مجدداً.',
    SERVICE_UNAVAILABLE: 'الخدمة غير متاحة خارج مصر. استخدم شبكة مصرية أو VPN مصري.',
    INVALID_CREDENTIALS: 'بيانات تسجيل الدخول غير صحيحة.',
    REGISTER_FAILED: 'فشل إنشاء الحساب. قد يكون الرقم مسجلاً مسبقاً.',
    OTP_INVALID: 'رمز OTP غير صحيح. تأكد وأعد المحاولة.',
    OTP_VERIFY_FAILED: 'فشل تأكيد الحساب. حاول مجدداً.',
    NATIONAL_ID_INVALID: 'الرقم القومي غير صحيح.',
    SESSION_EXPIRED: 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.',
    TOKEN_MISSING: 'لم يتم استلام رمز الجلسة.',
    INVALID_RESPONSE: 'استجابة غير صالحة من الخادم.',
    UNEXPECTED_ERROR: 'حدث خطأ غير متوقع. حاول مجدداً.',
  };
  return MAP[code] ?? fallback;
}

// ══════════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════════

/**
 * تسجيل الدخول — يرجع sessionKey (ليس token)
 * sessionKey يُخزن في sessionStorage ويُرسل مع طلب lookup
 */
export async function apiLogin(
  phone: string,
  password: string,
): Promise<ServiceResult<AuthToken & { name?: string; email?: string }>> {
  const result = await callProxy<{
    sessionKey: string;
    name?: string;
    email?: string;
  }>('login', { phone, password });

  if (!result.success) {
    return {
      success: false,
      errorCode: result.errorCode,
      userMessage: mapErrorCode(
        result.errorCode ?? '',
        result.userMessage ?? 'فشل تسجيل الدخول.',
      ),
    };
  }

  const sessionKey = result.data?.sessionKey ?? '';
  // حفظ session key محلياً
  sessionStorage.setItem('wl_session_key', sessionKey);

  return {
    success: true,
    data: {
      // نُعيد sessionKey كـ token في الـ interface (الـ real token في Edge Function فقط)
      token: sessionKey,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      name: result.data?.name,
      email: result.data?.email,
    },
  };
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
  const result = await callProxy<void>('register', {
    phone,
    name,
    email,
    password,
  });

  if (!result.success) {
    return {
      success: false,
      errorCode: result.errorCode,
      userMessage: mapErrorCode(
        result.errorCode ?? '',
        result.userMessage ?? 'فشل إنشاء الحساب.',
      ),
    };
  }

  return { success: true };
}

/**
 * التحقق من OTP
 */
export async function apiVerifyOtp(
  phone: string,
  otp: string,
): Promise<ServiceResult<void>> {
  const result = await callProxy<void>('verify_otp', { phone, otp });

  if (!result.success) {
    return {
      success: false,
      errorCode: result.errorCode,
      userMessage: mapErrorCode(
        result.errorCode ?? '',
        result.userMessage ?? 'رمز OTP غير صحيح.',
      ),
    };
  }

  return { success: true };
}

/**
 * الاستعلام بالرقم القومي — محافظ + خطوط بالتوازي
 * ⚠️ الرقم القومي لا يُسجَّل في console أبداً
 */
export async function apiLookup(
  nationalId: string,
): Promise<ServiceResult<WalletLinesResult>> {
  const sessionKey = sessionStorage.getItem('wl_session_key') ?? '';

  if (!sessionKey) {
    return {
      success: false,
      errorCode: 'SESSION_EXPIRED',
      userMessage: 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.',
    };
  }

  const result = await callProxy<{
    wallets: WalletLinesResult['wallets'];
    lines: WalletLinesResult['lines'];
    fetchedAt: string;
  }>('lookup', { nationalId, sessionKey });

  if (!result.success) {
    return {
      success: false,
      errorCode: result.errorCode,
      userMessage: mapErrorCode(
        result.errorCode ?? '',
        result.userMessage ?? 'فشل تحميل البيانات.',
      ),
    };
  }

  return {
    success: true,
    data: {
      wallets: result.data?.wallets ?? [],
      lines: result.data?.lines ?? [],
      fetchedAt: result.data?.fetchedAt ?? new Date().toISOString(),
    },
  };
}

/**
 * مسح الجلسة عند الخروج
 */
export function clearWalletLinesSession(): void {
  sessionStorage.removeItem('wl_session_key');
  sessionStorage.removeItem('wl_device_id');
}
