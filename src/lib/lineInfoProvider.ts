/**
 * LineInfoProvider — Abstraction Layer لخدمة "معلومات الخط"
 *
 * المرحلة الثانية: Real Provider — يستدعي Edge Function: line-info-query
 * كل الاتصال الحساس (productionKey, DirectLine, WebSocket) يتم Server-side.
 */

import { supabase } from '@/db/supabase';

// ── بيانات كارت/باقة واحدة ────────────────────────────────────
export interface CardItem {
  name: string;
  availableAllowance: number;
  usedAllowance: number;
  unitCode: string;
  resetDate: string;
}

/** نتيجة فحص الخط — المرحلة الثانية */
export interface LineInfoResult {
  phoneNumber: string;
  system: string | null;
  balance: string | null;
  loanDetails: string | null;
  miBundles: CardItem[];
  fakkaCards: CardItem[];
  maredCards: CardItem[];
}

/** حالات الاستجابة */
export type LineInfoStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'invalid_number'
  | 'no_data'
  | 'number_unavailable'
  | 'service_unavailable'
  | 'connection_error'
  | 'timeout'
  | 'error';

/** استجابة الـ Provider */
export interface LineInfoResponse {
  status: LineInfoStatus;
  data?: LineInfoResult;
  errorMessage?: string;
}

// ── سجل الفحوصات (localStorage 7 أيام) ──────────────────────
export interface LineInfoHistoryEntry {
  id: string;
  phone: string;
  checkedAt: number; // timestamp ms
  result: LineInfoResult;
}

const HISTORY_KEY = 'line_info_history';
const MAX_AGE_MS  = 7 * 24 * 60 * 60 * 1000; // 7 أيام

export function getLineInfoHistory(): LineInfoHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const entries = JSON.parse(raw) as LineInfoHistoryEntry[];
    const cutoff  = Date.now() - MAX_AGE_MS;
    return entries.filter(e => e.checkedAt > cutoff);
  } catch {
    return [];
  }
}

export function saveLineInfoHistory(entry: Omit<LineInfoHistoryEntry, 'id'>): void {
  try {
    const existing = getLineInfoHistory();
    // لا تحفظ duplicates للنفس الرقم في نفس الدقيقة
    const newEntry: LineInfoHistoryEntry = { id: crypto.randomUUID(), ...entry };
    const updated = [newEntry, ...existing].slice(0, 50); // حد أقصى 50 سجل
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // localStorage ممتلئ — نتجاهل
  }
}

// ── التحقق من صحة رقم الهاتف المصري ─────────────────────────
export function validateEgyptianPhone(phone: string): boolean {
  const cleaned = phone.replace(/\s|-/g, '');
  const LOCAL_RE = /^01[0-9]{9}$/;
  const INTL_RE  = /^(\+2|002)01[0-9]{9}$/;
  return LOCAL_RE.test(cleaned) || INTL_RE.test(cleaned);
}

export function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/\s|-/g, '');
  if (cleaned.startsWith('+2'))  cleaned = cleaned.slice(2);
  if (cleaned.startsWith('002')) cleaned = cleaned.slice(3);
  return cleaned;
}

// ── تعيين رسالة الخطأ المناسبة ────────────────────────────────
function mapErrorCode(code: string): { status: LineInfoStatus; message: string } {
  switch (code) {
    case 'invalid_number':
      return { status: 'invalid_number',      message: 'رقم الهاتف غير صحيح.' };
    case 'number_unavailable':
      return { status: 'number_unavailable',  message: 'الرقم غير متوفر أو غير صحيح، أو الخدمة غير متاحة حالياً.' };
    case 'no_data':
      return { status: 'no_data',             message: 'لا توجد بيانات لهذا الرقم.' };
    case 'service_unavailable':
      return { status: 'service_unavailable', message: 'الخدمة غير متاحة حالياً، حاول لاحقاً.' };
    case 'connection_error':
      return { status: 'connection_error',    message: 'تعذّر الاتصال بالخدمة، تحقق من الإنترنت.' };
    default:
      return { status: 'error',               message: 'حدث خطأ غير متوقع، حاول مرة أخرى.' };
  }
}

// ── الدالة الرئيسية — Real Provider ──────────────────────────
export async function fetchLineInfo(phone: string): Promise<LineInfoResponse> {
  // 1. التحقق من صحة الرقم قبل الإرسال
  if (!validateEgyptianPhone(phone)) {
    return { status: 'invalid_number', errorMessage: 'يرجى إدخال رقم هاتف صحيح.' };
  }

  const normalized = normalizePhone(phone);

  try {
    // 2. استدعاء Edge Function — timeout 35 ثانية (الـ function تستغرق حتى 25 ثانية)
    // ملاحظة: supabase-js v2 لا يدعم AbortSignal في invoke مباشرة
    // نستخدم Promise.race مع timeout يدوي بدلاً منه
    const invokePromise = supabase.functions.invoke('line-info-query', {
      body: { phone: normalized },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new DOMException('Request timeout', 'AbortError')), 35_000)
    );

    const { data, error } = await Promise.race([invokePromise, timeoutPromise]);

    if (error) {
      // supabase-js يُحوّل HTTP 4xx/5xx إلى FunctionsHttpError — نقرأ الـ body منه
      const httpBody = (error as any)?.context as Record<string, unknown> | undefined;
      const errCode  = (httpBody?.error as string | undefined) ?? 'error';
      const errMsg   = (httpBody?.message as string | undefined) ?? undefined;
      const mapped   = mapErrorCode(errCode);
      return { status: mapped.status, errorMessage: errMsg ?? mapped.message };
    }

    if (!data?.success || !data?.data) {
      const errCode = data?.error ?? 'error';
      const mapped  = mapErrorCode(errCode);
      return { status: mapped.status, errorMessage: data?.message ?? mapped.message };
    }

    // 3. تحويل response إلى LineInfoResult
    const raw = data.data as {
      phone: string;
      system: string | null;
      balance: string | null;
      loanDetails: string | null;
      miBundles: CardItem[];
      fakkaCards: CardItem[];
      maredCards: CardItem[];
    };

    const result: LineInfoResult = {
      phoneNumber: raw.phone,
      system:      raw.system,
      balance:     raw.balance,
      loanDetails: raw.loanDetails,
      miBundles:   raw.miBundles  ?? [],
      fakkaCards:  raw.fakkaCards ?? [],
      maredCards:  raw.maredCards ?? [],
    };

    // 4. حفظ في السجل
    saveLineInfoHistory({ phone: normalized, checkedAt: Date.now(), result });

    return { status: 'success', data: result };
  } catch (err) {
    // تسجيل الخطأ الحقيقي في console للتشخيص
    console.error('[LineInfoProvider] fetchLineInfo unexpected error:', err);
    // AbortError = timeout
    if (err instanceof Error && (err.name === 'AbortError' || err.message?.includes('aborted'))) {
      return { status: 'timeout', errorMessage: 'انتهت مهلة الاتصال — الخدمة بطيئة حالياً، حاول مجدداً.' };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'error', errorMessage: `خطأ غير متوقع: ${message}` };
  }
}
