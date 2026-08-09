/**
 * Error Architecture — PHASE 1 — خدمات الخطوط والمحافظ
 * فصل كامل بين رسائل المستخدم والبيانات التقنية الداخلية.
 * ممنوع تسجيل: Passwords / Tokens / OTP / الرقم القومي كاملًا.
 */

// ── أنواع الأخطاء ──────────────────────────────────────────────
export type WalletLinesErrorCode =
  | 'NO_INTERNET'
  | 'TIMEOUT'
  | 'SERVICE_UNAVAILABLE'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_NATIONAL_ID'
  | 'INVALID_RESPONSE'
  | 'NO_DATA'
  | 'PARTIAL_WALLETS'
  | 'PARTIAL_LINES'
  | 'UNEXPECTED_ERROR';

// ── رسائل مستخدم ودية — بدون بيانات تقنية ──────────────────────
export const USER_FRIENDLY_MESSAGES: Record<WalletLinesErrorCode, string> = {
  NO_INTERNET:         'لا يوجد اتصال بالإنترنت. تحقق من اتصالك وحاول مجددًا.',
  TIMEOUT:             'انتهت مهلة الاتصال. يرجى المحاولة مرة أخرى.',
  SERVICE_UNAVAILABLE: 'الخدمة غير متاحة حاليًا. يرجى المحاولة لاحقًا.',
  INVALID_CREDENTIALS: 'بيانات تسجيل الدخول غير صحيحة. تحقق من رقم الهاتف وكلمة المرور.',
  INVALID_NATIONAL_ID: 'الرقم القومي المُدخل غير صحيح. يجب أن يكون 14 رقمًا.',
  INVALID_RESPONSE:    'استجابة غير صالحة من الخادم. يرجى المحاولة مجددًا.',
  NO_DATA:             'لا توجد بيانات متاحة في الوقت الحالي.',
  PARTIAL_WALLETS:     'تم تحميل بعض البيانات. محافظ بعض الشركات غير متاحة حاليًا.',
  PARTIAL_LINES:       'تم تحميل بعض البيانات. خطوط بعض الشركات غير متاحة حاليًا.',
  UNEXPECTED_ERROR:    'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.',
};

// ── حالات عرض النتائج — الفصل بين أنواع الغياب ──────────────────
export type DataAvailability =
  | 'loaded'        // بيانات موجودة ✅
  | 'empty'         // لا توجد بيانات (الاستجابة صحيحة لكن فارغة)
  | 'unavailable'   // الخدمة غير متاحة
  | 'no_response'   // API لم يرجع بيانات لهذه الشركة
  | 'conn_error'    // خطأ اتصال
  | 'invalid'       // استجابة غير صالحة
  | 'loading';      // جاري التحميل

// ── نموذج السجل الداخلي (لا يُعرض للمستخدم) ────────────────────
export interface InternalErrorLog {
  timestamp: string;
  errorCode: WalletLinesErrorCode;
  httpStatus?: number;
  errorType?: string;
  serviceIdentifier: string;
  requestId?: string;
  // ممنوع: password / token / otp / nationalId
}

/** ينشئ سجل خطأ داخلي آمن */
export function buildErrorLog(
  code: WalletLinesErrorCode,
  serviceId: string,
  opts?: { httpStatus?: number; errorType?: string; requestId?: string },
): InternalErrorLog {
  return {
    timestamp: new Date().toISOString(),
    errorCode: code,
    serviceIdentifier: serviceId,
    httpStatus: opts?.httpStatus,
    errorType: opts?.errorType,
    requestId: opts?.requestId,
  };
}

/** يُرجع رسالة ودية للمستخدم */
export function getUserMessage(code: WalletLinesErrorCode): string {
  return USER_FRIENDLY_MESSAGES[code] ?? USER_FRIENDLY_MESSAGES.UNEXPECTED_ERROR;
}
