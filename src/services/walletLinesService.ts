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
    }
    return result;
  }

  async register(req: RegisterRequest): Promise<ServiceResult<void>> {
    return apiRegister(req.phone, req.fullName, req.email, req.password);
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
    return apiLookup(nationalIdFull);
  }

  /** طلب OTP للأرقام الكاملة */
  async sendFullNumbersOtp(nationalId: string): Promise<ServiceResult<void>> {
    return apiSendOtp(nationalId);
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
}

export const walletLinesService = new RealWalletLinesService();
