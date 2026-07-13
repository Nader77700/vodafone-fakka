// ═══════════════════════════════════════════════════════════════════════════
// Subscription Engine — المصدر الوحيد لجميع بيانات الاشتراك
// ═══════════════════════════════════════════════════════════════════════════
// يُستخدم في: SettingsPage · SubscriptionDetailPage · أي كارت أو Badge
// القاعدة: لا يوجد أي قيمة ثابتة (Hardcoded) خارج هذا الملف
// كل الكروت تقرأ من useSubscriptionEngine فقط — لا تكرار، لا تعارض
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserSubscription, getSubscriptionOpsInfo, derivePlanLabel } from '@/lib/api';
import { fmtTimeLeft, fmtProgress, fmtDateAr } from '@/lib/formatUtils';
import type { Subscription } from '@/types/types';
import type { SubscriptionOpsInfo } from '@/lib/api';
import { supabase } from '@/db/supabase';

// ─── رقم الاشتراك الاحترافي ─────────────────────────────────────────────────
// يقرأ serial_number من DB أولاً، ثم يولّد رقماً من الـ UUID
export function formatSubId(sub: Subscription | null): string {
  if (!sub) return 'غير متوفر';
  // serial_number موجود في DB
  if (sub.serial_number) return sub.serial_number;
  // توليد من UUID: أخذ آخر 6 أحرف رقمية من الـ id
  if (sub.id) {
    const digits = sub.id.replace(/\D/g, '').slice(-6).padStart(6, '0');
    return `SUB-${digits}`;
  }
  return 'غير متوفر';
}

// ─── حالة الاشتراك المحسوبة ──────────────────────────────────────────────────
export type SubStatus = 'admin' | 'active' | 'expiring' | 'critical' | 'expired' | 'none';

export interface SubscriptionEngineState {
  // ── حالة التحميل ──
  loading: boolean;

  // ── بيانات الدور ──
  isAdmin: boolean;

  // ── حالة الاشتراك ──
  status: SubStatus;            // الحالة المحسوبة الشاملة
  isActive: boolean;            // نشط فعلاً (وقت + حصة)
  isExpired: boolean;           // منتهٍ
  isUnlimited: boolean;         // غير محدود (لا expires_at ولا opsLimit)

  // ── الخطة ──
  planName: string;             // "شهري" | "مسؤول النظام" | "تجريبي" …
  planColor: string;            // لون الخطة الموحّد

  // ── الوقت ──
  timeLeft: ReturnType<typeof fmtTimeLeft>;   // { label, color, status }
  activatedAt: string;          // "24 يونيو 2026" | "—"
  expiresAt: string;            // "24 يوليو 2026" | "غير محدود" | "—"
  progressPct: number;          // 0-100 نسبة الوقت المنقضي

  // ── العمليات ──
  opsUsed: number;
  opsLimit: number | null;      // null = ♾️
  opsRem: number | null;        // null = ♾️
  opsPct: number;               // 0-100 نسبة الاستخدام

  // ── الهوية ──
  subId: string;                // "SUB-000245"

  // ── المصادر الخام (للاستخدامات المتقدمة) ──
  subscription: Subscription | null;
  opsInfo: SubscriptionOpsInfo | null;

  // ── تحديث يدوي ──
  refresh: () => Promise<void>;
}

