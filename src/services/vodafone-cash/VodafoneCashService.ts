import { MoneyTransfer, RechargeBalance, VodafoneCashCenterStats } from "../../types/vodafoneCash";
import { supabase } from "@/db/supabase";

/**
 * Placeholder service for Vodafone Cash operations.
 * NO REAL API CALLS YET.
 */
export class VodafoneCashService {
  static async initiateMoneyTransfer(payload: { receiver_number: string; amount: number; pin: string; seamless_token: string | null; msisdn: string | null }): Promise<{ success: boolean; message: string; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('vcc-money-transfer', {
        body: {
          receiver: payload.receiver_number,
          amount: payload.amount,
          pin: payload.pin,
          seamless_token: payload.seamless_token,
          payload_msisdn: payload.msisdn
        }
      });
      if (error) {
        // حاول تقرأ الـ body الفعلي من Edge Function (Supabase بيرمي FunctionsHttpError)
        let errMsg = error.message || "حدث خطأ أثناء الاتصال بالسيرفر";
        let debugSteps: any[] = [];
        try {
          const ctx = (error as any)?.context;
          const rawTxt = typeof ctx?.text === 'function' ? await ctx.text() : null;
          if (rawTxt) {
            const parsed = JSON.parse(rawTxt);
            if (parsed?.error) errMsg = parsed.error;
            if (parsed?.debugSteps) debugSteps = parsed.debugSteps;
          }
        } catch { /* ignore */ }
        return { success: false, message: errMsg, error: errMsg, data: { debugSteps } };
      }
      if (!data) {
        return { success: false, message: "لا يوجد رد من الخادم", error: "no_data" };
      }
      if (!data.success) {
        return { success: false, message: data.error || data.message || "فشلت العملية", error: data.error, data };
      }
      return { success: true, message: data.message || "تم التحويل بنجاح", data };
    } catch (e: any) {
      return { success: false, message: e.message || "حدث خطأ غير متوقع", error: e.message };
    }
  }

  static async initiateRecharge(payload: { receiver_number: string; amount: number; pin: string; seamless_token: string | null; msisdn: string | null }): Promise<{ success: boolean; message: string; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('vcc-recharge', {
        body: {
          receiver: payload.receiver_number,
          amount: payload.amount,
          pin: payload.pin,
          seamless_token: payload.seamless_token,
          payload_msisdn: payload.msisdn,
        }
      });
      if (error) {
        let errMsg = error.message || "حدث خطأ أثناء الاتصال بالسيرفر";
        let debugSteps: any[] = [];
        try {
          const ctx = (error as any)?.context;
          const rawTxt = typeof ctx?.text === 'function' ? await ctx.text() : null;
          if (rawTxt) {
            const parsed = JSON.parse(rawTxt);
            if (parsed?.error) errMsg = parsed.error;
            if (parsed?.debugSteps) debugSteps = parsed.debugSteps;
          }
        } catch { /* ignore */ }
        return { success: false, message: errMsg, error: errMsg, data: { debugSteps } };
      }
      if (!data) return { success: false, message: "لا يوجد رد من الخادم", error: "no_data" };
      if (!data.success) {
        return { success: false, message: data.error || data.message || "فشلت العملية", error: data.error, data };
      }
      return { success: true, message: data.message || "تم الشحن بنجاح", data };
    } catch (e: any) {
      return { success: false, message: e.message || "حدث خطأ غير متوقع", error: e.message };
    }
  }

  // ─── رصيد المحفظة ───────────────────────────────────────────────────
  static async getWalletBalance(payload: {
    pin: string;
    seamless_token: string | null;
    msisdn: string | null;
  }): Promise<{ success: boolean; balance?: string; msisdn?: string; queried_at?: string; message: string; data?: any }> {
    try {
      const { data, error } = await supabase.functions.invoke('vcc-wallet-balance', {
        body: {
          action: 'balance',
          pin: payload.pin,
          seamless_token: payload.seamless_token,
          payload_msisdn: payload.msisdn,
        }
      });
      if (error) {
        let errMsg = error.message || "حدث خطأ أثناء الاتصال بالسيرفر";
        try {
          const ctx = (error as any)?.context;
          const rawTxt = typeof ctx?.text === 'function' ? await ctx.text() : null;
          if (rawTxt) { const p = JSON.parse(rawTxt); if (p?.error) errMsg = p.error; }
        } catch { /* ignore */ }
        return { success: false, message: errMsg };
      }
      if (!data?.success) return { success: false, message: data?.error || "تعذر الحصول على الرصيد", data };
      return { success: true, message: "تم الحصول على الرصيد بنجاح", balance: data.balance, msisdn: data.msisdn, queried_at: data.queried_at, data };
    } catch (e: any) {
      return { success: false, message: e.message || "حدث خطأ غير متوقع" };
    }
  }

  // ─── سجل العمليات ────────────────────────────────────────────────────
  static async getTransactionHistory(payload: {
    pin: string;
    seamless_token: string | null;
    msisdn: string | null;
    start_date: string; // ISO string
    end_date: string;   // ISO string
  }): Promise<{ success: boolean; transactions?: any[]; total?: number; period?: any; pagination_error?: boolean; message: string; data?: any }> {
    try {
      const { data, error } = await supabase.functions.invoke('vcc-wallet-balance', {
        body: {
          action: 'transactions',
          pin: payload.pin,
          seamless_token: payload.seamless_token,
          payload_msisdn: payload.msisdn,
          start_date: payload.start_date,
          end_date: payload.end_date,
        }
      });
      if (error) {
        let errMsg = error.message || "حدث خطأ أثناء الاتصال بالسيرفر";
        try {
          const ctx = (error as any)?.context;
          const rawTxt = typeof ctx?.text === 'function' ? await ctx.text() : null;
          if (rawTxt) { const p = JSON.parse(rawTxt); if (p?.error) errMsg = p.error; }
        } catch { /* ignore */ }
        return { success: false, message: errMsg };
      }
      if (!data?.success) return { success: false, message: data?.error || "تعذر جلب سجل العمليات", data };
      return {
        success: true,
        message: data.pagination_error ? "تم تحميل جزء من السجل (خطأ في التصفح)" : "تم تحميل سجل العمليات",
        transactions: data.transactions || [],
        total: data.total || 0,
        period: data.period,
        pagination_error: data.pagination_error,
        data,
      };
    } catch (e: any) {
      return { success: false, message: e.message || "حدث خطأ غير متوقع" };
    }
  }

  static async getTransferHistory(userId?: string): Promise<MoneyTransfer[]> {
    let query = supabase
      .from('vcc_transfers')
      .select('*, profiles(full_name, username, phone)')
      .order('created_at', { ascending: false });
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (error || !data) return [];
    return data as MoneyTransfer[];
  }

  static async getRechargeHistory(userId?: string): Promise<RechargeBalance[]> {
    let query = supabase
      .from('vcc_recharges')
      .select('*, profiles(full_name, username, phone)')
      .order('created_at', { ascending: false });
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (error || !data) return [];
    return data as RechargeBalance[];
  }

  static async getAdminStats(): Promise<VodafoneCashCenterStats> {
    const [{ data: transfers }, { data: recharges }] = await Promise.all([
      supabase.from('vcc_transfers').select('amount, status'),
      supabase.from('vcc_recharges').select('amount, status'),
    ]);

    const allOps = [...(transfers || []), ...(recharges || [])];
    const successful_operations = allOps.filter(r => r.status === 'completed').length;
    const failed_operations     = allOps.filter(r => r.status === 'failed').length;

    const total_amount_transferred = (transfers || [])
      .filter(r => r.status === 'completed')
      .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

    const total_amount_recharged = (recharges || [])
      .filter(r => r.status === 'completed')
      .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

    return {
      total_transfers:          (transfers || []).length,
      total_recharges:          (recharges || []).length,
      successful_operations,
      failed_operations,
      total_amount_transferred,
      total_amount_recharged,
    };
  }
}
