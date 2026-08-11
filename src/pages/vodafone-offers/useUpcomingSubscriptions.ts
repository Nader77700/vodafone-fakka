import { useState, useCallback } from 'react';
import {
  getUpcomingSubscriptions,
  getVodafoneChargeEnabled,
  cancelVodafoneSubscription,
  chargeVodafoneSubscription,
  type VodafoneSubscription,
  type ChargeBreakdown,
} from '@/lib/api';

interface SubscriptionsState {
  subscriptions: VodafoneSubscription[];
  loading: boolean;
  error: string | null;
  code: string | null;
  chargeEnabled: boolean;
}

export function useUpcomingSubscriptions() {
  const [state, setState] = useState<SubscriptionsState>({
    subscriptions: [],
    loading: false,
    error: null,
    code: null,
    chargeEnabled: false,
  });

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [chargingId, setChargingId] = useState<string | null>(null);
  const [chargeSuccess, setChargeSuccess] = useState<string | null>(null);
  const [chargeError, setChargeError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null, code: null }));
    setCancelSuccess(null);
    setCancelError(null);
    setChargeSuccess(null);
    setChargeError(null);
    const [result, enabled] = await Promise.all([
      getUpcomingSubscriptions(),
      getVodafoneChargeEnabled(),
    ]);
    setState({
      subscriptions: result.success ? (result.subscriptions ?? []) : [],
      loading: false,
      error: result.success ? null : (result.error ?? 'فشل جلب الاشتراكات'),
      code: result.success ? null : (result.code ?? null),
      chargeEnabled: enabled,
    });
  }, []);

  // PHASE 1: تجهيز Action Hook — لا تنفيذ فعلي إذا لم يكن هناك ربط
  async function cancel(sub: VodafoneSubscription) {
    if (!sub.id || !sub.enc_product_id) return;
    setCancellingId(sub.id);
    setCancelError(null);
    setCancelSuccess(null);
    try {
      const result = await cancelVodafoneSubscription(sub.id, sub.enc_product_id);
      if (!result.success) {
        setCancelError(result.error ?? 'فشل إلغاء الاشتراك');
        return;
      }
      setCancelSuccess('تم إلغاء الاشتراك بنجاح ✓');
      await load();
    } catch {
      setCancelError('فشل إلغاء الاشتراك');
    } finally {
      setCancellingId(null);
    }
  }

  async function charge(
    sub: VodafoneSubscription,
    breakdown: ChargeBreakdown,
    onDone?: () => void
  ) {
    if (!sub.id || !sub.enc_product_id || !sub.price) return;
    setChargingId(sub.id);
    setChargeError(null);
    setChargeSuccess(null);
    try {
      const result = await chargeVodafoneSubscription(
        sub.id,
        sub.enc_product_id,
        sub.description || sub.type || 'باقة',
        sub.price,
        crypto.randomUUID()
      );
      if (!result.success) {
        setChargeError(result.error ?? 'فشل في عملية الشحن');
        return;
      }
      setChargeSuccess(result.message ?? 'تم احتساب مبلغ الشحن بنجاح ✓');
      await load();
      onDone?.();
    } catch {
      setChargeError('فشل في عملية الشحن');
    } finally {
      setChargingId(null);
    }
  }

  return {
    ...state,
    cancellingId,
    cancelSuccess,
    cancelError,
    chargingId,
    chargeSuccess,
    chargeError,
    load,
    cancel,
    charge,
    clearCancelError: () => setCancelError(null),
    clearCancelSuccess: () => setCancelSuccess(null),
    clearChargeError: () => setChargeError(null),
    clearChargeSuccess: () => setChargeSuccess(null),
  };
}
