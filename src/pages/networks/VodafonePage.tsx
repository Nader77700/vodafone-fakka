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
import { useAuth } from '@/contexts/AuthContext';
import { buildRedWhatsAppUrl, buildRedWhatsAppQueryUrl, validateRedSubscription } from '@/lib/redWhatsApp';
import { toast } from 'sonner';

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  available:   { label: 'متاحة',    color: '#00C896', bg: 'rgba(0,200,150,0.12)' },
  featured:    { label: 'مميزة',    color: '#F7C948', bg: 'rgba(247,201,72,0.12)' },
  coming_soon: { label: 'قريباً',   color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  disabled:    { label: 'غير متاح', color: '#888',    bg: 'rgba(136,136,136,0.10)' },
};

function PackageCard({ pkg, onDetails, onSubscribe, onWhatsapp }: {
  pkg:         RedPackage;
  onDetails:   (p: RedPackage) => void;
  onSubscribe: (p: RedPackage) => void;
  onWhatsapp:  (p: RedPackage) => void;
  // onSubscribe → فتح واتساب مباشرة بالرسالة الاحترافية
  // onWhatsapp  → فتح واتساب للاستفسار
}) {
  const { pct, currentPrice, originalPrice } = calcPackageDiscount(pkg);
  const isFeatured = pkg.status === 'featured';
  const statusMeta = STATUS_META[pkg.status] ?? STATUS_META.available;
  const cardColor  = pkg.card_color  || '#E60000';
  const darkColor  = pkg.color_secondary || '#B30000';

  const sf = pkg.show_fields ?? { gb: true, minutes: true, duration: true, renewal: true, features: true };

  return (
    <div
      className="relative rounded-3xl overflow-hidden flex flex-col"
      style={{
        background: isFeatured
          ? `linear-gradient(145deg,${cardColor}33,rgba(0,0,0,0.85),${cardColor}22)`
          : `linear-gradient(145deg,${cardColor}19,rgba(0,0,0,0.75),rgba(0,0,0,0.60))`,
        border: isFeatured ? `2px solid ${cardColor}99` : `1.5px solid ${cardColor}47`,
        boxShadow: isFeatured ? `0 8px 48px ${cardColor}38` : `0 4px 24px ${cardColor}19`,
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: `linear-gradient(90deg,transparent,${cardColor}cc,transparent)` }} />

      <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end z-10">
        {pct > 0 && (
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-white"
            style={{ background: `linear-gradient(90deg,${cardColor},${darkColor})` }}>
            وفر {pct}%
          </span>
        )}
        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: statusMeta.bg, color: statusMeta.color, border: `1px solid ${statusMeta.color}40` }}>
          {statusMeta.label}
        </span>
      </div>

      <div className="p-5 pb-3 flex-1">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: `${cardColor}4d`, border: `1.5px solid ${cardColor}73` }}>
            <span className="text-xl font-black" style={{ color: cardColor }}>VF</span>
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-black text-foreground">{pkg.name}</h3>
              {pkg.badge_label && (
                <Badge className="text-[9px] px-1.5 py-0 h-4 shrink-0"
                  style={{ background: `${cardColor}26`, color: cardColor, border: `1px solid ${cardColor}59` }}>
                  {pkg.badge_label}
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5 text-pretty line-clamp-2">
              {pkg.short_description || pkg.description}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          {sf.gb !== false && (
            <div className="rounded-xl p-2.5 text-center"
              style={{ background: `${cardColor}14`, border: `1px solid ${cardColor}33` }}>
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <Wifi className="w-3 h-3" style={{ color: cardColor }} />
                <span className="text-xs font-black" style={{ color: cardColor }}>{pkg.data_gb}</span>
                <span className="text-[9px] text-muted-foreground">جيجا</span>
              </div>
              <p className="text-[9px] text-muted-foreground">إنترنت عالي السرعة</p>
            </div>
          )}
          {sf.minutes !== false && (
            <div className="rounded-xl p-2.5 text-center"
              style={{ background: `${cardColor}14`, border: `1px solid ${cardColor}33` }}>
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <Phone className="w-3 h-3" style={{ color: cardColor }} />
                <span className="text-xs font-black" style={{ color: cardColor }}>
                  {pkg.minutes >= 1000 ? `${(pkg.minutes/1000).toFixed(pkg.minutes%1000===0?0:1)}k` : pkg.minutes}
                </span>
                <span className="text-[9px] text-muted-foreground">دقيقة</span>
              </div>
              <p className="text-[9px] text-muted-foreground">على جميع الشبكات</p>
            </div>
          )}
        </div>

        {sf.renewal !== false && (
          <div className="flex items-center gap-1.5 mb-3">
            <RefreshCw className="w-3 h-3" style={{ color: cardColor }} />
            <span className="text-[10px] font-semibold" style={{ color: cardColor }}>
              {pkg.renewal_type || 'تجديد تلقائي شهري'}
            </span>
            {sf.duration !== false && pkg.duration && (
              <span className="text-[10px] text-muted-foreground">• {pkg.duration}</span>
            )}
          </div>
        )}

        <div className="flex items-end gap-2 mb-1">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-foreground">{currentPrice}</span>
              <span className="text-xs text-muted-foreground">جنيه/شهر</span>
            </div>
            {pct > 0 && <span className="text-[10px] text-muted-foreground line-through">{originalPrice} جنيه</span>}
          </div>
          {pct > 0 && (
            <div className="flex items-center gap-1 mb-1 text-[10px] font-bold" style={{ color: '#00C896' }}>
              <Zap className="w-3 h-3" />
              وفرت {originalPrice - currentPrice} جنيه
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pb-4 space-y-2">
        {pkg.subscription_enabled && pkg.status !== 'coming_soon' && pkg.status !== 'disabled' ? (
          <button
            onClick={() => onSubscribe(pkg)}
            className="w-full h-10 rounded-xl text-sm font-black text-white transition-all active:scale-[0.97] flex items-center justify-center gap-2"
            style={{ background: `linear-gradient(90deg,${cardColor},${darkColor})` }}>
            <CheckCircle className="w-4 h-4" />
            اشترك الآن
          </button>
        ) : (
          <button disabled
            className="w-full h-10 rounded-xl text-sm font-semibold text-muted-foreground flex items-center justify-center gap-2 cursor-not-allowed"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {pkg.status === 'coming_soon' ? <><Clock className="w-4 h-4" />قريباً</> : <><Lock className="w-4 h-4" />غير متاح</>}
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onDetails(pkg)}
            className="h-9 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-[0.97]"
            style={{ background: `${cardColor}14`, border: `1px solid ${cardColor}33`, color: cardColor }}>
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

export default function VodafonePage() {
  const navigate           = useNavigate();
  const { user, profile }  = useAuth();
  const [packages, setPackages] = useState<RedPackage[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    getRedPackages()
      .then(setPackages)
      .catch(() => toast.error('تعذّر تحميل الباقات'))
      .finally(() => setLoading(false));
  }, []);

  // زر تفاصيل الباقة → صفحة التفاصيل
  const handleDetails = (p: RedPackage) => navigate(`/networks/vodafone/package/${p.id}`);

  // زر اشترك الآن → واتساب مباشرة برسالة احترافية كاملة
  const handleSubscribe = (p: RedPackage) => {
    const userInfo = { userId: user?.id ?? '', fullName: profile?.full_name, username: profile?.username, phone: profile?.phone };
    const { ok, errors } = validateRedSubscription(p, user ? userInfo : null);
    if (!ok) { errors.forEach(e => toast.error(e)); return; }
    const url = buildRedWhatsAppUrl(p, userInfo);
    window.open(url, '_blank', 'noopener,noreferrer');
    toast.success(p.post_subscription_msg || 'تم فتح واتساب — أرسل الرسالة لتفعيل الباقة ✅');
  };

  // زر واتساب → واتساب استفسار
  const handleWhatsapp = (p: RedPackage) => {
    const url = buildRedWhatsAppQueryUrl(p);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen pb-6 page-enter" dir="rtl">
      <div className="relative overflow-hidden rounded-b-3xl mb-4"
        style={{ background: 'linear-gradient(135deg,rgba(230,0,0,0.22),rgba(180,0,0,0.10),rgba(0,0,0,0.88))', borderBottom: '1.5px solid rgba(230,0,0,0.30)' }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 70% 80% at 15% 50%,rgba(230,0,0,0.14),transparent)' }} />
        <div className="relative px-4 pt-5 pb-6">
          <Button variant="ghost" size="sm" className="mb-4 gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => navigate('/networks')}>
            <ChevronRight className="w-4 h-4" />الشبكات
          </Button>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black"
              style={{ background: 'linear-gradient(135deg,rgba(230,0,0,0.30),rgba(180,0,0,0.18))', border: '2px solid rgba(230,0,0,0.50)' }}>
              <span style={{ color: '#E60000' }}>VF</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-foreground">Vodafone</h1>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-white"
                  style={{ background: 'linear-gradient(90deg,#E60000,#B30000)' }}>RED</span>
              </div>
              <p className="text-sm font-bold" style={{ color: '#E60000' }}>باقات خطوط الأفراد</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">اشترك وادفع شهرياً — تجديد تلقائي</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 mb-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {[
            { icon: RefreshCw,   label: 'تجديد تلقائي' },
            { icon: Star,        label: 'دعم مميز' },
            { icon: Zap,         label: 'تفعيل فوري' },
            { icon: CheckCircle, label: 'بدون عقود' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 shrink-0"
              style={{ background: 'rgba(230,0,0,0.08)', border: '1px solid rgba(230,0,0,0.18)' }}>
              <Icon className="w-3 h-3" style={{ color: '#E60000' }} />
              <span className="text-[10px] font-semibold" style={{ color: '#E60000' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 space-y-4">
        <div className="flex items-center gap-2">
          <Wifi className="w-4 h-4" style={{ color: '#E60000' }} />
          <h2 className="text-sm font-black text-foreground">باقات Vodafone RED</h2>
          {!loading && <span className="text-[10px] text-muted-foreground">({packages.length} باقة)</span>}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-7 h-7 animate-spin" style={{ color: '#E60000' }} />
            <p className="text-sm text-muted-foreground">جارٍ تحميل الباقات…</p>
          </div>
        ) : packages.length === 0 ? (
          <div className="rounded-2xl p-8 text-center"
            style={{ background: 'rgba(230,0,0,0.06)', border: '1.5px solid rgba(230,0,0,0.18)' }}>
            <Wifi className="w-10 h-10 mx-auto mb-3 opacity-40" style={{ color: '#E60000' }} />
            <p className="text-sm font-bold text-foreground">لا توجد باقات متاحة حالياً</p>
            <p className="text-[11px] text-muted-foreground mt-1">سيتم إضافة الباقات قريباً</p>
          </div>
        ) : (
          <div className="space-y-4">
            {packages.map(pkg => (
              <PackageCard key={pkg.id} pkg={pkg}
                onDetails={handleDetails} onSubscribe={handleSubscribe} onWhatsapp={handleWhatsapp} />
            ))}
          </div>
        )}
      </div>
      <AppFooter />
    </div>
  );
}
