<<<<<<< HEAD
// تخطيط Merchant Client Mode — مُبسَّط
// يعرض فقط: شريط علوي نظيف + المحتوى + زر خروج
// الشريط السفلي: قسمان فقط (فودافون كاش / الرصيد) + شاشة pending عند عدم الاشتراك
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
=======
// تخطيط Merchant Client Mode — Phase 8
// يعرض فقط الأقسام المسموح بها. يستبدل MainLayout للمستخدمين المرتبطين بتاجر.
// Additive Only — لا يعدّل MainLayout أو أي component قائم.
import { useState, useEffect } from 'react';
import { NavLink, Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
>>>>>>> 5aac87b (Initial miaoda project setup with React TypeScript Vite template)
import { useAuth } from '@/contexts/AuthContext';
import { useMerchantClient } from '@/contexts/MerchantClientContext';
import MerchantClientSuspended from './MerchantClientSuspended';
import MerchantClientHome from './MerchantClientHome';
<<<<<<< HEAD
import MerchantPendingScreen from './MerchantPendingScreen';
=======
import { MerchantChargeStatusBar } from './MerchantChargeGuard';
>>>>>>> 5aac87b (Initial miaoda project setup with React TypeScript Vite template)
import { KillSwitchScreen, MaintenanceScreen, ForceUpdateScreen } from './MerchantControlScreens';
import { useMerchantControlConfig } from '@/hooks/useMerchantControlConfig';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
<<<<<<< HEAD
import { Wifi, Battery, LogOut, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// المسارات المسموح بها لعميل التاجر
const MC_ALLOWED = new Set([
  '/home', '/networks/vodafone', '/balance-charge',
]);

// عنصرا شريط التنقل السفلي فقط
const MC_NAV = [
  { to: '/networks/vodafone', icon: Wifi,    label: 'فودافون كاش', color: '#E60000'  },
  { to: '/balance-charge',    icon: Battery, label: 'شحن الرصيد',  color: '#22c55e' },
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

  // ── شاشة التحميل ──
=======
import { OFFICIAL_LOGO } from '@/pages/SplashScreen';
import {
  Home, Battery, History, User, Download, Bell,
  LogOut, Menu, X, Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─── المسارات المسموح بها في Merchant Client Mode ─────────────────────────────
const MC_ALLOWED_PATHS = new Set([
  '/home', '/networks/vodafone', '/balance-charge',
  '/my-operations', '/subscription-history', '/updates',
  '/notifications', '/settings', '/operations',
]);

// ─── عناصر شريط التنقل السفلي ─────────────────────────────────────────────────
const MC_NAV_ITEMS = [
  { to: '/home',              icon: Home,    label: 'الرئيسية'  },
  { to: '/networks/vodafone', icon: Home,    label: 'فودافون'   },
  { to: '/balance-charge',    icon: Battery, label: 'الرصيد'    },
  { to: '/my-operations',     icon: History, label: 'السجل'     },
  { to: '/notifications',     icon: Bell,    label: 'الإشعارات' },
] as const;

export default function MerchantClientLayout() {
  const { profile }          = useAuth();
  const { data, merchantSuspended, isLoading } = useMerchantClient();
  // Phase 10: مفاتيح التحكم اللحظية
  const { killSwitch, maintenance, forceUpdate, forceLogout, config } = useMerchantControlConfig();
  const location             = useLocation();
  const navigate             = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const brandColor = data?.merchant?.brand_color ?? 'hsl(var(--primary))';

  // إعادة التوجيه للمسارات غير المسموح بها
  const currentPath = location.pathname;
  const isAllowed = [...MC_ALLOWED_PATHS].some(p => currentPath.startsWith(p));

  useEffect(() => {
    if (!isLoading && !isAllowed) {
      navigate('/home', { replace: true });
    }
  }, [currentPath, isLoading, isAllowed, navigate]);

  // ── شاشة التحميل ────────────────────────────────────────────────────────────
>>>>>>> 5aac87b (Initial miaoda project setup with React TypeScript Vite template)
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
  // ── توقف التاجر ──
  if (merchantSuspended) return <MerchantClientSuspended />;

  // ── شاشة انتظار تفعيل الاشتراك ──
  // تظهر عندما يكون العضو مرتبطاً بتاجر لكن ليس لديه اشتراك نشط
  const memberStatus = data?.member?.member_status;
  const subStatus    = data?.subscription?.status;
  const needsActivation =
    data !== null &&
    (memberStatus === 'pending' || memberStatus === undefined || memberStatus === null) &&
    (subStatus === undefined || subStatus === null ||
     subStatus === 'pending' || subStatus === 'expired' || subStatus === 'cancelled');

  if (needsActivation) {
    return (
      <>
        {killSwitch  && <KillSwitchScreen message={config?.kill_switch_msg} />}
        {forceUpdate && !killSwitch && <ForceUpdateScreen message={config?.force_update_msg} updateUrl={config?.force_update_url} />}
        <MerchantPendingScreen />
      </>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background" dir="rtl">
      {/* Phase 10: شاشات التحكم اللحظية */}
      {killSwitch  && <KillSwitchScreen message={config?.kill_switch_msg} />}
      {forceUpdate && !killSwitch && <ForceUpdateScreen message={config?.force_update_msg} updateUrl={config?.force_update_url} />}

      {/* ─── شريط العنوان العلوي — نظيف بدون قائمة ─── */}
      <header
        className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/90 backdrop-blur-sm sticky top-0 z-40"
        style={{ borderBottomColor: `${brandColor}20` }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {data?.merchant?.logo_url ? (
=======
  // ── شاشة توقف التاجر ────────────────────────────────────────────────────────
  if (merchantSuspended) {
    return <MerchantClientSuspended />;
  }

  // Phase 10 — B1 FIX: force_logout يُشغّل تسجيل خروج فوري
  useEffect(() => {
    if (!forceLogout) return;
    // تسجيل خروج فوري — ينقل إلى /login تلقائياً عبر PostSplashNavigator
    void supabase.auth.signOut();
  }, [forceLogout]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.info('تم تسجيل الخروج');
    setMenuOpen(false);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background relative" dir="rtl">
      {/* Phase 10: شاشات التحكم اللحظية — تُعرض فوق كل المحتوى */}
      {killSwitch  && <KillSwitchScreen  message={config?.kill_switch_msg} />}
      {forceUpdate && !killSwitch && <ForceUpdateScreen message={config?.force_update_msg} updateUrl={config?.force_update_url} />}

      {/* ─── شريط العنوان العلوي ─── */}
      <header
        className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-40"
        style={{ borderBottomColor: `${brandColor}20` }}
      >
        {/* الشعار والتاجر */}
        <div className="flex items-center gap-2.5 min-w-0">
          {data?.merchant.logo_url ? (
>>>>>>> 5aac87b (Initial miaoda project setup with React TypeScript Vite template)
            <img
              src={data.merchant.logo_url}
              alt={data.merchant.name}
              className="w-8 h-8 rounded-xl object-cover border border-border"
            />
          ) : (
            <div
<<<<<<< HEAD
              className="w-8 h-8 rounded-xl flex items-center justify-center border shrink-0"
              style={{ background: `${brandColor}14`, borderColor: `${brandColor}30` }}
=======
              className="w-8 h-8 rounded-xl flex items-center justify-center border"
              style={{ background: `${brandColor}15`, borderColor: `${brandColor}30` }}
>>>>>>> 5aac87b (Initial miaoda project setup with React TypeScript Vite template)
            >
              <Building2 className="w-4 h-4" style={{ color: brandColor }} />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-black truncate leading-tight" style={{ color: brandColor }}>
<<<<<<< HEAD
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
        {loc.pathname === '/home'
=======
              {data?.merchant.name ?? 'الخدمة'}
            </p>
            <p className="text-[9px] text-muted-foreground">
              {profile?.username ?? ''}
            </p>
          </div>
        </div>

        {/* أزرار رأس الصفحة */}
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <NavLink to="/notifications">
              <Bell className="w-4 h-4" />
            </NavLink>
          </Button>
          <Button
            variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>
        </div>
      </header>

      {/* ─── قائمة منسدلة ─── */}
      {menuOpen && (
        <div className="absolute top-14 left-0 right-0 z-50 bg-card border-b border-border shadow-lg px-4 py-3 space-y-1">
          {[
            { to: '/settings',             label: 'ملفي الشخصي',  icon: User     },
            { to: '/subscription-history', label: 'الاشتراك',     icon: Download },
            { to: '/updates',              label: 'التحديثات',    icon: Download },
          ].map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted text-sm font-medium transition-colors"
            >
              <item.icon className="w-4 h-4 text-muted-foreground" />
              {item.label}
            </NavLink>
          ))}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-destructive/10 text-destructive text-sm font-medium transition-colors w-full"
          >
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </button>
        </div>
      )}

      {/* ─── المحتوى ─── */}
      <main className="flex-1 overflow-y-auto pb-20 min-h-0 relative">
        {/* Phase 10: وضع الصيانة — يظهر كـ overlay يمنع التفاعل مع العمليات */}
        {maintenance && !killSwitch && (
          <MaintenanceScreen message={config?.maintenance_msg} />
        )}
        {/* Phase 9: شريط تحقق الأهلية — يظهر تلقائياً عند وجود مشكلة */}
        <MerchantChargeStatusBar />
        {currentPath === '/home'
>>>>>>> 5aac87b (Initial miaoda project setup with React TypeScript Vite template)
          ? <MerchantClientHome />
          : <Outlet />}
      </main>

<<<<<<< HEAD
      {/* ─── شريط التنقل السفلي — قسمان فقط ─── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border"
        style={{ borderTopColor: `${brandColor}20` }}
      >
        <div className="flex items-center justify-around px-4 py-1">
          {MC_NAV.map(item => (
=======
      {/* ─── شريط التنقل السفلي ─── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-card/90 backdrop-blur-md border-t border-border"
        style={{ borderTopColor: `${brandColor}20` }}
      >
        <div className="flex items-center justify-around px-2 py-1">
          {MC_NAV_ITEMS.map(item => (
>>>>>>> 5aac87b (Initial miaoda project setup with React TypeScript Vite template)
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
<<<<<<< HEAD
                'flex flex-col items-center gap-1 py-2 px-6 rounded-xl transition-all min-w-0',
                isActive ? 'text-foreground' : 'text-muted-foreground',
=======
                'flex flex-col items-center gap-0.5 py-2 px-3 rounded-xl transition-all min-w-0',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground',
>>>>>>> 5aac87b (Initial miaoda project setup with React TypeScript Vite template)
              )}
            >
              {({ isActive }) => (
                <>
                  <div
<<<<<<< HEAD
                    className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                    style={isActive
                      ? { background: `${item.color}15`, border: `1px solid ${item.color}30` }
                      : { background: 'transparent' }}
                  >
                    <item.icon
                      className="w-5 h-5"
                      style={isActive ? { color: item.color } : {}}
                    />
                  </div>
                  <span
                    className="text-[10px] font-semibold leading-none"
                    style={isActive ? { color: item.color } : {}}
=======
                    className={cn(
                      'w-8 h-8 rounded-xl flex items-center justify-center transition-colors',
                      isActive && 'bg-primary/10',
                    )}
                    style={isActive ? { background: `${brandColor}15` } : {}}
                  >
                    <item.icon
                      className="w-4 h-4"
                      style={isActive ? { color: brandColor } : {}}
                    />
                  </div>
                  <span
                    className="text-[9px] font-medium leading-none"
                    style={isActive ? { color: brandColor } : {}}
>>>>>>> 5aac87b (Initial miaoda project setup with React TypeScript Vite template)
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
