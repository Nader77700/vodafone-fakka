import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import IntersectObserver from '@/components/common/IntersectObserver';
import { PageErrorBoundary } from '@/components/common/PageErrorBoundary';
import UpdateBanner from '@/components/common/UpdateBanner';
import OfflineBanner from '@/components/common/OfflineBanner';
import ForceUpdateScreen from '@/components/common/ForceUpdateScreen';
import AnnouncementBanner from '@/components/common/AnnouncementBanner';
import MaintenanceScreen from '@/components/common/MaintenanceScreen';
import { useFeatureFlags } from '@/contexts/RuntimeConfigContext';
import { useUpdateChecker } from '@/hooks/useUpdateChecker';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { RuntimeConfigProvider } from '@/contexts/RuntimeConfigContext';
import { RouteGuard } from '@/components/common/RouteGuard';
import { insertOperation } from '@/lib/api';
import { checkDeviceBan, registerDeviceInRegistry } from '@/lib/api';
// ── استيراد ثابت للصفحات التي تظهر فور فتح التطبيق ──
import SplashScreen, { SplashOverlay } from './pages/SplashScreen';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import MainLayout from './components/layouts/MainLayout';
import SessionConflictScreen from './pages/SessionConflictScreen';
import DeviceBannedScreen from './pages/DeviceBannedScreen';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { resolveRoute, notifLog } from '@/lib/notificationRouter';
import { getStableDeviceIdentity } from '@/lib/deviceFingerprint';
import { registerDeviceFingerprint } from '@/lib/api';
import { MerchantProvider } from '@/contexts/MerchantContext';
import { MerchantClientProvider, useMerchantClient } from '@/contexts/MerchantClientContext';

// ── استيراد كسول لكل الصفحات الأخرى (تُحمَّل عند الحاجة فقط) ──
const ActivationPage         = lazy(() => import('./pages/ActivationPage'));
const RechargePage           = lazy(() => import('./pages/RechargePage'));
const FavoritesPage          = lazy(() => import('./pages/FavoritesPage'));
const OperationsPage         = lazy(() => import('./pages/OperationsPage'));
const UserOperationsPage     = lazy(() => import('./pages/UserOperationsPage'));
const OperationDetailPage    = lazy(() => import('./pages/OperationDetailPage'));
const NotificationsPage      = lazy(() => import('./pages/NotificationsPage'));
const SettingsPage           = lazy(() => import('./pages/SettingsPage'));
const AdminDashboard         = lazy(() => import('./pages/AdminDashboard'));
const AdminUserDetail        = lazy(() => import('./pages/admin/AdminUserDetail'));
const AdminUserActions       = lazy(() => import('./pages/admin/AdminUserActions'));
const AdminUserSubscription  = lazy(() => import('./pages/admin/AdminUserSubscription'));
const AdminUserOperations    = lazy(() => import('./pages/admin/AdminUserOperations'));
const AdminOperationsPage    = lazy(() => import('./pages/admin/AdminOperationsPage'));
const AdminVersionCenter     = lazy(() => import('./pages/admin/AdminVersionCenter'));
const AdminLiveMonitoring    = lazy(() => import('./pages/admin/AdminLiveMonitoring'));
const AdminFeatureManagement = lazy(() => import('./pages/admin/AdminFeatureManagement'));
const AdminMerchantDetail    = lazy(() => import('./pages/admin/AdminMerchantDetail'));
const AdminDuplicateAccounts = lazy(() => import('./pages/admin/AdminDuplicateAccounts'));
const AdminDuplicateGroupDetail = lazy(() => import('./pages/admin/AdminDuplicateGroupDetail'));
const MerchantDashboard      = lazy(() => import('./pages/merchant/MerchantDashboard'));
const MerchantClientLayout   = lazy(() => import('@/components/merchant-client/MerchantClientLayout'));
const JoinPage               = lazy(() => import('./pages/JoinPage'));
const InvitePage             = lazy(() => import('./pages/InvitePage'));
const StatisticsPage         = lazy(() => import('./pages/StatisticsPage'));
const SubscriptionHistoryPage = lazy(() => import('./pages/SubscriptionHistoryPage'));
const SubscriptionDetailPage = lazy(() => import('./pages/SubscriptionDetailPage'));
const BuildInfoPage          = lazy(() => import('./pages/BuildInfoPage'));
const UpdatesPage            = lazy(() => import('./pages/UpdatesPage'));
const SystemLogsPage         = lazy(() => import('./pages/SystemLogsPage'));
const NetworksPage           = lazy(() => import('./pages/NetworksPage'));
const VodafonePage           = lazy(() => import('./pages/networks/VodafonePage'));
const OrangePage             = lazy(() => import('./pages/networks/OrangePage'));
const EtisalatPage           = lazy(() => import('./pages/networks/EtisalatPage'));
const WEPage                 = lazy(() => import('./pages/networks/WEPage'));
const ESimPage               = lazy(() => import('./pages/networks/ESimPage'));
const ESimDetailPage         = lazy(() => import('./pages/networks/ESimDetailPage'));
const BalanceChargePage      = lazy(() => import('./pages/BalanceChargePage'));

