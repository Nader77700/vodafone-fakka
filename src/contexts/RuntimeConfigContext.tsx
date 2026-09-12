// RuntimeConfigContext — مصدر الحقيقة الوحيد للإعدادات الديناميكية
// يُلقَّم في App.tsx ويعمل مع جميع إصدارات APK
// polling كل 5 دقائق — fallback على آخر قيمة محلية
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/db/supabase';

// ── أنواع الإعدادات ──────────────────────────────────────────────────────────
export interface FeatureFlags {
  ff_recharge_enabled:         boolean;
  ff_esim_enabled:             boolean;
  ff_vodafone_enabled:         boolean;
  ff_orange_enabled:           boolean;
  ff_etisalat_enabled:         boolean;
  ff_we_enabled:               boolean;
  ff_favorites_enabled:        boolean;
  ff_statistics_enabled:       boolean;
  ff_operations_enabled:       boolean;
  ff_notifications_enabled:    boolean;
  ff_maintenance_mode:         boolean;
  ff_card_feedback_enabled:    boolean;
  ff_allow_browse_no_sub:      boolean;
  ff_preview_mode_enabled:     boolean;
}

export interface VersionConfig {
  version_min_supported:    number;
  version_latest_code:      number;
  version_latest_name:      string;
  version_force_update_msg: string;
  version_blocked_codes:    number[];
  version_apk_url:          string;
  version_force_update:     boolean; // تفعيل مباشر من لوحة التحكم
}

// ── HotFix Patch Type ────────────────────────────────────────────────────────
export interface HotfixPatch {
  id:         string;
  type:       'disable_function' | 'show_banner' | 'force_message' | 'redirect_function';
  target:     string;
  message?:   string;
  enabled:    boolean;
  created_at: string;
}

export interface SecurityConfig {
  sec_disabled_endpoints:      string[];
  sec_disabled_products:       string[];
  sec_max_daily_ops:           number;
  sec_require_active_sub:      boolean;
  sec_seamless_url?:           string;
  sec_seamless_client_id?:     string;
  // ── HotFix Kill Switches ─────────────────────────────────────────
  hotfix_disable_all_recharge:   boolean;
  hotfix_disable_line_info:      boolean;
  hotfix_disable_money_transfer: boolean;
  hotfix_patches:                HotfixPatch[];
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
  // ── HotFix Messages ──────────────────────────────────────────────
  hotfix_emergency_banner:               boolean;
  hotfix_emergency_message:              string;
  hotfix_emergency_type:                 'info' | 'warning' | 'error' | 'success';
  hotfix_disable_recharge_message:       string;
  hotfix_disable_line_info_message:      string;
  hotfix_disable_money_transfer_message: string;
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
    ff_card_feedback_enabled:  true,
    ff_allow_browse_no_sub:    false,
    ff_preview_mode_enabled:   false,
  },
  version: {
    version_min_supported:    94,
    version_latest_code:      98,
    version_latest_name:      '3.0.45',
    version_force_update_msg: 'يتوفر تحديث مهم. يرجى تحديث التطبيق للاستمرار.',
    version_blocked_codes:    [],
    version_apk_url:          '',
    version_force_update:     false,
  },
  security: {
    sec_disabled_endpoints:      [],
    sec_disabled_products:       [],
    sec_max_daily_ops:           100,
    sec_require_active_sub:      true,
    hotfix_disable_all_recharge:   false,
    hotfix_disable_line_info:      false,
    hotfix_disable_money_transfer: false,
    hotfix_patches:                [],
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
    hotfix_emergency_banner:               false,
    hotfix_emergency_message:              '',
    hotfix_emergency_type:                 'warning',
    hotfix_disable_recharge_message:       'الشحن متوقف مؤقتاً لأعمال الصيانة. نعود قريباً 🔧',
    hotfix_disable_line_info_message:      'خدمة معلومات الخط متوقفة مؤقتاً. نعود قريباً.',
    hotfix_disable_money_transfer_message: 'تحويل الأموال متوقف مؤقتاً. نعود قريباً.',
  },
};

const CACHE_KEY = 'vf_runtime_config_v1';
const POLL_MS   = 5 * 60 * 1000; // 5 دقائق

