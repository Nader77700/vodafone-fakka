// سياق Merchant Client Mode — Phase 8
// يكتشف إذا كان المستخدم مرتبطاً بتاجر ويوفر بيانات الوضع والاشتراك
// Additive Only — لا يعدّل أي سياق قائم
import React, {
  createContext, useContext, useEffect, useState, useCallback, useRef,
} from 'react';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MCMerchant {
  id:          string;
  name:        string;
  status:      string;   // 'active' | 'suspended' | 'disabled' | 'blocked'
  brand_color: string | null;
  logo_url:    string | null;
  welcome_msg: string | null;
}

export interface MCMember {
  member_status: string;
  joined_at:     string;
  last_op_at:    string | null;
}

export interface MCSubscription {
  id:              string;
  status:          string;
  sub_type:        'unlimited' | 'ops_limited' | 'time_limited' | 'both_limited' | 'active';
  ops_count:       number;
  ops_limit:       number | null;
  ops_remaining:   number | null;
  expires_at:      string | null;
  days_remaining:  number | null;
  hours_remaining: number | null;
  in_grace_period: boolean;
  activated_at:    string | null;
  code_type:       string | null;
  ops_success:     number;
  ops_failed:      number;
}

export interface MerchantClientData {
  merchant:     MCMerchant;
  member:       MCMember | null;
  subscription: MCSubscription | null;
}

interface MerchantClientContextValue {
  isMerchantClient: boolean;  // true = user is linked to a merchant
  isLoading:        boolean;
  data:             MerchantClientData | null;
  merchantSuspended: boolean; // merchant is not 'active'
  refresh:          () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────
const MerchantClientContext = createContext<MerchantClientContextValue>({
  isMerchantClient:  false,
  isLoading:         true,
  data:              null,
  merchantSuspended: false,
  refresh:           () => {},
});

export function useMerchantClient() {
  return useContext(MerchantClientContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function MerchantClientProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [data,      setData]      = useState<MerchantClientData | null>(null);

  // استخدم primitives فقط في deps لتجنب إعادة الإنشاء عند تغيّر مرجع الكائن
  const userId     = user?.id     ?? null;
  const merchantId = profile?.merchant_id ?? null;
  const isMerchantClient = !!(merchantId && profile?.role === 'user');

  // منع التحميل المتزامن
  const isFetchingRef = useRef(false);
  // حفظ أحدث قيم userId/merchantId بدون إعادة إنشاء load
  const userIdRef     = useRef(userId);
  const merchantIdRef = useRef(merchantId);
  const isMCRef       = useRef(isMerchantClient);
  useEffect(() => { userIdRef.current     = userId;         }, [userId]);
  useEffect(() => { merchantIdRef.current = merchantId;     }, [merchantId]);
  useEffect(() => { isMCRef.current       = isMerchantClient; }, [isMerchantClient]);

  const load = useCallback(async () => {
    const uid = userIdRef.current;
    const isMC = isMCRef.current;
    if (!uid || !isMC) {
      setData(null);
      setIsLoading(false);
      return;
    }
    // منع طلبات متزامنة
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoading(true);
    try {
      const { data: rpcData, error } = await supabase.rpc('get_merchant_client_data', {
        p_user_id: uid,
      });
      if (!error && rpcData?.success) {
        setData({
          merchant:     rpcData.merchant,
          member:       rpcData.member   ?? null,
          subscription: rpcData.subscription ?? null,
        });
      } else {
        setData(null);
      }
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
    }
  }, []); // deps فارغة — يستخدم refs لقراءة القيم الحديثة

  // تحميل أولي عند تغيّر userId أو isMerchantClient فعلياً
  useEffect(() => {
    void load();
  }, [userId, isMerchantClient, load]);

  // ─── Realtime Security ────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId || !merchantId) return;

    // debounce: تجنب طلبات متعددة عند تدفق الأحداث
    let debounceTimer: ReturnType<typeof setTimeout>;
    const debouncedLoad = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { void load(); }, 600);
    };

    const channel = supabase
      .channel(`mc_security_${userId}`)
      // تغيير حالة التاجر
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'merchants',
        filter: `id=eq.${merchantId}`,
      }, debouncedLoad)
      // تغيير ملف المستخدم (قد يُزال merchant_id)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'profiles',
        filter: `id=eq.${userId}`,
      }, debouncedLoad)
      // تغيير اشتراك عضو التاجر (الجدول الصحيح)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'merchant_member_subscriptions',
        filter: `user_id=eq.${userId}`,
      }, debouncedLoad)
      // تغيير حالة العضوية
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'merchant_members',
        filter: `user_id=eq.${userId}`,
      }, debouncedLoad)
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [userId, merchantId, load]);

  // حالة توقف التاجر
  const merchantSuspended = isMerchantClient && !!data &&
    !['active'].includes(data.merchant.status);

  return (
    <MerchantClientContext.Provider value={{
      isMerchantClient,
      isLoading,
      data,
      merchantSuspended,
      refresh: load,
    }}>
      {children}
    </MerchantClientContext.Provider>
  );
}
