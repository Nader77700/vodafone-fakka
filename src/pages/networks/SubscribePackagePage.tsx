// صفحة الاشتراك في الباقة — Phase 3 (رسالة واتساب احترافية كاملة)
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronRight, Wifi, Phone, MessageCircle, CheckCircle,
  Loader2, User, Phone as PhoneIcon, Calendar, AlertCircle,
  ArrowLeft, Hash, Package, Network,
} from 'lucide-react';
import AppFooter from '@/components/common/AppFooter';
import { getRedPackageById, calcPackageDiscount } from '@/lib/api';
import type { RedPackage } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { buildRedWhatsAppUrl, validateRedSubscription } from '@/lib/redWhatsApp';
import { toast } from 'sonner';
import { formatEgyptDate } from '@/lib/egyptTime';

const VF_RED  = '#E60000';
const VF_DARK = '#B30000';

export default function SubscribePackagePage() {
  const { id }                  = useParams<{ id: string }>();
  const navigate                = useNavigate();
  const { user, profile }       = useAuth();
  const [pkg, setPkg]           = useState<RedPackage | null>(null);
  const [loading, setLoading]   = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) { navigate('/networks/vodafone'); return; }
    getRedPackageById(id)
      .then(p => {
        if (!p) {
          toast.error('الباقة غير موجودة');
          navigate('/networks/vodafone');
        } else {
          setPkg(p);
        }
      })
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const userInfo = {
    userId:   user?.id         ?? '',
    fullName: profile?.full_name,
    username: profile?.username,
    phone:    profile?.phone,
  };

  const { ok: allOk, errors: failures } = validateRedSubscription(pkg, user ? userInfo : null);

  const cardColor = pkg?.card_color        || VF_RED;
  const darkColor = pkg?.color_secondary   || VF_DARK;

  const handleSubscribe = () => {
    if (!allOk) { failures.forEach(e => toast.error(e)); return; }
    if (!pkg || !user) return;
    setSubmitting(true);
    const url = buildRedWhatsAppUrl(pkg, userInfo);
    window.open(url, '_blank', 'noopener,noreferrer');
    setSubmitting(false);
    toast.success(pkg.post_subscription_msg || 'تم فتح واتساب — أرسل الرسالة لتفعيل الباقة ✅');
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
    </div>
  );
  if (!pkg) return null;

  const { currentPrice, originalPrice, pct } = calcPackageDiscount(pkg);
  const userName = profile?.full_name || profile?.username;

  return (
    <div className="min-h-screen pb-6 page-enter" dir="rtl">

      {/* ══ Header ══ */}
      <div className="relative overflow-hidden rounded-b-3xl mb-4"
        style={{ background: `linear-gradient(135deg,${cardColor}38,rgba(0,0,0,0.88))`, borderBottom: `1.5px solid ${cardColor}59` }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse 70% 80% at 15% 50%,${cardColor}26,transparent)` }} />
        <div className="relative px-4 pt-5 pb-6">
          <button className="mb-4 flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground transition-colors"
            onClick={() => navigate(`/networks/vodafone/package/${pkg.id}`)}>
            <ChevronRight className="w-4 h-4" />تفاصيل الباقة
          </button>
          <h1 className="text-xl font-black text-foreground">الاشتراك في الباقة</h1>
          <p className="text-[11px] text-muted-foreground mt-1">راجع بياناتك ثم أرسل الطلب عبر واتساب</p>
        </div>
      </div>

      <div className="px-4 space-y-4">

        {/* ══ رسالة قبل الاشتراك ══ */}
        {pkg.pre_subscription_msg && pkg.show_fields?.pre_msg !== false && (
          <div className="rounded-xl p-3 flex items-start gap-2"
            style={{ background: `${cardColor}14`, border: `1px solid ${cardColor}38` }}>
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: cardColor }} />
            <p className="text-[11px] text-foreground">{pkg.pre_subscription_msg}</p>
          </div>
        )}

        {/* ══ ملخص الباقة ══ */}
        <div className="rounded-2xl p-4"
          style={{ background: `linear-gradient(135deg,${cardColor}1e,rgba(0,0,0,0.65))`, border: `1.5px solid ${cardColor}4d` }}>
          <p className="text-[10px] font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
            <Package className="w-3 h-3" />الباقة المختارة
          </p>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${cardColor}33`, border: `1.5px solid ${cardColor}66` }}>
              <span className="text-sm font-black" style={{ color: cardColor }}>VF</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-foreground">{pkg.name}</p>
              {pkg.network_name && (
                <div className="flex items-center gap-1">
                  <Network className="w-3 h-3" style={{ color: cardColor }} />
                  <span className="text-[10px] font-semibold" style={{ color: cardColor }}>{pkg.network_name}</span>
                </div>
              )}
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Wifi className="w-3 h-3" />{pkg.data_gb} GB
                </span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Phone className="w-3 h-3" />{pkg.minutes} دقيقة
                </span>
                {pkg.duration && (
                  <span className="text-[10px] text-muted-foreground">{pkg.duration}</span>
                )}
              </div>
            </div>
            <div className="text-left shrink-0">
              <p className="text-lg font-black text-foreground">{currentPrice}</p>
              {pct > 0 && <p className="text-[9px] text-muted-foreground line-through">{originalPrice}</p>}
              <p className="text-[9px] text-muted-foreground">جنيه/شهر</p>
            </div>
          </div>
        </div>

        {/* ══ بيانات المستخدم — التحقق ══ */}
        <div className="rounded-2xl p-4 space-y-3"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-xs font-bold text-foreground flex items-center gap-2">
            <User className="w-3.5 h-3.5" style={{ color: '#a78bfa' }} />بيانات الحساب
          </p>

          {/* الاسم */}
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5"
            style={{ background: userName ? 'rgba(0,200,150,0.06)' : 'rgba(230,0,0,0.06)', border: `1px solid ${userName ? 'rgba(0,200,150,0.20)' : 'rgba(230,0,0,0.20)'}` }}>
            <User className="w-3.5 h-3.5 shrink-0" style={{ color: userName ? '#00C896' : VF_RED }} />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-muted-foreground">الاسم</p>
              <p className="text-[11px] font-bold text-foreground truncate">{userName || '⚠ غير محدد'}</p>
            </div>
            {userName ? <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: '#00C896' }} />
                      : <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: VF_RED }} />}
          </div>

          {/* الهاتف */}
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5"
            style={{ background: profile?.phone ? 'rgba(0,200,150,0.06)' : 'rgba(230,0,0,0.06)', border: `1px solid ${profile?.phone ? 'rgba(0,200,150,0.20)' : 'rgba(230,0,0,0.20)'}` }}>
            <PhoneIcon className="w-3.5 h-3.5 shrink-0" style={{ color: profile?.phone ? '#00C896' : VF_RED }} />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-muted-foreground">رقم الهاتف</p>
              <p className="text-[11px] font-bold text-foreground truncate">{profile?.phone || '⚠ غير محدد'}</p>
            </div>
            {profile?.phone ? <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: '#00C896' }} />
                            : <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: VF_RED }} />}
          </div>

          {/* معرف المستخدم */}
          {user && (
            <div className="flex items-center gap-3 rounded-xl px-3 py-2.5"
              style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.20)' }}>
              <Hash className="w-3.5 h-3.5 shrink-0" style={{ color: '#a78bfa' }} />
              <div className="flex-1 min-w-0">
                <p className="text-[9px] text-muted-foreground">معرف المستخدم</p>
                <p className="text-[10px] font-mono text-foreground truncate">{user.id}</p>
              </div>
              <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: '#00C896' }} />
            </div>
          )}

          {/* تاريخ الطلب */}
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <Calendar className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-muted-foreground">تاريخ الطلب</p>
              <p className="text-[11px] font-bold text-foreground">{formatEgyptDate(new Date().toISOString())}</p>
            </div>
          </div>

          {/* مشاكل التحقق */}
          {failures.length > 0 && (
            <div className="space-y-1.5">
              {failures.map((msg, i) => (
                <div key={i} className="flex items-start gap-2 rounded-xl p-2.5"
                  style={{ background: 'rgba(230,0,0,0.08)', border: '1px solid rgba(230,0,0,0.22)' }}>
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: VF_RED }} />
                  <p className="text-[10px] text-muted-foreground">{msg}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ══ شروط مختصرة ══ */}
        {pkg.show_fields?.terms !== false && pkg.terms.length > 0 && (
          <div className="rounded-2xl p-4"
            style={{ background: `${cardColor}0a`, border: `1px solid ${cardColor}26` }}>
            <p className="text-[10px] font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3" style={{ color: cardColor }} />شروط الاشتراك
            </p>
            <ul className="space-y-1.5">
              {pkg.terms.slice(0, 4).map((t, i) => (
                <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1.5">
                  <span style={{ color: cardColor }}>•</span>{t}
                </li>
              ))}
              {pkg.terms.length > 4 && (
                <li className="text-[10px]" style={{ color: cardColor }}>+{pkg.terms.length - 4} شروط أخرى…</li>
              )}
            </ul>
          </div>
        )}

        {/* ══ الأزرار ══ */}
        <div className="space-y-2 pt-2 pb-4">
          <button
            onClick={handleSubscribe}
            disabled={!allOk || submitting}
            className="w-full h-12 rounded-xl text-base font-black text-white transition-all active:scale-[0.97] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: `linear-gradient(90deg,${cardColor},${darkColor})` }}>
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircle className="w-5 h-5" />}
            {submitting ? 'جارٍ الإرسال…' : 'إرسال الطلب عبر واتساب'}
          </button>

          {failures.some(e => e.includes('اسم') || e.includes('هاتف')) && (
            <button
              onClick={() => navigate('/settings')}
              className="w-full h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
              style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.30)', color: '#a78bfa' }}>
              إكمال بيانات الحساب
            </button>
          )}

          <button
            onClick={() => navigate(`/networks/vodafone/package/${pkg.id}`)}
            className="w-full h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 text-muted-foreground transition-all active:scale-[0.97]"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <ArrowLeft className="w-4 h-4" />العودة للتفاصيل
          </button>
        </div>
      </div>
      <AppFooter />
    </div>
  );
}
