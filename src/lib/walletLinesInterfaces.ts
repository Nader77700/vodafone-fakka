/**
 * Interfaces & Contracts — خدمات الخطوط والمحافظ — PHASE 1
 * هذه الـ interfaces تضمن إمكانية استبدال Mock بـ API حقيقي لاحقًا
 * دون إعادة بناء أي UI Component.
 */

import type { DataAvailability, InternalErrorLog } from './walletLinesErrors';

// ── Auth ──────────────────────────────────────────────────────────

export interface LoginRequest {
  phone: string;
  password: string;
}

export interface RegisterRequest {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface OtpRequest {
  phone: string;
  otp: string;
}

export interface AuthToken {
  token: string;
  expiresAt: string;
}

// ── National ID ───────────────────────────────────────────────────

export interface NationalIdRequest {
  /** الرقم القومي الكامل — يُرسل للـ Backend فقط عبر HTTPS — ممنوع حفظه أو تسجيله */
  nationalIdFull: string;
}

// ── Wallet (محفظة) ────────────────────────────────────────────────

export type TelecomCarrier = 'vodafone' | 'orange' | 'etisalat' | 'we';

export interface WalletInfo {
  carrier: TelecomCarrier;
  carrierName: string;
  /** الاسم المسجل على المحفظة */
  registeredName?: string;
  /** عدد المحافظ */
  walletCount?: number;
  /** أرقام المحافظ */
  walletNumbers?: string[];
  /** تاريخ التسجيل */
  registrationDate?: string;
  /** حالة المحفظة */
  walletStatus?: string;
  /** حالة توفر البيانات */
  availability: DataAvailability;
  /** معلومات خطأ داخلية (لا تُعرض للمستخدم) */
  _errorLog?: InternalErrorLog;
}

// ── Line (خط) ─────────────────────────────────────────────────────

export interface LineInfo {
  carrier: TelecomCarrier;
  carrierName: string;
  /** عدد الخطوط */
  lineCount?: number;
  /** أرقام الخطوط */
  lineNumbers?: string[];
  /** حالة الخدمة للخطوط */
  serviceStatus?: string;
  /** حالة توفر البيانات */
  availability: DataAvailability;
  _errorLog?: InternalErrorLog;
}

// ── نتيجة البحث الكاملة ───────────────────────────────────────────

export interface WalletLinesResult {
  wallets: WalletInfo[];
  lines: LineInfo[];
  /** طابع زمني لوقت الاستجابة */
  fetchedAt: string;
}

// ── Contracts: Service Layer ──────────────────────────────────────

/**
 * عقد طبقة الخدمة — يجب أن يُنفَّذ من Mock أو API حقيقي
 * UI لا يعرف أي نوع يعمل الآن.
 */
export interface IWalletLinesService {
  login(req: LoginRequest): Promise<ServiceResult<AuthToken>>;
  register(req: RegisterRequest): Promise<ServiceResult<void>>;
  verifyOtp(req: OtpRequest): Promise<ServiceResult<AuthToken>>;
  /** nationalIdFull: الرقم القومي الكامل 14 رقم — يُرسل للـ Backend فقط عبر HTTPS */
  lookupByNationalId(nationalIdFull: string, token: string): Promise<ServiceResult<WalletLinesResult>>;
}

/** نتيجة موحدة لكل عمليات الـ Service Layer */
export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  errorCode?: string;
  userMessage?: string;
}
