// ─── صفحة تفاصيل عرض eSIM ──────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft, Wifi, Shield, ShieldOff, Zap, Clock,
  Globe, Smartphone, CheckCircle, Star, MessageCircle,
  QrCode, Tag,
} from 'lucide-react';
import type { ESimOffer, ESimSettings } from '@/types/esim';
import { getESimOffer, getESimSettings } from '@/lib/esimApi';
import { fmtDateAr } from '@/lib/formatUtils';

const BLUE = '#1E6FFF';

function InfoRow({ label, value, icon: Icon, color }: { label: string; value: string; icon?: React.ElementType; color?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b"
      style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
        <span className="text-[12px] text-muted-foreground">{label}</span>
      </div>
      <span className="text-[12px] font-bold" style={{ color: color ?? undefined }}>{value}</span>
    </div>
  );
}

const ACTIVATION_STEPS = [
  { n: 1, text: 'قم بشراء العرض عبر زر واتساب أدناه' },
  { n: 2, text: 'تواصل مع فريق الدعم الفني' },
  { n: 3, text: 'استلم QR Code الخاص بشريحتك' },
  { n: 4, text: 'افتح إعدادات الهاتف وامسح QR Code' },
  { n: 5, text: 'اضغط تفعيل وانتظر ثوانٍ قليلة' },
  { n: 6, text: 'شريحتك تعمل مباشرة بدون VPN ✅' },
];

