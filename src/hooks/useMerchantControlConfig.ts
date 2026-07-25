// ── Phase 10: useMerchantControlConfig ──────────────────────────────────────
// Hook للعميل — يجلب ويستمع لإعدادات التحكم الخاصة بتاجره
// يُرسل Heartbeat كل 30 ثانية ويُعيد الإعدادات اللحظية

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import { getMerchantControlConfig, upsertMerchantHeartbeat } from '@/lib/api';
import type { MerchantControlConfig, HeartbeatResponse } from '@/lib/api';

export interface ControlConfigState {
  loading:     boolean;
  config:      MerchantControlConfig | null;
  /** kill switch active — يوقف النسخة كلياً */
  killSwitch:  boolean;
  /** maintenance mode — يمنع العمليات مع عرض البيانات */
  maintenance: boolean;
  /** force update required */
  forceUpdate: boolean;
  /** force logout pending */
  forceLogout: boolean;
  refresh:     () => void;
}

const HEARTBEAT_INTERVAL = 30_000; // 30 ثانية

export function useMerchantControlConfig(): ControlConfigState {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [config,  setConfig]  = useState<MerchantControlConfig | null>(null);
  const mountedRef  = useRef(true);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const merchantId = profile?.merchant_id ?? null;

  const fetch = useCallback(async () => {
    if (!merchantId) { setLoading(false); return; }
    const cfg = await getMerchantControlConfig(merchantId);
    if (mountedRef.current) { setConfig(cfg); setLoading(false); }
  }, [merchantId]);

  const sendHeartbeat = useCallback(async () => {
    if (!user?.id) return;
    const res: HeartbeatResponse | null = await upsertMerchantHeartbeat({
      userId:        user.id,
      configVersion: config?.config_version ?? 0,
      realtimeOk:    true,
    });
    // إذا تغيّر config_version في الـ heartbeat response → re-fetch
    if (res && mountedRef.current && res.config_version !== (config?.config_version ?? 0)) {
      void fetch();
    }
  }, [user?.id, config?.config_version, fetch]);

  useEffect(() => {
    mountedRef.current = true;
    void fetch();
    return () => { mountedRef.current = false; };
  }, [fetch]);

  // Realtime subscription على merchant_control_config
  useEffect(() => {
    if (!merchantId) return;

    const channel = supabase
      .channel(`control-config-${merchantId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'merchant_control_config',
        filter: `merchant_id=eq.${merchantId}`,
      }, (payload) => {
        if (!mountedRef.current) return;
        setConfig(prev => ({ ...prev!, ...(payload.new as Partial<MerchantControlConfig>) }));
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [merchantId]);

  // Heartbeat interval
  useEffect(() => {
    if (!user?.id || !merchantId) return;
    timerRef.current = setInterval(() => void sendHeartbeat(), HEARTBEAT_INTERVAL);
    // إرسال أول heartbeat فور mount
    void sendHeartbeat();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [user?.id, merchantId, sendHeartbeat]);

  return {
    loading,
    config,
    killSwitch:  config?.kill_switch    ?? false,
    maintenance: config?.maintenance_mode ?? false,
    forceUpdate: config?.force_update   ?? false,
    forceLogout: config?.force_logout   ?? false,
    refresh: fetch,
  };
}
