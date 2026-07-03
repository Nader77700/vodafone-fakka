// تخطيط Merchant Client Mode — مُبسَّط
// يعرض فقط: شريط علوي نظيف + المحتوى + زر خروج
<<<<<<< HEAD
// الشريط السفلي: أربعة عناصر — بدون قفل للاشتراك المعلق (فقط رسالة عند العملية)
=======
// الشريط السفلي: قسمان فقط (فودافون كاش / الرصيد) + شاشة pending عند عدم الاشتراك
>>>>>>> origin/main
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useMerchantClient } from '@/contexts/MerchantClientContext';
import MerchantClientSuspended from './MerchantClientSuspended';
<<<<<<< HEAD
import MerchantBlockedMemberScreen from './MerchantBlockedMemberScreen';
import MerchantWelcomeDialog from './MerchantWelcomeDialog';
=======
import MerchantPendingScreen from './MerchantPendingScreen';
>>>>>>> origin/main
import { KillSwitchScreen, MaintenanceScreen, ForceUpdateScreen } from './MerchantControlScreens';
import { useMerchantControlConfig } from '@/hooks/useMerchantControlConfig';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { Wifi, Battery, Bell, History, LogOut, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// المسارات المسموح بها لعميل التاجر
const MC_ALLOWED = new Set([
  '/home', '/balance-charge', '/my-operations', '/notifications',
]);

// شريط التنقل السفلي — أربعة عناصر
const MC_NAV = [
  { to: '/home',           icon: Wifi,    label: 'الرئيسية',    color: '#E60000'  },
  { to: '/balance-charge', icon: Battery, label: 'شحن الرصيد',  color: '#22c55e'  },
  { to: '/my-operations',  icon: History, label: 'العمليات',    color: '#f59e0b'  },
  { to: '/notifications',  icon: Bell,    label: 'الإشعارات',   color: '#8b5cf6'  },
] as const;

export default function MerchantClientLayout() {
  const { profile }      = useAuth();
  const { data, merchantSuspended, isLoading } = useMerchantClient();
  const { killSwitch, maintenance, forceUpdate, forceLogout, config } = useMerchantControlConfig();
  const navigate  = useNavigate();
  const loc       = useLocation();

  const brandColor = data?.merchant?.brand_color ?? '#E60000';

  // إعادة توجيه المسارات غير المسموح بها إلى /home
  useEffect(() => {
    if (!isLoading) {
      const allowed = [...MC_ALLOWED].some(p => loc.pathname.startsWith(p));
      if (!allowed) navigate('/home', { replace: true });
    }
  }, [loc.pathname, isLoading, navigate]);

  // Phase 10: force_logout
  useEffect(() => {
    if (!forceLogout) return;
    void supabase.auth.signOut();
  }, [forceLogout]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.info('تم تسجيل الخروج');
  };

<<<<<<< HEAD
  // ── شاشة التحميل (محدودة بـ 3 ثوانٍ لمنع loading لا نهائي) ──
=======
  // ── شاشة التحميل ──
>>>>>>> origin/main
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">جارٍ تحميل الخدمة…</p>
        </div>
      </div>
    );
  }

<<<<<<< HEAD
  // ── توقف التاجر (merchant-level) ──
  if (merchantSuspended) return <MerchantClientSuspended />;

  // ── حظر / إيقاف العضو (member-level) — شاشة واضحة بدون loading ──
  const memberStatus = data?.member?.member_status;
  if (memberStatus === 'blocked' || memberStatus === 'disabled') {
    return <MerchantBlockedMemberScreen status={memberStatus} />;
  }
  if (memberStatus === 'suspended') {
    return <MerchantBlockedMemberScreen status="suspended" />;
  }

  // ملاحظة: pending / expired → يدخل التطبيق بشكل طبيعي
  // MerchantChargeGuard يتولى عرض الرسالة عند محاولة تنفيذ أي عملية
=======
  // ── توقف التاجر ──
  if (merchantSuspended) return <MerchantClientSuspended />;

  // ── شاشة انتظار تفعيل الاشتراك ──
  // تظهر عندما يكون العضو مرتبطاً بتاجر لكن ليس لديه اشتراك نشط
  const memberStatus = data?.member?.member_status;
  const subStatus    = data?.subscription?.status;
  const needsActivation =
    data !== null &&
    (memberStatus === 'pending' || memberStatus === undefined || memberStatus === null) &&
    (subStatus === undefined || subStatus === null || subStatus === 'pending');

  if (needsActivation) {
    return (
      <>
        {killSwitch  && <KillSwitchScreen message={config?.kill_switch_msg} />}
        {forceUpdate && !killSwitch && <ForceUpdateScreen message={config?.force_update_msg} updateUrl={config?.force_update_url} />}
        <MerchantPendingScreen />
      </>
    );
  }
>>>>>>> origin/main

  return (
    <div className="flex flex-col min-h-screen bg-background" dir="rtl">
      {/* Phase 10: شاشات التحكم اللحظية */}
      {killSwitch  && <KillSwitchScreen message={config?.kill_switch_msg} />}
      {forceUpdate && !killSwitch && <ForceUpdateScreen message={config?.force_update_msg} updateUrl={config?.force_update_url} />}

<<<<<<< HEAD
      {/* Welcome Dialog — أول دخول فقط */}
      <MerchantWelcomeDialog />

=======
>>>>>>> origin/main
      {/* ─── شريط العنوان العلوي — نظيف بدون قائمة ─── */}
      <header
        className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/90 backdrop-blur-sm sticky top-0 z-40"
        style={{ borderBottomColor: `${brandColor}20` }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {data?.merchant?.logo_url ? (
            <img
              src={data.merchant.logo_url}
              alt={data.merchant.name}
              className="w-8 h-8 rounded-xl object-cover border border-border"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center border shrink-0"
              style={{ background: `${brandColor}14`, borderColor: `${brandColor}30` }}
            >
              <Building2 className="w-4 h-4" style={{ color: brandColor }} />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-black truncate leading-tight" style={{ color: brandColor }}>
              {data?.merchant?.name ?? 'الخدمة'}
            </p>
            <p className="text-[9px] text-muted-foreground leading-none">{profile?.username ?? ''}</p>
          </div>
        </div>

        {/* زر الخروج فقط */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-muted-foreground hover:text-destructive px-2"
          onClick={handleLogout}
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="text-xs">خروج</span>
        </Button>
      </header>

      {/* ─── المحتوى ─── */}
      <main className="flex-1 overflow-y-auto pb-20 min-h-0 relative">
        {maintenance && !killSwitch && (
          <MaintenanceScreen message={config?.maintenance_msg} />
        )}
        <Outlet />
      </main>

      {/* ─── شريط التنقل السفلي — أربعة عناصر ─── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border"
        style={{ borderTopColor: `${brandColor}20` }}
      >
        <div className="flex items-center justify-around px-2 py-1">
          {MC_NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
                'flex flex-col items-center gap-1 py-2 px-3 rounded-xl transition-all min-w-0',
                isActive ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {({ isActive }) => (
                <>
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                    style={isActive
                      ? { background: `${item.color}15`, border: `1px solid ${item.color}30` }
                      : { background: 'transparent' }}
                  >
                    <item.icon
                      className="w-4.5 h-4.5"
                      style={isActive ? { color: item.color } : {}}
                    />
                  </div>
                  <span
                    className="text-[9px] font-semibold leading-none"
                    style={isActive ? { color: item.color } : {}}
                  >
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
