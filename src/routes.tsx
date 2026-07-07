import type { ReactNode } from 'react';
import { lazy, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import SplashScreen from './pages/SplashScreen';
import LoginPage from './pages/LoginPage';
import MainLayout from './components/layouts/MainLayout';
import HomePage from './pages/HomePage';

// ── تحميل كسول لتسريع الفتح الأول ──────────────────────────────
const ActivationPage        = lazy(() => import('./pages/ActivationPage'));
const RechargePage          = lazy(() => import('./pages/RechargePage'));
const FavoritesPage         = lazy(() => import('./pages/FavoritesPage'));
const OperationsPage        = lazy(() => import('./pages/OperationsPage'));
const StatisticsPage        = lazy(() => import('./pages/StatisticsPage'));
const NotificationsPage     = lazy(() => import('./pages/NotificationsPage'));
const SettingsPage          = lazy(() => import('./pages/SettingsPage'));
const AdminDashboard        = lazy(() => import('./pages/AdminDashboard'));
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
      { name: 'Redirect',            path: '',                      element: <Navigate to="/home" replace /> },
    ],
  },

  { name: 'Admin',      path: '/admin',       element: <S><AdminDashboard /></S>, adminOnly: true },
  { name: 'SystemLogs', path: '/system-logs', element: <S><SystemLogsPage /></S>, adminOnly: true },
  { name: 'InvitePage', path: '/invite/:token', element: <S><InvitePage /></S>, public: true },
];
