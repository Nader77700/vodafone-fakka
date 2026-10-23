import type { ReactNode } from 'react';
import { lazy, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import SplashScreen from './pages/SplashScreen';
import LoginPage from './pages/LoginPage';
import MainLayout from './components/layouts/MainLayout';
import HomePage from './pages/HomePage';

// ── دالة تحميل كسول مرنة تدعم إعادة المحاولة التلقائية عند عثرات الشبكة أو تحديثات Vite ──
function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 3
) {
  return lazy(async () => {
    for (let i = 0; i < retries; i++) {
      try {
        return await factory();
      } catch (error: any) {
        const isDynamicImportError =
          error?.message?.includes('Failed to fetch dynamically imported module') ||
          error?.name === 'TypeError' ||
          String(error).includes('dynamically imported');

        if (i < retries - 1 && isDynamicImportError) {
          await new Promise((res) => setTimeout(res, 600 * (i + 1)));
          continue;
        }

        if (isDynamicImportError && typeof window !== 'undefined') {
          const key = 'vfp_dyn_reload';
          const lastReload = parseInt(sessionStorage.getItem(key) || '0', 10);
          if (Date.now() - lastReload > 8000) {
            sessionStorage.setItem(key, String(Date.now()));
            window.location.reload();
          }
        }
        throw error;
      }
    }
    return factory();
  });
}

// ── تحميل كسول لتسريع الفتح الأول مع حماية من تعثر الوحدات ──────────────────────────────
const ActivationPage        = lazyWithRetry(() => import('./pages/ActivationPage'));
const RechargePage          = lazyWithRetry(() => import('./pages/RechargePage'));
const FavoritesPage         = lazyWithRetry(() => import('./pages/FavoritesPage'));
const OperationsPage        = lazyWithRetry(() => import('./pages/OperationsPage'));
const StatisticsPage        = lazyWithRetry(() => import('./pages/StatisticsPage'));
const NotificationsPage     = lazyWithRetry(() => import('./pages/NotificationsPage'));
const SettingsPage          = lazyWithRetry(() => import('./pages/SettingsPage'));
const AdminDashboard        = lazyWithRetry(() => import('./pages/AdminDashboard'));
const AdminServicesControlPage = lazyWithRetry(() => import('./pages/admin/AdminServicesControlPage'));
const AdminHotfixPage          = lazyWithRetry(() => import('./pages/admin/AdminHotfixPage'));
const AdminLineInfoDebugPage   = lazyWithRetry(() => import('./pages/admin/AdminLineInfoDebugPage'));
const AdminVipRedSettingsPage  = lazyWithRetry(() => import('./pages/admin/AdminVipRedSettingsPage'));
const VipRedCenterPage          = lazyWithRetry(() => import('./pages/vip-red/VipRedCenterPage'));
const VipRedMerchantsPage       = lazyWithRetry(() => import('./pages/vip-red/VipRedMerchantsPage'));
const VipRedMerchantDetailsPage = lazyWithRetry(() => import('./pages/vip-red/VipRedMerchantDetailsPage'));
const VipRedRenewalsPage        = lazyWithRetry(() => import('./pages/vip-red/VipRedRenewalsPage'));
const VipRedRequestsPage        = lazyWithRetry(() => import('./pages/vip-red/VipRedRequestsPage'));
const VipPage                   = lazyWithRetry(() => import('./pages/vip/VipPage'));
const VipTemporarySharePage     = lazyWithRetry(() => import('./pages/vip/VipTemporarySharePage'));
const SubscriptionHistoryPage = lazy(() => import('./pages/SubscriptionHistoryPage'));
const UpdatesPage           = lazy(() => import('./pages/UpdatesPage'));
const BuildInfoPage         = lazy(() => import('./pages/BuildInfoPage'));
const SystemLogsPage        = lazy(() => import('./pages/SystemLogsPage'));
const NetworksPage          = lazy(() => import('./pages/NetworksPage'));
const VodafonePage          = lazy(() => import('./pages/networks/VodafonePage'));
const PackageDetailPage     = lazy(() => import('./pages/networks/PackageDetailPage'));
const SubscribePackagePage  = lazy(() => import('./pages/networks/SubscribePackagePage'));
const OrangePage            = lazy(() => import('./pages/networks/OrangePage'));
const EtisalatPage          = lazy(() => import('./pages/networks/EtisalatPage'));
const WEPage                = lazy(() => import('./pages/networks/WEPage'));
const ESimPage              = lazy(() => import('./pages/networks/ESimPage'));
const ESimDetailPage        = lazy(() => import('./pages/networks/ESimDetailPage'));
const BalanceChargePage     = lazy(() => import('./pages/BalanceChargePage'));
const InvitePage            = lazy(() => import('./pages/InvitePage'));
const DownloadPage          = lazy(() => import('./pages/DownloadPage'));
const ReferralPage          = lazy(() => import('./pages/ReferralPage'));
const RefLandingPage        = lazy(() => import('./pages/RefLandingPage'));

