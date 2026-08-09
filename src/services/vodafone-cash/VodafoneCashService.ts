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

  static async getTransferHistory(userId: string): Promise<MoneyTransfer[]> {
    return [];
  }

  static async getRechargeHistory(userId: string): Promise<RechargeBalance[]> {
    return [];
  }

  static async getAdminStats(): Promise<VodafoneCashCenterStats> {
    return {
      total_transfers: 0,
      total_recharges: 0,
      successful_operations: 0,
      failed_operations: 0,
      total_amount_transferred: 0,
      total_amount_recharged: 0,
    };
  }
}
