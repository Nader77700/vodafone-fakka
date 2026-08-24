// ─── بطاقة حالة الاشتراك Premium ─────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard, Calendar, Clock, Crown,
  ChevronRight, BarChart3, Gem,
  Activity, ShieldCheck, Sparkles,
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

  // ألوان الحالة — Light: ألوان داكنة حقيقية مرئية على أبيض
  const statusColor =
    isAdmin         ? (L ? '#b45309' : '#00E5FF')
    : !subActive    ? '#dc2626'
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
    const label = opsInfo?.planLabel ?? '';
    // إذا كان الاسم عربياً → استبدله بالإنجليزي
    const isArabic = /[\u0600-\u06FF]/.test(label);
    if (label && !isArabic) return label;
    const ct = opsInfo?.codeType;
    if (ct === 'trial') return 'Trial';
    if (ct === 'gift')  return 'Gift';
    return 'PREMIUM VIP';
  })();

  const opsUsed  = isAdmin ? 0 : (opsInfo?.opsUsed ?? 0);
  const opsLimit = isAdmin ? null : (opsInfo?.opsLimit ?? null);
  const opsRem   = opsLimit !== null ? Math.max(0, opsLimit - opsUsed) : null;
  const opsPct   = opsLimit ? Math.min(100, Math.round((opsUsed / opsLimit) * 100)) : 0;

  // ── Light Mode card styles ──────────────────────────────────────────────────
  const cardStyle = L ? {
    background: 'linear-gradient(160deg, #ffffff 0%, #fffdf7 40%, #fff9e8 80%, #fffbef 100%)',
    border: '1.5px solid rgba(212,175,55,0.30)',
    boxShadow: [
      '0 2px 0 rgba(255,255,255,0.95) inset',
      '0 -1px 0 rgba(212,175,55,0.15) inset',
      '0 8px 32px rgba(212,175,55,0.12)',
      '0 2px 8px rgba(0,0,0,0.06)',
      '0 1px 2px rgba(0,0,0,0.04)',
    ].join(', '),
  } : {
    border: `1.5px solid ${statusColor}35`,
    boxShadow: `0 4px 32px ${statusColor}18, 0 1px 0 rgba(255,255,255,0.04) inset`,
  };

  return (
    <div className="subscription-premium-card relative rounded-2xl overflow-hidden select-none" style={cardStyle}>

      {/* ── Light: Premium gold top stripe ── */}
      {L && (
        <div className="h-[3px] w-full"
          style={{ background: 'linear-gradient(90deg, #b8860b 0%, #F7C948 30%, #fffacd 50%, #F7C948 70%, #b8860b 100%)' }} />
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

            {/* PREMIUM VIP Gold Badge */}
            <div className="flex items-center gap-1.5 w-fit px-3 py-1.5 rounded-full"
              style={L ? {
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                border: '1.5px solid rgba(180,83,9,0.55)',
                boxShadow: '0 2px 8px rgba(180,83,9,0.20), 0 1px 0 rgba(255,255,255,0.90) inset',
              } : {
                background: 'linear-gradient(135deg, rgba(247,201,72,0.14), rgba(230,0,0,0.06))',
                border: '1px solid rgba(247,201,72,0.40)',
                boxShadow: '0 0 14px rgba(247,201,72,0.12)',
              }}>
              <Sparkles className="w-3 h-3" style={{ color: L ? '#92400e' : '#F7C948' }} />
              {/* Light: solid dark amber — perfectly readable on yellow bg */}
              <span className="text-[10px] font-black tracking-[0.12em] uppercase"
                style={{ color: L ? '#78350f' : undefined,
                  ...(L ? {} : {
                    background: 'linear-gradient(90deg, #F7C948, #fde68a, #F7C948)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  })
                }}>PREMIUM</span>
              <span className="text-[9px] font-black tracking-widest"
                style={L ? {
                  color: '#7c2d12',
                  border: '1px solid rgba(124,45,18,0.40)',
                  borderRadius: '4px',
                  padding: '0 5px',
                  background: 'rgba(255,255,255,0.55)',
                } : {
                  color: '#fbbf24',
                  border: '1px solid rgba(247,201,72,0.35)',
                  borderRadius: '4px',
                  padding: '0 5px',
                }}>VIP</span>
              <Gem className="w-2.5 h-2.5" style={{ color: L ? '#92400e' : '#F7C948', opacity: 0.85 }} />
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

            {/* Plan name — Light: slow angled gold shimmer (professional metallic), Dark: bright shimmer */}
            {subActive && (
              <p className="text-xl font-black leading-tight tracking-tight"
                style={L ? {
                  background: 'linear-gradient(118deg, #78350f 0%, #b45309 12%, #d97706 24%, #fef3c7 38%, #fde68a 44%, #ffffff 50%, #fde68a 56%, #fef3c7 62%, #d97706 76%, #b45309 88%, #78350f 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  color: 'transparent',
                  backgroundSize: '400% 100%',
                  animation: 'nameShimmerLight 8s ease-in-out infinite',
                  display: 'inline-block',
                  filter: 'drop-shadow(0 1px 2px rgba(120,53,15,0.25))',
                } : {
                  background: 'linear-gradient(118deg, #e5e7eb 0%, #f5d060 20%, #fbbf24 35%, #E60000 52%, #fbbf24 68%, #f5d060 82%, #e5e7eb 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  color: 'transparent',
                  backgroundSize: '400% 100%',
                  animation: 'nameShimmerDark 8s ease-in-out infinite',
                  display: 'inline-block',
                  filter: 'drop-shadow(0 0 8px rgba(230,0,0,0.35))',
                }}>{planName}</p>
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

        {/* ── Admin Card ── gold-red premium palette, no blue ── */}
        {isAdmin ? (
          <div className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all active:scale-[0.98]"
            style={L ? {
              background: 'linear-gradient(135deg, #fffff8 0%, #fdf8ec 60%, #faf0d0 100%)',
              border: '1.5px solid rgba(212,175,55,0.45)',
              boxShadow: '0 2px 12px rgba(212,175,55,0.18), 0 1px 0 rgba(255,255,255,0.95) inset',
            } : {
              background: 'linear-gradient(135deg, rgba(247,201,72,0.09), rgba(230,0,0,0.05))',
              border: '1px solid rgba(247,201,72,0.25)',
              boxShadow: '0 0 16px rgba(212,175,55,0.10)',
            }}
            onClick={() => navigate('/admin')}
          >
            {/* Crown icon — gold gradient */}
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={L ? {
                background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                border: '1px solid rgba(212,175,55,0.40)',
              } : {
                background: 'linear-gradient(135deg, rgba(247,201,72,0.15), rgba(230,0,0,0.08))',
                border: '1px solid rgba(247,201,72,0.20)',
              }}>
              <Crown className="w-5 h-5"
                style={L ? {
                  color: '#b45309',
                  filter: 'drop-shadow(0 1px 2px rgba(212,175,55,0.40))',
                } : {
                  color: '#F7C948',
                  filter: 'drop-shadow(0 0 6px rgba(247,201,72,0.60))',
                }} />
            </div>
            <div className="min-w-0 flex-1">
            {/* "مسؤول النظام" — Light: solid dark readable, Dark: slow shimmer */}
              <p className="text-xs font-black"
                style={L ? {
                  color: '#78350f',
                } : {
                  background: 'linear-gradient(118deg, #fde68a 0%, #F7C948 30%, #E60000 55%, #F7C948 80%, #fde68a 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  color: 'transparent',
                  backgroundSize: '400% 100%',
                  animation: 'nameShimmerDark 8s ease-in-out infinite',
                  display: 'inline-block',
                }}>
                مسؤول النظام
              </p>
              {/* subtitle */}
              <p className="text-[10px] font-medium leading-snug mt-0.5"
                style={{ color: L ? '#92400e' : 'rgba(247,201,72,0.70)' }}>
                صلاحيات كاملة — استخدام غير محدود ♾️
              </p>
            </div>
            <ChevronRight className="w-4 h-4 shrink-0 mr-auto"
              style={{ color: L ? '#b45309' : '#F7C948' }} />
          </div>
        ) : (
          /* ── Stats Grid ── */
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                icon: Calendar,
                label: 'تاريخ التفعيل',
                value: fmtDateAr(subscription?.activated_at),
                accent: L ? '#78350f' : '#94a3b8',
                bg: L ? 'linear-gradient(135deg,#fef9ee,#fef3c7)' : 'hsl(var(--card))',
                border: L ? 'rgba(180,83,9,0.30)' : 'hsl(var(--muted))',
                shadow: L ? '0 2px 6px rgba(180,83,9,0.12)' : 'none',
              },
              {
                icon: Clock,
                label: 'تاريخ الانتهاء',
                value: subscription?.expires_at
                  ? fmtDateAr(subscription.expires_at)
                  : (subActive ? 'غير محدود ♾️' : '—'),
                accent: L ? (
                  statusColor === '#059669' ? '#059669'
                  : statusColor === '#b45309' ? '#b45309'
                  : '#dc2626'
                ) : statusColor,
                bg: L ? 'linear-gradient(135deg,#ffffff,rgba(220,38,38,0.05))' : 'hsl(var(--card))',
                border: L ? 'rgba(220,38,38,0.20)' : 'hsl(var(--muted))',
                shadow: L ? '0 2px 6px rgba(220,38,38,0.08)' : 'none',
              },
            ].map(({ icon: Icon, label, value, accent, bg, border, shadow }) => (
              <div key={label} className="flex items-center gap-2 p-2.5 rounded-xl"
                style={{ background: bg, border: `1px solid ${border}`, boxShadow: shadow }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: L ? `${accent}22` : `${accent}18`, color: accent }}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  {/* Light: مرئي — رمادي داكن كافٍ */}
                  <p className="text-[9px] font-medium" style={{ color: L ? '#6b7280' : 'hsl(var(--muted-foreground))' }}>{label}</p>
                  {/* Light: لون داكن واضح */}
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

        {/* ── Subscription Number ── gold-tinted ── */}
        {subscription && (
          <div className="flex items-center justify-between pt-1 border-t"
            style={{ borderColor: L ? 'rgba(212,175,55,0.20)' : 'hsl(var(--muted))' }}>
            <span className="text-[9px] uppercase tracking-widest font-semibold"
              style={{ color: L ? '#b45309' : 'rgba(247,201,72,0.55)' }}>
              رقم الاشتراك
            </span>
            <span className="text-[11px] font-mono font-black tabular-nums"
              style={L ? {
                background: 'linear-gradient(90deg, #b45309, #d97706)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              } : { color: 'rgba(247,201,72,0.80)' }}>
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