// مؤشر تحميل خفيف أثناء lazy loading
const PageSpinner = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  </div>
);

// تغليف Suspense مختصر
const S = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<PageSpinner />}>{children}</Suspense>
);

// ─── NotificationDeepLinkHandler ──────────────────────────────────────────────
// يقرأ deep link من Cold Start (App URL open) ويوجّه للصفحة الصحيحة
function NotificationDeepLinkHandler() {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const handled   = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !user) return;

    // Cold Start — التطبيق فُتح عبر رابط
    const urlSub = CapApp.addListener('appUrlOpen', ({ url }) => {
      notifLog('App URL Open (deep link)', { url });
      try {
        const parsed  = new URL(url);
        const path    = parsed.pathname;
        const params  = Object.fromEntries(parsed.searchParams.entries());
        const route   = resolveRoute({ action_url: path, ...params });
        notifLog('Navigation Success (appUrlOpen)', { route });
        navigate(route, { replace: false });
      } catch {
        notifLog('App URL Open parse error', { url });
        navigate('/home', { replace: false });
      }
    });

    // Cold Start — بيانات إشعار محفوظة عند الإطلاق
    if (!handled.current) {
      handled.current = true;
      CapApp.getLaunchUrl().then((result) => {
        if (!result?.url) return;
        notifLog('Launch URL (cold start)', { url: result.url });
        try {
          const parsed = new URL(result.url);
          const route  = resolveRoute({ action_url: parsed.pathname });
          notifLog('Navigation Success (launchUrl)', { route });
          navigate(route, { replace: false });
        } catch { /* تجاهل */ }
      });
    }

    return () => { urlSub.then(h => h.remove()); };
  }, [navigate, user]);

  return null;
}

// ─── DeviceFingerprintRegistrar ──────────────────────────────────────────────
// يُسجِّل بصمة الجهاز في الخادم عند تسجيل الدخول لأول مرة
// ويسجّل الجهاز في device_registry لكشف الحسابات المكررة
function DeviceFingerprintRegistrar() {
  const { user } = useAuth();
  const registered = useRef(false);
  useEffect(() => {
    if (!user || registered.current) return;
    registered.current = true;
    const { device_fp, hardware_hash, device_id } = getStableDeviceIdentity();
    // تسجيل legacy (device_fp في profiles)
    registerDeviceFingerprint(user.id, device_fp);
    // تسجيل في device_registry (الجدول الجديد)
    registerDeviceInRegistry(user.id, {
      device_fp,
      hardware_hash,
      device_id: device_id ?? undefined,
      platform: Capacitor.getPlatform(),
    }).catch(() => {});
  }, [user]);
  return null;
}

// ─── AppResumeHandler ──────────────────────────────────────────────────────────
// يحدّث طابع النشاط عند العودة من الخلفية — يمنع معاملة الاستئناف كـ cold start
function AppResumeHandler() {
  const isAndroid = Capacitor.getPlatform() === 'android';

  useEffect(() => {
    if (!isAndroid) return;
    const handler = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        // تحديث طابع النشاط عند العودة لضمان تخطي Splash
        localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
        notifLog('App Resumed — keeping current route');
      }
    });
    return () => { handler.then(h => h.remove()); };
  }, [isAndroid]);

  return null;
}