export default function ESimDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [offer, setOffer] = useState<ESimOffer | null>(null);
  const [settings, setSettings] = useState<ESimSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([getESimOffer(id), getESimSettings()]).then(([o, s]) => {
      setOffer(o);
      setSettings(s);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: `${BLUE}40`, borderTopColor: BLUE }} />
      </div>
    );
  }

  if (!offer) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6" dir="rtl">
        <Wifi className="w-12 h-12 text-muted-foreground" />
        <p className="text-base font-bold text-muted-foreground">لم يتم العثور على العرض</p>
        <button onClick={() => navigate('/networks/esim')}
          className="px-4 py-2 rounded-xl text-sm font-bold"
          style={{ background: `${BLUE}20`, border: `1px solid ${BLUE}40`, color: BLUE }}>
          العودة
        </button>
      </div>
    );
  }

  const waNumber = settings?.whatsapp_number ?? '201222692182';
  const waMsg = encodeURIComponent(
    `أرغب في شراء عرض ${offer.title} بسعر ${offer.price} جنيه\nبرجاء إرسال تفاصيل الطلب.`
  );
  const waUrl = `https://wa.me/${waNumber}?text=${waMsg}`;

  return (
    <div className="min-h-screen pb-24 page-enter" dir="rtl">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${BLUE}15`, border: `1px solid ${BLUE}30` }}>
          <ChevronLeft className="w-4 h-4" style={{ color: BLUE }} />
        </button>
        <h1 className="text-base font-black text-foreground text-balance flex-1 min-w-0 truncate">
          {offer.title}
        </h1>
        {offer.is_featured && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black shrink-0"
            style={{ background: 'rgba(255,215,0,0.15)', border: '1px solid rgba(255,215,0,0.4)', color: '#FFD700' }}>
            <Star className="w-2.5 h-2.5" /> مميز
          </span>
        )}
      </div>

      <div className="px-4 space-y-4">
        {/* بطاقة الصورة والسعر */}
        <div className="rounded-2xl overflow-hidden"
          style={{
            background: `linear-gradient(135deg,${BLUE}15,${BLUE}08)`,
            border: `1.5px solid ${BLUE}40`,
            boxShadow: `0 4px 24px ${BLUE}20`,
          }}>
          <div className="h-px w-full" style={{ background: `linear-gradient(90deg,transparent,${BLUE}80,transparent)` }} />

          {/* صورة كبيرة */}
          <div className="w-full h-44 flex items-center justify-center overflow-hidden"
            style={{ background: `${BLUE}10` }}>
            {offer.image ? (
              <img src={offer.image} alt={offer.title} className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Wifi className="w-16 h-16" style={{ color: BLUE, opacity: 0.6 }} />
                <span className="text-2xl font-black" style={{ color: BLUE }}>{offer.data_size}</span>
              </div>
            )}
          </div>

          <div className="p-4 space-y-3">
            <div>
              <h2 className="text-xl font-black text-foreground">{offer.title}</h2>
              <p className="text-[12px] text-muted-foreground mt-1 text-pretty">{offer.description}</p>
            </div>

            {/* السعر */}
            {settings?.show_prices && (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-2xl font-black" style={{ color: BLUE }}>{offer.price} جنيه</span>
                {settings.show_discounts && offer.old_price && (
                  <span className="text-base line-through text-muted-foreground">{offer.old_price} جنيه</span>
                )}
                {settings.show_discounts && offer.discount && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-black"
                    style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                    وفّر {offer.discount}%
                  </span>
                )}
              </div>
            )}

            {/* مميزات سريعة */}
            {offer.features.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {offer.features.map(f => (
                  <span key={f} className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold"
                    style={{ background: `${BLUE}15`, border: `1px solid ${BLUE}30`, color: BLUE }}>
                    <CheckCircle className="w-2.5 h-2.5" /> {f}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* مواصفات الشريحة */}
        <div className="rounded-2xl p-4 space-y-1"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-[11px] font-black text-muted-foreground uppercase tracking-wider mb-2">مواصفات الشريحة</p>
          <InfoRow label="نوع الشريحة"       value="eSIM إلكترونية"           icon={Smartphone} color={BLUE} />
          <InfoRow label="حجم البيانات"       value={offer.data_size}          icon={Wifi} color={BLUE} />
          <InfoRow label="مدة الصلاحية"       value={offer.duration}           icon={Clock} />
          <InfoRow label="الدولة"             value={offer.country}            icon={Globe} />
          <InfoRow label="أعلى سرعة"         value={offer.speed}              icon={Zap} color={BLUE} />
          <InfoRow label="يحتاج VPN"         value="لا — تعمل مباشرة"        icon={CheckCircle} color="#22c55e" />
          <InfoRow label="التفعيل"            value="فوري بعد مسح QR Code"    icon={QrCode} />
          <InfoRow label="تاريخ الإضافة"     value={fmtDateAr(offer.created_at)} />
          {offer.supported_networks.length > 0 && (
            <InfoRow label="الشبكات المدعومة" value={offer.supported_networks.join(' · ')} />
          )}
        </div>

        {/* الضمان */}
        <div className="rounded-2xl p-4 flex items-center gap-3"
          style={{
            background: offer.warranty ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
            border: `1.5px solid ${offer.warranty ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
          }}>
          {offer.warranty
            ? <Shield className="w-6 h-6 text-success shrink-0" />
            : <ShieldOff className="w-6 h-6 text-destructive shrink-0" />}
          <div>
            <p className={`text-sm font-black ${offer.warranty ? 'text-success' : 'text-destructive'}`}>
              {offer.warranty ? '✅ يوجد ضمان' : '❌ لا يوجد ضمان'}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {offer.warranty
                ? 'هذا العرض مضمون — في حال وجود أي مشكلة يتم الاستبدال أو الاسترجاع'
                : 'هذا العرض لا يشمل ضماناً — للاستفسار تواصل معنا'}
            </p>
          </div>
          {offer.warranty && (
            <div className="mr-auto shrink-0">
              <Tag className="w-4 h-4 text-success" />
            </div>
          )}
        </div>

        {/* طريقة الاستلام */}
        <div className="rounded-2xl p-4 space-y-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2">
            <QrCode className="w-4 h-4" style={{ color: BLUE }} />
            <p className="text-sm font-black text-foreground">طريقة الاستلام</p>
          </div>
          <div className="space-y-2">
            {ACTIVATION_STEPS.map(step => (
              <div key={step.n} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-black"
                  style={{ background: `${BLUE}20`, border: `1px solid ${BLUE}40`, color: BLUE }}>
                  {step.n}
                </div>
                <p className="text-[12px] text-muted-foreground text-pretty">{step.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* معلومات الجهاز */}
        <div className="rounded-2xl p-4"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-[11px] font-black text-muted-foreground uppercase tracking-wider mb-2">الأجهزة المدعومة</p>
          <p className="text-[12px] text-muted-foreground text-pretty">
            تعمل على جميع الأجهزة الداعمة لـ eSIM مثل iPhone XS وأحدث، Samsung Galaxy S20 وأحدث،
            وجميع أجهزة Android الحديثة الداعمة لـ eSIM.
          </p>
        </div>
      </div>

      {/* زر واتساب ثابت */}
      {offer.whatsapp_enabled && (
        <div className="fixed bottom-0 left-0 right-0 p-4 z-40"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 70%, transparent)' }}>
          <a href={waUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 w-full py-3.5 rounded-2xl font-black text-base text-white transition-all active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg,#22c55e,#16a34a)',
              boxShadow: '0 4px 20px rgba(34,197,94,0.35)',
            }}>
            <MessageCircle className="w-5 h-5" />
            تواصل عبر WhatsApp لشراء العرض
          </a>
        </div>
      )}
    </div>
  );
}
