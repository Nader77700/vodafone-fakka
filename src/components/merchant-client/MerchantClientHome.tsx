// الشاشة الرئيسية لعميل التاجر — المرحلة 11
// كارت اشتراك المستخدم + شبكة الكروت الحقيقية + شحن الرصيد
import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useMerchantClient } from '@/contexts/MerchantClientContext';
import { useAuth } from '@/contexts/AuthContext';
import { FAKKA_PRODUCTS, MARED_PRODUCTS } from '@/data/products';
import type { VodafoneProduct } from '@/data/products';
import {
  Battery, CheckCircle2, XCircle,
  Infinity, Clock, Zap, ChevronLeft, AlertTriangle,
  Phone, Users, CreditCard,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ─── مساعد: تنسيق الوقت المتبقي ──────────────────────────────────────────────
function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState<{ days: number; hours: number; minutes: number; seconds: number; expired: boolean } | null>(null);

  useEffect(() => {
    if (!expiresAt) { setRemaining(null); return; }
    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: true }); return; }
      const days    = Math.floor(diff / 86400000);
      const hours   = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setRemaining({ days, hours, minutes, seconds, expired: false });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return remaining;
}

// ─── كارت الاشتراك ────────────────────────────────────────────────────────────
function SubscriptionCard({ brandColor }: { brandColor: string }) {
  const { data }    = useMerchantClient();
  const { profile } = useAuth();
  const sub  = data?.subscription;
  const mer  = data?.merchant;
  const countdown = useCountdown(sub?.expires_at ?? null);

  if (!sub) return null;

  const isExpired = sub.status === 'expired' || sub.status === 'cancelled' || countdown?.expired;
  const isUnlimited = sub.sub_type === 'unlimited';
  const isOpsLimited = sub.sub_type === 'ops_limited' || sub.sub_type === 'both_limited';
  const isTimeLimited = sub.sub_type === 'time_limited' || sub.sub_type === 'both_limited';
  const opsUsed = sub.ops_success ?? sub.ops_count ?? 0;
  const opsFail = sub.ops_failed ?? 0;
  const opsLimit = sub.ops_limit;
  const opsLeft  = sub.ops_remaining;

  // شريط التقدم
  const progressPct = isOpsLimited && opsLimit
    ? Math.min(100, Math.round((opsUsed / opsLimit) * 100))
    : null;

  // هل ≤ يوم واحد؟ → عرض الساعات
  const showLive = countdown && !countdown.expired && countdown.days < 1;

  return (
    <div
      className="relative rounded-2xl overflow-hidden border"
      style={{
        background: `linear-gradient(135deg, ${brandColor}18 0%, ${brandColor}08 60%, transparent 100%)`,
        borderColor: `${brandColor}30`,
      }}
    >
      {/* خلفية ضوء */}
      <div
        className="absolute top-0 right-0 w-32 h-32 rounded-full blur-[60px] opacity-20 pointer-events-none"
        style={{ background: brandColor }}
      />

      <div className="relative p-4 space-y-3">
        {/* صف: التاجر + المستخدم */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold truncate" style={{ color: brandColor }}>
              {mer?.name ?? 'التاجر'}
            </p>
            <p className="text-lg font-black leading-tight text-foreground truncate">
              {profile?.username ?? '—'}
            </p>
          </div>
          {/* شارة نوع الاشتراك */}
          <div className="shrink-0">
            {isExpired ? (
              <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-[10px]">
                منتهي
              </Badge>
            ) : isUnlimited ? (
              <div
                className="flex items-center gap-1 px-2 py-1 rounded-xl border text-[10px] font-black"
                style={{ background: `${brandColor}15`, borderColor: `${brandColor}30`, color: brandColor }}
              >
                <Infinity className="w-3 h-3" />
                غير محدود
              </div>
            ) : isOpsLimited ? (
              <div
                className="flex items-center gap-1 px-2 py-1 rounded-xl border text-[10px] font-bold"
                style={{ background: 'rgba(251,191,36,0.12)', borderColor: 'rgba(251,191,36,0.30)', color: '#f59e0b' }}
              >
                <Zap className="w-3 h-3" />
                {opsLeft !== null ? `${opsLeft} متبقي` : 'بالعمليات'}
              </div>
            ) : (
              <div
                className="flex items-center gap-1 px-2 py-1 rounded-xl border text-[10px] font-bold"
                style={{ background: 'rgba(74,222,128,0.10)', borderColor: 'rgba(74,222,128,0.25)', color: '#4ade80' }}
              >
                <Clock className="w-3 h-3" />
                بالأيام
              </div>
            )}
          </div>
        </div>

        {/* ─── التاريخ / الوقت المتبقي ─── */}
        {!isExpired && sub.expires_at && (
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            {showLive ? (
              <p className="text-xs font-bold text-warning">
                متبقي: {countdown!.hours}س {countdown!.minutes}د {countdown!.seconds}ث
                <span className="text-[9px] font-normal text-muted-foreground mr-1">(عد تنازلي)</span>
              </p>
            ) : countdown ? (
              <p className="text-xs text-muted-foreground">
                ينتهي بعد
                <span className="font-black text-foreground mx-1">{countdown.days}</span>
                يوم
                {countdown.hours > 0 && (
                  <span className="font-semibold text-foreground mx-1">و {countdown.hours} ساعة</span>
                )}
              </p>
            ) : null}
          </div>
        )}

        {/* ─── انتهى الاشتراك ─── */}
        {isExpired && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-destructive/25 bg-destructive/8">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-xs text-destructive font-semibold">
              انتهى اشتراكك — تواصل مع تاجرك لتجديده
            </p>
          </div>
        )}

        {/* ─── شريط تقدم العمليات ─── */}
        {isOpsLimited && opsLimit && progressPct !== null && !isExpired && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">العمليات المستخدمة</span>
              <span className="font-bold text-foreground">{opsUsed} / {opsLimit}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${progressPct}%`,
                  background: progressPct > 80 ? '#ef4444' : progressPct > 50 ? '#f59e0b' : brandColor,
                }}
              />
            </div>
          </div>
        )}

        {/* ─── إحصائيات سريعة ─── */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-muted/30 border border-border">
            <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
            <div className="min-w-0">
              <p className="text-base font-black text-success leading-none">{opsUsed}</p>
              <p className="text-[9px] text-muted-foreground">ناجحة</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-muted/30 border border-border">
            <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
            <div className="min-w-0">
              <p className="text-base font-black text-destructive leading-none">{opsFail}</p>
              <p className="text-[9px] text-muted-foreground">فاشلة</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── لوجو VF مبسّط — نفس تصميم HomePage ─────────────────────────────────────
function VFLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="11" fill="#E60000" />
      <path d="M8 8l4 8 4-8" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── أيقونة نوع المنتج ──────────────────────────────────────────────────────
function ProductIcon({ type, className = 'w-4 h-4', style }: { type: string; className?: string; style?: React.CSSProperties }) {
  if (type === 'دقايق') return <Phone className={className} style={style} />;
  if (type === 'فليكس') return <Zap className={className} style={style} />;
  if (type === 'سوشيال') return <Users className={className} style={style} />;
  return <CreditCard className={className} style={style} />;
}

// ─── كارت المنتج — نسخة طبق الأصل من ProductCard في HomePage ───────────────
function ProductCard({ product, onSelect }: { product: VodafoneProduct; onSelect: (p: VodafoneProduct) => void }) {
  const isMared = product.category === 'mared';

  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      className="relative w-full overflow-hidden select-none"
      style={{
        minHeight: 136,
        borderRadius: 14,
        border: '1.5px solid rgba(230,0,0,0.45)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.70)',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
        background: '#0D0303',
      }}
      onTouchStart={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = 'scale(0.97)';
        el.style.boxShadow = '0 2px 14px rgba(0,0,0,0.80), 0 0 22px rgba(230,0,0,0.40)';
      }}
      onTouchEnd={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = 'scale(1)';
        el.style.boxShadow = '0 4px 24px rgba(0,0,0,0.70)';
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = 'translateY(-3px)';
        el.style.boxShadow = '0 12px 36px rgba(0,0,0,0.75), 0 0 28px rgba(230,0,0,0.42)';
        el.style.borderColor = 'rgba(230,0,0,0.75)';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = 'translateY(0)';
        el.style.boxShadow = '0 4px 24px rgba(0,0,0,0.70)';
        el.style.borderColor = 'rgba(230,0,0,0.45)';
      }}
    >
      {/* خلفية الكارت */}
      <img
        src="/images/vf-card-bg.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ borderRadius: 'inherit', objectPosition: 'center center' }}
      />
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(to right, rgba(4,0,0,0.95) 38%, rgba(4,0,0,0.55) 58%, rgba(4,0,0,0.02) 100%)',
        borderRadius: 'inherit',
      }} />

      <div className="relative z-10 flex flex-row h-full" style={{ minHeight: 136 }}>
        {/* يسار: لوجو + توقيع */}
        <div className="flex flex-col justify-between py-2 px-2" style={{ width: '36%', minWidth: 0 }}>
          <div className="flex items-center gap-1">
            <VFLogo size={15} />
            <span className="text-[8px] font-black text-white leading-none"
              style={{ textShadow: '0 1px 4px rgba(0,0,0,0.90)' }}>vodafone</span>
          </div>
          <div>
            <p className="text-[9px] font-bold leading-tight text-white"
              style={{ fontFamily: "'Dancing Script','Brush Script MT',cursive", textShadow: '0 1px 6px rgba(0,0,0,0.95)' }}>
              Nader Akram
            </p>
            <p className="text-[7px] font-bold" style={{ color: '#E60000' }}>Developer</p>
          </div>
        </div>

        {/* يمين: بيانات الكارت */}
        <div className="flex flex-col flex-1 min-w-0 px-2 py-1.5 text-right justify-between">
          <div className="flex justify-end">
            <span className="text-[9px] font-black px-2 py-0.5 rounded-full"
              style={{ color: '#fff', background: '#E60000', border: '1px solid rgba(255,255,255,0.20)' }}>
              {isMared ? 'مارد' : 'فكة'}
            </span>
          </div>

          <p className="text-[28px] font-black tabular-nums leading-none mt-0.5"
            style={{ color: '#ffffff', textShadow: '0 0 18px rgba(230,0,0,0.75), 0 2px 8px rgba(0,0,0,0.90)' }}>
            {product.priceLabel}
          </p>

          <div className="flex items-center justify-end gap-2 mt-0.5">
            <span className="text-[10px] font-semibold tabular-nums" style={{ color: 'rgba(255,255,255,0.80)' }}>
              {product.unitsLabel}
            </span>
            {product.net_balance > 0 && (
              <span className="text-[10px] font-semibold"
                style={{ color: 'rgba(255,200,0,0.90)', textShadow: '0 1px 3px rgba(0,0,0,0.80)' }}>
                صافي: {product.net_balance.toFixed(2)} ج
              </span>
            )}
          </div>

          <div className="flex items-center justify-between mt-1"
            style={{ borderTop: '1px solid rgba(255,255,255,0.14)', paddingTop: 5 }}>
            <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'rgba(0,229,255,0.14)', border: '1px solid rgba(0,229,255,0.38)' }}>
              <ChevronLeft className="w-3 h-3" style={{ color: '#00E5FF' }} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-white/70">🗓 {product.validity}</span>
              <span className="text-[11px] font-black"
                style={{ color: '#00E5FF', textShadow: '0 0 10px rgba(0,229,255,0.55)' }}>
                تنفيذ الآن
              </span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── الشاشة الرئيسية ──────────────────────────────────────────────────────────
export default function MerchantClientHome() {
  const navigate    = useNavigate();
  const { data }    = useMerchantClient();

  const brandColor = data?.merchant?.brand_color ?? '#E60000';
  const sub        = data?.subscription;

  const allCards = useMemo(() => [...FAKKA_PRODUCTS, ...MARED_PRODUCTS], []);
  const [activeTab, setActiveTab] = useState<'fakka' | 'mared'>('fakka');
  const visibleCards = useMemo(
    () => allCards.filter(p => p.category === activeTab),
    [allCards, activeTab],
  );

  // الاشتراك نشط فقط إذا كان status === 'active' صراحةً
  // أي حالة أخرى (pending / expired / cancelled / suspended / null) = محجوب
  const isSubActive = sub?.status === 'active';
  const isExpired   = !isSubActive; // متغير موحد للحجب

  // عند الضغط على كارت
  const handleCardSelect = (product: VodafoneProduct) => {
    if (!isSubActive) {
      toast.error('اشتراكك غير مفعّل', {
        description: 'تواصل مع التاجر الخاص بك لتفعيل الاشتراك',
        duration: 4000,
      });
      return;
    }
    navigate('/home', { state: { preSelectProduct: product } });
  };

  return (
    <div className="flex flex-col bg-background min-h-full pb-4" dir="rtl">
      {/* ─── خلفية ضوئية ─── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className="absolute -top-24 -right-16 w-64 h-64 rounded-full blur-[100px] opacity-10"
          style={{ background: brandColor }}
        />
      </div>

      <div className="relative z-10 flex flex-col gap-4 p-4 pt-3">

        {/* ─── كارت الاشتراك ─── */}
        <SubscriptionCard brandColor={brandColor} />

        {/* ─── قسم كروت الشحن من خلال فودافون كاش ─── */}
        <div className="space-y-3">
          {/* عنوان القسم */}
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
              شحن كروت فودافون كاش
            </p>
            {isExpired && (
              <span className="text-[9px] text-destructive font-semibold">الاشتراك منتهي</span>
            )}
          </div>

          {/* تبويبات fakka / mared */}
          <div
            className="flex gap-2 p-1 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {(['fakka', 'mared'] as const).map(tab => (
              <button
                key={tab}
                className={cn(
                  'flex-1 py-2 rounded-lg text-xs font-bold transition-all',
                  activeTab === tab ? 'text-foreground' : 'text-muted-foreground',
                )}
                style={activeTab === tab ? {
                  background: tab === 'mared' ? 'rgba(204,34,0,0.18)' : `${brandColor}18`,
                  border: `1px solid ${tab === 'mared' ? 'rgba(204,34,0,0.30)' : `${brandColor}30`}`,
                  color: tab === 'mared' ? '#cc2200' : brandColor,
                } : {}}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'fakka' ? '⚡ فكة' : '🔥 مارد'}
              </button>
            ))}
          </div>

          {/* شبكة الكروت — مفعّلة فقط إذا كان الاشتراك نشطاً */}
          <div className="grid grid-cols-2 gap-2">
            {visibleCards.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onSelect={handleCardSelect}
              />
            ))}
          </div>
        </div>

        {/* ─── فاصل ─── */}
        <div className="h-px bg-border" />

        {/* ─── قسم شحن من الرصيد ─── */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
            شحن من رصيد أنا فودافون
          </p>
          <button
            onClick={() => {
              if (!isSubActive) {
                toast.error('اشتراكك غير مفعّل', {
                  description: 'تواصل مع التاجر الخاص بك لتفعيل الاشتراك',
                  duration: 4000,
                });
                return;
              }
              navigate('/balance-charge');
            }}
            className={cn(
              'group relative flex items-center gap-4 p-4 rounded-2xl border border-border bg-card w-full text-right overflow-hidden transition-all',
              !isSubActive ? 'opacity-40' : 'active:scale-95',
            )}
            style={{ borderColor: 'rgba(34,197,94,0.25)' }}
          >
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
              style={{ background: 'rgba(34,197,94,0.04)' }}
            />
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(34,197,94,0.10)' }}
            >
              <Battery className="w-6 h-6 text-success" />
            </div>
            <div className="flex-1 min-w-0 text-right">
              <p className="text-sm font-black">شحن من الرصيد</p>
              <p className="text-xs text-muted-foreground mt-0.5">تحويل رصيد أنا فودافون لخط آخر</p>
            </div>
            <ChevronLeft className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        </div>

      </div>
    </div>
  );
}
