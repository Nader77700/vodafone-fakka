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
  apiSendOtp,
  apiGetFullNumbers,
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
    _token: string,
  ): Promise<ServiceResult<WalletLinesResult>> {
    // حفظ الرقم القومي للجلسة القادمة
    saveNationalId(nationalIdFull);
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
}

export const walletLinesService = new RealWalletLinesService();