// ── PHASE 1: Services Hub + Wallet Lines ─────────────────────────
const ServicesPage              = lazy(() => import('./pages/ServicesPage'));
const WalletLinesPage           = lazy(() => import('./pages/wallet-lines/WalletLinesPage'));
const WalletLinesLoginPage      = lazy(() => import('./pages/wallet-lines/WalletLinesLoginPage'));
const WalletLinesRegisterPage   = lazy(() => import('./pages/wallet-lines/WalletLinesRegisterPage'));
const WalletLinesOtpPage        = lazy(() => import('./pages/wallet-lines/WalletLinesOtpPage'));
const WalletLinesNationalIdPage = lazy(() => import('./pages/wallet-lines/WalletLinesNationalIdPage'));
const WalletLinesResultsPage    = lazy(() => import('./pages/wallet-lines/WalletLinesResultsPage'));
const WalletLinesChangePasswordPage = lazy(() => import('./pages/wallet-lines/WalletLinesChangePasswordPage'));
const VodafoneOffersPage           = lazy(() => import('./pages/vodafone-offers/VodafoneOffersPage'));
const FlexOffersPage               = lazy(() => import('./pages/vodafone-offers/FlexOffersPage'));
const InternetOffersPage           = lazy(() => import('./pages/vodafone-offers/InternetOffersPage'));
const OtherOffersPage              = lazy(() => import('./pages/vodafone-offers/OtherOffersPage'));
const UpcomingSubscriptionsPage    = lazy(() => import('./pages/vodafone-offers/UpcomingSubscriptionsPage'));
const BalanceRechargeShortcutPage  = lazy(() => import('./pages/vodafone-offers/BalanceRechargeShortcutPage'));

// Fallback خفيف أثناء التحميل الكسول
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  </div>
);

// مساعد تغليف Suspense
const S = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<PageLoader />}>{children}</Suspense>
);

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  public?: boolean;
  adminOnly?: boolean;
  children?: RouteConfig[];
}