// ── Context ──────────────────────────────────────────────────────────────────
interface RuntimeConfigContextValue {
  config:      RuntimeConfig;
  isLoading:   boolean;
  lastFetched: string | null;
  refresh:     () => Promise<void>;
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
  const etagRef  = useRef<string>('');
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
        version:       {},
        security:      {},
        business:      {},
        ui:            {},
      };

      for (const row of (data ?? []) as { key: string; value: string; value_type: string }[]) {
        const k = row.key;
        let cat = 'general';
        if      (k.startsWith('ff_'))       cat = 'feature_flags';
        else if (k.startsWith('version_'))  cat = 'version';
        else if (k.startsWith('sec_'))      cat = 'security';
        else if (k.startsWith('biz_'))      cat = 'business';
        else if (k.startsWith('ui_'))       cat = 'ui';
        else if (k === 'hotfix_disable_all_recharge' ||
                 k === 'hotfix_disable_line_info'    ||
                 k === 'hotfix_disable_money_transfer' ||
                 k === 'hotfix_patches')              cat = 'security';
        else if (k.startsWith('hotfix_'))             cat = 'ui';

        if (!built[cat]) built[cat] = {};
        built[cat][k] = parseValue(row.value, row.value_type);
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
      // نحذف الـ cache القديم أولاً لضمان عدم بقاء قيم version_force_update=false القديمة
      try {
        localStorage.removeItem(CACHE_KEY);
        localStorage.setItem(CACHE_KEY, JSON.stringify(merged));
      } catch { /* ignore */ }
    } catch (e) {
      console.warn('[RuntimeConfig] fetch failed — using cached/default:', e);
      // عند فشل الشبكة: نُبقي آخر قيمة (cache) كما هي — لا نُطفئ أي إعداد قسراً
      // الأدمن فعَّل الصيانة أو الحظر عن قصد — شبكة ضعيفة لا يجب أن تُلغيه
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    timerRef.current = setInterval(fetchConfig, POLL_MS);

    // Realtime — تحديث فوري عند تغيير أي إعداد (مثل hotfix أو maintenance)
    // ملاحظة: app_config هو VIEW — Realtime لا يعمل عليه، يجب الاستماع على الجدول الأصلي core_app_config
    const channelName = `app_config_changes_${Math.random().toString(36).substring(2)}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'core_app_config' }, () => {
        console.log('[RuntimeConfig] Realtime update — fetching new config...');
        fetchConfig();
      })
      .subscribe();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchConfig]);

  const contextValue = React.useMemo(() => ({
    config, isLoading, lastFetched, refresh: fetchConfig,
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

/** هل الشحن مُعطَّل بـ HotFix؟ */
export function useHotfixRechargeDisabled(): { disabled: boolean; message: string } {
  const sec = useSecurityConfig();
  const ui  = useUIConfig();
  return {
    disabled: sec.hotfix_disable_all_recharge,
    message:  ui.hotfix_disable_recharge_message,
  };
}

/** هل معلومات الخط مُعطَّلة بـ HotFix؟ */
export function useHotfixLineInfoDisabled(): { disabled: boolean; message: string } {
  const sec = useSecurityConfig();
  const ui  = useUIConfig();
  return {
    disabled: sec.hotfix_disable_line_info,
    message:  ui.hotfix_disable_line_info_message,
  };
}

/** هل تحويل الأموال مُعطَّل بـ HotFix؟ */
export function useHotfixMoneyTransferDisabled(): { disabled: boolean; message: string } {
  const sec = useSecurityConfig();
  const ui  = useUIConfig();
  return {
    disabled: sec.hotfix_disable_money_transfer,
    message:  ui.hotfix_disable_money_transfer_message,
  };
}

/** بانر الطوارئ العام */
export function useHotfixEmergencyBanner(): { active: boolean; message: string; type: UIConfig['hotfix_emergency_type'] } {
  const ui = useUIConfig();
  return {
    active:  ui.hotfix_emergency_banner,
    message: ui.hotfix_emergency_message,
    type:    ui.hotfix_emergency_type,
  };
}
