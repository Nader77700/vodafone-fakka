// ── Phase 9: Merchant Charge Validation Hook ────────────────────────────────
// ADDITIVE — لا يعدّل أي نظام موجود
// يتحقق من أهلية المستخدم لتنفيذ عملية شحن قبل السماح بالمتابعة
// يستمع لأي تغيير في حالة التاجر / الاشتراك / العضوية عبر Realtime

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import { validateMerchantChargeEligibility } from '@/lib/api';
import type { MerchantChargeEligibility } from '@/lib/api';

export interface MerchantChargeValidationState {
  loading:     boolean;
  eligible:    boolean;
  eligibility: MerchantChargeEligibility | null;
  errorLabel:  string | null;   // رسالة مقروءة للمستخدم
  refresh:     () => void;
}

// ترجمة أسباب الرفض إلى رسائل عربية واضحة
function translateReason(reason: string, stage: string): string {
  const map: Record<string, string> = {
    user_not_found:        'لم يتم العثور على حسابك',
    user_inactive:         'حسابك موقوف حالياً',
    not_merchant_client:   'لست مرتبطاً بأي تاجر',
    merchant_not_found:    'التاجر المرتبط بك غير موجود',
    merchant_inactive:     'التاجر موقوف حالياً — لا يمكن تنفيذ عمليات',
    merchant_suspended:    'التاجر موقوف مؤقتاً',
    merchant_disabled:     'التاجر معطّل',
    member_not_found:      'عضويتك لدى التاجر غير مسجّلة',
    member_suspended:      'تم إيقاف عضويتك مؤقتاً',
    member_blocked:        'تم حظر عضويتك',
    member_disabled:       'تم تعطيل عضويتك',
<<<<<<< HEAD
    member_expired:        'انتهى اشتراكك. يرجى التواصل مع التاجر الخاص بك لتجديد الاشتراك.',
    no_active_subscription:'حسابك غير مفعل حالياً. يرجى التواصل مع التاجر الخاص بك لتفعيل الاشتراك.',
=======
    member_expired:        'انتهت صلاحية عضويتك',
    no_active_subscription:'لا يوجد اشتراك نشط — جدّد اشتراكك للمتابعة',
>>>>>>> origin/main
    ops_exhausted:         'نفدت عمليات اشتراكك — جدّد اشتراكك للمتابعة',
    rpc_error:             'خطأ في التحقق — أعد المحاولة',
  };
  return map[reason] ?? `خطأ في ${stage}: ${reason}`;
}

export function useMerchantChargeValidation(): MerchantChargeValidationState {
  const { user, profile } = useAuth();
  const [loading,     setLoading]     = useState(true);
  const [eligibility, setEligibility] = useState<MerchantChargeEligibility | null>(null);
  const mountedRef = useRef(true);

  const fetch = useCallback(async () => {
    if (!user?.id || !profile?.merchant_id) {
      setEligibility(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await validateMerchantChargeEligibility(user.id);
    if (!mountedRef.current) return;
    setEligibility(result);
    setLoading(false);
  }, [user?.id, profile?.merchant_id]);

  useEffect(() => {
    mountedRef.current = true;
    void fetch();
    return () => { mountedRef.current = false; };
  }, [fetch]);

  // Realtime: استمع لتغييرات تؤثر على الأهلية
  useEffect(() => {
    if (!user?.id || !profile?.merchant_id) return;

    const channel = supabase
      .channel('merchant-charge-validation')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'merchants',
        filter: `id=eq.${profile.merchant_id}`,
      }, () => void fetch())
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'profiles',
        filter: `id=eq.${user.id}`,
      }, () => void fetch())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'subscriptions',
        filter: `user_id=eq.${user.id}`,
      }, () => void fetch())
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'merchant_members',
        filter: `user_id=eq.${user.id}`,
      }, () => void fetch())
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [user?.id, profile?.merchant_id, fetch]);

  const eligible   = eligibility?.eligible ?? false;
  const errorLabel = (!loading && eligibility && !eligible)
    ? translateReason(eligibility.reason ?? '', eligibility.stage ?? '')
    : null;

  return { loading, eligible, eligibility, errorLabel, refresh: fetch };
}
