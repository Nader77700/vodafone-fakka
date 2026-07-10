// ─── بطاقة حالة الاشتراك Premium ─────────────────────────────────────────────
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard, Calendar, Clock, Shield, Crown,
  ChevronRight, BarChart3, Zap,
} from 'lucide-react';
import type { Subscription } from '@/types/types';
import type { SubscriptionOpsInfo } from '@/lib/api';
import { fmtDate, fmtDateAr, fmtTimeLeft, fmtProgress } from '@/lib/formatUtils';

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
function PremiumBar({ pct, color }: { pct: number; color: string }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(pct), 120); return () => clearTimeout(t); }, [pct]);
  return (
    <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
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

  // Admin دائماً نشط بصرف النظر عن أي subscription row في DB
  const rawSubActive = !!(subscription?.status === 'active'
    && (!subscription?.expires_at || new Date(subscription.expires_at).getTime() > Date.now()));
  const subActive  = isAdmin || rawSubActive;
  const isUnlimited = isAdmin || (rawSubActive && !subscription?.expires_at && opsInfo?.opsLimit === null);
  const timeLeft   = isAdmin
    ? { label: 'غير محدود ♾️', color: '#00E5FF', status: 'active' as const }
    : fmtTimeLeft(subscription?.expires_at);
  const progress   = isAdmin ? 0
    : fmtProgress(subscription?.activated_at ?? null, subscription?.expires_at ?? null);

  // ألوان الحالة
  const statusColor =
    isAdmin         ? '#00E5FF'
    : !subActive    ? '#ef4444'
    : timeLeft.status === 'critical' || timeLeft.status === 'expiring' ? '#F7C948'
    : '#22c55e';

  const statusLabel =
    isAdmin      ? 'نشط — مسؤول'
    : !subActive ? 'منتهي'
    : isUnlimited ? 'نشط — غير محدود'
    : timeLeft.status === 'critical' ? 'ينتهي قريباً'
    : timeLeft.status === 'expiring' ? 'نشط — ينتهي قريباً'
    : 'نشط';

  // اسم الخطة من planLabel المُحسوب في api.ts (بناءً على نوع الكود والمدة)
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


  return (
    <div
      className="relative rounded-2xl overflow-hidden select-none"
      style={{
        background: 'linear-gradient(135deg,#0a0000 0%,#1a0000 40%,#0d0d0d 100%)',
        border: `1.5px solid ${statusColor}35`,
        boxShadow: `0 4px 32px ${statusColor}18, 0 1px 0 rgba(255,255,255,0.04) inset`,
      }}
    >
      {/* Glow top line */}
      <div className="h-px w-full" style={{ background: `linear-gradient(90deg,transparent,${statusColor}80,transparent)` }} />

      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 70% 60% at 90% 10%,${statusColor}10,transparent)` }} />

      <div className="relative p-4 space-y-4">

        {/* ── Header: Plan + Status ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-black"
                style={{ borderColor: `${statusColor}40`, background: `${statusColor}15`, color: statusColor }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: statusColor }} />
                {statusLabel}
              </div>
            </div>
            {/* اسم الخطة: يظهر فقط إذا كان الاشتراك نشطاً */}
            {subActive && (
              <p className="text-lg font-black text-foreground">{planName}</p>
            )}
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${statusColor}18`, border: `1px solid ${statusColor}35` }}>
            {isAdmin ? <Crown className="w-5 h-5" style={{ color: statusColor }} />
              : <CreditCard className="w-5 h-5" style={{ color: statusColor }} />}
          </div>
        </div>

        {/* ── Info Grid: Admin → رسالة احترافية | User → تاريخ التفعيل + الانتهاء فقط ── */}
        {isAdmin ? (
          <div className="flex items-center gap-3 p-3 rounded-xl"
            style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.18)' }}>
            <Crown className="w-5 h-5 shrink-0" style={{ color: '#00E5FF' }} />
            <p className="text-xs font-bold leading-snug" style={{ color: '#00E5FF' }}>
              هذا الحساب يتمتع بصلاحيات مسؤول النظام واستخدام غير محدود ♾️
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                icon: Calendar, label: 'تاريخ التفعيل',
                value: fmtDateAr(subscription?.activated_at),
                color: '#94a3b8',
              },
              {
                icon: Clock, label: 'تاريخ الانتهاء',
                value: subscription?.expires_at
                  ? fmtDateAr(subscription.expires_at)
                  : (subActive ? 'غير محدود ♾️' : '—'),
                color: statusColor,
              },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="flex items-center gap-2 p-2.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${color}18`, color }}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] text-muted-foreground">{label}</p>
                  <p className="text-[12px] font-black tabular-nums" style={{ color }}>{value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── قسم العمليات ── */}
        {!isAdmin && (
          <div className="space-y-2.5 pt-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" style={{ color: '#F7C948' }} />
                <span className="text-[11px] font-bold text-foreground/80">العمليات</span>
              </div>
              {!subActive ? (
                <span className="text-sm font-black" style={{ color: '#ef4444' }}>لا توجد عمليات متاحة</span>
              ) : opsLimit === null ? (
                <span className="text-sm font-black" style={{ color: '#00C896' }}>♾️ غير محدود</span>
              ) : (
                <span className="text-xs font-black tabular-nums" style={{ color: '#F7C948' }}>
                  <AnimatedNumber value={opsRem ?? 0} /> / {opsLimit} متبقٍ
                </span>
              )}
            </div>

            {subActive && opsLimit !== null && (
              <>
                <PremiumBar pct={opsPct} color="#F7C948" />
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">
                    مستخدم: <span className="font-bold tabular-nums" style={{ color: '#F7C948' }}>
                      <AnimatedNumber value={opsUsed} />
                    </span>
                  </span>
                  <span className="font-bold" style={{ color: opsPct >= 90 ? '#ef4444' : opsPct >= 60 ? '#F7C948' : '#22c55e' }}>
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
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <span className="text-[9px] text-muted-foreground uppercase tracking-widest">رقم الاشتراك</span>
            <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color: '#94a3b8' }}>
              {subscription.serial_number ?? subscription.id.slice(0, 8).toUpperCase()}
            </span>
          </div>
        )}

        {/* ── Actions ── */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => navigate('/subscription-detail')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-95"
            style={{
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
                boxShadow: '0 2px 12px rgba(230,0,0,0.35)',
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
