/**
 * Wallet Lines Service — PHASE 3 (Session Persistence + OTP Full Numbers)
 */

import type {
  IWalletLinesService,
  LoginRequest,
  RegisterRequest,
  OtpRequest,
  AuthToken,
  ServiceResult,
  WalletLinesResult,
} from '@/lib/walletLinesInterfaces';
import {
  apiLogin,
  apiRegister,
  apiVerifyOtp,
  apiLookup,
  apiVerifyNationalId,
  apiSendOtp,
  apiGetFullNumbers,
  apiRequestPasswordResetOtp,
  apiVerifyPasswordResetOtp,
  apiResetPassword,
  clearWalletLinesSession,
  isSessionActive,
  loadNationalId,
  saveNationalId,
  loadUsername,
  saveUsername,
  loadFullName,
  saveFullName,
  loadEmail,
  saveEmail,
  saveLastResult,
  loadLastResult,
  saveOtpSentAt,
  getOtpResendCooldown,
  savePasswordResetPhone,
  loadPasswordResetPhone,
  savePasswordResetAttempts,
  loadPasswordResetAttempts,
  savePasswordResetLockoutUntil,
  isPasswordResetLockedOut,
  getPasswordResetLockoutRemaining,
  clearPasswordResetState,
} from '@/lib/apiWalletLines';

export type { ServiceResult };

export interface FullNumbersData {
  vodafone: { count: number; mobileLines: string[] };
  orange:   { count: number; mobileLines: string[] };
  etisalat: { count: number; mobileLines: string[] };
  we:       { count: number; mobileLines: string[] };
}

class RealWalletLinesService implements IWalletLinesService {
  async login(req: LoginRequest): Promise<ServiceResult<AuthToken>> {
    const result = await apiLogin(req.phone, req.password);
    if (result.success) {
      saveUsername(req.phone);
      if (result.data?.name) saveFullName(result.data.name);
      if (result.data?.email) saveEmail(result.data.email);
    }
    return result;
  }

  async register(req: RegisterRequest): Promise<ServiceResult<void>> {
    const result = await apiRegister(req.phone, req.fullName, req.email, req.password);
    if (result.success) {
      saveUsername(req.phone);
      saveFullName(req.fullName);
      saveEmail(req.email);
    }
    return result;
  }

  async verifyOtp(req: OtpRequest): Promise<ServiceResult<AuthToken>> {
    const result = await apiVerifyOtp(req.phone, req.otp);
    if (!result.success) {
      return { success: false, errorCode: result.errorCode, userMessage: result.userMessage };
    }
    const token = localStorage.getItem('wl_session_token') ?? '';
    return {
      success: true,
      data: { token, expiresAt: new Date(Date.now() + 3600_000).toISOString() },
    };
  }

  async lookupByNationalId(
    nationalIdFull: string,
    _token?: string,
  ): Promise<ServiceResult<WalletLinesResult>> {
    // حفظ الرقم القومي للجلسة القادمة
    saveNationalId(nationalIdFull);
    // 1. التحقق من الرقم القومي أولاً باستخدام loginToken
    const verifyResult = await apiVerifyNationalId(nationalIdFull);
    if (!verifyResult.success) {
      return {
        success: false,
        errorCode: verifyResult.errorCode,
        userMessage: verifyResult.userMessage,
      };
    }
    // 2. جلب بيانات المحافظ والخطوط بعد نجاح التحقق
    const result = await apiLookup(nationalIdFull);
    // حفظ آخر نتيجة ناجحة لاستعادتها لو المستخدم رجع للقسم
    if (result.success && result.data) {
      saveLastResult(result.data);
    }
    return result;
  }

  /** طلب OTP للأرقام الكاملة */
  async sendFullNumbersOtp(nationalId: string): Promise<ServiceResult<void>> {
    const result = await apiSendOtp(nationalId);
    if (result.success) {
      // حفظ وقت الإرسال لضبط الـ cooldown
      saveOtpSentAt();
    }
    return result;
  }

  /** جلب الأرقام الكاملة بعد التحقق بـ OTP */
  async getFullNumbers(
    nationalId: string,
    otp: string,
  ): Promise<ServiceResult<FullNumbersData>> {
    return apiGetFullNumbers(nationalId, otp);
  }

  /** تسجيل الخروج — حذف كل بيانات الجلسة */
  logout(): void {
    clearWalletLinesSession();
  }

  /** هل يوجد جلسة محفوظة صالحة؟ */
  hasActiveSession(): boolean {
    return isSessionActive();
  }

  /** تحميل الرقم القومي المحفوظ */
  getSavedNationalId(): string | null {
    return loadNationalId();
  }

  /** تحميل اسم المستخدم (رقم الهاتف) المحفوظ */
  getSavedUsername(): string | null {
    return loadUsername();
  }

