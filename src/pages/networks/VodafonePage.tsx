// صفحة Vodafone RED — نظام الباقات الاحترافي الديناميكي
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, Wifi, Phone, Zap, Star, MessageCircle,
  Info, RefreshCw, Loader2, CheckCircle, Clock, Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import AppFooter from '@/components/common/AppFooter';
import { getRedPackages, calcPackageDiscount } from '@/lib/api';
import type { RedPackage } from '@/lib/api';
import { toast } from 'sonner';

// ── ثوابت ──────────────────────────────────────────────────────
const VF_RED   = '#E60000';
const VF_DARK  = '#B30000';

// ── رسالة الحالة ────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  available:   { label: 'متاحة',    color: '#00C896', bg: 'rgba(0,200,150,0.12)' },
  featured:    { label: 'مميزة',    color: '#F7C948', bg: 'rgba(247,201,72,0.12)' },
  coming_soon: { label: 'قريباً',   color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  disabled:    { label: 'غير متاح', color: '#888',    bg: 'rgba(136,136,136,0.10)' },
};

// ── كارت باقة واحدة ──────────────────────────────────────────────
function PackageCard({ pkg, onDetails, onSubscribe, onWhatsapp }: {
  pkg:         RedPackage;
  onDetails:   (p: RedPackage) => void;
  onSubscribe: (p: RedPackage) => void;
  onWhatsapp:  (p: RedPackage) => void;
}) {
  const { pct, currentPrice, originalPrice } = calcPackageDiscount(pkg);
  const isFeatured = pkg.status === 'featured';
  const statusMeta = STATUS_META[pkg.status] ?? STATUS_META.available;

  return (
    <div
      className="relative rounded-3xl overflow-hidden flex flex-col"
      style={{
        background: isFeatured
          ? 'linear-gradient(145deg,rgba(230,0,0,0.20),rgba(0,0,0,0.85),rgba(180,0,0,0.14))'
          : 'linear-gradient(145deg,rgba(230,0,0,0.10),rgba(0,0,0,0.75),rgba(0,0,0,0.60))',
        border: isFeatured
          ? `2px solid rgba(230,0,0,0.60)`
          : '1.5px solid rgba(230,0,0,0.28)',
        boxShadow: isFeatured
          ? '0 8px 48px rgba(230,0,0,0.22), 0 2px 0 rgba(255,255,255,0.05) inset'
          : '0 4px 24px rgba(230,0,0,0.10)',
      }}
    >
      {/* ── Glow top ── */}
      <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: isFeatured ? 'linear-gradient(90deg,transparent,rgba(230,0,0,0.8),transparent)' : 'linear-gradient(90deg,transparent,rgba(230,0,0,0.3),transparent)' }} />

      {/* ── خصم Badge + حالة ── */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end z-10">
        {pct > 0 && (
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-white"
            style={{ background: 'linear-gradient(90deg,#E60000,#B30000)' }}>
            وفر {pct}%
          </span>
        )}
        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: statusMeta.bg, color: statusMeta.color, border: `1px solid ${statusMeta.color}40` }}>
          {statusMeta.label}
        </span>
      </div>

      {/* ── الجزء العلوي ── */}
      <div className="p-5 pb-3 flex-1">
        {/* أيقونة Vodafone RED */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg,rgba(230,0,0,0.30),rgba(180,0,0,0.18))', border: '1.5px solid rgba(230,0,0,0.45)' }}>
            <span className="text-xl font-black" style={{ color: VF_RED }}>VF</span>
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-black text-foreground">{pkg.name}</h3>
              {pkg.badge_label && (
                <Badge className="text-[9px] px-1.5 py-0 h-4 shrink-0"
                  style={{ background: isFeatured ? 'rgba(247,201,72,0.20)' : 'rgba(230,0,0,0.15)', color: isFeatured ? '#F7C948' : VF_RED, border: `1px solid ${isFeatured ? '#F7C94840' : 'rgba(230,0,0,0.35)'}` }}>
                  {pkg.badge_label}
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5 text-pretty line-clamp-2">{pkg.description}</p>
          </div>
        </div>

        {/* جيجا + دقائق */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="rounded-xl p-2.5 text-center"
            style={{ background: 'rgba(230,0,0,0.08)', border: '1px solid rgba(230,0,0,0.20)' }}>
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Wifi className="w-3 h-3" style={{ color: VF_RED }} />
              <span className="text-xs font-black" style={{ color: VF_RED }}>{pkg.data_gb}</span>
              <span className="text-[9px] text-muted-foreground">جيجا</span>
            </div>
            <p className="text-[9px] text-muted-foreground">إنترنت عالي السرعة</p>
          </div>
          <div className="rounded-xl p-2.5 text-center"
            style={{ background: 'rgba(230,0,0,0.08)', border: '1px solid rgba(230,0,0,0.20)' }}>
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Phone className="w-3 h-3" style={{ color: VF_RED }} />
              <span className="text-xs font-black" style={{ color: VF_RED }}>{pkg.minutes >= 1000 ? `${(pkg.minutes / 1000).toFixed(pkg.minutes % 1000 === 0 ? 0 : 1)}k` : pkg.minutes}</span>
              <span className="text-[9px] text-muted-foreground">دقيقة</span>
            </div>
            <p className="text-[9px] text-muted-foreground">على جميع الشبكات</p>
          </div>
        </div>

        {/* وسام تجديد تلقائي */}
        <div className="flex items-center gap-1.5 mb-4">
          <RefreshCw className="w-3 h-3" style={{ color: VF_RED }} />
          <span className="text-[10px] font-semibold" style={{ color: VF_RED }}>تجديد تلقائي شهري</span>
        </div>

        {/* السعر */}
        <div className="flex items-end gap-2 mb-1">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-foreground">{currentPrice}</span>
              <span className="text-xs text-muted-foreground">جنيه/شهر</span>
            </div>
            {pct > 0 && (
              <span className="text-[10px] text-muted-foreground line-through">{originalPrice} جنيه</span>
            )}
          </div>
          {pct > 0 && (
            <div className="flex items-center gap-1 mb-1 text-[10px] font-bold"
              style={{ color: '#00C896' }}>
              <Zap className="w-3 h-3" />
              وفرت {originalPrice - currentPrice} جنيه
            </div>
          )}
        </div>
      </div>

      {/* ── أزرار ── */}
      <div className="px-4 pb-4 space-y-2">
        {pkg.subscription_enabled && pkg.status !== 'coming_soon' && pkg.status !== 'disabled' ? (
          <button
            onClick={() => onSubscribe(pkg)}
            className="w-full h-10 rounded-xl text-sm font-black text-white transition-all active:scale-[0.97] flex items-center justify-center gap-2"
            style={{ background: `linear-gradient(90deg,${VF_RED},${VF_DARK})` }}>
            <CheckCircle className="w-4 h-4" />
            اشترك الآن
          </button>
        ) : (
          <button
            disabled
            className="w-full h-10 rounded-xl text-sm font-semibold text-muted-foreground flex items-center justify-center gap-2 cursor-not-allowed"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {pkg.status === 'coming_soon' ? <><Clock className="w-4 h-4" />قريباً</> : <><Lock className="w-4 h-4" />غير متاح</>}
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onDetails(pkg)}
            className="h-9 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-[0.97]"
            style={{ background: 'rgba(230,0,0,0.08)', border: '1px solid rgba(230,0,0,0.20)', color: VF_RED }}>
            <Info className="w-3.5 h-3.5" />
            تفاصيل الباقة
          </button>
          <button
            onClick={() => onWhatsapp(pkg)}
            className="h-9 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-[0.97]"
            style={{ background: 'rgba(37,211,102,0.10)', border: '1px solid rgba(37,211,102,0.25)', color: '#25d366' }}>
            <MessageCircle className="w-3.5 h-3.5" />
            واتساب
          </button>
        </div>
      </div>
    </div>
  );
}

// ── الصفحة الرئيسية ──────────────────────────────────────────────
export default function VodafonePage() {
  const navigate = useNavigate();
  const [packages, setPackages]   = useState<RedPackage[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    getRedPackages()
      .then(setPackages)
      .catch(() => toast.error('تعذّر تحميل الباقات'))
      .finally(() => setLoading(false));
  }, []);

  const handleDetails   = (p: RedPackage) => navigate(`/networks/vodafone/package/${p.id}`);
  const handleSubscribe = (p: RedPackage) => navigate(`/networks/vodafone/subscribe/${p.id}`);
  const handleWhatsapp  = (p: RedPackage) => {
    const url = p.whatsapp_link || `https://wa.me/?text=أريد الاشتراك في ${encodeURIComponent(p.name)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen pb-6 page-enter" dir="rtl">

      {/* ══ Header ══════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-b-3xl mb-4"
        style={{ background: 'linear-gradient(135deg,rgba(230,0,0,0.22),rgba(180,0,0,0.10),rgba(0,0,0,0.88))', borderBottom: '1.5px solid rgba(230,0,0,0.30)' }}>
        {/* Glow */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 70% 80% at 15% 50%,rgba(230,0,0,0.14),transparent)' }} />
        <div className="relative px-4 pt-5 pb-6">
          <Button variant="ghost" size="sm" className="mb-4 gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => navigate('/networks')}>
            <ChevronRight className="w-4 h-4" />
            الشبكات
          </Button>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black"
              style={{ background: 'linear-gradient(135deg,rgba(230,0,0,0.30),rgba(180,0,0,0.18))', border: '2px solid rgba(230,0,0,0.50)' }}>
              <span style={{ color: VF_RED }}>VF</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-foreground">Vodafone</h1>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-white"
                  style={{ background: `linear-gradient(90deg,${VF_RED},${VF_DARK})` }}>
                  RED
                </span>
              </div>
              <p className="text-sm font-bold" style={{ color: VF_RED }}>باقات خطوط الأفراد</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">اشترك وادفع شهرياً — تجديد تلقائي</p>
            </div>
          </div>
        </div>
      </div>

      {/* ══ شرح سريع ══ */}
      <div className="px-4 mb-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {[
            { icon: RefreshCw,  label: 'تجديد تلقائي' },
            { icon: Star,       label: 'دعم مميز' },
            { icon: Zap,        label: 'تفعيل فوري' },
            { icon: CheckCircle,label: 'بدون عقود' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 shrink-0"
              style={{ background: 'rgba(230,0,0,0.08)', border: '1px solid rgba(230,0,0,0.18)' }}>
              <Icon className="w-3 h-3" style={{ color: VF_RED }} />
              <span className="text-[10px] font-semibold" style={{ color: VF_RED }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══ الباقات ══ */}
      <div className="px-4 space-y-4">
        <div className="flex items-center gap-2">
          <Wifi className="w-4 h-4" style={{ color: VF_RED }} />
          <h2 className="text-sm font-black text-foreground">باقات Vodafone RED</h2>
          {!loading && (
            <span className="text-[10px] text-muted-foreground">({packages.length} باقة)</span>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-7 h-7 animate-spin" style={{ color: VF_RED }} />
            <p className="text-sm text-muted-foreground">جارٍ تحميل الباقات…</p>
          </div>
        ) : packages.length === 0 ? (
          <div className="rounded-2xl p-8 text-center"
            style={{ background: 'rgba(230,0,0,0.06)', border: '1.5px solid rgba(230,0,0,0.18)' }}>
            <Wifi className="w-10 h-10 mx-auto mb-3 opacity-40" style={{ color: VF_RED }} />
            <p className="text-sm font-bold text-foreground">لا توجد باقات متاحة حالياً</p>
            <p className="text-[11px] text-muted-foreground mt-1">سيتم إضافة الباقات قريباً</p>
          </div>
        ) : (
          <div className="space-y-4">
            {packages.map(pkg => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                onDetails={handleDetails}
                onSubscribe={handleSubscribe}
                onWhatsapp={handleWhatsapp}
              />
            ))}
          </div>
        )}
      </div>

      <AppFooter />
    </div>
  );
}


