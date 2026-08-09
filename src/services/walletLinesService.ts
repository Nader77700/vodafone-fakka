/**
 * Wallet Lines Service — PHASE 2 (Real API via Edge Function)
 * طبقة الخدمة — UI لا يستدعي API مباشرة.
 * يستدعي apiWalletLines (Edge Function proxy) بدلاً من Mock.
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
} from '@/lib/apiWalletLines';

class RealWalletLinesService implements IWalletLinesService {
  async login(req: LoginRequest): Promise<ServiceResult<AuthToken>> {
    return apiLogin(req.phone, req.password);
  }

  async register(req: RegisterRequest): Promise<ServiceResult<void>> {
    return apiRegister(req.phone, req.fullName, req.email, req.password);
  }

  async verifyOtp(req: OtpRequest): Promise<ServiceResult<AuthToken>> {
    const result = await apiVerifyOtp(req.phone, req.otp);
    if (!result.success) return result;
    // بعد OTP ناجح → token موجود بالفعل في sessionStorage من login
    // نُعيد token placeholder — الجلسة محفوظة في apiWalletLines
    const sessionKey = sessionStorage.getItem('wl_session_token') ?? '';
    return {
      success: true,
      data: {
        token: sessionKey,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      },
    };
  }

  /**
   * nationalIdFull: الرقم القومي الكامل (14 رقم) — يُرسل للـ Edge Function فقط
   * لا يُسجَّل في console أبداً
   */
  async lookupByNationalId(
    nationalIdFull: string,
    _token: string,
  ): Promise<ServiceResult<WalletLinesResult>> {
    return apiLookup(nationalIdFull);
  }
}

/** الـ instance المُصدَّر — PHASE 2: Real API */
export const walletLinesService: IWalletLinesService = new RealWalletLinesService();