// ─── hook رئيسي ──────────────────────────────────────────────────────────────
export function useSubscriptionEngine(opts?: { intervalMs?: number }): SubscriptionEngineState {
  const { user, profile } = useAuth();
  const intervalMs = opts?.intervalMs ?? 60_000;

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  const [subscription, setSub]   = useState<Subscription | null>(null);
  const [opsInfo,      setOps]   = useState<SubscriptionOpsInfo | null>(null);
  const [loading,      setLoad]  = useState(true);
  const mountedRef = useRef(true);

  const fetch = useCallback(async () => {
    if (!user) { setLoad(false); return; }
    const [s, o] = await Promise.all([
      getUserSubscription(user.id),
      getSubscriptionOpsInfo(user.id),
    ]);
    if (!mountedRef.current) return;
    setSub(s);
    setOps(o);
    setLoad(false);
  }, [user]);

  // mount + interval
  useEffect(() => {
    mountedRef.current = true;
    fetch();
    const id = setInterval(fetch, intervalMs);
    return () => { mountedRef.current = false; clearInterval(id); };
  }, [fetch, intervalMs]);

  // ── Realtime: refresh immediately when admin changes this user's subscription ──
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`sub-engine-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'subscriptions',
        filter: `user_id=eq.${user.id}`,
      }, () => { fetch(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetch]);

  // ── حساب الحالة الشاملة ──────────────────────────────────────────────────
  const rawIsActive = !!(
    subscription?.status === 'active' &&
    (!subscription?.expires_at || new Date(subscription.expires_at).getTime() > Date.now())
  );

  // انتهاء الحصة يُعدّ انتهاءً فورياً
  const exhaustedByUsage = !!(
    opsInfo?.isExhaustedByUsage ||
    (opsInfo?.opsLimit !== null && opsInfo?.opsLimit !== undefined &&
     opsInfo.opsUsed >= (opsInfo.opsLimit ?? Infinity))
  );

  const isActive   = rawIsActive && !exhaustedByUsage;
  const isExpired  = !isAdmin && (subscription !== null) && (!isActive);
  const isUnlimited = isAdmin || (isActive && !subscription?.expires_at && opsInfo?.opsLimit === null);

  // ── اللون الموحّد ────────────────────────────────────────────────────────
  const timeLeftObj = fmtTimeLeft(subscription?.expires_at);
  const planColor = isAdmin ? '#00E5FF'
    : !isActive              ? '#ef4444'
    : timeLeftObj.status === 'critical'  ? '#ef4444'
    : timeLeftObj.status === 'expiring'  ? '#F7C948'
    : '#22c55e';

  // ── حالة موحّدة ─────────────────────────────────────────────────────────
  const status: SubStatus = isAdmin ? 'admin'
    : !subscription           ? 'none'
    : !isActive               ? 'expired'
    : timeLeftObj.status === 'critical' ? 'critical'
    : timeLeftObj.status === 'expiring' ? 'expiring'
    : 'active';

  // ── اسم الخطة ───────────────────────────────────────────────────────────
  const planName = isAdmin ? 'مسؤول النظام'
    : opsInfo?.planLabel
    ?? derivePlanLabel(opsInfo?.codeType ?? 'unknown', opsInfo?.durationDays ?? null);

  // ── التواريخ المنسّقة ────────────────────────────────────────────────────
  const activatedAt  = fmtDateAr(subscription?.activated_at);
  const expiresAtRaw = subscription?.expires_at;
  const expiresAt    = isAdmin ? 'غير محدود ♾️'
    : !expiresAtRaw   ? (isActive ? 'غير محدود ♾️' : '—')
    : fmtDateAr(expiresAtRaw);

  const progressPct = isAdmin || !subscription?.expires_at ? 0
    : isActive
      ? fmtProgress(subscription?.activated_at ?? null, subscription?.expires_at ?? null)
      : 100; // منتهي = مكتمل 100%

  // ── العمليات ─────────────────────────────────────────────────────────────
  const opsUsed  = isAdmin ? 0 : (opsInfo?.opsUsed ?? 0);
  const opsLimit = isAdmin ? null : (opsInfo?.opsLimit ?? null);
  const opsRem   = opsLimit === null ? null : Math.max(0, opsLimit - opsUsed);
  const opsPct   = opsLimit ? Math.min(100, Math.round((opsUsed / opsLimit) * 100)) : 0;

  // ── رقم الاشتراك ─────────────────────────────────────────────────────────
  const subId = formatSubId(subscription);

  return {
    loading,
    isAdmin,
    status,
    isActive,
    isExpired,
    isUnlimited,
    planName,
    planColor,
    timeLeft: isAdmin
      ? { label: 'غير محدود ♾️', color: '#00E5FF', status: 'active' }
      : isActive ? timeLeftObj
      : { label: 'منتهي', color: '#ef4444', status: 'expired' },
    activatedAt,
    expiresAt,
    progressPct,
    opsUsed,
    opsLimit,
    opsRem,
    opsPct,
    subId,
    subscription,
    opsInfo,
    refresh: fetch,
  };
}
