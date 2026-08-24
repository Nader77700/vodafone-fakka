// صفحة سجل الاشتراكات + Activity Timeline
// P0 FIX: كل اشتراك يعرض Usage مستقل تماماً — لا aggregation على user_id
// SSOT: يقرأ الحالة الفعلية من useSubscriptionEngine
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { staleWhileRevalidate, CACHE_KEYS } from '@/lib/appCache';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import {
  getSubscriptionHistory, getActivityTimeline, syncHistoryOnLoad,
  getSubscriptionUsageAnalytics, type SubscriptionUsageAnalytics,
} from '@/lib/api';
import { useSubscriptionEngine } from '@/hooks/useSubscriptionEngine';
import type { SubscriptionHistoryEntry, ActivityEntry } from '@/lib/api';
import {
  ArrowRight, Key, CheckCircle, AlertTriangle, Zap,
  Activity, Clock, Calendar, Plus, RefreshCw, Ban, Repeat2,
  TrendingUp, BarChart2, ChevronDown, ChevronUp,
  Target, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/* ── مساعدات ── */
const EVENT_CFG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  activation:      { icon: Key,           color: 'text-success',          bg: 'bg-success/10' },
  renewal:         { icon: RefreshCw,     color: 'text-primary',          bg: 'bg-primary/10' },
  expiry:          { icon: AlertTriangle, color: 'text-destructive',      bg: 'bg-destructive/10' },
  trial_exhausted: { icon: Zap,           color: 'text-destructive',      bg: 'bg-destructive/10' },
  recharge:        { icon: Activity,      color: 'text-primary',          bg: 'bg-primary/10' },
  login:           { icon: Clock,         color: 'text-muted-foreground', bg: 'bg-muted/50' },
};

function deriveEndReason(
  eng: ReturnType<typeof useSubscriptionEngine>,
): SubscriptionHistoryEntry['end_reason'] {
  const sub = eng.subscription;
  if (!sub) return null;
  if (sub.status === 'cancelled') return 'cancelled_by_admin';
  if (sub.status === 'replaced')  return 'replaced_by_new_subscription';
  if (eng.opsRem === 0 && eng.opsLimit !== null) {
    const isTrial = eng.opsInfo?.codeType === 'trial';
    return isTrial ? 'trial_finished' : 'operations_finished';
  }
  if (sub.expires_at && new Date(sub.expires_at).getTime() < Date.now()) return 'duration_finished';
  return null;
}

