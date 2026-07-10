// ── Core Engine للإدارة الذكية ────────────────────────────────────────────────
// طبقة داخلية تنفذ الأوامر البسيطة وتترجمها إلى عمليات كاملة:
// - تحديث DB + Runtime Config + Cache + إشعار الأجهزة
// لا يحتاج الأدمن لمعرفة تفاصيلها

import { supabase } from '@/db/supabase';

// ── نتيجة موحّدة لكل أمر ────────────────────────────────────────────────────
export interface EngineResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

// ── مساعد: تحديث app_config بقيمة واحدة ─────────────────────────────────────
async function setConfig(key: string, value: string, value_type = 'boolean'): Promise<void> {
  await supabase.from('app_config').upsert(
    { key, value, value_type, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
}

// ── مساعد: تسجيل العملية في system_logs ──────────────────────────────────────
async function logEngine(action: string, message: string, meta?: Record<string, unknown>): Promise<void> {
  await supabase.from('system_logs').insert({
    level: 'info',
    action: `engine:${action}`,
    message,
    metadata: meta ?? {},
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. إيقاف / تشغيل كارت منتج
// ═══════════════════════════════════════════════════════════════════════════════
export type ProductKey = 'vodafone' | 'orange' | 'etisalat' | 'we' | 'esim' | 'recharge';

const PRODUCT_FLAG: Record<ProductKey, string> = {
  vodafone:  'ff_vodafone_enabled',
  orange:    'ff_orange_enabled',
  etisalat:  'ff_etisalat_enabled',
  we:        'ff_we_enabled',
  esim:      'ff_esim_enabled',
  recharge:  'ff_recharge_enabled',
};

export async function engineSetProduct(product: ProductKey, enabled: boolean): Promise<EngineResult> {
  const key = PRODUCT_FLAG[product];
  if (!key) return { success: false, message: `منتج غير معروف: ${product}` };
  try {
    await setConfig(key, String(enabled));
    await logEngine('set_product', `${product} → ${enabled ? 'تشغيل' : 'إيقاف'}`, { product, enabled });
    return {
      success: true,
      message: `تم ${enabled ? 'تشغيل' : 'إيقاف'} كارت ${product} على جميع الأجهزة`,
    };
  } catch (e) {
    return { success: false, message: `فشل: ${(e as Error).message}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. وضع الصيانة
// ═══════════════════════════════════════════════════════════════════════════════
export async function engineSetMaintenance(enabled: boolean, message?: string): Promise<EngineResult> {
  try {
    await Promise.all([
      setConfig('ff_maintenance_mode', String(enabled)),
      message ? setConfig('ui_maintenance_msg', message, 'string') : Promise.resolve(),
    ]);
    await logEngine('maintenance', `وضع الصيانة → ${enabled ? 'تفعيل' : 'إلغاء'}`, { enabled, message });
    return {
      success: true,
      message: enabled
        ? `تم تفعيل وضع الصيانة — جميع الأجهزة ستعرض الرسالة فور فتح التطبيق`
        : `تم إلغاء وضع الصيانة — التطبيق يعمل بشكل طبيعي`,
    };
  } catch (e) {
    return { success: false, message: `فشل: ${(e as Error).message}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. إجبار تحديث — تحديد الحد الأدنى للإصدار
// ═══════════════════════════════════════════════════════════════════════════════
export async function engineForceUpdate(minCode: number, message?: string): Promise<EngineResult> {
  try {
    await Promise.all([
      setConfig('version_min_supported', String(minCode), 'number'),
      message ? setConfig('version_force_update_msg', message, 'string') : Promise.resolve(),
    ]);
    await logEngine('force_update', `min_version → ${minCode}`, { minCode, message });
    return {
      success: true,
      message: `سيُجبر كل مستخدم على إصدار أقل من ${minCode} على التحديث فور فتح التطبيق`,
    };
  } catch (e) {
    return { success: false, message: `فشل: ${(e as Error).message}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. حجب إصدار بعينه
// ═══════════════════════════════════════════════════════════════════════════════
export async function engineBlockVersion(codes: number[]): Promise<EngineResult> {
  try {
    await setConfig('version_blocked_codes', JSON.stringify(codes), 'json');
    await logEngine('block_version', `حجب الإصدارات: ${codes.join(', ')}`, { codes });
    return {
      success: true,
      message: `تم حجب الإصدارات: ${codes.join(', ')} — ستُعرض رسالة التحديث الإجباري`,
    };
  } catch (e) {
    return { success: false, message: `فشل: ${(e as Error).message}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. الإعلانات العامة
// ═══════════════════════════════════════════════════════════════════════════════
export type AnnouncementType = 'info' | 'warning' | 'error' | 'success';

export async function engineSetAnnouncement(
  enabled: boolean,
  text?: string,
  type: AnnouncementType = 'info',
): Promise<EngineResult> {
  try {
    await Promise.all([
      setConfig('ui_announcement_enabled', String(enabled)),
      text   ? setConfig('ui_announcement_text', text, 'string') : Promise.resolve(),
      setConfig('ui_announcement_type', type, 'string'),
    ]);
    await logEngine('announcement', enabled ? `إعلان: ${text}` : 'إلغاء الإعلان', { enabled, text, type });
    return {
      success: true,
      message: enabled
        ? `تم نشر الإعلان على جميع الأجهزة`
        : `تم إخفاء الإعلان`,
    };
  } catch (e) {
    return { success: false, message: `فشل: ${(e as Error).message}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. إيقاف ميزة كاملة
// ═══════════════════════════════════════════════════════════════════════════════
export type FeatureKey =
  | 'favorites' | 'statistics' | 'operations' | 'notifications';

const FEATURE_FLAG: Record<FeatureKey, string> = {
  favorites:     'ff_favorites_enabled',
  statistics:    'ff_statistics_enabled',
  operations:    'ff_operations_enabled',
  notifications: 'ff_notifications_enabled',
};

export async function engineSetFeature(feature: FeatureKey, enabled: boolean): Promise<EngineResult> {
  const key = FEATURE_FLAG[feature];
  if (!key) return { success: false, message: `ميزة غير معروفة: ${feature}` };
  try {
    await setConfig(key, String(enabled));
    await logEngine('set_feature', `${feature} → ${enabled ? 'تشغيل' : 'إيقاف'}`, { feature, enabled });
    return {
      success: true,
      message: `تم ${enabled ? 'تشغيل' : 'إيقاف'} ميزة ${feature} على جميع الأجهزة المدعومة`,
    };
  } catch (e) {
    return { success: false, message: `فشل: ${(e as Error).message}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. قراءة حالة النظام الحالية
// ═══════════════════════════════════════════════════════════════════════════════
export interface SystemStatus {
  maintenance: boolean;
  products: Record<ProductKey, boolean>;
  features: Record<FeatureKey, boolean>;
  minVersion: number;
  blockedCodes: number[];
  announcement: { enabled: boolean; text: string; type: string };
}

export async function engineGetStatus(): Promise<SystemStatus> {
  const { data } = await supabase.from('app_config').select('key,value,value_type');
  const rows = (Array.isArray(data) ? data : []) as { key: string; value: string; value_type: string }[];
  const get = (k: string, fallback: string) => rows.find(r => r.key === k)?.value ?? fallback;
  const bool = (k: string, def = true) => get(k, String(def)) === 'true';

  return {
    maintenance: bool('ff_maintenance_mode', false),
    products: {
      vodafone:  bool('ff_vodafone_enabled'),
      orange:    bool('ff_orange_enabled'),
      etisalat:  bool('ff_etisalat_enabled'),
      we:        bool('ff_we_enabled'),
      esim:      bool('ff_esim_enabled'),
      recharge:  bool('ff_recharge_enabled'),
    },
    features: {
      favorites:     bool('ff_favorites_enabled'),
      statistics:    bool('ff_statistics_enabled'),
      operations:    bool('ff_operations_enabled'),
      notifications: bool('ff_notifications_enabled'),
    },
    minVersion: Number(get('version_min_supported', '94')),
    blockedCodes: (() => { try { return JSON.parse(get('version_blocked_codes', '[]')); } catch { return []; } })(),
    announcement: {
      enabled: bool('ui_announcement_enabled', false),
      text:    get('ui_announcement_text', ''),
      type:    get('ui_announcement_type', 'info'),
    },
  };
}
