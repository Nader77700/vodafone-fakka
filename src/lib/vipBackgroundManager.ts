// ── VIP Background Execution & Notification Manager ──
// Supports Screen WakeLock, Web Audio Keep-Alive for background execution, Native Sticky Android Curtain Notifications, and Remote FCM Push
import { supabase } from '@/db/supabase';
import { LocalNotifications } from '@capacitor/local-notifications';

let wakeLockSentinel: any = null;
let audioContext: AudioContext | null = null;
let audioInterval: any = null;
let backgroundWorker: Worker | null = null;
let silentAudioEl: HTMLAudioElement | null = null;
let isNativeCurtainActive = false;

// Channel ID for persistent background automation
const VIP_NOTIFICATION_CHANNEL_ID = 'vip-continuous-automation-channel';
const VIP_STICKY_NOTIFICATION_ID = 9911;

// Minimal base64 1-second silent WAV
const SILENT_WAV_BASE64 =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

/**
 * Start dedicated Web Worker ticker to bypass background tab throttling
 */
export function startWorkerKeepAlive(onTick?: () => void) {
  try {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return;
    if (backgroundWorker) return;

    const workerBlob = new Blob(
      [
        `
        let timer = null;
        self.onmessage = function(e) {
          if (e.data === 'start') {
            if (timer) clearInterval(timer);
            timer = setInterval(function() {
              self.postMessage('tick');
            }, 1000);
          } else if (e.data === 'stop') {
            if (timer) clearInterval(timer);
            timer = null;
          }
        };
      `,
      ],
      { type: 'application/javascript' }
    );

    backgroundWorker = new Worker(URL.createObjectURL(workerBlob));
    backgroundWorker.onmessage = () => {
      if (onTick) onTick();
    };
    backgroundWorker.postMessage('start');
  } catch (err) {
    console.warn('[VipBackground] Web Worker error:', err);
  }
}

/**
 * Stop dedicated Web Worker ticker
 */
export function stopWorkerKeepAlive() {
  try {
    if (backgroundWorker) {
      backgroundWorker.postMessage('stop');
      backgroundWorker.terminate();
      backgroundWorker = null;
    }
  } catch (_) {}
}

/**
 * Start silent HTML5 Audio element + Web Audio keep-alive + MediaSession
 * Android foreground media playback prevents OS from freezing WebView when user switches to WhatsApp or locks screen
 */
export function startAudioKeepAlive() {
  try {
    if (typeof window === 'undefined') return;

    // 1. Android MediaSession foreground registration
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'اتصالات VIP - الأتمتة المستمرة بالخلفية',
          artist: 'Vodafone Fakka Premium',
          album: 'خلفية نشطة بدون توقف',
        });
        navigator.mediaSession.playbackState = 'playing';
        navigator.mediaSession.setActionHandler('play', () => {
          if (silentAudioEl) silentAudioEl.play().catch(() => {});
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          // Prevent external pause from halting automation
          if (silentAudioEl) silentAudioEl.play().catch(() => {});
        });
      } catch (_) {}
    }

    // 2. HTML5 Audio Element Loop
    if (!silentAudioEl) {
      silentAudioEl = new Audio(SILENT_WAV_BASE64);
      silentAudioEl.loop = true;
      silentAudioEl.volume = 0.001;
      (silentAudioEl as any).playsInline = true;
      silentAudioEl.setAttribute('playsinline', 'true');
      silentAudioEl.setAttribute('webkit-playsinline', 'true');
      const playPromise = silentAudioEl.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Autoplay policy might block until first user click
        });
      }
    }

    // 3. Web Audio Context initialization (without continuous CPU battery-draining intervals)
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      if (!audioContext) {
        audioContext = new AudioCtx();
      }
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[VipBackground] Audio Keep-Alive error:', err);
  }
}

/**
 * Stop Audio Keep-Alive
 */
export function stopAudioKeepAlive() {
  try {
    if (silentAudioEl) {
      silentAudioEl.pause();
      silentAudioEl.src = '';
      silentAudioEl = null;
    }
    if (audioInterval) {
      clearInterval(audioInterval);
      audioInterval = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
  } catch (err) {
    console.warn('[VipBackground] Stop Audio Keep-Alive error:', err);
  }
}

/**
 * Start full background execution protection
 */
export async function enableVipBackgroundExecution(): Promise<void> {
  await acquireScreenWakeLock();
  startAudioKeepAlive();
  startWorkerKeepAlive();
}

/**
 * Disable background execution protection
 */
export async function disableVipBackgroundExecution(): Promise<void> {
  await releaseScreenWakeLock();
  stopAudioKeepAlive();
  stopWorkerKeepAlive();
}
export async function requestVipNotificationPermission(): Promise<boolean> {
  // 1. Try Capacitor native local notifications permission first
  try {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display === 'granted') {
      await ensureVipNotificationChannel();
      return true;
    }
  } catch (_) {}

  // 2. Web Notification fallback
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission === 'granted') {
    return true;
  }
  if (Notification.permission === 'denied') {
    return false;
  }
  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch {
    return false;
  }
}

/**
 * Ensure notification channel with max priority exists on Android
 */
async function ensureVipNotificationChannel() {
  try {
    await LocalNotifications.createChannel({
      id: VIP_NOTIFICATION_CHANNEL_ID,
      name: 'أتمتة اتصالات VIP المستمرة',
      description: 'إشعار مثبت في ستارة الهاتف أثناء تشغيل الدورات بالخلفية 24/7',
      importance: 5, // MAX importance in Android (heads up & high priority)
      visibility: 1, // Public on lockscreen
      sound: undefined,
      vibration: false,
      lights: false,
    });
  } catch (err) {
    console.warn('[VipBackground] Create channel error:', err);
  }
}

