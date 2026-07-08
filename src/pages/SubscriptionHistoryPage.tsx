// صفحة سجل الاشتراكات + Activity Timeline
// SSOT: يقرأ الحالة الفعلية من useSubscriptionEngine — لا يعتمد على التاريخ فقط
// Realtime: يستمع لتغييرات subscriptions + subscription_history في الوقت الفعلي
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { staleWhileRevalidate, CACHE_KEYS } from '@/lib/appCache';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import { getSubscriptionHistory, getActivityTimeline, syncHistoryOnLoad } from '@/lib/api';
import { useSubscriptionEngine } from '@/hooks/useSubscriptionEngine';
import type { SubscriptionHistoryEntry, ActivityEntry } from '@/lib/api';
import {
  ArrowRight, Key, CheckCircle, AlertTriangle, Zap,
  Activity, Clock, Calendar, Plus, RefreshCw, Ban, Repeat2,
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

/* ── حساب end_reason من حالة Engine ── */
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

/* ── Badge حالة الاشتراك — يدعم جميع الحالات ── */
function StatusBadge({ entry, engineOverride }: {
  entry: SubscriptionHistoryEntry;
  engineOverride?: { status: SubscriptionHistoryEntry['status']; end_reason: SubscriptionHistoryEntry['end_reason'] } | null;
}) {
  const status     = engineOverride?.status     ?? entry.status;
  const end_reason = engineOverride?.end_reason ?? entry.end_reason;

  const cfg: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
    active:    { label: 'نشط',              color: 'text-success',          bg: 'bg-success/10',     icon: CheckCircle  },
    expired:   { label: 'منتهي',            color: 'text-destructive',      bg: 'bg-destructive/10', icon: AlertTriangle },
    cancelled: { label: 'ملغي',             color: 'text-destructive',      bg: 'bg-destructive/10', icon: Ban           },
    replaced:  { label: 'تم استبداله',     color: 'text-primary',          bg: 'bg-primary/10',     icon: Repeat2       },
    pending:   { label: 'قيد الانتظار',    color: 'text-warning',          bg: 'bg-warning/10',     icon: Clock         },
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

export default function SubscriptionHistoryPage() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const eng       = useSubscriptionEngine(); // SSOT

  const [history,    setHistory]    = useState<SubscriptionHistoryEntry[]>([]);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState<'history' | 'timeline'>('history');

  const loadData = useCallback(async (background = false) => {
    if (!user) return;

    // stale-while-revalidate: عرض الكاش فوراً ثم تحديث في الخلفية
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

    if (!background) setLoading(false);
    else setLoading(false);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Realtime: يستمع لأي تغيير في subscriptions أو subscription_history ──
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`history_rt_${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'subscriptions',
        filter: `user_id=eq.${user.id}`,
      }, () => { loadData(); })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'subscription_history',
        filter: `user_id=eq.${user.id}`,
      }, () => { loadData(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, loadData]);

  const engineOverride: { status: SubscriptionHistoryEntry['status']; end_reason: SubscriptionHistoryEntry['end_reason'] } | null = (() => {
    if (eng.loading || !eng.subscription) return null;
    const sub = eng.subscription;
    if (!eng.isActive && eng.status !== 'admin') {
      // map DB statuses to supported SubscriptionHistoryEntry status values
      let newStatus: SubscriptionHistoryEntry['status'];
      if (sub.status === 'cancelled') newStatus = 'cancelled';
      else if (sub.status === 'replaced') newStatus = 'replaced';
      else newStatus = 'expired'; // suspended, disabled, expired → expired
      return { status: newStatus, end_reason: deriveEndReason(eng) };
    }
    // نشط لكن ينتهي خلال 3 أيام → warning (نبقى على active، نضيف سبب)
    const expiresAt = eng.subscription?.expires_at;
    if (eng.isActive && expiresAt) {
      const msLeft = new Date(expiresAt).getTime() - Date.now();
      const daysLeft = Math.ceil(msLeft / 86400000);
      if (daysLeft <= 3 && daysLeft > 0) {
        return { status: 'active', end_reason: 'duration_finished' };
      }
    }
    return null;
  })();

  return (
    <div className="p-4 md:p-6 space-y-4 page-enter" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate('/home')}>
          <ArrowRight className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-black">سجل الاشتراكات</h1>
          <p className="text-xs text-muted-foreground">التاريخ الكامل لاشتراكاتك ونشاطاتك</p>
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
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl bg-muted" />)
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Key className="w-12 h-12 opacity-20" />
              <p className="text-sm font-medium">لا توجد اشتراكات سابقة</p>
              <Button variant="outline" size="sm" className="border-border mt-2" onClick={() => navigate('/activate')}>
                تفعيل أول اشتراك
              </Button>
            </div>
          ) : (
            history.map((h, idx) => (
              <div key={h.id} className="card-premium p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
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

                {h.days_before > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-success/8 border border-success/15 rounded-lg">
                    <Plus className="w-3.5 h-3.5 text-success shrink-0" />
                    <p className="text-xs text-success">
                      تجديد تراكمي: {h.days_before} + {h.duration_days} = <strong>{h.days_after} يوم</strong>
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-muted/30 rounded-lg p-2">
                    <p className="text-sm font-black tabular-nums">{h.duration_days}</p>
                    <p className="text-[9px] text-muted-foreground">أيام الكود</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-2">
                    <div className="flex items-center justify-center gap-1">
                      <Calendar className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <p className="text-[10px] font-semibold tabular-nums mt-0.5">
                      {new Date(h.activated_at).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-[9px] text-muted-foreground">البداية</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-2">
                    <div className="flex items-center justify-center gap-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <p className="text-[10px] font-semibold tabular-nums mt-0.5">
                      {new Date(h.expires_at).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-[9px] text-muted-foreground">الانتهاء</p>
                  </div>
                </div>

                {h.notes && (
                  <p className="text-[10px] text-muted-foreground bg-muted/20 rounded px-2 py-1">{h.notes}</p>
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
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl bg-muted" />)
          ) : activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Activity className="w-12 h-12 opacity-20" />
              <p className="text-sm font-medium">لا توجد أنشطة مسجّلة بعد</p>
            </div>
          ) : (
            <div className="relative pr-5">
              <div className="absolute right-[18px] top-4 bottom-4 w-px bg-border" />
              {activities.map((a, idx) => {
                const cfg = EVENT_CFG[a.event_type] ?? { icon: Activity, color: 'text-muted-foreground', bg: 'bg-muted/50' };
                const Icon = cfg.icon;
                return (
                  <div key={a.id} className={`relative flex items-start gap-3 pb-4 ${idx === activities.length - 1 ? 'pb-0' : ''}`}>
                    <div className={`absolute right-0 w-7 h-7 rounded-full ${cfg.bg} border-2 border-background flex items-center justify-center shrink-0 z-10`}>
                      <Icon className={`w-3 h-3 ${cfg.color}`} />
                    </div>
                    <div className="mr-9 flex-1 min-w-0 bg-card border border-border/50 rounded-xl px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold">{a.title}</p>
                        <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">{relativeTime(a.created_at)}</span>
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

      {!loading && (
        <div className="grid grid-cols-2 gap-3 pt-2">
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

