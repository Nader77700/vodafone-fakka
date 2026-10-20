// ── VIP Background Execution & Notification Manager ──
// Supports Screen WakeLock, Web Audio Keep-Alive for background execution, and System Notifications

let wakeLockSentinel: any = null;
let audioContext: AudioContext | null = null;
let audioInterval: any = null;

/**
 * Request notification permissions (Browser Notification API)
 */
export async function requestVipNotificationPermission(): Promise<boolean> {
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

/**
 * Start silent Audio Keep-Alive to keep JavaScript thread active in mobile background
 */
export function startAudioKeepAlive() {
  try {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    if (!audioContext) {
      audioContext = new AudioCtx();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    // Ping low-frequency near-silent audio pulse every 15s to keep the browser process active
    if (!audioInterval) {
      audioInterval = setInterval(() => {
        try {
          if (!audioContext) return;
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          // Virtually silent (gain 0.001)
          gain.gain.value = 0.001;
          osc.connect(gain);
          gain.connect(audioContext.destination);
          osc.frequency.setValueAtTime(200, audioContext.currentTime);
          osc.start();
          osc.stop(audioContext.currentTime + 0.1);
        } catch (_) {}
      }, 15000);
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
    if (audioInterval) {
      clearInterval(audioInterval);
      audioInterval = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
  } catch (_) {}
}

/**
 * Start full background execution protection
 */
export async function enableVipBackgroundExecution(): Promise<void> {
  await acquireScreenWakeLock();
  startAudioKeepAlive();
}

/**
 * Disable background execution protection
 */
export async function disableVipBackgroundExecution(): Promise<void> {
  await releaseScreenWakeLock();
  stopAudioKeepAlive();
}
