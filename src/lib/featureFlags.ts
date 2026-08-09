/**
 * Feature Flags — PHASE 2 (Server-Driven)
 * يقرأ الـ flags من app_config (core_app_config) في Supabase.
 * fallback للقيم الافتراضية إذا فشل الاتصال.
 * التحكم الكامل من السيرفر دون الحاجة لتحديث التطبيق.
 */

import { supabase } from '@/lib/supabase';

export interface FeatureFlags {
  servicesHubEnabled: boolean;
  walletLinesServiceEnabled: boolean;
  /** حالة خدمة الخطوط: active | maintenance | coming_soon | disabled */
  walletLinesStatus: string;
  /** رسالة الصيانة — تظهر عند status=maintenance */
  walletLinesMaintenanceMsg: string;
  /** رسالة الحجب الجغرافي */
  walletLinesGeoBlockMsg: string;
  /** عدد خانات OTP */
  walletLinesOtpLength: number;
  /** تسجيل أخطاء الخطوط في لوحة الأدمن */
  walletLinesAdminLogsEnabled: boolean;
  /** وضع تشخيص تفصيلي */
  walletLinesDebugMode: boolean;
  isDevelopment: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  servicesHubEnabled: true,
  walletLinesServiceEnabled: true,
  walletLinesStatus: 'active',
  walletLinesMaintenanceMsg: '',
  walletLinesGeoBlockMsg: 'هذه الخدمة تعمل داخل مصر فقط. استخدم شبكة مصرية أو VPN مصري.',
  walletLinesOtpLength: 6,
  walletLinesAdminLogsEnabled: true,
  walletLinesDebugMode: false,
  isDevelopment: import.meta.env.DEV,
};

// Cache لمدة 5 دقائق لتقليل الطلبات
let _cachedFlags: FeatureFlags | null = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * يجلب الـ flags من السيرفر مع fallback للقيم الافتراضية.
 * مُخزَّن في الذاكرة لمدة 5 دقائق.
 */
export async function fetchFeatureFlags(): Promise<FeatureFlags> {
  const now = Date.now();
  if (_cachedFlags && now - _cacheTime < CACHE_TTL_MS) return _cachedFlags;

  try {
    const keys = [
      'wl_service_enabled', 'wl_service_status', 'wl_maintenance_message',
      'wl_require_egypt_vpn_msg', 'wl_otp_length',
      'wl_admin_logs_enabled', 'wl_debug_mode',
    ];
    const { data, error } = await supabase
      .from('app_config')
      .select('key, value')
      .in('key', keys);

    if (error || !data) return DEFAULT_FLAGS;

    const map: Record<string, string> = {};
    for (const row of data) map[row.key] = row.value;

    _cachedFlags = {
      servicesHubEnabled: true,
      walletLinesServiceEnabled: map['wl_service_enabled'] !== 'false',
      walletLinesStatus:          map['wl_service_status']        ?? DEFAULT_FLAGS.walletLinesStatus,
      walletLinesMaintenanceMsg:  map['wl_maintenance_message']    ?? '',
      walletLinesGeoBlockMsg:     map['wl_require_egypt_vpn_msg']  ?? DEFAULT_FLAGS.walletLinesGeoBlockMsg,
      walletLinesOtpLength:       parseInt(map['wl_otp_length'] ?? '6', 10),
      walletLinesAdminLogsEnabled:map['wl_admin_logs_enabled'] !== 'false',
      walletLinesDebugMode:       map['wl_debug_mode'] === 'true',
      isDevelopment:              import.meta.env.DEV,
    };
    _cacheTime = now;
    return _cachedFlags;
  } catch {
    return DEFAULT_FLAGS;
  }
}

/** مزامنة — يُرجع الـ cache أو الافتراضي فوراً */
export function getFeatureFlags(): FeatureFlags {
  return _cachedFlags ?? DEFAULT_FLAGS;
}

/** يُحدّث الـ cache يدوياً (مثلاً بعد تغيير الإعدادات من لوحة الأدمن) */
export function invalidateFlagsCache(): void {
  _cachedFlags = null;
  _cacheTime = 0;
}

export const FEATURE_FLAGS = getFeatureFlags();
