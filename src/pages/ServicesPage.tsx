/**
 * ServicesPage — صفحة الخدمات الموحدة — PHASE 2
 * - يجلب إعدادات الخدمات من DB عبر useServicesControl
 * - يتحقق من الاشتراك عبر useSubscriptionEngine
 * - يمنع الدخول لو القسم في صيانة / معطل / يحتاج اشتراك
 */

import { useNavigate } from 'react-router-dom';
import {
  RotateCcw, Wallet, Radio, CreditCard, ScanLine, Tag,
  ChevronLeft, Wrench, WifiOff, ArrowRight, Loader2,
} from 'lucide-react';
import { FEATURE_FLAGS } from '@/lib/featureFlags';
import type { ServiceConfig } from '@/lib/servicesConfig';
import { getVisibleServices } from '@/lib/servicesConfig';
import { useState, type ReactNode } from 'react';
import { useServicesControl } from '@/hooks/useServicesControl';
import { useSubscriptionEngine } from '@/hooks/useSubscriptionEngine';
import { usePreviewMode } from '@/contexts/PreviewModeContext';
import SubscriptionRequiredDialog from '@/components/subscription/SubscriptionRequiredDialog';

// ── أيقونة ديناميكية بحسب iconName ──────────────────────────────
function ServiceIcon({ name, className }: { name: string; className?: string }) {
  const icons: Record<string, ReactNode> = {
    RotateCcw:  <RotateCcw className={className} />,
    Wallet:     <Wallet className={className} />,
    Radio:      <Radio className={className} />,
    CreditCard: <CreditCard className={className} />,
    ScanLine:   <ScanLine className={className} />,
    Tag:        <Tag className={className} />,
  };
  return <>{icons[name] ?? <Wrench className={className} />}</>;
}

