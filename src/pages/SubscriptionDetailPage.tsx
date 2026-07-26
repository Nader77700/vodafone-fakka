// ─── صفحة تفاصيل الاشتراك Premium ───────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  getUserSubscription, getSubscriptionHistory, getSubscriptionOpsInfo, derivePlanLabel,
  getActivityTimeline,
} from '@/lib/api';
import type { SubscriptionHistoryEntry, ActivityEntry } from '@/lib/api';
import type { Subscription } from '@/types/types';
import type { SubscriptionOpsInfo } from '@/lib/api';
import { formatSubId } from '@/hooks/useSubscriptionEngine';
import { fmtDateAr, fmtTimeLeft, fmtProgress } from '@/lib/formatUtils';
import {
  ArrowRight, CreditCard, Calendar, Clock, Zap, Shield, Crown,
  CheckCircle2, XCircle, AlertTriangle, TrendingUp, BarChart3,
  Activity, RefreshCw, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

// ── عداد متحرّك ──────────────────────────────────────────────────────────────
function AnimNum({ value }: { value: number }) {
  const [d, setD] = useState(0);
  useEffect(() => {
    let n = 0;
    const step = Math.max(1, Math.floor(value / 30));
    const t = setInterval(() => { n = Math.min(n + step, value); setD(n); if (n >= value) clearInterval(t); }, 20);
    return () => clearInterval(t);
  }, [value]);
  return <>{d}</>;
}

// ── Progress Bar ─────────────────────────────────────────────────────────────
function Bar({ pct, color }: { pct: number; color: string }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(pct), 200); return () => clearTimeout(t); }, [pct]);
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
      <div className="h-full rounded-full transition-all duration-1000 ease-out"
        style={{
          width: `${w}%`,
          background: pct >= 90 ? 'linear-gradient(90deg,#ef4444,#b91c1c)'
            : pct >= 60 ? 'linear-gradient(90deg,#F7C948,#E60000)'
            : `linear-gradient(90deg,${color},${color}99)`,
          boxShadow: `0 0 6px ${color}50`,
        }}
      />
    </div>
  );
}