// ─── NavigationStateManager ───────────────────────────────────────────────────
// يحفظ المسار الحالي في localStorage (يبقى حتى بعد إعادة إنشاء WebView)
// مع طابع زمني لتحديد ما إذا كان الغياب قصيراً (خلفية) أو طويلاً (إغلاق حقيقي)
const NAV_KEY       = 'vfp_last_route';
const ACTIVITY_KEY  = 'vfp_last_active';
const RESUME_TTL_MS = 30 * 60 * 1000; // 30 دقيقة — بعدها تُعامَل كـ cold start

export function saveLastRoute(path: string) {
  if (path === '/' || path.startsWith('/login') || path.startsWith('/activate') || path.startsWith('/join') || path.startsWith('/invite')) return;
  localStorage.setItem(NAV_KEY,      path);
  localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
}

export function getRestoredRoute(): string | null {
  const ts   = Number(localStorage.getItem(ACTIVITY_KEY) ?? 0);
  const path = localStorage.getItem(NAV_KEY);
  if (!path || Date.now() - ts > RESUME_TTL_MS) return null;
  return path;
}

function NavigationStateManager() {
  const location = useLocation();
  useEffect(() => {
    saveLastRoute(location.pathname + location.search);
  }, [location]);
  return null;
}

// ─── AndroidBackHandler ────────────────────────────────────────────────────────
function AndroidBackHandler() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const lastBack  = useRef<number>(0);
  const isAndroid = Capacitor.getPlatform() === 'android';

  useEffect(() => {
    if (!isAndroid) return;
    const handler = CapApp.addListener('backButton', () => {
      if (location.pathname !== '/home') { navigate(-1); return; }
      const now = Date.now();
      if (now - lastBack.current < 2000) {
        CapApp.exitApp();
      } else {
        lastBack.current = now;
        import('sonner').then(({ toast }) => toast('اضغط مرة أخرى للخروج', { duration: 2000 }));
      }
    });
    return () => { handler.then(h => h.remove()); };
  }, [isAndroid, location.pathname, navigate]);

  return null;
}

// ─── PostSplashNavigator ───────────────────────────────────────────────────────
// بعد انتهاء Splash يتحقق من حالة Auth ويوجّه المستخدم
// isHotStart=true → عودة من الخلفية → أعد المسار المحفوظ مهما كان currentPath
// isHotStart=false → cold start عادي → لا تتدخل إذا كان المستخدم على مسار غير root
function PostSplashNavigator({ onNavigated, isHotStart }: { onNavigated: () => void; isHotStart: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const navigated = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (navigated.current) return;
    navigated.current = true;

    // ── مسارات عامة لا يجب المساس بها (روابط الدعوة) ──────────────────────────
    // InvitePage و JoinPage تدير منطقهما الخاص (حفظ التوكن ثم التوجيه للـ login)
    // إذا تدخّل PostSplashNavigator هنا فلن تعمل هذه الصفحات أبداً
    const isPublicInviteRoute =
      location.pathname.startsWith('/invite/') ||
      location.pathname.startsWith('/join/');

    if (!user && !isPublicInviteRoute) {
      navigate('/login', { replace: true });
    } else if (!user && isPublicInviteRoute) {
      // اترك الصفحة تعمل بمفردها — ستحفظ التوكن وتوجّه للـ login بنفسها
      onNavigated();
      return;
    } else if (isHotStart) {
      // ── Hot Start (عودة من الخلفية) ──
      // دائماً أعد المسار المحفوظ — بغض النظر عن المسار الحالي
      // (الـ index route قد ضغطنا بالفعل على /home قبل أن يصل useEffect)
      const saved = getRestoredRoute();
      if (saved && saved !== '/home') {
        navigate(saved, { replace: true });
      }
      // إذا كان المسار المحفوظ /home أو لا يوجد → ابقَ على /home
    } else {
      // ── Cold Start ──
      const currentPath = location.pathname;
      const isAtRoot    = currentPath === '/' || currentPath === '';
      if (!isAtRoot) {
        // المستخدم وُجِّه مسبقاً (من إشعار أو deep link) — لا تُعِد التوجيه
        onNavigated();
        return;
      }
      const saved = getRestoredRoute();
      navigate(saved ?? '/home', { replace: true });
    }
    onNavigated();
  }, [loading, user, navigate, location.pathname, onNavigated, isHotStart]);

  return null;
}

