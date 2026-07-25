// ── Subscription Validation Engine ─────────────────────────────────────────
// محرك التحقق من صحة الاشتراك — يعمل بصورة مستمرة في كل حالات التطبيق
//
// يُشغَّل في:
//  • فتح التطبيق (mount)
//  • الرجوع من الخلفية (visibilitychange / resume)
//  • كل دقيقة (interval)
//  • بعد تسجيل الدخول
//  • بعد أي عملية
//  • بعد أي تحديث
//
// قواعد الانتهاء (أيهما يتحقق أولاً):
//  1. expires_at < الآن  → منتهي فوراً
//  2. ops_count >= ops_limit (BY_USAGE) → منتهي فوراً
//  ولا ينتظر الشرط الآخر

import { useEffect, useCallback, useRef } from 'react';
import { validateAndSyncSubscription } from '@/lib/api';
import type { Subscription } from '@/types/types';

// ── حساب الحالة الفعلية للاشتراك بدون استدعاء DB (للفحص السريع) ────────────
export function computeRealStatus(sub: Subscription | null): 'active' | 'expired' | 'unknown' {
  if (!sub) return 'unknown';
  if (sub.status === 'expired') return 'expired';

  // فحص انتهاء الوقت
  if (sub.expires_at) {
    const expiresMs = new Date(sub.expires_at).getTime();
    if (expiresMs < Date.now()) return 'expired';
  }

  // فحص نفاد الحصة المحلية (إذا كانت ops_limit محفوظة)
  if (sub.ops_limit !== null && sub.ops_limit !== undefined) {
    if ((sub.ops_count ?? 0) >= sub.ops_limit) return 'expired';
  }

  return 'active';
}

// ── hook: useSubscriptionValidator ──────────────────────────────────────────
// الاستخدام:
//   useSubscriptionValidator(userId, subscription, (fresh) => setSub(fresh));
//
interface ValidatorOptions {
  userId: string | null;
  subscription: Subscription | null;
  onUpdate: (fresh: Subscription | null) => void;
  intervalMs?: number; // افتراضي: 60 ثانية
}

export function useSubscriptionValidator({
  userId,
  subscription,
  onUpdate,
  intervalMs = 60_000,
}: ValidatorOptions) {
  const lastCheckRef = useRef<number>(0);

  const validate = useCallback(async (force = false) => {
    if (!userId) return;
    const now = Date.now();
    // تجنب الفحص المتكرر في أقل من 10 ثوانٍ (إلا إذا كان إجبارياً)
    if (!force && now - lastCheckRef.current < 10_000) return;
    lastCheckRef.current = now;

    // فحص سريع محلي أولاً قبل DB
    const localStatus = computeRealStatus(subscription);
    if (localStatus === 'expired' && subscription?.status !== 'expired') {
      // الاشتراك انتهى محلياً — اذهب لـ DB لتأكيد وتحديث
    } else if (localStatus === 'active' && subscription?.status === 'active') {
      // لا تزال هناك ساعة أو أكثر → تخطَّ DB لتوفير الطلبات
      if (subscription.expires_at) {
        const remaining = new Date(subscription.expires_at).getTime() - now;
        if (remaining > 3_600_000) return; // أكثر من ساعة — لا حاجة للتحقق
      }
    }

    const fresh = await validateAndSyncSubscription(userId);
    onUpdate(fresh);
  }, [userId, subscription, onUpdate]);

  // ── فحص عند mount ────────────────────────────────────────────────────────
  useEffect(() => {
    validate(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ── فحص كل دقيقة ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    const id = setInterval(() => validate(false), intervalMs);
    return () => clearInterval(id);
  }, [userId, intervalMs, validate]);

  // ── فحص عند الرجوع من الخلفية (visibilitychange + Capacitor resume) ───────
  useEffect(() => {
    if (!userId) return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') validate(true);
    };
    document.addEventListener('visibilitychange', onVisible);

    // Capacitor appStateChange
    let capCleanup: (() => void) | null = null;
    import('@capacitor/app').then(({ App: CapApp }) => {
      const handler = CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) validate(true);
      });
      capCleanup = () => { handler.then(h => h.remove()).catch(() => {}); };
    }).catch(() => {});

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      capCleanup?.();
    };
  }, [userId, validate]);

  // ── تصدير validate للاستخدام الخارجي (بعد عملية مثلاً) ────────────────────
  return { validate };
}
