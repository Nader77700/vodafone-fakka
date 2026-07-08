// ── Hook: إدارة إشعارات FCM ───────────────────────────────────────────────
// يدعم: Cold Start · Warm Start · Foreground · Background · Terminated
// ميزات: NotificationRouter · DuplicateGuard · mark-as-read · Debug Logs
// إصلاح: pendingAction pattern لحل race condition عند Cold Start
import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, type ActionPerformed, type PushNotificationSchema } from '@capacitor/push-notifications';
import { Browser } from '@capacitor/browser';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { resolveRoute, notifLog } from '@/lib/notificationRouter';
import { isNewNotification } from '@/lib/duplicateNotifGuard';
import { BUILD_INFO } from '@/lib/buildInfo';

// ─── نوع الإجراء المعلّق ─────────────────────────────────────────────────────
type PendingAction =
  | { kind: 'external'; url: string }
  | { kind: 'navigate'; route: string };

// ─── فتح رابط خارجي (APK / متصفح) ───────────────────────────────────────────
async function openExternalUrl(url: string) {
  notifLog('openExternalUrl', { url });
  // محاولة Browser.open أولاً
  try {
    await Browser.open({ url, presentationStyle: 'fullscreen' });
    return;
  } catch (e) {
    notifLog('Browser.open failed, trying fallback', { error: String(e) });
  }
  // Fallback 1: window.open
  try {
    window.open(url, '_system');
    return;
  } catch (e2) {
    notifLog('window.open failed, trying location', { error: String(e2) });
  }
  // Fallback 2: location.href
  window.location.href = url;
}

/** هل الرابط خارجي (http/https)? */
function isExternalUrl(str?: string): boolean {
  return !!str && (str.startsWith('http://') || str.startsWith('https://'));
}

/** هل الإشعار نوعه تحديث؟ */
function isUpdateNotification(data: Record<string, string>): boolean {
  const t = (data.type ?? '').toLowerCase();
  return t === 'update' || t === 'update_available' || t === 'update_critical' || t === 'update_downloaded';
}

// ─── تحليل بيانات الإشعار → PendingAction ───────────────────────────────────
function resolveAction(data: Record<string, string>): PendingAction {
  // 1. إشعار تحديث: افتح رابط APK في المتصفح
  const apkUrl = data.apk_url ?? data.download_url;
  if (isUpdateNotification(data) && isExternalUrl(apkUrl)) {
    notifLog('resolveAction → APK external', { apkUrl });
    return { kind: 'external', url: apkUrl! };
  }

  // 2. action_url خارجي (https://wa.me/... أو رابط خارجي)
  if (isExternalUrl(data.action_url)) {
    notifLog('resolveAction → action_url external', { url: data.action_url });
    return { kind: 'external', url: data.action_url! };
  }

  // 3. التنقل الداخلي
  const route = resolveRoute(data);
  notifLog('resolveAction → navigate', { route });
  return { kind: 'navigate', route };
}

// ─── mark notification as read in DB ────────────────────────────────────────
async function markReadByExternalId(externalId: string) {
  if (!externalId) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', session.user.id)
      .eq('external_id', externalId)
      .eq('is_read', false);
    notifLog('Mark Read', { externalId });
  } catch (e) {
    notifLog('Mark Read Error', { error: String(e) });
  }
}

// ─── بيانات إشعار → مفتاح dedup ────────────────────────────────────────────
function extractDedupParams(n: PushNotificationSchema) {
  return {
    messageId:      (n.data?.messageId as string) ?? (n.id as string),
    notificationId: n.id,
    collapseKey:    n.data?.collapseKey as string,
    title:          n.title,
    body:           n.body,
    sentTime:       n.data?.sentTime as string,
  };
}

// ─── تسجيل رمز FCM مع معلومات الجهاز في الخادم ──────────────────────────────
async function registerTokenWithServer(token: string) {
  try {
    const ua = navigator.userAgent || '';
    const modelMatch = ua.match(/;\s*([^;)]+)\s+Build\//);
    const deviceModel = modelMatch ? modelMatch[1].trim() : 'Android';
    const androidMatch = ua.match(/Android\s+([\d.]+)/);
    const osVersion = androidMatch ? `Android ${androidMatch[1]}` : 'Android';

    notifLog('Registering token with server', { model: deviceModel, ver: BUILD_INFO.appVersion });
    await supabase.functions.invoke('register-fcm-token', {
      body: {
        token,
        device_info: { platform: 'android', model: deviceModel, os_version: osVersion },
        app_version: BUILD_INFO.appVersion,
        version_code: BUILD_INFO.versionCode,
      },
    });
  } catch (e) {
    notifLog('registerTokenWithServer error', { error: String(e) });
  }
}

