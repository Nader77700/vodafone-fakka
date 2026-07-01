<<<<<<< HEAD
// الشاشة الرئيسية لعميل التاجر — مُبسَّطة: قسمان فقط
// قسم 1: كروت فودافون كاش | قسم 2: شحن من الرصيد
// لا توجد أي عناصر إضافية (لا دعم، لا إشعارات، لا إعدادات)
import { useNavigate } from 'react-router-dom';
import { useMerchantClient } from '@/contexts/MerchantClientContext';
import { useAuth } from '@/contexts/AuthContext';
import { Wifi, Battery, ChevronLeft, Building2 } from 'lucide-react';

export default function MerchantClientHome() {
  const navigate   = useNavigate();
  const { data }   = useMerchantClient();
  const { profile } = useAuth();

  const brandColor = data?.merchant?.brand_color ?? '#E60000';
  const sub        = data?.subscription;
  const opsLeft    = sub?.ops_remaining !== null && sub?.ops_remaining !== undefined
    ? sub.ops_remaining
    : null;

  return (
    <div className="flex flex-col min-h-screen bg-background" dir="rtl">
      {/* ─── خلفية ضوئية ─── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className="absolute -top-32 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full blur-[120px] opacity-8"
=======
// الشاشة الرئيسية لعميل التاجر — Merchant Client Mode (Phase 8)
// تعرض فقط: Vodafone Cash, شحن الرصيد, السجل, الملف الشخصي, التحديثات, الدعم
import { useNavigate } from 'react-router-dom';
import { useMerchantClient } from '@/contexts/MerchantClientContext';
import MerchantSubscriptionCard from './MerchantSubscriptionCard';
import {
  Wifi, Battery, History, User, Download, HeadphonesIcon,
  ChevronLeft, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// اختصارات الشاشة الرئيسية لعميل التاجر
const MC_SHORTCUTS = [
  {
    id:    'vodafone',
    label: 'كروت فودافون كاش',
    sub:   'شحن فوري وآمن',
    icon:  Wifi,
    path:  '/networks/vodafone',
    color: '#E60000',
    bg:    'rgba(230,0,0,0.08)',
  },
  {
    id:    'balance',
    label: 'شحن من الرصيد',
    sub:   'تحويل من رصيدك',
    icon:  Battery,
    path:  '/balance-charge',
    color: '#22c55e',
    bg:    'rgba(34,197,94,0.08)',
  },
  {
    id:    'history',
    label: 'سجل العمليات',
    sub:   'جميع معاملاتك',
    icon:  History,
    path:  '/my-operations',
    color: '#8b5cf6',
    bg:    'rgba(139,92,246,0.08)',
  },
  {
    id:    'subscription',
    label: 'الاشتراك',
    sub:   'بيانات باقتك',
    icon:  Zap,
    path:  '/subscription-history',
    color: '#f59e0b',
    bg:    'rgba(245,158,11,0.08)',
  },
  {
    id:    'updates',
    label: 'التحديثات',
    sub:   'آخر الأخبار',
    icon:  Download,
    path:  '/updates',
    color: '#06b6d4',
    bg:    'rgba(6,182,212,0.08)',
  },
  {
    id:    'settings',
    label: 'ملفي الشخصي',
    sub:   'إعدادات الحساب',
    icon:  User,
    path:  '/settings',
    color: '#64748b',
    bg:    'rgba(100,116,139,0.08)',
  },
] as const;

export default function MerchantClientHome() {
  const navigate = useNavigate();
  const { data }  = useMerchantClient();

  const brandColor = data?.merchant?.brand_color ?? 'hsl(var(--primary))';

  return (
    <div className="flex flex-col min-h-0 h-full" dir="rtl">
      {/* ─── خلفية ضوئية ─── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className="absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-[100px] opacity-10"
>>>>>>> 5aac87b (Initial miaoda project setup with React TypeScript Vite template)
          style={{ background: brandColor }}
        />
      </div>

<<<<<<< HEAD
      <div className="relative z-10 flex flex-col gap-4 p-4 pt-3">
        {/* ─── رأس الترحيب ─── */}
        <div
          className="rounded-2xl p-4 flex items-center justify-between gap-3 border"
          style={{
            background: `${brandColor}0d`,
            borderColor: `${brandColor}25`,
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            {data?.merchant.logo_url ? (
              <img
                src={data.merchant.logo_url}
                alt={data.merchant.name}
                className="w-10 h-10 rounded-xl object-cover border border-border shrink-0"
              />
            ) : (
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                style={{ background: `${brandColor}18`, borderColor: `${brandColor}35` }}
              >
                <Building2 className="w-5 h-5" style={{ color: brandColor }} />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">مرحباً،</p>
              <p className="text-sm font-black truncate">{profile?.username ?? '—'}</p>
              <p className="text-[10px] font-semibold truncate" style={{ color: brandColor }}>
                {data?.merchant.name}
              </p>
            </div>
          </div>

          {/* النقاط المتبقية */}
          {opsLeft !== null && (
            <div
              className="shrink-0 flex flex-col items-center px-3 py-2 rounded-xl border"
              style={{ background: `${brandColor}0d`, borderColor: `${brandColor}25` }}
            >
              <p className="text-xl font-black leading-none" style={{ color: brandColor }}>
                {opsLeft}
              </p>
              <p className="text-[9px] text-muted-foreground mt-0.5">متبقي</p>
            </div>
          )}
        </div>

        {/* ─── القسمان الرئيسيان ─── */}
        <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase px-0.5">
          الخدمات المتاحة
        </p>

        {/* بطاقة 1: كروت فودافون كاش */}
        <button
          onClick={() => navigate('/networks/vodafone')}
          className="group relative flex items-center gap-4 p-5 rounded-2xl border border-border bg-card active:scale-95 transition-all duration-150 text-right w-full overflow-hidden"
          style={{ borderColor: 'rgba(230,0,0,0.25)' }}
        >
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
            style={{ background: 'rgba(230,0,0,0.04)' }}
          />
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(230,0,0,0.10)' }}
          >
            <Wifi className="w-7 h-7" style={{ color: '#E60000' }} />
          </div>
          <div className="flex-1 min-w-0 text-right">
            <p className="text-base font-black">كروت فودافون كاش</p>
            <p className="text-xs text-muted-foreground mt-0.5">شحن كروت من حسابك مباشرةً</p>
          </div>
          <ChevronLeft className="w-5 h-5 text-muted-foreground shrink-0" />
        </button>

        {/* بطاقة 2: شحن من الرصيد */}
        <button
          onClick={() => navigate('/balance-charge')}
          className="group relative flex items-center gap-4 p-5 rounded-2xl border border-border bg-card active:scale-95 transition-all duration-150 text-right w-full overflow-hidden"
          style={{ borderColor: 'rgba(34,197,94,0.25)' }}
        >
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
            style={{ background: 'rgba(34,197,94,0.04)' }}
          />
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(34,197,94,0.10)' }}
          >
            <Battery className="w-7 h-7 text-success" />
          </div>
          <div className="flex-1 min-w-0 text-right">
            <p className="text-base font-black">شحن من الرصيد</p>
            <p className="text-xs text-muted-foreground mt-0.5">تحويل رصيد من حساب لآخر</p>
          </div>
          <ChevronLeft className="w-5 h-5 text-muted-foreground shrink-0" />
=======
      <div className="relative z-10 flex flex-col gap-5 p-4 pb-2">
        {/* ─── بطاقة الاشتراك ─── */}
        <MerchantSubscriptionCard />

        {/* ─── الاختصارات ─── */}
        <div>
          <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase mb-3 px-0.5">
            الخدمات المتاحة
          </p>
          <div className="grid grid-cols-2 gap-3">
            {MC_SHORTCUTS.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => navigate(s.path)}
                  className={cn(
                    'flex flex-col items-start gap-2 p-4 rounded-2xl border border-border',
                    'bg-card hover:bg-muted/40 active:scale-95 transition-all duration-150',
                    'text-right w-full'
                  )}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: s.bg }}
                  >
                    <Icon className="w-5 h-5" style={{ color: s.color }} />
                  </div>
                  <div className="min-w-0 w-full">
                    <p className="text-sm font-bold leading-tight truncate">{s.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</p>
                  </div>
                  <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground self-end mt-auto" />
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── قسم الدعم ─── */}
        <button
          className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card hover:bg-muted/40 active:scale-95 transition-all w-full text-right"
          onClick={() => navigate('/notifications')}
        >
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <HeadphonesIcon className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">الإشعارات والدعم</p>
            <p className="text-[10px] text-muted-foreground">رسائل وتنبيهات الخدمة</p>
          </div>
          <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
>>>>>>> 5aac87b (Initial miaoda project setup with React TypeScript Vite template)
        </button>
      </div>
    </div>
  );
}
