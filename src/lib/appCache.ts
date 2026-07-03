/**
 * AppCache — نظام التخزين المحلي Offline-First (v2)
 * ─────────────────────────────────────────────────
 * • Capacitor Preferences (native) + localStorage (web fallback)
 * • stale-while-revalidate: يعرض البيانات القديمة فوراً ويحدّث خلفياً
 * • Delta sync: يقارن updated_at قبل إعادة الجلب
 * • Image preloader: يتحقق من وجود الصورة في Browser Cache
 */
import { Preferences } from '@capacitor/preferences';

// ─── مفاتيح التخزين ──────────────────────────────────────────────────────
export const CACHE_KEYS = {
  APP_SETTINGS:         'cache_app_settings_v2',
  PRODUCT_CONFIG:       'cache_product_config_v2',
  USER_PROFILE:         'cache_user_profile_v2',
  HERO_ASSETS:          'cache_hero_assets_v2',
  SUBSCRIPTION:         'cache_subscription_v2',
  OPERATIONS_P1:        'cache_operations_p1_v2',
  SUBSCRIPTION_HISTORY: 'cache_sub_history_v2',
  ACTIVITY_TIMELINE:    'cache_activity_v2',
  NOTIFICATIONS_COUNT:  'cache_notif_count_v2',
} as const;

// مدة الصلاحية بالمللي ثانية
const CACHE_TTL: Record<string, number> = {
  [CACHE_KEYS.APP_SETTINGS]:         60 * 60 * 1000,  // 1 ساعة — بيانات شبه ثابتة
  [CACHE_KEYS.PRODUCT_CONFIG]:       30 * 60 * 1000,  // 30 دقيقة
  [CACHE_KEYS.USER_PROFILE]:         10 * 60 * 1000,  // 10 دقائق
  [CACHE_KEYS.HERO_ASSETS]:          60 * 60 * 1000,  // 1 ساعة — صور ثابتة
  [CACHE_KEYS.SUBSCRIPTION]:          3 * 60 * 1000,  // 3 دقائق — حرجة
  [CACHE_KEYS.OPERATIONS_P1]:         5 * 60 * 1000,  // 5 دقائق
  [CACHE_KEYS.SUBSCRIPTION_HISTORY]: 15 * 60 * 1000,  // 15 دقيقة
  [CACHE_KEYS.ACTIVITY_TIMELINE]:    10 * 60 * 1000,  // 10 دقائق
  [CACHE_KEYS.NOTIFICATIONS_COUNT]:   1 * 60 * 1000,  // 1 دقيقة — يتغير كثيراً
};

interface CacheEntry<T> {
  data: T;
  ts: number;       // وقت الحفظ
  etag?: string;    // للـ delta sync (updated_at أو hash)
}

// ─── Storage Abstraction ──────────────────────────────────────────────────
async function storageGet(key: string): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key });
    return value;
  } catch {
    try { return localStorage.getItem(key); } catch { return null; }
  }
}

async function storageSet(key: string, value: string): Promise<void> {
  try {
    await Preferences.set({ key, value });
  } catch {
    try { localStorage.setItem(key, value); } catch { /* تجاهل */ }
  }
}

