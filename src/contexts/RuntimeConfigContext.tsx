// RuntimeConfigContext — مصدر الحقيقة الوحيد للإعدادات الديناميكية
// يُلقَّم في App.tsx ويعمل مع جميع إصدارات APK
// polling كل 5 دقائق — fallback على آخر قيمة محلية
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/db/supabase';

// ── أنواع الإعدادات ──────────────────────────────────────────────────────────
export interface FeatureFlags {
  ff_recharge_enabled:       boolean;
  ff_esim_enabled:           boolean;
  ff_vodafone_enabled:       boolean;
  ff_orange_enabled:         boolean;
  ff_etisalat_enabled:       boolean;
  ff_we_enabled:             boolean;
  ff_favorites_enabled:      boolean;
  ff_statistics_enabled:     boolean;
  ff_operations_enabled:     boolean;
  ff_notifications_enabled:  boolean;
  ff_maintenance_mode:       boolean;
}

export interface VersionConfig {
  version_min_supported:   number;
  version_latest_code:     number;
  version_latest_name:     string;
  version_force_update_msg: string;
  version_blocked_codes:   number[];
  version_apk_url:         string;
}

export interface SecurityConfig {
  sec_disabled_endpoints: string[];
  sec_disabled_products:  string[];
  sec_max_daily_ops:       number;
  sec_require_active_sub:  boolean;
}

export interface BusinessConfig {
  biz_default_profit_margin: number;
  biz_max_free_ops:          number;
  biz_trial_days:            number;
}

export interface UIConfig {
  ui_maintenance_msg:       string;
  ui_announcement_enabled:  boolean;
  ui_announcement_text:     string;
  ui_announcement_type:     'info' | 'warning' | 'error' | 'success';
  ui_support_phone:         string;
  ui_support_whatsapp:      string;
}

export interface RuntimeConfig {
  feature_flags: FeatureFlags;
  version:       VersionConfig;
  security:      SecurityConfig;
  business:      BusinessConfig;
  ui:            UIConfig;
}

// القيم الافتراضية — fallback كامل لو الشبكة فشلت
const DEFAULT_CONFIG: RuntimeConfig = {
  feature_flags: {
    ff_recharge_enabled:       true,
    ff_esim_enabled:           true,
    ff_vodafone_enabled:       true,
    ff_orange_enabled:         true,
    ff_etisalat_enabled:       true,
    ff_we_enabled:             true,
    ff_favorites_enabled:      true,
    ff_statistics_enabled:     true,
    ff_operations_enabled:     true,
    ff_notifications_enabled:  true,
    ff_maintenance_mode:       false,
  },
  version: {
    version_min_supported:    94,
    version_latest_code:      98,
    version_latest_name:      '3.0.45',
    version_force_update_msg: 'يتوفر تحديث مهم. يرجى تحديث التطبيق للاستمرار.',
    version_blocked_codes:    [],
    version_apk_url:          '',
  },
  security: {
    sec_disabled_endpoints: [],
    sec_disabled_products:  [],
    sec_max_daily_ops:       100,
    sec_require_active_sub:  true,
  },
  business: {
    biz_default_profit_margin: 5,
    biz_max_free_ops:          3,
    biz_trial_days:            3,
  },
  ui: {
    ui_maintenance_msg:      'التطبيق تحت الصيانة. نعود قريباً 🔧',
    ui_announcement_enabled: false,
    ui_announcement_text:    '',
    ui_announcement_type:    'info',
    ui_support_phone:        '',
    ui_support_whatsapp:     '',
  },
};

const CACHE_KEY  = 'vf_runtime_config_v1';
const POLL_MS    = 5 * 60 * 1000; // 5 دقائق

// ── Context ──────────────────────────────────────────────────────────────────
interface RuntimeConfigContextValue {
  config:     RuntimeConfig;
  isLoading:  boolean;
  lastFetched: string | null;
  refresh:    () => Promise<void>;
}

const RuntimeConfigContext = createContext<RuntimeConfigContextValue>({
  config:      DEFAULT_CONFIG,
  isLoading:   true,
  lastFetched: null,
  refresh:     async () => {},
});