// ─── MerchantClientGate — Phase 8 ────────────────────────────────────────────
function MerchantClientGate() {
  const { isMerchantClient, isLoading } = useMerchantClient();
  if (isLoading) return null;
  if (isMerchantClient) return <S><MerchantClientLayout /></S>;
  return <MainLayout />;
}

// ─── AppInner ─────────────────────────────────────────────────────────────────
// COLD_START_KEY منطق جديد: localStorage + timestamp بدل sessionStorage
// ─ cold start حقيقي  : localStorage فارغة أو انقضت مدة RESUME_TTL_MS → showSplash
// ─ عودة من الخلفية   : localStorage بها timestamp حديث           → تخطي Splash
// ─ إغلاق كامل (>30م) : timestamp قديم → showSplash مجدداً
const COLD_START_KEY = 'vfp_cold_start_done';

function AppInner() {
  const { sessionConflict } = useAuth();

  // isColdStart: true فقط إذا لم يكن للتطبيق نشاط حديث (خلال 30 دقيقة)
  const isColdStart = (() => {
    const ts = Number(localStorage.getItem(ACTIVITY_KEY) ?? 0);
    if (!ts) return true;
    return Date.now() - ts > RESUME_TTL_MS;
  })();

  const [showSplash,  setShowSplash]  = useState(isColdStart);
  const [navigateNow, setNavigateNow] = useState(!isColdStart);

  // ── فحص حظر الجهاز ─────────────────────────────────────────────────────
  const [deviceBan, setDeviceBan] = useState<{ banned: boolean; reason?: string; banned_at?: string } | null>(null);

  useEffect(() => {
    const { device_fp, hardware_hash, device_id } = getStableDeviceIdentity();
    checkDeviceBan({ device_fp, hardware_hash, device_id: device_id ?? undefined })
      .then(res => { if (res.banned) setDeviceBan(res); })
      .catch(() => {});
  }, []);

  const handleSplashDone = () => {
    // سجّل وقت الانتهاء من Splash في localStorage — يصمد بعد إعادة بناء WebView
    localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
    setNavigateNow(true);
  };
  const handleNavigated  = () => { setShowSplash(false); setNavigateNow(false); };

  // تسجيل FCM بعد تحميل التطبيق
  usePushNotifications();

  // فحص التحديث الإجباري — يُقرأ من DB بعد 2.5 ثانية
  const { forceUpdate, latestVersion } = useUpdateChecker();
  const flags = useFeatureFlags();

  // ── مسح طابور العمليات المعلّقة عند عودة الإنترنت ──
  // العمليات التي نجحت native/bridge لكن فشل تسجيلها client-side بسبب انقطاع الإنترنت
  const { user } = useAuth();
  const flushQueue = useCallback(async () => {
    if (!user) return;
    try {
      const raw = localStorage.getItem('pending_ops_queue');
      if (!raw) return;
      const queue: unknown[] = JSON.parse(raw);
      if (!queue.length) return;
      const remaining: unknown[] = [];
      for (const op of queue) {
        try {
          const { error } = await insertOperation(op as Parameters<typeof insertOperation>[0]);
          if (error) remaining.push(op);
        } catch { remaining.push(op); }
      }
      if (remaining.length < queue.length) {
        const flushed = queue.length - remaining.length;
        toast.success(`✅ تم تسجيل ${flushed} عملية${flushed > 1 ? ' معلّقة' : ' معلّقة'} بنجاح`);
      }
      if (remaining.length === 0) localStorage.removeItem('pending_ops_queue');
      else localStorage.setItem('pending_ops_queue', JSON.stringify(remaining));
    } catch { /* لا يوقف التطبيق */ }
  }, [user]);

  useEffect(() => {
    // محاولة عند فتح التطبيق مباشرة
    flushQueue();
    // محاولة عند عودة الإنترنت
    window.addEventListener('online', flushQueue);
    return () => window.removeEventListener('online', flushQueue);
  }, [flushQueue]);

  return (
    <>
      {/* DeviceBannedScreen — يغطي التطبيق بالكامل إذا كان الجهاز محظوراً */}
      {deviceBan?.banned && (
        <DeviceBannedScreen reason={deviceBan.reason} bannedAt={deviceBan.banned_at} />
      )}

      {/* MaintenanceScreen — يغطي التطبيق بالكامل فوراً من لوحة الإدارة */}
      {!deviceBan?.banned && flags.ff_maintenance_mode && <MaintenanceScreen />}

      {/* SessionConflictScreen — الحساب مفتوح على جهاز آخر */}
      {!deviceBan?.banned && !flags.ff_maintenance_mode && sessionConflict && <SessionConflictScreen />}

      {/* ForceUpdateScreen — يغطي كل شيء ولا يسمح بالدخول حتى التحديث */}
      {!deviceBan?.banned && !flags.ff_maintenance_mode && !sessionConflict && forceUpdate && (
        <ForceUpdateScreen
          apkUrl={latestVersion?.apk_url}
          latestVersion={latestVersion?.version}
        />
      )}

      {/* SplashOverlay خارج كل Route — إضافة حاجز أخطاء محلي يمنع كراش Sentry */}
      {showSplash && (
        <PageErrorBoundary pageName="splash-overlay">
          <SplashOverlay onDone={handleSplashDone} />
        </PageErrorBoundary>
      )}

      {/* PostSplashNavigator يقرأ حالة Auth ويوجّه — حمايته تمنع رفع الخطأ لـ Sentry */}
      {navigateNow && (
        <PageErrorBoundary pageName="post-splash-nav">
          <PostSplashNavigator onNavigated={handleNavigated} isHotStart={!isColdStart} />
        </PageErrorBoundary>
      )}

      <AppResumeHandler />
      <AndroidBackHandler />
      <NotificationDeepLinkHandler />
      <NavigationStateManager />
      <IntersectObserver />
      <DeviceFingerprintRegistrar />

      <Routes>
        {/* SplashScreen و LoginPage بدون PageErrorBoundary كانا يرسلان الأخطاء مباشرة لـ Sentry */}
        <Route path="/" element={<PageErrorBoundary pageName="splash"><SplashScreen /></PageErrorBoundary>} />
        <Route path="/login" element={<PageErrorBoundary pageName="login"><LoginPage /></PageErrorBoundary>} />
        <Route path="/join/:code"    element={<PageErrorBoundary pageName="join"><S><JoinPage /></S></PageErrorBoundary>} />
        <Route path="/invite/:token" element={<PageErrorBoundary pageName="invite"><S><InvitePage /></S></PageErrorBoundary>} />
        <Route path="/activate" element={<RouteGuard><PageErrorBoundary pageName="activate"><S><ActivationPage /></S></PageErrorBoundary></RouteGuard>} />

        <Route path="/" element={<RouteGuard><MerchantClientGate /></RouteGuard>}>
          <Route path="home"                 element={<PageErrorBoundary pageName="home"><HomePage /></PageErrorBoundary>} />
          <Route path="recharge"             element={<PageErrorBoundary pageName="recharge"><S><RechargePage /></S></PageErrorBoundary>} />
          <Route path="networks"             element={<PageErrorBoundary pageName="networks"><S><NetworksPage /></S></PageErrorBoundary>} />
          <Route path="networks/vodafone"    element={<PageErrorBoundary pageName="vodafone"><S><VodafonePage /></S></PageErrorBoundary>} />
          <Route path="networks/orange"      element={<PageErrorBoundary pageName="orange"><S><OrangePage /></S></PageErrorBoundary>} />
          <Route path="networks/etisalat"    element={<PageErrorBoundary pageName="etisalat"><S><EtisalatPage /></S></PageErrorBoundary>} />
          <Route path="networks/we"          element={<PageErrorBoundary pageName="we"><S><WEPage /></S></PageErrorBoundary>} />
          <Route path="networks/esim"        element={<PageErrorBoundary pageName="esim"><S><ESimPage /></S></PageErrorBoundary>} />
          <Route path="networks/esim/:id"    element={<PageErrorBoundary pageName="esim-detail"><S><ESimDetailPage /></S></PageErrorBoundary>} />
          <Route path="favorites"            element={<PageErrorBoundary pageName="favorites"><S><FavoritesPage /></S></PageErrorBoundary>} />
          <Route path="operations"           element={<PageErrorBoundary pageName="operations"><S><OperationsPage /></S></PageErrorBoundary>} />
          <Route path="operations/:id"       element={<PageErrorBoundary pageName="operation-detail"><S><OperationDetailPage /></S></PageErrorBoundary>} />
          <Route path="my-operations"        element={<PageErrorBoundary pageName="user-operations"><S><UserOperationsPage /></S></PageErrorBoundary>} />
          <Route path="statistics"           element={<PageErrorBoundary pageName="statistics"><S><StatisticsPage /></S></PageErrorBoundary>} />
          <Route path="subscription-history" element={<PageErrorBoundary pageName="subscription-history"><S><SubscriptionHistoryPage /></S></PageErrorBoundary>} />
          <Route path="subscription-detail"  element={<PageErrorBoundary pageName="subscription-detail"><S><SubscriptionDetailPage /></S></PageErrorBoundary>} />
          <Route path="build-info" element={<RouteGuard adminOnly><PageErrorBoundary pageName="build-info"><S><BuildInfoPage /></S></PageErrorBoundary></RouteGuard>} />
          <Route path="updates"              element={<PageErrorBoundary pageName="updates"><S><UpdatesPage /></S></PageErrorBoundary>} />
          <Route path="balance-charge"       element={<PageErrorBoundary pageName="balance-charge"><S><BalanceChargePage /></S></PageErrorBoundary>} />
          <Route path="notifications"        element={<PageErrorBoundary pageName="notifications"><S><NotificationsPage /></S></PageErrorBoundary>} />
          <Route path="settings"             element={<PageErrorBoundary pageName="settings"><S><SettingsPage /></S></PageErrorBoundary>} />
          <Route index element={<Navigate to="/home" replace />} />
        </Route>

        <Route path="/admin"       element={<RouteGuard adminOnly><PageErrorBoundary pageName="admin"><S><AdminDashboard /></S></PageErrorBoundary></RouteGuard>} />
        <Route path="/admin/users/:id"              element={<RouteGuard adminOnly><PageErrorBoundary pageName="admin-user-detail"><S><AdminUserDetail /></S></PageErrorBoundary></RouteGuard>} />
        <Route path="/admin/users/:id/actions"      element={<RouteGuard adminOnly><PageErrorBoundary pageName="admin-user-actions"><S><AdminUserActions /></S></PageErrorBoundary></RouteGuard>} />
        <Route path="/admin/merchants/:id"          element={<RouteGuard adminOnly><PageErrorBoundary pageName="admin-merchant-detail"><S><AdminMerchantDetail /></S></PageErrorBoundary></RouteGuard>} />
        <Route path="/admin/users/:id/subscription" element={<RouteGuard adminOnly><PageErrorBoundary pageName="admin-user-sub"><S><AdminUserSubscription /></S></PageErrorBoundary></RouteGuard>} />
        <Route path="/admin/users/:id/operations"   element={<RouteGuard adminOnly><PageErrorBoundary pageName="admin-user-ops"><S><AdminUserOperations /></S></PageErrorBoundary></RouteGuard>} />
        <Route path="/admin/operations"             element={<RouteGuard adminOnly><PageErrorBoundary pageName="admin-ops"><S><AdminOperationsPage /></S></PageErrorBoundary></RouteGuard>} />
        <Route path="/admin/version-center"         element={<RouteGuard adminOnly><PageErrorBoundary pageName="admin-version"><S><AdminVersionCenter /></S></PageErrorBoundary></RouteGuard>} />
        <Route path="/admin/live-monitoring"        element={<RouteGuard adminOnly><PageErrorBoundary pageName="admin-live"><S><AdminLiveMonitoring /></S></PageErrorBoundary></RouteGuard>} />
        <Route path="/admin/feature-management"     element={<RouteGuard adminOnly><PageErrorBoundary pageName="admin-features"><S><AdminFeatureManagement /></S></PageErrorBoundary></RouteGuard>} />
        <Route path="/admin/duplicate-accounts"     element={<RouteGuard adminOnly><PageErrorBoundary pageName="admin-duplicates"><S><AdminDuplicateAccounts /></S></PageErrorBoundary></RouteGuard>} />
        <Route path="/admin/duplicate-accounts/:fp" element={<RouteGuard adminOnly><PageErrorBoundary pageName="admin-duplicate-detail"><S><AdminDuplicateGroupDetail /></S></PageErrorBoundary></RouteGuard>} />
        <Route path="/system-logs" element={<RouteGuard adminOnly><PageErrorBoundary pageName="system-logs"><S><SystemLogsPage /></S></PageErrorBoundary></RouteGuard>} />
        <Route path="/merchant"    element={<RouteGuard merchantOnly><PageErrorBoundary pageName="merchant"><S><MerchantDashboard /></S></PageErrorBoundary></RouteGuard>} />
        <Route path="*"            element={<Navigate to="/home" replace />} />
      </Routes>

      <OfflineBanner />
      {/* AnnouncementBanner — رسائل الإدارة الفورية */}
      <AnnouncementBanner />
      {/* UpdateBanner كان بدون PageErrorBoundary — أي خطأ فيه كان يصل لـ Sentry.ErrorBoundary */}
      <PageErrorBoundary pageName="update-banner">
        <UpdateBanner />
      </PageErrorBoundary>
      <Toaster
        richColors
        position="top-center"
        expand={false}
        duration={3500}
        toastOptions={{
          style: { direction: 'rtl' },
          classNames: { toast: 'font-sans text-sm' },
        }}
      />
    </>
  );
}