/**
 * Check if notifications are granted
 */
export function isVipNotificationGranted(): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  return Notification.permission === 'granted';
}

/**
 * Show a native system notification with sound/vibrate support
 */
export function showVipNotification(
  title: string,
  body: string,
  options?: { icon?: string; tag?: string; priority?: 'normal' | 'high' }
) {
  try {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      const notif = new Notification(title, {
        body,
        icon: options?.icon || '/favicon.ico',
        badge: '/favicon.ico',
        tag: options?.tag || 'vip-automation',
        dir: 'rtl',
        lang: 'ar',
      });

      notif.onclick = () => {
        window.focus();
        notif.close();
      };

      // Also vibrate if supported
      if ('vibrate' in navigator) {
        navigator.vibrate([150, 75, 150]);
      }
    }
  } catch (err) {
    console.warn('[VipBackground] showNotification failed:', err);
  }
}

let activePersistentNotification: any = null;

/**
 * Show a persistent foreground sticky notification in the Android notification curtain (ستارة الهاتف) while automation is running
 * Uses Capacitor LocalNotifications with ongoing: true so Android never dismisses it, plus MediaSession and Web Audio keep-alive
 */
export async function showVipPersistentNotification(
  sessionId: string,
  details = 'الأتمتة السحابية تعمل 24/7 بالسيرفر'
) {
  try {
    if (typeof window !== 'undefined') {
      // 1. Native Capacitor Android Notification in Status Bar / Notification Curtain (ستارة الهاتف)
      try {
        await ensureVipNotificationChannel();
        await LocalNotifications.schedule({
          notifications: [
            {
              id: VIP_STICKY_NOTIFICATION_ID,
              title: '⚡ أتمتة اتصالات VIP تعمل بالخلفية 24/7',
              body: `${details} (نشطة بالستارة والسيرفر بدون توقف)`,
              channelId: VIP_NOTIFICATION_CHANNEL_ID,
              ongoing: true, // Pinned permanently in the Android curtain! Cannot be swiped away.
              autoCancel: false,
              extra: { sessionId },
            },
          ],
        });
        isNativeCurtainActive = true;
      } catch (nativeErr) {
        // Fallback smoothly if running in desktop browser
      }

      // 2. Update MediaSession in status bar
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: '⚡ أتمتة اتصالات VIP نشطة بالسيرفر 24/7',
          artist: 'Vodafone Fakka Premium',
          album: details,
        });
        navigator.mediaSession.playbackState = 'playing';
      }

      // 3. Show Sticky Notification if permission granted on desktop
      if ('Notification' in window && Notification.permission === 'granted') {
        if (activePersistentNotification) {
          try {
            activePersistentNotification.close();
          } catch (_) {}
        }

        activePersistentNotification = new Notification('⚡ اتصالات VIP: الأتمتة السحابية جارية', {
          body: `${details}\nتعمل بالسيرفر بدون توقف حتى لو أغلقت التطبيق أو قفلت الشاشة.`,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: `vip-persistent-${sessionId}`,
          requireInteraction: true, // Keep notification sticky in notification bar
          silent: true,
          dir: 'rtl',
          lang: 'ar',
        });

        activePersistentNotification.onclick = () => {
          window.focus();
        };
      }
    }
  } catch (err) {
    console.warn('[VipBackground] showVipPersistentNotification failed:', err);
  }
}

/**
 * Dismiss persistent sticky notification upon manual stop or target completion
 */
export async function dismissVipPersistentNotification(sessionId?: string) {
  try {
    // 1. Cancel native Android curtain notification
    try {
      await LocalNotifications.cancel({
        notifications: [{ id: VIP_STICKY_NOTIFICATION_ID }],
      });
      isNativeCurtainActive = false;
    } catch (_) {}

    // 2. Dismiss Web Notification
    if (activePersistentNotification) {
      activePersistentNotification.close();
      activePersistentNotification = null;
    }
    if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
    }
  } catch (_) {}
}

/**
 * Send real FCM remote push notification to phone status bar via Edge Function
 * Works even if browser / app is completely closed or screen is off (same as Vodafone Red)
 */
export async function sendVipRemotePushNotification(
  title: string,
  body: string,
  priority: 'normal' | 'important' | 'urgent' = 'important'
): Promise<boolean> {
  try {
    const { data: userAuth } = await supabase.auth.getUser();
    const userId = userAuth?.user?.id;

    const { error } = await supabase.functions.invoke('send-push-notification', {
      body: {
        title,
        body,
        priority,
        action_url: '/vip?tab=dashboard',
        user_id: userId || undefined,
        is_global: !userId, // If no user auth, send to admin devices
        send_push: true,
      },
    });

    if (error) {
      console.warn('[VipBackground] send-push-notification error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[VipBackground] sendVipRemotePushNotification exception:', err);
    return false;
  }
}

/**
 * Acquire Screen Wake Lock to prevent the screen from turning off
 */
export async function acquireScreenWakeLock(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
    return false;
  }
  try {
    if (!wakeLockSentinel) {
      wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
    }
    return true;
  } catch (err) {
    console.warn('[VipBackground] Wake Lock request error:', err);
    return false;
  }
}

/**
 * Release Screen Wake Lock
 */
export async function releaseScreenWakeLock() {
  try {
    if (wakeLockSentinel) {
      await wakeLockSentinel.release();
      wakeLockSentinel = null;
    }
  } catch (_) {}
}