// ─── Hook الرئيسي ────────────────────────────────────────────────────────────
export function usePushNotifications() {
  const navigate      = useNavigate();
  const registered    = useRef(false);

  // pendingAction: يُخزَّن هنا عند tap قبل تهيئة Router (Cold Start)
  // useEffect يراقبه ويطبّقه بمجرد أن تكون المكوّنات جاهزة
  const pendingAction = useRef<PendingAction | null>(null);

  // ─── تطبيق PendingAction بعد تهيئة React Router ──────────────────────────
  useEffect(() => {
    if (!pendingAction.current) return;
    const action = pendingAction.current;
    pendingAction.current = null;

    // تأخير صغير لضمان تهيئة Router الكاملة
    const timer = setTimeout(async () => {
      notifLog('Applying pendingAction', { action });
      if (action.kind === 'external') {
        await openExternalUrl(action.url);
      } else {
        navigate(action.route, { replace: false });
      }
    }, 400);

    return () => clearTimeout(timer);
  }); // بدون dependencies — يعمل عند كل render حتى يُطبَّق الإجراء

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || registered.current) return;
    registered.current = true;

    const setup = async () => {
      // 1. فحص وطلب الصلاحية
      let permission = await PushNotifications.checkPermissions();
      if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
        permission = await PushNotifications.requestPermissions();
      }
      if (permission.receive !== 'granted') {
        notifLog('Permission Denied');
        return;
      }

      // 2. تسجيل الجهاز — دائماً عند كل تشغيل لتحديث app_version
      await PushNotifications.register();

      // 3. حفظ رمز FCM في الخادم مع معلومات الجهاز الكاملة
      PushNotifications.addListener('registration', async ({ value: token }) => {
        notifLog('FCM Token Registered', { token: token.slice(0, 20) + '…' });
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(async (event, sess) => {
            if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && sess) {
              authSub.unsubscribe();
              await registerTokenWithServer(token);
            }
          });
          return;
        }
        await registerTokenWithServer(token);
      });

      // 4. إشعار وصل والتطبيق في المقدمة (Foreground)
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        notifLog('Notification Received (foreground)', {
          title: notification.title,
          id: notification.id,
          data: notification.data as Record<string, unknown>,
        });

        const dedupParams = extractDedupParams(notification);
        if (!isNewNotification(dedupParams)) return;

        const data = (notification.data ?? {}) as Record<string, string>;
        const action = resolveAction(data);

        toast(notification.title ?? 'إشعار جديد', {
          description: notification.body,
          duration: 6000,
          action: {
            label: 'فتح',
            onClick: async () => {
              notifLog('Toast Action Clicked', { action });
              if (action.kind === 'external') {
                await openExternalUrl(action.url);
              } else {
                navigate(action.route);
              }
            },
          },
        });
      });

      // 5. ضغط على إشعار (Background / Cold Start / Terminated)
      // ⚡ الإصلاح: نستخدم pendingAction بدلاً من navigate مباشرة
      // لأن في Cold Start، Router قد لا يكون جاهزاً بعد
      PushNotifications.addListener('pushNotificationActionPerformed', async (action: ActionPerformed) => {
        const notification = action.notification;
        const data = (notification.data ?? {}) as Record<string, string>;

        notifLog('Notification Tapped ✅', {
          id: notification.id,
          actionId: action.actionId,
          type: data.type,
          action_url: data.action_url,
          apk_url: data.apk_url,
        });

        // mark as read
        const extId = data.notification_id ?? data.external_id ?? notification.id ?? '';
        if (extId) markReadByExternalId(extId).catch(() => {/* silent */});

        // حل الإجراء المناسب
        const resolved = resolveAction(data);
        notifLog('Resolved action', { resolved });

        if (resolved.kind === 'external') {
          // للروابط الخارجية: نحاول فتحها مباشرة
          await openExternalUrl(resolved.url);
        } else {
          // للتنقل الداخلي: نستخدم pendingAction لضمان جاهزية Router
          pendingAction.current = resolved;
          // محاولة مباشرة أولاً (Warm Start)
          try {
            navigate(resolved.route, { replace: false });
          } catch {
            // إذا فشلت (Cold Start) — pendingAction سيُطبَّق في useEffect
            notifLog('navigate failed, will retry via pendingAction');
          }
        }
      });
    };

    setup();

    return () => {
      PushNotifications.removeAllListeners();
      registered.current = false; // إعادة تعيين لضمان إعادة التهيئة عند re-mount
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
/** تنظيف رمز FCM عند تسجيل الخروج */
export async function deregisterFCMToken() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    PushNotifications.removeAllListeners();
    notifLog('FCM Listeners Removed (logout)');
  } catch (_) { /* تجاهل */ }
}
