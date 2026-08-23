// ─── بطاقة حالة الاشتراك Premium ─────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard, Calendar, Clock, Crown,
  ChevronRight, BarChart3, Zap, Star,
  Activity, ShieldCheck,
} from 'lucide-react';
import type { Subscription } from '@/types/types';
import type { SubscriptionOpsInfo } from '@/lib/api';
import { fmtDateAr, fmtTimeLeft, fmtProgress } from '@/lib/formatUtils';
import { useIsLight } from '@/contexts/ThemeContext';

interface Props {
  subscription: Subscription | null;
  opsInfo: SubscriptionOpsInfo | null;
  isAdmin?: boolean;
  onRenew?: () => void;
}

// ── عداد متحرّك ─────────────────────────────────────────────────────────────
function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    let start = 0;
    const step = Math.max(1, Math.floor(value / 30));
    const timer = setInterval(() => {
      start = Math.min(start + step, value);
      setDisplay(start);
      if (start >= value) clearInterval(timer);
    }, 20);
    return () => clearInterval(timer);
  }, [value]);
  return <>{display}{suffix}</>;
}

// ── Progress Bar متحرّك ─────────────────────────────────────────────────────
function PremiumBar({ pct, color, isDark = true }: { pct: number; color: string; isDark?: boolean }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(pct), 120); return () => clearTimeout(t); }, [pct]);
  return (
    <div className="spc-bar-track h-2.5 rounded-full overflow-hidden"
      style={{ background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}>
      <div
        className="h-full rounded-full transition-all duration-1000 ease-out"
        style={{
          width: `${w}%`,
          background: pct >= 90 ? 'linear-gradient(90deg,#ef4444,#b91c1c)'
            : pct >= 60 ? 'linear-gradient(90deg,#F7C948,#E60000)'
            : `linear-gradient(90deg,${color},${color}cc)`,
          boxShadow: `0 0 8px ${color}60`,
        }}
      />
    </div>
  );
}