// ── كرت خدمة واحد ─────────────────────────────────────────────────
function ServiceCard({ svc, onPress }: { svc: ServiceConfig; onPress: () => void }) {
  const isDisabled = svc.status === 'maintenance' || svc.status === 'disabled';
  const isComingSoon = svc.status === 'coming_soon';

  return (
    <div
      onClick={() => !isDisabled && onPress()}
      className={`group relative rounded-[24px] overflow-hidden flex flex-col justify-end transition-all duration-500 min-h-[148px] shadow-[0_8px_32px_rgba(0,0,0,0.35)]
        ${isDisabled ? 'opacity-60 grayscale-[40%] cursor-not-allowed' : 'cursor-pointer hover:scale-[1.015] active:scale-[0.98]'}`}
      aria-label={svc.name}
    >
      {/* Background */}
      {svc.bgImage ? (
        <div className="absolute inset-0">
          <img src={svc.bgImage} alt={svc.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
        </div>
      ) : (
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${svc.accentColor}22, #0d1020)` }} />
      )}

      {/* Overlays */}
      <div className="absolute inset-0 bg-black/35" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#080d14] via-[#080d14]/75 to-transparent" />

      {/* Hover glow */}
      {!isDisabled && (
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 mix-blend-overlay"
          style={{ background: `radial-gradient(circle at center, ${svc.accentColor}55 0%, transparent 70%)` }} />
      )}

      {/* Border */}
      <div className="absolute inset-0 border border-white/10 rounded-[24px] pointer-events-none group-hover:border-white/20 transition-colors" />

      {/* Coming Soon overlay */}
      {isComingSoon && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[24px]"
          style={{ background: 'rgba(8,13,20,0.55)', backdropFilter: 'blur(2px)' }}>
          <span className="text-xs font-black px-3 py-1.5 rounded-full border"
            style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', borderColor: 'rgba(99,102,241,0.4)' }}>
            قريبًا
          </span>
        </div>
      )}

      {/* Maintenance overlay */}
      {svc.status === 'maintenance' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[24px]"
          style={{ background: 'rgba(8,13,20,0.6)', backdropFilter: 'blur(2px)' }}>
          <span className="text-xs font-black px-3 py-1.5 rounded-full border flex items-center gap-1.5"
            style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', borderColor: 'rgba(245,158,11,0.35)' }}>
            <Wrench className="w-3 h-3" /> {svc.maintenanceMessage ?? 'صيانة مؤقتة'}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 p-4 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center backdrop-blur-md bg-white/10 border border-white/15 shadow-inner">
              <ServiceIcon name={svc.iconName} className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-base font-black text-white drop-shadow-md leading-tight">{svc.name}</h3>
          </div>
          {svc.badge && (
            <span className="text-[9px] font-black tracking-widest px-2 py-0.5 rounded-full uppercase shrink-0 backdrop-blur-md bg-black/50 border border-white/10"
              style={{ color: svc.accentColor }}>
              {svc.badge}
            </span>
          )}
        </div>

        <div className="flex items-end justify-between gap-3 mt-0.5">
          <p className="text-[11px] text-white/55 font-medium leading-relaxed flex-1">
            {svc.description}
          </p>
          {!isDisabled && !isComingSoon && (
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0 group-hover:bg-primary/70 transition-colors border border-white/10 group-hover:border-primary/50">
              <ChevronLeft className="w-3.5 h-3.5 text-white" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── الصفحة الرئيسية ────────────────────────────────────────────────
export default function ServicesPage() {
  const navigate = useNavigate();
  const { isAccessible, loading: cfgLoading } = useServicesControl();
  const eng = useSubscriptionEngine();
  const { isPreview } = usePreviewMode();
  const hasActiveSub = eng.isAdmin || eng.isActive;
  const [lockedService, setLockedService] = useState<string | null>(null);

  if (!FEATURE_FLAGS.servicesHubEnabled) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6" dir="rtl">
        <WifiOff className="w-10 h-10 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">قسم الخدمات غير متاح حاليًا.</p>
        <button onClick={() => navigate('/home')} className="text-primary text-sm font-semibold flex items-center gap-1">
          <ArrowRight className="w-4 h-4" /> العودة للرئيسية
        </button>
      </div>
    );
  }

  // تحقق من القسم الرئيسي (services_section) — الصيانة والتعطيل فقط، لا نمنع بسبب الاشتراك
  // المستخدم غير المشترك يستطيع دخول قسم الخدمات والتصفح — المنع عند تنفيذ العملية
  const mainAccess = isAccessible('services_section', true, isPreview);
  if (!cfgLoading && !mainAccess.allowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6" dir="rtl">
        <Wrench className="w-10 h-10 text-muted-foreground" />
        <p className="text-white text-sm font-bold">
          {mainAccess.reason === 'maintenance' ? (mainAccess.message ?? 'صيانة مؤقتة — نعود قريباً') :
           mainAccess.reason === 'disabled'    ? 'قسم الخدمات معطل حالياً'                          :
           'قسم الخدمات غير متاح'}
        </p>
        <button onClick={() => navigate('/home')} className="text-primary text-sm font-semibold flex items-center gap-1">
          <ArrowRight className="w-4 h-4" /> العودة للرئيسية
        </button>
      </div>
    );
  }

  const services = getVisibleServices();

  async function handleServicePress(svc: ServiceConfig) {
    // تحقق سريع من حالة الخدمة (صيانة/تعطيل/اشتراك) — Frontend only للـ UX
    const access = isAccessible(svc.id, hasActiveSub, isPreview);
    if (!access.allowed) {
      if (access.reason === 'no_subscription') setLockedService(svc.id);
      // صيانة/تعطيل: الكارد نفسه يعرض overlay — لا نفعل شيئاً
      return;
    }
    // انتقال مباشر — الحماية النهائية Server-Side داخل كل خدمة
    navigate(svc.path);
  }

  return (
    <div className="min-h-screen pb-28" dir="rtl"
      style={{ background: 'var(--gradient-background)' }}>

      {/* ── Header ── */}
      <div className="sticky top-0 z-30 px-4 pt-safe-top"
        style={{ background: 'rgba(8,13,20,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3 py-4">
          <button
            onClick={() => navigate('/home')}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95"
            aria-label="رجوع"
          >
            <ArrowRight className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black text-white leading-tight">الخدمات</h1>
            <p className="text-[10px] text-muted-foreground">جميع خدمات التطبيق</p>
          </div>
          {cfgLoading ? (
            <Loader2 className="w-4 h-4 text-white/30 animate-spin" />
          ) : (
            <span className="text-[10px] font-bold px-2 py-1 rounded-full"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' }}>
              {services.length} خدمات
            </span>
          )}
        </div>
      </div>

      {/* ── قائمة الخدمات ── */}
      <div className="px-4 pt-4 space-y-3">
        {services.map(svc => {
          // تحقق من حالة كل خدمة من DB — فقط حالات الصيانة/التعطيل الحقيقية تُدمج
          // no_subscription لا تُعيّن maintenance — المستخدم يضغط ويرى Dialog الاشتراك
          const access = isAccessible(svc.id, hasActiveSub, isPreview);
          const mergedSvc: ServiceConfig = {
            ...svc,
            status: !access.allowed && (access.reason === 'maintenance' || access.reason === 'disabled')
              ? access.reason
              : svc.status,
            maintenanceMessage: access.message ?? svc.maintenanceMessage,
          };
          return (
            <ServiceCard
              key={svc.id}
              svc={mergedSvc}
              onPress={() => handleServicePress(svc)}
            />
          );
        })}
      </div>

      <SubscriptionRequiredDialog
        open={!!lockedService}
        onClose={() => setLockedService(null)}
      />
    </div>
  );
}
