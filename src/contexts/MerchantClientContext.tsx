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
  id:             string;
  status:         string;
  ops_count:      number;
  ops_limit:      number | null;
  ops_remaining:  number | null;
  expires_at:     string | null;
  in_grace_period: boolean;
  activated_at:   string | null;
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
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // اكتشاف الوضع: المستخدم مرتبط بتاجر إذا merchant_id != null والدور = user
  const isMerchantClient = !!(
    profile?.merchant_id &&
    profile.role === 'user'
  );

  // تحميل بيانات وضع العميل
  const load = useCallback(async () => {
    if (!user || !isMerchantClient) {
      setData(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const { data: rpcData, error } = await supabase.rpc('get_merchant_client_data', {
      p_user_id: user.id,
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
    setIsLoading(false);
  }, [user, isMerchantClient]);

  useEffect(() => {
    load();
  }, [load]);

  // ─── Realtime Security ────────────────────────────────────────────────────
  // يراقب حالة التاجر وملف المستخدم لاكتشاف:
  // • التاجر أُوقف/علّق → merchantSuspended = true
  // • المستخدم فقد ارتباطه بالتاجر → يعيد تحميل البيانات (يخرج من الوضع)
  useEffect(() => {
    if (!user || !profile?.merchant_id) return;

    const merchantId = profile.merchant_id;

    realtimeRef.current = supabase
      .channel(`mc_security_${user.id}`)
      // ── تغيير حالة التاجر ──────────────────────────────────────────────────
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'merchants',
        filter: `id=eq.${merchantId}`,
      }, () => { load(); })
      // ── تغيير ملف المستخدم (merchant_id قد يُزال) ──────────────────────────
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'profiles',
        filter: `id=eq.${user.id}`,
      }, () => { load(); })
      // ── تغيير الاشتراك ──────────────────────────────────────────────────────
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'subscriptions',
        filter: `user_id=eq.${user.id}`,
      }, () => { load(); })
      .subscribe();

    return () => { realtimeRef.current?.unsubscribe(); };
  }, [user?.id, profile?.merchant_id, load]);

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