async function storageRemove(key: string): Promise<void> {
  try { await Preferences.remove({ key }); } catch { /* ignore */ }
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

// ─── Core API ─────────────────────────────────────────────────────────────

/** جلب من الكاش — يعيد null إذا انتهت الصلاحية */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await storageGet(key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    const ttl = CACHE_TTL[key] ?? 10 * 60 * 1000;
    if (Date.now() - entry.ts > ttl) {
      // منتهية الصلاحية — نحذف ونعيد null
      storageRemove(key).catch(() => {});
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

/** جلب من الكاش بغض النظر عن الصلاحية — لعرض Stale data */
export async function cacheGetStale<T>(key: string): Promise<T | null> {
  try {
    const raw = await storageGet(key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    return entry.data;
  } catch {
    return null;
  }
}

/** حفظ في الكاش */
export async function cacheSet<T>(key: string, data: T, etag?: string): Promise<void> {
  try {
    const entry: CacheEntry<T> = { data, ts: Date.now(), etag };
    await storageSet(key, JSON.stringify(entry));
  } catch {
    /* تجاهل أخطاء الحفظ */
  }
}

/** قراءة الـ etag المخزّن (للـ delta sync) */
export async function cacheGetEtag(key: string): Promise<string | undefined> {
  try {
    const raw = await storageGet(key);
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as CacheEntry<unknown>;
    return entry.etag;
  } catch {
    return undefined;
  }
}

export async function cacheInvalidate(key: string): Promise<void> {
  await storageRemove(key);
}

export async function cacheInvalidateAll(): Promise<void> {
  await Promise.all(Object.values(CACHE_KEYS).map(k => storageRemove(k)));
}

/**
 * staleWhileRevalidate (الإصدار الأساسي)
 * ─────────────────────────────────────────
 * 1. يعيد البيانات القديمة من الكاش فوراً (إن وجدت)
 * 2. يجلب من المصدر في الخلفية ويستدعي onFresh
 * 3. إذا لم يوجد كاش → ينتظر المصدر
 */
export async function staleWhileRevalidate<T>(
  key: string,
  fetcher: () => Promise<T>,
  onFresh: (data: T) => void,
): Promise<T | null> {
  // حاول القراءة من الكاش (حتى لو منتهية الصلاحية → stale)
  const cached = await cacheGetStale<T>(key);

  if (cached !== null) {
    // عرض البيانات القديمة فوراً، ثم تحديث في الخلفية
    fetcher()
      .then(fresh => {
        cacheSet(key, fresh);
        onFresh(fresh);
      })
      .catch(() => { /* تجاهل أخطاء الخلفية — الكاش يبقى */ });
    return cached;
  }

  // لا يوجد كاش على الإطلاق — انتظر المصدر
  try {
    const fresh = await fetcher();
    await cacheSet(key, fresh);
    return fresh;
  } catch {
    return null;
  }
}

/**
 * staleWhileRevalidateWithEtag
 * ──────────────────────────────
 * مثل staleWhileRevalidate لكن يمرر etag للـ fetcher لتقليل البيانات المحمّلة.
 * المفيد لـ API calls التي تدعم If-None-Match أو last_updated comparison.
 * إذا أعاد الـ fetcher null → لا تغيير → الكاش يبقى.
 */
export async function staleWhileRevalidateWithEtag<T>(
  key: string,
  fetcher: (etag?: string) => Promise<T | null>,
  onFresh: (data: T) => void,
): Promise<T | null> {
  const cached = await cacheGetStale<T>(key);
  const etag   = await cacheGetEtag(key);

  if (cached !== null) {
    fetcher(etag)
      .then(fresh => {
        if (fresh !== null) {
          cacheSet(key, fresh);
          onFresh(fresh);
        }
        // null = لا تغيير → الكاش يبقى كما هو
      })
      .catch(() => {});
    return cached;
  }

  try {
    const fresh = await fetcher(undefined);
    if (fresh !== null) await cacheSet(key, fresh);
    return fresh;
  } catch {
    return null;
  }
}

/**
 * preloadImages — يُحمّل الصور مسبقاً في ذاكرة المتصفح
 * ───────────────────────────────────────────────────────
 * يستخدم fetch() مع mode='no-cors' لتخزين الصور في Browser HTTP Cache.
 * بعد التحميل الأول، الصور تُعرض فوراً من الكاش بدون شبكة.
 */
export function preloadImages(urls: string[]): void {
  if (typeof window === 'undefined' || !urls.length) return;
  // استخدام requestIdleCallback إذا كان متاحاً لتجنب التأثير على الأداء
  const run = () => {
    for (const url of urls) {
      if (!url || url.startsWith('blob:')) continue;
      // طريقة 1: new Image() — يستخدم ذاكرة المتصفح المعتادة
      const img = new Image();
      img.src = url;
    }
  };
  if ('requestIdleCallback' in window) {
    (window as Window & { requestIdleCallback?: (cb: () => void) => void })
      .requestIdleCallback?.(run);
  } else {
    setTimeout(run, 200);
  }
}