export default function SubscriptionPremiumCard({ subscription, opsInfo, isAdmin, onRenew }: Props) {
  const navigate = useNavigate();
  const L = useIsLight();

  // Admin دائماً نشط
  const rawSubActive = !!(subscription?.status === 'active'
    && (!subscription?.expires_at || new Date(subscription.expires_at).getTime() > Date.now()));
  const subActive   = isAdmin || rawSubActive;
  const isUnlimited = isAdmin || (rawSubActive && !subscription?.expires_at && opsInfo?.opsLimit === null);
  const timeLeft    = isAdmin
    ? { label: 'غير محدود ♾️', color: '#00E5FF', status: 'active' as const }
    : fmtTimeLeft(subscription?.expires_at);
  const progress    = isAdmin ? 0
    : fmtProgress(subscription?.activated_at ?? null, subscription?.expires_at ?? null);

  // ألوان الحالة
  const statusColor =
    isAdmin         ? (L ? '#0077aa' : '#00E5FF')
    : !subActive    ? '#ef4444'
    : timeLeft.status === 'critical' || timeLeft.status === 'expiring' ? (L ? '#b45309' : '#F7C948')
    : (L ? '#059669' : '#22c55e');

  const statusLabel =
    isAdmin      ? 'نشط — مسؤول'
    : !subActive ? 'منتهي'
    : isUnlimited ? 'نشط — غير محدود'
    : timeLeft.status === 'critical' ? 'ينتهي قريباً'
    : timeLeft.status === 'expiring' ? 'نشط — ينتهي قريباً'
    : 'نشط';

  const planName = (() => {
    if (isAdmin) return '👑 مسؤول النظام';
    const label = opsInfo?.planLabel;
    if (label) return label;
    const ct = opsInfo?.codeType;
    if (ct === 'trial') return 'تجريبي';
    if (ct === 'gift')  return 'هدية';
    return 'Premium';
  })();

  const opsUsed  = isAdmin ? 0 : (opsInfo?.opsUsed ?? 0);
  const opsLimit = isAdmin ? null : (opsInfo?.opsLimit ?? null);
  const opsRem   = opsLimit !== null ? Math.max(0, opsLimit - opsUsed) : null;
  const opsPct   = opsLimit ? Math.min(100, Math.round((opsUsed / opsLimit) * 100)) : 0;

  // ── Light Mode card styles ──────────────────────────────────────────────────
  const cardStyle = L ? {
    background: 'linear-gradient(145deg, #ffffff 0%, #fafafa 60%, #fff8f0 100%)',
    border: '1.5px solid rgba(0,0,0,0.10)',
    boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.05)',
  } : {
    border: `1.5px solid ${statusColor}35`,
    boxShadow: `0 4px 32px ${statusColor}18, 0 1px 0 rgba(255,255,255,0.04) inset`,
  };

  return (
    <div className="subscription-premium-card relative rounded-2xl overflow-hidden select-none" style={cardStyle}>

      {/* ── Light: Top accent stripe ── */}
      {L && (
        <div className="h-[3px] w-full"
          style={{ background: 'linear-gradient(90deg, #E60000 0%, #F7C948 50%, #E60000 100%)' }} />
      )}

      {/* ── Dark: Glow top line ── */}
      {!L && (
        <div className="h-px w-full"
          style={{ background: `linear-gradient(90deg,transparent,${statusColor}80,transparent)` }} />
      )}

      {/* Background glow — dark only */}
      {!L && (
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse 70% 60% at 90% 10%,${statusColor}10,transparent)` }} />
      )}

      <div className="relative p-4 space-y-4">

        {/* ── Header: Plan badge + status + icon ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">

            {/* Premium Gold Badge */}
            <div className="flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-full"
              style={L ? {
                background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                border: '1.5px solid #F7C948',
                boxShadow: '0 1px 4px rgba(247,201,72,0.25)',
              } : {
                background: 'rgba(247,201,72,0.12)',
                border: '1px solid rgba(247,201,72,0.35)',
              }}>
              <Star className="w-3 h-3 fill-current" style={{ color: L ? '#92400e' : '#F7C948' }} />
              <span className="text-[10px] font-black tracking-widest uppercase"
                style={{ color: L ? '#78350f' : '#F7C948' }}>Premium</span>
            </div>

            {/* Status badge */}
            <div className="flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-full"
              style={{
                background: L ? `${statusColor}12` : `${statusColor}15`,
                border: `1px solid ${statusColor}${L ? '35' : '40'}`,
              }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: statusColor }} />
              <span className="text-[11px] font-black" style={{ color: statusColor }}>{statusLabel}</span>
            </div>

            {/* Plan name */}
            {subActive && (
              <p className="text-lg font-black"
                style={{ color: L ? '#111827' : 'hsl(var(--foreground))' }}>{planName}</p>
            )}
          </div>

          {/* Icon */}
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={L ? {
              background: `${statusColor}12`,
              border: `1.5px solid ${statusColor}30`,
              boxShadow: `0 2px 8px ${statusColor}18`,
            } : {
              background: `${statusColor}18`,
              border: `1px solid ${statusColor}35`,
            }}>
            {isAdmin
              ? <Crown className="w-5 h-5" style={{ color: statusColor }} />
              : <CreditCard className="w-5 h-5" style={{ color: statusColor }} />}
          </div>
        </div>

        {/* ── Admin Card ── */}
        {isAdmin ? (
          <div className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all active:scale-[0.98]"
            style={L ? {
              background: 'linear-gradient(135deg, #eff6ff 0%, #e0f2fe 100%)',
              border: '1.5px solid rgba(0,160,200,0.25)',
              boxShadow: '0 2px 10px rgba(0,160,200,0.10)',
            } : {
              background: 'rgba(0,229,255,0.06)',
              border: '1px solid rgba(0,229,255,0.18)',
            }}
            onClick={() => navigate('/admin')}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: L ? 'rgba(0,119,170,0.12)' : 'rgba(0,229,255,0.10)' }}>
              <ShieldCheck className="w-5 h-5" style={{ color: L ? '#0077aa' : '#00E5FF' }} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black" style={{ color: L ? '#0c4a6e' : '#00E5FF' }}>
                مسؤول النظام
              </p>
              <p className="text-[10px] font-medium leading-snug mt-0.5"
                style={{ color: L ? '#0369a1' : 'rgba(0,229,255,0.75)' }}>
                صلاحيات كاملة — استخدام غير محدود ♾️
              </p>
            </div>
            <ChevronRight className="w-4 h-4 shrink-0 mr-auto" style={{ color: L ? '#0077aa' : '#00E5FF' }} />
          </div>
        ) : (
          /* ── Stats Grid ── */
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                icon: Calendar,
                label: 'تاريخ التفعيل',
                value: fmtDateAr(subscription?.activated_at),
                accent: L ? '#4b5563' : '#94a3b8',
                bg: L ? '#f9fafb' : 'hsl(var(--card))',
                border: L ? 'rgba(0,0,0,0.08)' : 'hsl(var(--muted))',
              },
              {
                icon: Clock,
                label: 'تاريخ الانتهاء',
                value: subscription?.expires_at
                  ? fmtDateAr(subscription.expires_at)
                  : (subActive ? 'غير محدود ♾️' : '—'),
                accent: statusColor,
                bg: L ? `${statusColor}08` : 'hsl(var(--card))',
                border: L ? `${statusColor}20` : 'hsl(var(--muted))',
              },
            ].map(({ icon: Icon, label, value, accent, bg, border }) => (
              <div key={label} className="flex items-center gap-2 p-2.5 rounded-xl"
                style={{ background: bg, border: `1px solid ${border}`, boxShadow: L ? '0 1px 3px rgba(0,0,0,0.04)' : 'none' }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${accent}18`, color: accent }}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px]" style={{ color: L ? '#9ca3af' : 'hsl(var(--muted-foreground))' }}>{label}</p>
                  <p className="text-[12px] font-black tabular-nums" style={{ color: accent }}>{value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Operations section ── */}
        {!isAdmin && (
          <div className="space-y-2.5 pt-1 border-t"
            style={{ borderColor: L ? 'rgba(0,0,0,0.08)' : 'hsl(var(--muted))' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" style={{ color: L ? '#b45309' : '#F7C948' }} />
                <span className="text-[11px] font-bold" style={{ color: L ? '#374151' : 'hsl(var(--foreground)/0.8)' }}>
                  العمليات
                </span>
              </div>
              {!subActive ? (
                <span className="text-sm font-black" style={{ color: '#ef4444' }}>لا توجد عمليات متاحة</span>
              ) : opsLimit === null ? (
                <span className="text-sm font-black" style={{ color: L ? '#059669' : '#00C896' }}>♾️ غير محدود</span>
              ) : (
                <span className="text-xs font-black tabular-nums" style={{ color: L ? '#b45309' : '#F7C948' }}>
                  <AnimatedNumber value={opsRem ?? 0} /> / {opsLimit} متبقٍ
                </span>
              )}
            </div>

            {subActive && opsLimit !== null && (
              <>
                <PremiumBar pct={opsPct} color={L ? '#b45309' : '#F7C948'} isDark={!L} />
                <div className="flex items-center justify-between text-[10px]">
                  <span style={{ color: L ? '#6b7280' : 'hsl(var(--muted-foreground))' }}>
                    مستخدم:{' '}
                    <span className="font-bold tabular-nums" style={{ color: L ? '#b45309' : '#F7C948' }}>
                      <AnimatedNumber value={opsUsed} />
                    </span>
                  </span>
                  <span className="font-bold" style={{
                    color: opsPct >= 90 ? '#ef4444' : opsPct >= 60 ? (L ? '#b45309' : '#F7C948') : (L ? '#059669' : '#22c55e')
                  }}>
                    {opsPct}%
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Subscription Number ── */}
        {subscription && (
          <div className="flex items-center justify-between pt-1 border-t"
            style={{ borderColor: L ? 'rgba(0,0,0,0.08)' : 'hsl(var(--muted))' }}>
            <span className="text-[9px] uppercase tracking-widest" style={{ color: L ? '#9ca3af' : 'hsl(var(--muted-foreground))' }}>
              رقم الاشتراك
            </span>
            <span className="text-[11px] font-mono font-bold tabular-nums"
              style={{ color: L ? '#374151' : '#94a3b8' }}>
              {subscription.serial_number ?? subscription.id.slice(0, 8).toUpperCase()}
            </span>
          </div>
        )}

        {/* ── Actions ── */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => navigate('/subscription-detail')}
            className="spc-detail-btn flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-95"
            style={L ? {
              background: 'rgba(230,0,0,0.06)',
              border: '1.5px solid rgba(230,0,0,0.20)',
              color: '#cc0000',
              boxShadow: '0 1px 4px rgba(230,0,0,0.10)',
            } : {
              background: 'rgba(230,0,0,0.15)',
              border: '1px solid rgba(230,0,0,0.35)',
              color: '#E60000',
            }}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            تفاصيل الاشتراك
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          {(!subActive || timeLeft.status === 'expiring' || timeLeft.status === 'critical') && !isAdmin && onRenew && (
            <button
              onClick={onRenew}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-95"
              style={{
                background: 'linear-gradient(135deg,#E60000,#B30000)',
                color: '#fff',
                boxShadow: L ? '0 2px 12px rgba(230,0,0,0.28)' : '0 2px 12px rgba(230,0,0,0.35)',
              }}
            >
              تجديد
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