// ── Section Wrapper ──────────────────────────────────────────────────────────
function Section({ title, icon: Icon, color = '#E60000', children }: {
  title: string; icon: React.ElementType; color?: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: '#0d0d0d', border: `1px solid ${color}25` }}>
      <div className="flex items-center gap-2 px-4 py-3"
        style={{ background: `${color}10`, borderBottom: `1px solid ${color}20` }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: `${color}20`, color }}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="text-sm font-black" style={{ color }}>{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ── Info Row ─────────────────────────────────────────────────────────────────
function InfoRow({ label, value, color = '#94a3b8', mono = false }: {
  label: string; value: string; color?: string; mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
      <span className={`text-[12px] font-bold truncate text-right ${mono ? 'font-mono' : ''}`}
        style={{ color }}>{value}</span>
    </div>
  );
}

export default function SubscriptionDetailPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [subscription, setSub]     = useState<Subscription | null>(null);
  const [opsInfo, setOpsInfo]       = useState<SubscriptionOpsInfo | null>(null);
  const [history, setHistory]       = useState<SubscriptionHistoryEntry[]>([]);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getUserSubscription(user.id),
      getSubscriptionOpsInfo(user.id),
      getSubscriptionHistory(user.id),
      getActivityTimeline(user.id, 100),
    ]).then(([s, o, h, a]) => {
      setSub(s); setOpsInfo(o); setHistory(h); setActivities(a);
      setLoading(false);
    });
  }, [user]);

  const isAdmin    = profile?.role === 'admin' || profile?.role === 'super_admin';
  const subActive  = !!(subscription?.status === 'active'
    && (!subscription?.expires_at || new Date(subscription.expires_at).getTime() > Date.now()));
  // غير محدود = نشط فعلاً + لا تاريخ انتهاء + لا حد عمليات
  const isUnlimited = (subActive && !subscription?.expires_at && opsInfo?.opsLimit === null);
  const timeLeft   = fmtTimeLeft(subscription?.expires_at);
  const progress   = fmtProgress(subscription?.activated_at ?? null, subscription?.expires_at ?? null);

  const statusColor =
    !subActive                                                      ? '#ef4444'
    : timeLeft.status === 'critical' || timeLeft.status === 'expiring' ? '#F7C948'
    : '#22c55e';

  const opsUsed  = (opsInfo?.opsUsed ?? 0);
  const opsLimit = (opsInfo?.opsLimit ?? null);
  const opsRem   = opsLimit !== null ? Math.max(0, opsLimit - opsUsed) : null;
  const opsPct   = opsLimit ? Math.min(100, Math.round((opsUsed / opsLimit) * 100)) : 0;

  const planName = (() => {
    const label = opsInfo?.planLabel;
    if (label) return label;
    return derivePlanLabel(opsInfo?.codeType ?? 'unknown', opsInfo?.durationDays ?? null);
  })();

  // إحصائيات الاستخدام من activities
  const todayStr = new Date().toDateString();
  const weekMs   = 7 * 86400000;
  const monthMs  = 30 * 86400000;

  const opActivities = activities.filter(a => a.event_type === 'recharge');
  const todayOps   = opActivities.filter(a => new Date(a.created_at).toDateString() === todayStr).length;
  const weekOps    = opActivities.filter(a => Date.now() - new Date(a.created_at).getTime() < weekMs).length;
  const monthOps   = opActivities.filter(a => Date.now() - new Date(a.created_at).getTime() < monthMs).length;
  const totalOps   = opActivities.length;
  const successOps = opActivities.filter(a => a.metadata?.success !== false).length;
  const successRate = totalOps > 0 ? Math.round((successOps / totalOps) * 100) : 100;

  if (loading) {
    return (
      <div className="p-4 space-y-4" dir="rtl">
        <div className="flex items-center gap-3">
          <Skeleton className="w-8 h-8 rounded-xl bg-muted" />
          <Skeleton className="h-6 w-48 bg-muted" />
        </div>
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-2xl bg-muted" />)}
      </div>
    );
  }

  return (
    <div className="pb-8 space-y-4" dir="rtl" style={{ background: '#070707', minHeight: '100dvh' }}>

      {/* ── Header ── */}
      <div className="sticky top-0 z-20 px-4 pt-4 pb-3"
        style={{ background: '#070707', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate(-1)}>
            <ArrowRight className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black text-balance">تفاصيل الاشتراك</h1>
          </div>
          {/* Status dot */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold"
            style={{ background: `${statusColor}18`, border: `1px solid ${statusColor}35`, color: statusColor }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: statusColor }} />
            {subActive ? 'نشط' : 'منتهي'}
          </div>
        </div>
      </div>

      <div className="px-4 space-y-4">

        {/* ══════════════════════════════════════
            1. معلومات الاشتراك
           ══════════════════════════════════════ */}
        <Section title="معلومات الاشتراك" icon={CreditCard} color={statusColor}>
          <div className="space-y-0">
            <InfoRow label="الخطة"  value={planName} color={statusColor} />
            <InfoRow label="الحالة" value={subActive ? 'نشط' : 'منتهي'} color={statusColor} />
            <InfoRow label="تاريخ التفعيل" value={fmtDateAr(subscription?.activated_at)} />
            <InfoRow
              label="تاريخ الانتهاء"
              value={subscription?.expires_at ? fmtDateAr(subscription.expires_at) : (subActive ? 'غير محدود ♾️' : '—')}
              color={statusColor}
            />
            <InfoRow
              label="الوقت المتبقي"
              value={isUnlimited ? 'غير محدود ♾️' : subActive ? timeLeft.label : 'منتهي'}
              color={isUnlimited ? '#00C896' : subActive ? timeLeft.color : '#ef4444'}
            />
            <InfoRow label="رقم الاشتراك" value={formatSubId(subscription)} mono />
          </div>

          {/* Time Progress — مستخدم فقط: 100% عند الانتهاء */}
          {!isUnlimited && subscription?.expires_at && (
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">الوقت المنقضي</span>
                <span className="font-bold tabular-nums" style={{ color: statusColor }}>
                  {subActive ? `${progress}%` : '100%'}
                </span>
              </div>
              <Bar pct={subActive ? progress : 100} color={statusColor} />
            </div>
          )}
        </Section>

        {/* ══════════════════════════════════════
            2. العمليات
           ══════════════════════════════════════ */}
        <Section title="العمليات" icon={Zap} color="#F7C948">
          {opsInfo ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'الحد الشهري', value: opsLimit != null ? String(opsLimit) : 'غير محدود ♾️', color: '#a78bfa', anim: false },
                  { label: 'مستخدم',      value: String(opsUsed),   color: '#F7C948', anim: true,  raw: opsUsed },
                  { label: 'متبقي',       value: opsRem != null ? String(opsRem) : '∞', color: '#22c55e', anim: opsRem !== null, raw: opsRem ?? 0 },
                  { label: 'نسبة الاستهلاك', value: `${opsPct}%`, color: opsPct >= 90 ? '#ef4444' : opsPct >= 60 ? '#F7C948' : '#22c55e', anim: false },
                ].map(({ label, value, color, anim, raw }) => (
                  <div key={label} className="p-3 rounded-xl text-center"
                    style={{ background: `${color}10`, border: `1px solid ${color}25` }}>
                    <p className="text-[9px] text-muted-foreground mb-1">{label}</p>
                    <p className="text-base font-black tabular-nums" style={{ color }}>
                      {anim && raw !== undefined ? <AnimNum value={raw as number} /> : value}
                    </p>
                  </div>
                ))}
              </div>

              {opsLimit !== null && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">
                      {opsUsed} مستخدم / {opsLimit} إجمالي
                    </span>
                    <span className="font-bold tabular-nums"
                      style={{ color: opsPct >= 90 ? '#ef4444' : opsPct >= 60 ? '#F7C948' : '#22c55e' }}>
                      {opsPct}%
                    </span>
                  </div>
                  <Bar pct={opsPct} color="#F7C948" />
                </div>
              )}
              {opsLimit === null && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ background: '#22c55e10', border: '1px solid #22c55e25' }}>
                  <span className="text-xs font-bold" style={{ color: '#22c55e' }}>
                    ♾️ استخدام غير محدود
                  </span>
                </div>
              )}
            </div>
          ) : null}
        </Section>

        {/* ══════════════════════════════════════
            3. إحصائيات الاستخدام
           ══════════════════════════════════════ */}
        <Section title="إحصائيات الاستخدام" icon={BarChart3} color="#00C896">
          <div className="grid grid-cols-2 gap-2 mb-3">
            {[
              { label: 'اليوم',        value: todayOps,   color: '#00E5FF' },
              { label: 'هذا الأسبوع', value: weekOps,    color: '#a78bfa' },
              { label: 'هذا الشهر',   value: monthOps,   color: '#F7C948' },
              { label: 'الإجمالي',    value: totalOps,   color: '#00C896' },
            ].map(({ label, value, color }) => (
              <div key={label} className="p-3 rounded-xl text-center"
                style={{ background: `${color}10`, border: `1px solid ${color}25` }}>
                <p className="text-[9px] text-muted-foreground mb-1">{label}</p>
                <p className="text-2xl font-black tabular-nums" style={{ color }}>
                  <AnimNum value={value} />
                </p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.20)' }}>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" style={{ color: '#22c55e' }} />
              <span className="text-[11px] font-bold text-foreground/80">معدل النجاح</span>
            </div>
            <span className="text-lg font-black tabular-nums" style={{ color: '#22c55e' }}>
              <AnimNum value={successRate} />%
            </span>
          </div>
        </Section>

        {/* ══════════════════════════════════════
            4. سجل الاشتراكات
           ══════════════════════════════════════ */}
        <Section title="سجل الاشتراكات" icon={Activity} color="#60a5fa">
          {history.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <RefreshCw className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">لا يوجد سجل</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((h, i) => {
                const isExp = new Date(h.expires_at).getTime() < Date.now();
                const hColor = isExp ? '#94a3b8' : '#22c55e';
                const typeLabel = h.code_type === 'trial' ? 'تجريبي'
                  : h.code_type === 'gift' ? 'هدية'
                  : h.code_type === 'paid' ? 'شهري'
                  : 'بريميوم';
                return (
                  <div key={h.id ?? i}
                    className="rounded-xl p-3 space-y-2"
                    style={{ background: 'rgba(255,255,255,0.025)', border: `1px solid ${hColor}25` }}>
                    {/* Header row */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                          style={{ background: `${hColor}18`, color: hColor }}>
                          <CreditCard className="w-3 h-3" />
                        </div>
                        <span className="text-[11px] font-bold" style={{ color: hColor }}>{typeLabel}</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: `${hColor}15`, color: hColor }}>
                        {isExp ? 'منتهي' : 'نشط'}
                      </span>
                    </div>
                    {/* Info */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      {[
                        { k: 'تاريخ التفعيل', v: fmtDateAr(h.activated_at) },
                        { k: 'تاريخ الانتهاء', v: fmtDateAr(h.expires_at) },
                        { k: 'المدة',          v: `${h.duration_days} يوم` },
                        { k: 'العمليات',       v: String(h.days_after ?? '—') },
                      ].map(({ k, v }) => (
                        <div key={k}>
                          <p className="text-[9px] text-muted-foreground">{k}</p>
                          <p className="text-[11px] font-bold tabular-nums text-foreground/80">{v}</p>
                        </div>
                      ))}
                    </div>
                    {h.code && (
                      <div className="flex items-center gap-1 pt-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                        <span className="text-[9px] text-muted-foreground">الكود:</span>
                        <span className="text-[10px] font-mono text-foreground/40">{h.code}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* ── Renew CTA ── */}
        {!subActive && !isAdmin && (
          <button
            onClick={() => navigate('/activate')}
            className="w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-sm font-black transition-all active:scale-95"
            style={{
              background: 'linear-gradient(135deg,#E60000,#B30000)',
              color: '#fff',
              boxShadow: '0 4px 20px rgba(230,0,0,0.40)',
            }}
          >
            <Zap className="w-4 h-4" />
            تفعيل / تجديد الاشتراك
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
