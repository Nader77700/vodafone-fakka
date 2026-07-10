// سياق التاجر — MerchantContext
// يوفر بيانات التاجر للمكونات المحمية بـ merchantOnly
// Phase 4: Realtime — لوحة التاجر تظهر/تختفي فوراً بدون Refresh
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getMerchant, getMerchantStats } from '@/lib/api';
import { supabase } from '@/db/supabase';
import type { Merchant, MerchantStats } from '@/types/types';

interface MerchantContextType {
  merchant: Merchant | null;
  stats: MerchantStats | null;
  loading: boolean;
  isMerchant: boolean;
  isAdmin: boolean;
  refresh: () => Promise<void>;
}

const MerchantContext = createContext<MerchantContextType>({
  merchant: null,
  stats: null,
  loading: true,
  isMerchant: false,
  isAdmin: false,
  refresh: async () => {},
});

export function MerchantProvider({ children }: { children: React.ReactNode }) {
  const { profile, refreshProfile } = useAuth();
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [stats, setStats]       = useState<MerchantStats | null>(null);
  const [loading, setLoading]   = useState(true);
  const channelRef              = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const isMerchant = profile?.role === 'merchant';
  const isAdmin    = profile?.role === 'admin' || profile?.role === 'super_admin';

  const load = useCallback(async () => {
    if (!profile?.merchant_id || !isMerchant) {
      setMerchant(null);
      setStats(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [m, s] = await Promise.all([
        getMerchant(profile.merchant_id),
        getMerchantStats(profile.merchant_id),
      ]);
      setMerchant(m);
      setStats(s);
    } finally {
      setLoading(false);
    }
  }, [profile?.merchant_id, isMerchant]);

  useEffect(() => { load(); }, [load]);

  // ── Phase 4: Realtime على profiles + merchants ────────────────────────────
  // عند تغيير role أو merchant_id في profiles → refreshProfile → يعيد تقييم isMerchant
  // عند تغيير merchants record → reload بيانات التاجر
  useEffect(() => {
    if (!profile?.id) return;

    // إلغاء الاشتراك القديم
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const ch = supabase
      .channel(`merchant-ctx-${profile.id}`)
      // مراقبة تغييرات profile الخاص بالمستخدم (role / merchant_id)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${profile.id}` },
        () => { refreshProfile?.(); },
      )
      // مراقبة تغييرات merchants (status / invite_enabled)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'merchants',
          ...(profile.merchant_id ? { filter: `id=eq.${profile.merchant_id}` } : {}),
        },
        () => { load(); },
      )
      .subscribe();

    channelRef.current = ch;

    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [profile?.id, profile?.merchant_id, load, refreshProfile]);

  return (
    <MerchantContext.Provider value={{ merchant, stats, loading, isMerchant, isAdmin, refresh: load }}>
      {children}
    </MerchantContext.Provider>
  );
}

export function useMerchant() {
  return useContext(MerchantContext);
}
