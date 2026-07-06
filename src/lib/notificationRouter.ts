// ── Notification Router ────────────────────────────────────────────────────
// يحوّل أي قيمة (action_url / deep_link / page / type) إلى مسار React Router
// يدعم: Cold Start · Warm Start · Foreground · Background · Terminated

const IS_DEV = import.meta.env.DEV;

// ─── خريطة الأنواع → المسارات ──────────────────────────────────────────────
const TYPE_ROUTE_MAP: Record<string, string> = {
  // اشتراكات
  subscription_renewal:   '/subscription-history',
  subscription_expiry:    '/subscription-history',
  subscription_activated: '/subscription-history',
  subscription_failed:    '/activate',
  subscription:           '/subscription-history',
  renew:                  '/subscription-history',
  // تحديثات
  update_available:       '/updates',
  update_downloaded:      '/updates',
  update_installed:       '/updates',
  update_critical:        '/updates',
  update:                 '/updates',
  // عمليات
  operation:              '/operations',
  operations:             '/operations',
  // إشعارات عامة
  message:                '/notifications',
  info:                   '/notifications',
  system:                 '/notifications',
  announcement:           '/notifications',
  offer:                  '/notifications',
  maintenance:            '/notifications',
  // دعم
  support:                '/support',
  contact:                '/support',
  // أمان
  security:               '/settings',
  // ملف شخصي / محفظة
  profile:                '/profile',
  wallet:                 '/wallet',
  // أخرى
  orders:                 '/operations',
  history:                '/subscription-history',
  home:                   '/home',
  dashboard:              '/home',
  admin:                  '/admin',
  about:                  '/settings',
};

// ─── خريطة الصفحات القصيرة ───────────────────────────────────────────────
const PAGE_ROUTE_MAP: Record<string, string> = {
  home:                 '/home',
  dashboard:            '/home',
  notifications:        '/notifications',
  subscription:         '/subscription-history',
  'subscription-history': '/subscription-history',
  renew:                '/subscription-history',
  profile:              '/settings',
  wallet:               '/operations',
  orders:               '/operations',
  history:              '/subscription-history',
  settings:             '/settings',
  support:              '/support',
  'contact-owner':      '/support',
  update:               '/updates',
  about:                '/settings',
  updates:              '/updates',  admin:                '/admin',
  'system-logs':        '/system-logs',
  recharge:             '/recharge',
  favorites:            '/favorites',
  operations:           '/operations',
  statistics:           '/statistics',
  'build-info':         '/build-info',
  activate:             '/activate',
};

/** سجّل رسالة debug فقط في بيئة التطوير */
export function notifLog(event: string, payload?: Record<string, unknown>) {
  if (!IS_DEV) return;
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[NotifRouter ${ts}] ${event}`, payload ?? '');
}

/** حوّل بيانات الإشعار إلى مسار React Router */
export function resolveRoute(data: Record<string, string | undefined>): string {
  const actionUrl = data.action_url?.trim();
  const deepLink  = data.deep_link?.trim();
  const page      = data.page?.trim()?.toLowerCase();
  const type      = data.type?.trim()?.toLowerCase();

  // 1. action_url (مسار كامل مثل /notifications أو /settings)
  if (actionUrl) {
    const route = actionUrl.startsWith('/') ? actionUrl : `/${actionUrl}`;
    notifLog('resolveRoute → action_url', { route });
    return route;
  }

  // 2. deep_link (قد يكون URL كامل أو مسار)
  if (deepLink) {
    try {
      const url = new URL(deepLink);
      const route = url.pathname || '/home';
      notifLog('resolveRoute → deep_link (URL)', { route });
      return route;
    } catch {
      const route = deepLink.startsWith('/') ? deepLink : `/${deepLink}`;
      notifLog('resolveRoute → deep_link (path)', { route });
      return route;
    }
  }

  // 3. page (اسم صفحة قصير)
  if (page && PAGE_ROUTE_MAP[page]) {
    notifLog('resolveRoute → page', { page, route: PAGE_ROUTE_MAP[page] });
    return PAGE_ROUTE_MAP[page];
  }

  // 4. type → خريطة الأنواع
  if (type && TYPE_ROUTE_MAP[type]) {
    notifLog('resolveRoute → type', { type, route: TYPE_ROUTE_MAP[type] });
    return TYPE_ROUTE_MAP[type];
  }

  // 5. fallback — Dashboard
  notifLog('resolveRoute → fallback /home', { data });
  return '/home';
}
