// صفحة تفاصيل الباقة — PHASE 6
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronRight, Wifi, Phone, Zap, Star, MessageCircle,
  CheckCircle, RefreshCw, Loader2, AlertCircle, Shield,
  FileText, Info, Clock, Lock, ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import AppFooter from '@/components/common/AppFooter';
import { getRedPackageById, calcPackageDiscount } from '@/lib/api';
import type { RedPackage } from '@/lib/api';
import { toast } from 'sonner';

const VF_RED  = '#E60000';
const VF_DARK = '#B30000';

const STATUS_META: Record<string, { label: string; color: string }> = {
  available:   { label: 'متاحة',    color: '#00C896' },
  featured:    { label: 'مميزة',    color: '#F7C948' },
  coming_soon: { label: 'قريباً',   color: '#a78bfa' },
  disabled:    { label: 'غير متاح', color: '#888'    },
};

export default function PackageDetailPage() {
  const { id }          = useParams<{ id: string }>();
  const navigate        = useNavigate();
  const [pkg, setPkg]   = useState<RedPackage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { navigate('/networks/vodafone'); return; }
    getRedPackageById(id)
      .then(p => {
        if (!p) { toast.error('الباقة غير موجودة'); navigate('/networks/vodafone'); }
        else setPkg(p);
      })
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: VF_RED }} />
        <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
      </div>
    );
  }

  if (!pkg) return null;

  const { pct, currentPrice, originalPrice, savings } = calcPackageDiscount(pkg);
  const statusMeta = STATUS_META[pkg.status] ?? STATUS_META.available;
  const canSubscribe = pkg.subscription_enabled && pkg.status !== 'coming_soon' && pkg.status !== 'disabled';

  return (
    <div className="min-h-screen pb-6 page-enter" dir="rtl">

      {/* ══ Header ══ */}
      <div className="relative overflow-hidden rounded-b-3xl mb-4"
        style={{ background: 'linear-gradient(135deg,rgba(230,0,0,0.22),rgba(0,0,0,0.88))', borderBottom: '1.5px solid rgba(230,0,0,0.35)' }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 70% 80% at 15% 50%,rgba(230,0,0,0.15),transparent)' }} />
        <div className="relative px-4 pt-5 pb-6">
          <Button variant="ghost" size="sm" className="mb-4 gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => navigate('/networks/vodafone')}>
            <ChevronRight className="w-4 h-4" />
            الباقات
          </Button>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black"
              style={{ background: 'linear-gradient(135deg,rgba(230,0,0,0.30),rgba(180,0,0,0.18))', border: '2px solid rgba(230,0,0,0.50)' }}>
              <span style={{ color: VF_RED }}>VF</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black text-foreground">{pkg.name}</h1>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                  style={{ color: statusMeta.color, background: `${statusMeta.color}18`, border: `1px solid ${statusMeta.color}40` }}>
                  {statusMeta.label}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 text-pretty">{pkg.description}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 space-y-4">

        {/* ══ إحصائيات الباقة ══ */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl p-4 text-center"
            style={{ background: 'linear-gradient(135deg,rgba(230,0,0,0.12),rgba(0,0,0,0.60))', border: '1.5px solid rgba(230,0,0,0.28)' }}>
            <Wifi className="w-6 h-6 mx-auto mb-1" style={{ color: VF_RED }} />
            <p className="text-2xl font-black text-foreground">{pkg.data_gb}</p>
            <p className="text-[10px] text-muted-foreground">جيجابايت</p>
            <p className="text-[9px] font-semibold mt-0.5" style={{ color: VF_RED }}>إنترنت عالي السرعة</p>
          </div>
          <div className="rounded-2xl p-4 text-center"
            style={{ background: 'linear-gradient(135deg,rgba(230,0,0,0.12),rgba(0,0,0,0.60))', border: '1.5px solid rgba(230,0,0,0.28)' }}>
            <Phone className="w-6 h-6 mx-auto mb-1" style={{ color: VF_RED }} />
            <p className="text-2xl font-black text-foreground">{pkg.minutes >= 1000 ? `${(pkg.minutes / 1000).toFixed(1)}K` : pkg.minutes}</p>
            <p className="text-[10px] text-muted-foreground">دقيقة</p>
            <p className="text-[9px] font-semibold mt-0.5" style={{ color: VF_RED }}>على جميع الشبكات</p>
          </div>
        </div>

        {/* ══ بطاقة السعر ══ */}
        <div className="rounded-2xl p-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1.5px solid rgba(230,0,0,0.22)' }}>
          <p className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5" style={{ color: VF_RED }} />السعر والعروض
          </p>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-black text-foreground">{currentPrice}
                <span className="text-sm font-medium text-muted-foreground mr-1">جنيه</span>
              </p>
              <p className="text-xs text-muted-foreground">شهرياً — تجديد تلقائي</p>
            </div>
            <div className="text-left">
              {pct > 0 && (
                <>
                  <p className="text-[11px] text-muted-foreground line-through">{originalPrice} جنيه</p>
                  <p className="text-sm font-black" style={{ color: '#00C896' }}>وفرت {savings} جنيه</p>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-white"
                    style={{ background: `linear-gradient(90deg,${VF_RED},${VF_DARK})` }}>
                    خصم {pct}%
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ══ المميزات ══ */}
        {pkg.features.length > 0 && (
          <div className="rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs font-bold text-foreground mb-3 flex items-center gap-2">
              <Star className="w-3.5 h-3.5" style={{ color: '#F7C948' }} />مميزات الباقة
            </p>
            <ul className="space-y-2">
              {pkg.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: '#00C896' }} />
                  <span className="text-[11px] text-foreground">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ══ المتطلبات ══ */}
        {pkg.requirements.length > 0 && (
          <div className="rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs font-bold text-foreground mb-3 flex items-center gap-2">
              <Shield className="w-3.5 h-3.5" style={{ color: '#a78bfa' }} />المتطلبات
            </p>
            <ul className="space-y-2">
              {pkg.requirements.map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: '#a78bfa' }} />
                  <span className="text-[11px] text-foreground">{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ══ شروط الاشتراك ══ */}
        {pkg.terms.length > 0 && (
          <div className="rounded-2xl p-4"
            style={{ background: 'rgba(230,0,0,0.04)', border: '1px solid rgba(230,0,0,0.18)' }}>
            <p className="text-xs font-bold text-foreground mb-3 flex items-center gap-2">
              <FileText className="w-3.5 h-3.5" style={{ color: VF_RED }} />شروط الاشتراك
            </p>
            <ul className="space-y-2">
              {pkg.terms.map((t, i) => (
                <li key={i} className="flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: VF_RED }} />
                  <span className="text-[11px] text-foreground">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ══ طريقة الاشتراك ══ */}
        {pkg.subscription_method && (
          <div className="rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-2">
              <Info className="w-3.5 h-3.5" style={{ color: '#00C896' }} />طريقة الاشتراك
            </p>
            <p className="text-[11px] text-muted-foreground">{pkg.subscription_method}</p>
          </div>
        )}

        {/* ══ بيانات الدعم ══ */}
        <div className="rounded-2xl p-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-2">
            <MessageCircle className="w-3.5 h-3.5" style={{ color: '#25d366' }} />الدعم والتواصل
          </p>
          <p className="text-[11px] text-muted-foreground">للاشتراك أو الاستفسار تواصل معنا عبر واتساب وسيتم تفعيل الباقة فور استلام الطلب.</p>
        </div>

        {/* ══ الأزرار ══ */}
        <div className="space-y-2 pt-2 pb-4">
          {canSubscribe ? (
            <button
              onClick={() => navigate(`/networks/vodafone/subscribe/${pkg.id}`)}
              className="w-full h-12 rounded-xl text-base font-black text-white transition-all active:scale-[0.97] flex items-center justify-center gap-2"
              style={{ background: `linear-gradient(90deg,${VF_RED},${VF_DARK})` }}>
              <CheckCircle className="w-5 h-5" />
              اشترك الآن
            </button>
          ) : (
            <button disabled
              className="w-full h-12 rounded-xl text-base font-semibold text-muted-foreground flex items-center justify-center gap-2 cursor-not-allowed"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {pkg.status === 'coming_soon' ? <><Clock className="w-5 h-5" />قريباً</> : <><Lock className="w-5 h-5" />غير متاح</>}
            </button>
          )}
          <button
            onClick={() => {
              const url = pkg.whatsapp_link || `https://wa.me/?text=${encodeURIComponent(`أريد الاشتراك في ${pkg.name}`)}`;
              window.open(url, '_blank', 'noopener,noreferrer');
            }}
            className="w-full h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
            style={{ background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.30)', color: '#25d366' }}>
            <MessageCircle className="w-4 h-4" />
            تواصل عبر واتساب
          </button>
          <button
            onClick={() => navigate('/networks/vodafone')}
            className="w-full h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 text-muted-foreground transition-all active:scale-[0.97]"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <ArrowLeft className="w-4 h-4" />
            العودة للباقات
          </button>
        </div>
      </div>

      <AppFooter />
    </div>
  );
}