export const routes: RouteConfig[] = [
  { name: 'Splash',     path: '/',       element: <SplashScreen />, public: true },
  { name: 'Login',      path: '/login',  element: <LoginPage />,    public: true },
  { name: 'Activation', path: '/activate', element: <S><ActivationPage /></S> },

  {
    name: 'App',
    path: '/',
    element: <MainLayout />,
    children: [
      { name: 'Home',                path: '/home',                 element: <HomePage /> },
      { name: 'Recharge',            path: '/recharge',             element: <S><RechargePage /></S> },
      { name: 'Networks',            path: '/networks',             element: <S><NetworksPage /></S> },
      { name: 'NetworkESim',         path: '/networks/esim',        element: <S><ESimPage /></S> },
      { name: 'NetworkESimDetail',   path: '/networks/esim/:id',    element: <S><ESimDetailPage /></S> },
      { name: 'NetworkVodafone',          path: '/networks/vodafone',              element: <S><VodafonePage /></S> },
      { name: 'NetworkVodafonePackage',    path: '/networks/vodafone/package/:id',  element: <S><PackageDetailPage /></S> },
      { name: 'NetworkVodafoneSubscribe',  path: '/networks/vodafone/subscribe/:id',element: <S><SubscribePackagePage /></S> },
      { name: 'NetworkOrange',       path: '/networks/orange',      element: <S><OrangePage /></S> },
      { name: 'NetworkEtisalat',     path: '/networks/etisalat',    element: <S><EtisalatPage /></S> },
      { name: 'NetworkWE',           path: '/networks/we',          element: <S><WEPage /></S> },
      { name: 'Favorites',           path: '/favorites',            element: <S><FavoritesPage /></S> },
      { name: 'Operations',          path: '/operations',           element: <S><OperationsPage /></S> },
      { name: 'Statistics',          path: '/statistics',           element: <S><StatisticsPage /></S> },
      { name: 'Notifications',       path: '/notifications',        element: <S><NotificationsPage /></S> },
      { name: 'Settings',            path: '/settings',             element: <S><SettingsPage /></S> },
      { name: 'SubscriptionHistory', path: '/subscription-history', element: <S><SubscriptionHistoryPage /></S> },
      { name: 'BuildInfo',           path: '/build-info',           element: <S><BuildInfoPage /></S> },
      { name: 'Updates',             path: '/updates',              element: <S><UpdatesPage /></S> },
      { name: 'BalanceCharge',       path: '/balance-charge',       element: <S><BalanceChargePage /></S> },
      { name: 'Referral',            path: '/referrals',            element: <S><ReferralPage /></S> },

      // ── PHASE 1: Services Hub + Wallet Lines (لا تُعدِّل Routes القديمة) ──
      { name: 'Services',                path: '/services',                        element: <S><ServicesPage /></S> },
      { name: 'WalletLines',             path: '/wallet-lines',                    element: <S><WalletLinesPage /></S> },
      { name: 'WalletLinesLogin',        path: '/wallet-lines/login',              element: <S><WalletLinesLoginPage /></S> },
      { name: 'WalletLinesRegister',     path: '/wallet-lines/register',           element: <S><WalletLinesRegisterPage /></S> },
      { name: 'WalletLinesOtp',          path: '/wallet-lines/otp',                element: <S><WalletLinesOtpPage /></S> },
      { name: 'WalletLinesNationalId',   path: '/wallet-lines/national-id',        element: <S><WalletLinesNationalIdPage /></S> },
      { name: 'WalletLinesResults',      path: '/wallet-lines/results',            element: <S><WalletLinesResultsPage /></S> },
      { name: 'WalletLinesChangePassword', path: '/wallet-lines/change-password',  element: <S><WalletLinesChangePasswordPage /></S> },
      { name: 'VodafoneOffers',           path: '/vodafone-offers',                  element: <S><VodafoneOffersPage /></S> },
      { name: 'VodafoneOffersFlex',       path: '/vodafone-offers/flex',             element: <S><FlexOffersPage /></S> },
      { name: 'VodafoneOffersInternet',   path: '/vodafone-offers/internet',         element: <S><InternetOffersPage /></S> },
      { name: 'VodafoneOffersOther',      path: '/vodafone-offers/other',            element: <S><OtherOffersPage /></S> },
      { name: 'VodafoneOffersSubscriptions', path: '/vodafone-offers/subscriptions', element: <S><UpcomingSubscriptionsPage /></S> },
      { name: 'VodafoneOffersRecharge',   path: '/vodafone-offers/recharge',         element: <S><BalanceRechargeShortcutPage /></S> },

      // ── VIP RED Center: قسم إدارة باقات ريد VIP المستقل ──
      { name: 'VipRedCenter',             path: '/vip-red',                          element: <S><VipRedCenterPage /></S> },
      { name: 'VipRedCenterAlias',        path: '/red-vip',                          element: <Navigate to="/vip-red" replace /> },
      { name: 'VipRedMerchants',          path: '/vip-red/merchants',                element: <S><VipRedMerchantsPage /></S> },
      { name: 'VipRedMerchantDetails',    path: '/vip-red/merchants/:id',            element: <S><VipRedMerchantDetailsPage /></S> },
      { name: 'VipRedRenewals',           path: '/vip-red/renewals',                 element: <S><VipRedRenewalsPage /></S> },
      { name: 'VipRedRequests',           path: '/vip-red/requests',                 element: <S><VipRedRequestsPage /></S> },

      // ── VIP Section (Phase 1): قسم إدارة باقات VIP المستقل للأونر ──
      { name: 'VipManagement',            path: '/vip',                              element: <S><VipPage /></S> },

      { name: 'Redirect',            path: '',                      element: <Navigate to="/home" replace /> },
    ],
  },

  { name: 'SystemLogs',            path: '/system-logs',               element: <S><SystemLogsPage /></S>, adminOnly: true },
  { name: 'AdminServicesControl',  path: '/admin/services-control',    element: <S><AdminServicesControlPage /></S>, adminOnly: true },
  { name: 'AdminHotfix',           path: '/admin/hotfix',               element: <S><AdminHotfixPage /></S>,           adminOnly: true },
  { name: 'AdminLineInfoDebug',    path: '/admin/line-info-debug',      element: <S><AdminLineInfoDebugPage /></S>,     adminOnly: true },
  { name: 'AdminVipRedSettings',   path: '/admin/vip-red',              element: <S><AdminVipRedSettingsPage /></S>,    adminOnly: true },
  { name: 'InvitePage', path: '/invite/:token', element: <S><InvitePage /></S>, public: true },
  { name: 'RefPage',    path: '/ref/:code',     element: <S><RefLandingPage /></S>, public: true },
  { name: 'Download',   path: '/download',    element: <S><DownloadPage /></S>, public: true },

  // ── Standalone Isolated Temporary VIP Section Link ──
  { name: 'VipTemporaryShare',      path: '/vip-share/:token', element: <S><VipTemporarySharePage /></S>, public: true },
  { name: 'VipTemporaryShareAlias', path: '/temp-vip/:token',  element: <S><VipTemporarySharePage /></S>, public: true },
];