function StatusBadge({ entry, engineOverride }: {
  entry: SubscriptionHistoryEntry;
  engineOverride?: { status: SubscriptionHistoryEntry['status']; end_reason: SubscriptionHistoryEntry['end_reason'] } | null;
}) {
  const status     = engineOverride?.status     ?? entry.status;
  const end_reason = engineOverride?.end_reason ?? entry.end_reason;

  const cfg: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
    active:    { label: 'نشط',           color: 'text-success',          bg: 'bg-success/10',     icon: CheckCircle  },
    expired:   { label: 'منتهي',         color: 'text-destructive',      bg: 'bg-destructive/10', icon: AlertTriangle },
    cancelled: { label: 'ملغي',          color: 'text-destructive',      bg: 'bg-destructive/10', icon: Ban           },
    replaced:  { label: 'تم استبداله',  color: 'text-primary',          bg: 'bg-primary/10',     icon: Repeat2       },
    pending:   { label: 'قيد الانتظار', color: 'text-warning',          bg: 'bg-warning/10',     icon: Clock         },
  };
  const reasonLabel: Record<string, string> = {
    operations_finished:          'انتهى بنفاد العمليات',
    duration_finished:            'انتهى بانتهاء المدة',
    cancelled_by_admin:           'ألغي بواسطة الإدارة',
    suspended_by_admin:           'موقوف بواسطة الإدارة',
    disabled_by_admin:            'معطّل بواسطة الإدارة',
    replaced_by_new_subscription: 'استُبدل باشتراك أحدث',
    manual_cancel:                'ألغي يدوياً',
    trial_finished:               'انتهت الفترة التجريبية',
    quota_finished:               'انتهى بنفاد الحصة',
  };
  const c = cfg[status] ?? cfg['expired'];
  const Icon = c.icon;
  return (
    <div className="flex flex-col gap-1">
      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.bg} ${c.color} w-fit`}>
        <Icon className="w-2.5 h-2.5" />
        {c.label}
      </div>
      {end_reason && (
        <p className={`text-[9px] ${c.color} opacity-80`}>{reasonLabel[end_reason] ?? end_reason}</p>
      )}
    </div>
  );
}

function relativeTime(date: string) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60)    return 'الآن';
  if (diff < 3600)  return `منذ ${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`;
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/* ── لوحة Usage المستقلة لكل اشتراك (P0) ── */
function SubscriptionUsagePanel({ usage }: { usage: SubscriptionUsageAnalytics }) {
  const isLimited = usage.subscription_type === 'limited';
  const usedPct   = isLimited && usage.allowed_operations
    ? Math.min(100, Math.round((usage.used_operations / usage.allowed_operations) * 100))
    : null;

  return (
    <div className="space-y-3 pt-1">

      {/* شريط التقدم — Limited فقط */}
      {isLimited && usage.allowed_operations != null && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-foreground">
              {usage.used_operations} / {usage.allowed_operations} عملية
            </span>
            <span className={`font-bold ${usedPct! >= 90 ? 'text-destructive' : usedPct! >= 70 ? 'text-warning' : 'text-success'}`}>
              {usedPct}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                usedPct! >= 90 ? 'bg-destructive' : usedPct! >= 70 ? 'bg-warning' : 'bg-success'
              }`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Target className="w-3 h-3" />
            <span>متبقي: <strong className="text-foreground">{usage.remaining_operations ?? 0}</strong> عملية</span>
          </div>
        </div>
      )}

      {/* Unlimited badge */}
      {!isLimited && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/15">
          <div className="w-4 h-4 text-primary shrink-0 font-black text-xs flex items-center justify-center">∞</div>
          <div>
            <p className="text-xs font-bold text-primary">اشتراك غير محدود</p>
            <p className="text-[10px] text-muted-foreground">
              استُخدم: <strong>{usage.used_operations}</strong> عملية ناجحة خلال فترة هذا الاشتراك
            </p>
          </div>
        </div>
      )}

      {/* إحصائيات 3-عمود */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-muted/20 rounded-lg p-2 text-center">
          <p className="text-sm font-black tabular-nums">{usage.total}</p>
          <p className="text-[9px] text-muted-foreground">إجمالي</p>
        </div>
        <div className="bg-success/8 rounded-lg p-2 text-center">
          <p className="text-sm font-black tabular-nums text-success">{usage.success}</p>
          <p className="text-[9px] text-muted-foreground">ناجح</p>
        </div>
        <div className="bg-destructive/8 rounded-lg p-2 text-center">
          <p className="text-sm font-black tabular-nums text-destructive">{usage.failed}</p>
          <p className="text-[9px] text-muted-foreground">فاشل</p>
        </div>
      </div>

      {/* إيراد + أرقام فريدة */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-primary/5 border border-primary/15 rounded-lg p-2 text-center">
          <p className="text-sm font-black tabular-nums text-primary">
            {usage.revenue} <span className="text-[9px] font-normal">جنيه</span>
          </p>
          <p className="text-[9px] text-muted-foreground">إجمالي الإيراد</p>
        </div>
        <div className="bg-muted/20 rounded-lg p-2 text-center">
          <p className="text-sm font-black tabular-nums">{usage.unique_phones}</p>
          <p className="text-[9px] text-muted-foreground">أرقام فريدة</p>
        </div>
      </div>

      {/* ملاحظة: بيانات هذا الاشتراك فقط */}
      <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg bg-muted/20 border border-border/40">
        <CheckCircle className="w-3 h-3 text-success shrink-0 mt-0.5" />
        <p className="text-[9px] text-muted-foreground leading-relaxed">
          هذه الإحصائيات خاصة بهذا الاشتراك فقط
          {usage.start_date && usage.end_date && (
            <> ({new Date(usage.start_date).toLocaleDateString('en-GB', { day:'numeric', month:'short' })} → {new Date(usage.end_date).toLocaleDateString('en-GB', { day:'numeric', month:'short' })})</>
          )}
          {' '}— لا تتضمن عمليات اشتراكات أخرى.
        </p>
      </div>

      {/* رسم بياني يومي */}
      {usage.daily_usage && usage.daily_usage.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> الاستخدام اليومي
          </p>
          <div className="flex items-end gap-0.5 h-12 overflow-x-auto pb-1">
            {(() => {
              const daily = usage.daily_usage!;
              const max   = Math.max(...daily.map(d => d.total), 1);
              return daily.map(d => (
                <div
                  key={d.day}
                  title={`${d.day}: ${d.success} ناجح / ${d.failed} فاشل`}
                  className="flex-1 min-w-[6px] bg-primary/60 rounded-t-sm hover:bg-primary transition-colors cursor-default"
                  style={{ height: `${Math.max(8, Math.round((d.total / max) * 100))}%` }}
                />
              ));
            })()}
          </div>
        </div>
      )}

      {/* أول + آخر عملية */}
      {(usage.first_op_at || usage.last_op_at) && (
        <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
          {usage.first_op_at && (
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 shrink-0" />
              <span>أول: {new Date(usage.first_op_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}</span>
            </div>
          )}
          {usage.last_op_at && (
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 shrink-0" />
              <span>آخر: {new Date(usage.last_op_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   الصفحة الرئيسية
══════════════════════════════════════════════════════════════ */
export default function SubscriptionHistoryPage() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const eng       = useSubscriptionEngine();

  const [history,      setHistory]      = useState<SubscriptionHistoryEntry[]>([]);
  const [activities,   setActivities]   = useState<ActivityEntry[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [tab,          setTab]          = useState<'history' | 'timeline'>('history');
  const [usageMap,     setUsageMap]     = useState<Record<string, SubscriptionUsageAnalytics>>({});
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const [usageLoading, setUsageLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    const cachedH = await staleWhileRevalidate<typeof history>(
      CACHE_KEYS.SUBSCRIPTION_HISTORY,
      async () => {
        await syncHistoryOnLoad(user.id);
        return getSubscriptionHistory(user.id);
      },
      (fresh) => { setHistory(fresh); },
    );
    const cachedA = await staleWhileRevalidate<typeof activities>(
      CACHE_KEYS.ACTIVITY_TIMELINE,
      () => getActivityTimeline(user.id, 50),
      (fresh) => { setActivities(fresh); },
    );
    if (cachedH) setHistory(cachedH);
    if (cachedA) setActivities(cachedA);
    setLoading(false);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  /* P0: loadUsage — يجلب بيانات هذا الاشتراك فقط */
  const loadUsage = useCallback(async (subscriptionId: string) => {
    if (usageMap[subscriptionId]) {
      setExpandedId(prev => prev === subscriptionId ? null : subscriptionId);
      return;
    }
    setExpandedId(subscriptionId);
    setUsageLoading(subscriptionId);
    const data = await getSubscriptionUsageAnalytics(subscriptionId);
    setUsageMap(prev => ({ ...prev, [subscriptionId]: data }));
    setUsageLoading(null);
  }, [usageMap]);

  useEffect(() => { loadData(); }, [loadData]);

  /* Realtime */
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`history_rt_${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'subscriptions',
        filter: `user_id=eq.${user.id}`,
      }, () => { loadData(); setUsageMap({}); })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'subscription_history',
        filter: `user_id=eq.${user.id}`,
      }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadData]);

  const engineOverride: {
    status: SubscriptionHistoryEntry['status'];
    end_reason: SubscriptionHistoryEntry['end_reason'];
  } | null = (() => {
    if (eng.loading || !eng.subscription) return null;
    const sub = eng.subscription;
    if (!eng.isActive && eng.status !== 'admin') {
      let newStatus: SubscriptionHistoryEntry['status'];
      if (sub.status === 'cancelled') newStatus = 'cancelled';
      else if (sub.status === 'replaced') newStatus = 'replaced';
      else newStatus = 'expired';
      return { status: newStatus, end_reason: deriveEndReason(eng) };
    }
    const expiresAt = eng.subscription?.expires_at;
    if (eng.isActive && expiresAt) {
      const msLeft   = new Date(expiresAt).getTime() - Date.now();
      const daysLeft = Math.ceil(msLeft / 86400000);
      if (daysLeft <= 3 && daysLeft > 0)
        return { status: 'active', end_reason: 'duration_finished' };
    }
    return null;
  })();

  /* ═══════════════════════ Render ═══════════════════════ */
  return (
    <div className="p-4 md:p-6 space-y-4 page-enter" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate('/home')}>
          <ArrowRight className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-black">سجل الاشتراكات</h1>
          <p className="text-xs text-muted-foreground">استخدام كل اشتراك بشكل مستقل</p>
        </div>
        {!eng.loading && (
          <div className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${
            eng.isActive ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'
          }`}>
            {eng.isActive ? '● نشط' : '● منتهي'}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex bg-muted/40 rounded-xl p-1 gap-1">
        {(['history', 'timeline'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              tab === t ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'
            }`}
          >
            {t === 'history' ? '📋 سجل الاشتراكات' : '⏱ جدول الأنشطة'}
          </button>
        ))}
      </div>

      {/* ── سجل الاشتراكات ── */}
      {tab === 'history' && (
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl bg-muted" />
            ))
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Key className="w-12 h-12 opacity-20" />
              <p className="text-sm font-medium">لا توجد اشتراكات سابقة</p>
              <Button
                variant="outline" size="sm"
                className="border-border mt-2"
                onClick={() => navigate('/activate')}
              >
                تفعيل أول اشتراك
              </Button>
            </div>
          ) : (
            history.map((h, idx) => (
              <div key={h.id} className="card-premium p-4 space-y-3">

                {/* رأس البطاقة */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      h.code_type === 'trial' ? 'bg-warning/10' : 'bg-primary/10'
                    }`}>
                      {h.code_type === 'trial'
                        ? <Zap className="w-4 h-4 text-warning" />
                        : <Key className="w-4 h-4 text-primary" />}
                    </div>
                    <div>
                      <p className="text-xs font-bold font-mono">{h.code ?? 'كود مجهول'}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {h.code_type === 'trial' ? 'تجريبي' : h.code_type === 'gift' ? 'هدية' : 'مدفوع'}
                        {idx === 0 && <span className="mr-1.5 text-primary font-semibold">• الأحدث</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StatusBadge entry={h} engineOverride={idx === 0 ? engineOverride : null} />
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {new Date(h.activated_at).toLocaleDateString('en-GB')}
                    </span>
                  </div>
                </div>

                {/* تجديد تراكمي */}
                {h.days_before > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-success/8 border border-success/15 rounded-lg">
                    <Plus className="w-3.5 h-3.5 text-success shrink-0" />
                    <p className="text-xs text-success">
                      تجديد تراكمي: {h.days_before} + {h.duration_days} = <strong>{h.days_after} يوم</strong>
                    </p>
                  </div>
                )}

                {/* تواريخ + مدة */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-muted/30 rounded-lg p-2">
                    <p className="text-sm font-black tabular-nums">{h.duration_days}</p>
                    <p className="text-[9px] text-muted-foreground">أيام الكود</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-2">
                    <Calendar className="w-3 h-3 text-muted-foreground mx-auto mb-0.5" />
                    <p className="text-[10px] font-semibold tabular-nums">
                      {new Date(h.activated_at).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-[9px] text-muted-foreground">البداية</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-2">
                    <Clock className="w-3 h-3 text-muted-foreground mx-auto mb-0.5" />
                    <p className="text-[10px] font-semibold tabular-nums">
                      {new Date(h.expires_at).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-[9px] text-muted-foreground">الانتهاء</p>
                  </div>
                </div>

                {h.notes && (
                  <p className="text-[10px] text-muted-foreground bg-muted/20 rounded px-2 py-1">{h.notes}</p>
                )}

                {/* زر Usage — P0: يجلب بيانات هذا الاشتراك فقط */}
                {h.id && (
                  <button
                    onClick={() => loadUsage(h.id)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-border/50 bg-muted/10 hover:bg-muted/20 transition-colors text-xs text-muted-foreground"
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <BarChart2 className="w-3.5 h-3.5 text-primary" />
                      إحصائيات هذا الاشتراك فقط
                    </span>
                    {usageLoading === h.id
                      ? <RefreshCw className="w-3 h-3 animate-spin text-primary" />
                      : expandedId === h.id
                        ? <ChevronUp className="w-3.5 h-3.5" />
                        : <ChevronDown className="w-3.5 h-3.5" />
                    }
                  </button>
                )}

                {/* لوحة Usage المستقلة */}
                {expandedId === h.id && usageMap[h.id] && (
                  <SubscriptionUsagePanel usage={usageMap[h.id]} />
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── جدول الأنشطة ── */}
      {tab === 'timeline' && (
        <div className="space-y-1">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl bg-muted" />
            ))
          ) : activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Activity className="w-12 h-12 opacity-20" />
              <p className="text-sm font-medium">لا توجد أنشطة مسجّلة بعد</p>
            </div>
          ) : (
            <div className="relative pr-5">
              <div className="absolute right-[18px] top-4 bottom-4 w-px bg-border" />
              {activities.map((a, idx) => {
                const cfg  = EVENT_CFG[a.event_type] ?? { icon: Activity, color: 'text-muted-foreground', bg: 'bg-muted/50' };
                const Icon = cfg.icon;
                return (
                  <div
                    key={a.id}
                    className={`relative flex items-start gap-3 pb-4 ${idx === activities.length - 1 ? 'pb-0' : ''}`}
                  >
                    <div className={`absolute right-0 w-7 h-7 rounded-full ${cfg.bg} border-2 border-background flex items-center justify-center shrink-0 z-10`}>
                      <Icon className={`w-3 h-3 ${cfg.color}`} />
                    </div>
                    <div className="mr-9 flex-1 min-w-0 bg-card border border-border/50 rounded-xl px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold">{a.title}</p>
                        <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                          {relativeTime(a.created_at)}
                        </span>
                      </div>
                      {a.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{a.description}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* إجماليات السجل — Lifetime منفصل عن per-subscription */}
      {!loading && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted/20 border border-border/40">
            <XCircle className="w-3 h-3 text-muted-foreground shrink-0" />
            <p className="text-[9px] text-muted-foreground">
              الأرقام التالية إجمالي السجل الكامل — لإحصائيات اشتراك محدد اضغط "إحصائيات هذا الاشتراك فقط"
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="card-premium p-3 text-center">
              <p className="text-xl font-black tabular-nums text-primary">{history.length}</p>
              <p className="text-xs text-muted-foreground">اشتراكات مسجّلة</p>
            </div>
            <div className="card-premium p-3 text-center">
              <p className="text-xl font-black tabular-nums">
                {history.reduce((s, h) => s + h.duration_days, 0)}
              </p>
              <p className="text-xs text-muted-foreground">إجمالي أيام</p>
            </div>
          </div>
        </div>
      )}

      <Button
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2 h-11"
        onClick={() => navigate('/home')}
      >
        <CheckCircle className="w-4 h-4" />
        العودة للرئيسية
      </Button>
    </div>
  );
}