// ─── حماية المحتوى الشاملة ─────────────────────────────────────────────────────
// الطبقة الأولى: منع قوائم السياق + السحب + اختصارات DevTools + مفاتيح المصدر
// الاستثناء الوحيد: حقول الإدخال تعمل بشكل طبيعي
function useContentProtection() {
  useEffect(() => {
    const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA']);
    const isEditable = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      return EDITABLE_TAGS.has(el.tagName) ||
             el.isContentEditable ||
             el.closest('input, textarea, [contenteditable="true"]') !== null;
    };

    // منع قائمة السياق (نسخ / مشاركة / تحديد الكل)
    const onContextMenu = (e: MouseEvent | TouchEvent) => {
      if (!isEditable(e.target)) e.preventDefault();
    };

    // منع السحب (Drag & Drop) للصور والعناصر
    const onDragStart = (e: DragEvent) => {
      if (!isEditable(e.target)) e.preventDefault();
    };

    // منع Pointer/Touch على الصور (Long Press لمشاركة الصورة)
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof HTMLImageElement ||
          e.target instanceof HTMLVideoElement ||
          e.target instanceof HTMLCanvasElement) {
        e.preventDefault();
      }
    };

    // ── منع اختصارات لوحة المفاتيح الخطيرة ──────────────────────────────
    const BLOCKED_KEYS = new Set(['F12', 'F5']);
    const onKeyDown = (e: KeyboardEvent) => {
      const ctrl  = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const key   = e.key;

      // F12: فتح DevTools
      if (BLOCKED_KEYS.has(key)) { e.preventDefault(); e.stopPropagation(); return; }
      // Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C: فتح DevTools
      if (ctrl && shift && ['i', 'I', 'j', 'J', 'c', 'C'].includes(key)) {
        e.preventDefault(); e.stopPropagation(); return;
      }
      // Ctrl+U: عرض المصدر
      if (ctrl && ['u', 'U'].includes(key)) { e.preventDefault(); e.stopPropagation(); return; }
      // Ctrl+S: حفظ الصفحة
      if (ctrl && ['s', 'S'].includes(key)) { e.preventDefault(); e.stopPropagation(); return; }
      // Ctrl+P: طباعة الصفحة
      if (ctrl && ['p', 'P'].includes(key)) { e.preventDefault(); e.stopPropagation(); return; }
      // Ctrl+A: تحديد الكل (فقط خارج حقول الإدخال)
      if (ctrl && ['a', 'A'].includes(key) && !isEditable(e.target)) {
        e.preventDefault(); e.stopPropagation(); return;
      }
    };

    document.addEventListener('contextmenu', onContextMenu, { passive: false, capture: true });
    document.addEventListener('dragstart',   onDragStart,   { passive: false, capture: true });
    document.addEventListener('pointerdown', onPointerDown, { passive: false, capture: true });
    document.addEventListener('keydown',     onKeyDown,     { capture: true });

    return () => {
      document.removeEventListener('contextmenu', onContextMenu, { capture: true });
      document.removeEventListener('dragstart',   onDragStart,   { capture: true });
      document.removeEventListener('pointerdown', onPointerDown, { capture: true });
      document.removeEventListener('keydown',     onKeyDown,     { capture: true });
    };
  }, []);
}