// ── Provider ─────────────────────────────────────────────────────────────────
export function RuntimeConfigProvider({ children }: { children: React.ReactNode }) {
  const [config,      setConfig]      = useState<RuntimeConfig>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return { ...DEFAULT_CONFIG, ...JSON.parse(cached) } as RuntimeConfig;
    } catch { /* ignore */ }
    return DEFAULT_CONFIG;
  });
  const [isLoading,   setIsLoading]   = useState(true);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const etagRef = useRef<string>('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const parseValue = (value: string, type: string): unknown => {
    try {
      switch (type) {
        case 'boolean': return value === 'true';
        case 'number':  return Number(value);
        case 'json':    return JSON.parse(value);
        default:        return value;
      }
    } catch { return value; }
  };

  const fetchConfig = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_app_config_public');
      if (error) throw error;

      const built: Record<string, Record<string, unknown>> = {
        feature_flags: {},
        version: {},
        security: {},
        business: {},
        ui: {},
        general: {},
      };

      for (const row of (data ?? []) as { key: string; value: string; value_type: string; category: string }[]) {
        const cat = row.category;
        if (!built[cat]) built[cat] = {};
        built[cat][row.key] = parseValue(row.value, row.value_type);
      }

      const merged: RuntimeConfig = {
        feature_flags: { ...DEFAULT_CONFIG.feature_flags, ...(built.feature_flags as Partial<FeatureFlags>) },
        version:       { ...DEFAULT_CONFIG.version,       ...(built.version       as Partial<VersionConfig>) },
        security:      { ...DEFAULT_CONFIG.security,      ...(built.security      as Partial<SecurityConfig>) },
        business:      { ...DEFAULT_CONFIG.business,      ...(built.business      as Partial<BusinessConfig>) },
        ui:            { ...DEFAULT_CONFIG.ui,            ...(built.ui            as Partial<UIConfig>) },
      };

      setConfig(merged);
      setLastFetched(new Date().toISOString());
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(merged)); } catch { /* ignore */ }
    } catch (e) {
      console.warn('[RuntimeConfig] fetch failed — using cached/default:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    timerRef.current = setInterval(fetchConfig, POLL_MS);

    // تفعيل Realtime لتحديث الإعدادات (مثل وضع الصيانة) فوراً بدون انتظار 5 دقائق
    const channel = supabase.channel('public:app_config')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_config' }, () => {
        console.log('[RuntimeConfig] Realtime update detected, fetching new config...');
        fetchConfig();
      })
      .subscribe();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchConfig]);

  const contextValue = React.useMemo(() => ({
    config, isLoading, lastFetched, refresh: fetchConfig
  }), [config, isLoading, lastFetched, fetchConfig]);

  return (
    <RuntimeConfigContext.Provider value={contextValue}>
      {children}
    </RuntimeConfigContext.Provider>
  );
}

// ── Hooks ─────────────────────────────────────────────────────────────────────
export function useRuntimeConfig()   { return useContext(RuntimeConfigContext); }
export function useFeatureFlags()    { return useContext(RuntimeConfigContext).config.feature_flags; }
export function useVersionConfig()   { return useContext(RuntimeConfigContext).config.version; }
export function useSecurityConfig()  { return useContext(RuntimeConfigContext).config.security; }
export function useBusinessConfig()  { return useContext(RuntimeConfigContext).config.business; }
export function useUIConfig()        { return useContext(RuntimeConfigContext).config.ui; }

/** هل هذا الـ endpoint معطَّل من السيرفر؟ */
export function useIsEndpointDisabled(endpoint: string): boolean {
  const { sec_disabled_endpoints } = useSecurityConfig();
  return sec_disabled_endpoints.includes(endpoint);
}

/** هل هذا المنتج معطَّل من السيرفر؟ */
export function useIsProductDisabled(productId: string): boolean {
  const { sec_disabled_products } = useSecurityConfig();
  return sec_disabled_products.includes(productId);
}