  /** تحميل الاسم الكامل المحفوظ */
  getSavedFullName(): string | null {
    return loadFullName();
  }

  /** تحميل البريد الإلكتروني المحفوظ */
  getSavedEmail(): string | null {
    return loadEmail();
  }

  /** تحميل آخر نتيجة استعلام محفوظة */
  getLastResult<T = unknown>(): T | null {
    return loadLastResult<T>();
  }

  /** ثانية الـ cooldown المتبقية (0 = مسموح بالإرسال) */
  getOtpCooldown(): number {
    return getOtpResendCooldown(60);
  }

  // ── Change Password Flow ─────────────────────────────────────────

  /** الحد الأقصى لمحاولات OTP */
  readonly MAX_PASSWORD_RESET_ATTEMPTS = 3;

  /** التحقق من حظر تغيير كلمة السر */
  isPasswordResetLockedOut(): boolean {
    return isPasswordResetLockedOut();
  }

  /** الثواني المتبقية في الحظر */
  getPasswordResetLockoutRemaining(): number {
    return getPasswordResetLockoutRemaining();
  }

  /** طلب OTP لتغيير كلمة السر */
  async requestPasswordResetOtp(phone: string): Promise<ServiceResult<void>> {
    if (this.isPasswordResetLockedOut()) {
      return {
        success: false,
        errorCode: 'OTP_LOCKED_OUT',
        userMessage: `تم تجاوز الحد الأقصى للمحاولات. يرجى الانتظار ${Math.ceil(this.getPasswordResetLockoutRemaining() / 60)} دقيقة.`,
      };
    }
    savePasswordResetPhone(phone);
    const result = await apiRequestPasswordResetOtp(phone);
    if (result.success) {
      savePasswordResetAttempts(0);
    }
    return result;
  }

  /** التحقق من OTP وتخزين مفتاح التحقق */
  async verifyPasswordResetOtp(
    phone: string,
    otp: string,
  ): Promise<ServiceResult<{ verificationKey: string }>> {
    if (this.isPasswordResetLockedOut()) {
      return {
        success: false,
        errorCode: 'OTP_LOCKED_OUT',
        userMessage: `تم تجاوز الحد الأقصى للمحاولات. يرجى الانتظار ${Math.ceil(this.getPasswordResetLockoutRemaining() / 60)} دقيقة.`,
      };
    }
    const result = await apiVerifyPasswordResetOtp(phone, otp);
    if (result.success) {
      savePasswordResetAttempts(0);
      savePasswordResetLockoutUntil(null);
      return result;
    }

    // خطأ في OTP → زيادة المحاولات وتطبيق الحظر بعد 3 محاولات
    if (result.errorCode === 'OTP_INVALID') {
      const attempts = loadPasswordResetAttempts() + 1;
      savePasswordResetAttempts(attempts);
      if (attempts >= this.MAX_PASSWORD_RESET_ATTEMPTS) {
        savePasswordResetLockoutUntil(Date.now() + 300_000); // 5 دقائق
        return {
          success: false,
          errorCode: 'OTP_LOCKED_OUT',
          userMessage: `تم تجاوز الحد الأقصى (${this.MAX_PASSWORD_RESET_ATTEMPTS}) محاولات. يرجى الانتظار 5 دقائق.`,
        };
      }
      return {
        success: false,
        errorCode: 'OTP_INVALID',
        userMessage: `${result.userMessage} (المحاولات المتبقية: ${this.MAX_PASSWORD_RESET_ATTEMPTS - attempts})`,
      };
    }

    return result;
  }

  /** تغيير كلمة السر */
  async resetPassword(
    phone: string,
    password: string,
    confirmPassword: string,
    verificationKey: string,
  ): Promise<ServiceResult<void>> {
    if (password.length < 6) {
      return { success: false, errorCode: 'PASSWORD_TOO_SHORT', userMessage: 'كلمة السر يجب أن تكون 6 أحرف/أرقام على الأقل.' };
    }
    if (password !== confirmPassword) {
      return { success: false, errorCode: 'PASSWORD_MISMATCH', userMessage: 'كلمتا السر غير متطابقتين.' };
    }
    const result = await apiResetPassword(phone, password, verificationKey);
    if (result.success) {
      clearPasswordResetState();
    }
    return result;
  }

  /** رقم الهاتف المقنّع (مثلاً: 010****3680) */
  getMaskedPhone(): string | null {
    const phone = loadUsername();
    if (!phone || phone.length < 7) return null;
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  }

  /** رقم الهاتف المستخدم في تغيير كلمة السر */
  getPasswordResetPhone(): string | null {
    return loadPasswordResetPhone();
  }
}

export const walletLinesService = new RealWalletLinesService();