// ── الطبقة الثانية: كشف DevTools المفتوحة ─────────────────────────────────────
// يعتمد على فرق أبعاد النافذة الداخلية/الخارجية
// لا ينطبق على المسؤولين (Admin/Super Admin)
function useDevToolsGuard(isAdmin: boolean) {
  const [devToolsOpen, setDevToolsOpen] = useState(false);

  useEffect(() => {
    if (isAdmin) return; // الأدمن مستثنى

    const THRESHOLD = 160; // فارق البكسل المقبول
    let interval: ReturnType<typeof setInterval> | null = null;

    const check = () => {
      // تجاهل الفحص على أجهزة الموبايل الحقيقية — لا DevTools هناك
      if (typeof window !== 'undefined' && window.outerWidth <= 768 && window.outerHeight <= 1024) {
        setDevToolsOpen(false);
        return;
      }
      const widthDiff  = window.outerWidth  - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      const opened = widthDiff > THRESHOLD || heightDiff > THRESHOLD;
      setDevToolsOpen(opened);
    };

    const startInterval = () => {
      if (interval) return;
      interval = setInterval(check, 3000); // كل 3 ثواني بدلاً من 2
    };

    const stopInterval = () => {
      if (interval) { clearInterval(interval); interval = null; }
    };

    // إيقاف الفحص عند دخول الخلفية — يوفر CPU/RAM على الأجهزة الضعيفة
    const onVisibilityChange = () => {
      if (document.hidden) {
        stopInterval();
        setDevToolsOpen(false); // إخفاء overlay عند الخلفية
      } else {
        startInterval();
        check(); // فحص فوري عند العودة للأمام
      }
    };

    window.addEventListener('resize', check);
    document.addEventListener('visibilitychange', onVisibilityChange);

    // لا نبدأ الفحص إلا إذا كانت الصفحة في المقدمة
    if (!document.hidden) {
      startInterval();
      check();
    }

    return () => {
      stopInterval();
      window.removeEventListener('resize', check);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isAdmin]);

  return devToolsOpen;
}

// ── شاشة التحذير عند اكتشاف DevTools ─────────────────────────────────────────
function DevToolsWarningOverlay() {
  return (
    <div
      dir="rtl"
      style={{
        position:        'fixed',
        inset:           0,
        zIndex:          999999,
        background:      '#0B0B14',
        display:         'flex',
        flexDirection:   'column',
        alignItems:      'center',
        justifyContent:  'center',
        gap:             '16px',
        userSelect:      'none',
      }}
    >
      <div style={{ fontSize: 64 }}>🔒</div>
      <h1 style={{ color: '#E60000', fontSize: 24, fontWeight: 900, margin: 0 }}>
        محتوى محمي
      </h1>
      <p style={{ color: '#ffffff99', fontSize: 15, textAlign: 'center', maxWidth: 300, margin: 0 }}>
        تم اكتشاف أدوات المطوّرين. يُرجى إغلاقها للمتابعة.
      </p>
      <p style={{ color: '#E60000aa', fontSize: 12, margin: 0 }}>
        Vodafone Fakka Premium · محمي بحقوق الملكية
      </p>
    </div>
  );
}

const App: React.FC = () => {
  useContentProtection();
  return (
    <Router>
      <RuntimeConfigProvider>
        <AuthProvider>
          <MerchantProvider>
            <MerchantClientProvider>
              <AppWithGuard />
            </MerchantClientProvider>
          </MerchantProvider>
        </AuthProvider>
      </RuntimeConfigProvider>
    </Router>
  );
};

// AppWithGuard: يحمل profile من AuthContext ويطبق حماية DevTools
function AppWithGuard() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  const devToolsOpen = useDevToolsGuard(isAdmin);

  return (
    <>
      {devToolsOpen && !isAdmin && <DevToolsWarningOverlay />}
      <AppInner />
    </>
  );
}

export default App;
