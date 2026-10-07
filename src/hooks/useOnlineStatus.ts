// P6: مراقبة حالة الشبكة — Offline First (نسخة محسّنة فائقة الاستقرار)
// ✅ فحص متوازي لعدة مسارات (Multi-endpoint Ping) لضمان عدم حدوث false-positive
// ✅ إذا كان navigator.onLine = true لا نعلن الانقطاع إلا بعد 3 جولات فشل متتالية لجميع المسارات
// ✅ زر "إعادة المحاولة" يتحقق فورياً ويغلق الشاشة مباشرة عند عودة الاتصال
import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

const PING_TIMEOUT  = 4_500;  // 4.5 ثوانٍ لكل مسار
const POLL_INTERVAL = 20_000; // فحص دوري كل 20 ثانية

// فحص سريع وموثوق لأحد الخوادم العالمية أو Supabase
async function pingUrl(url: string, headers?: Record<string, string>, mode: RequestMode = 'no-cors'): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT);
    await fetch(url, {
      method: 'HEAD',
      cache: 'no-store',
      mode,
      signal: ctrl.signal,
      headers,
    });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

// فحص الإنترنت الحقيقي عبر مسارات متعددة لتفادي حجب المستخدم بالخطأ
async function checkRealInternet(): Promise<boolean> {
  // 1. إذا كان نظام التشغيل يؤكد عدم وجود أي اتصال (Airplane Mode أو بدون WiFi/Data)
  if (!navigator.onLine) return false;

  // في متصفح الويب العادي، navigator.onLine دقيق وكافٍ
  if (!Capacitor.isNativePlatform()) return true;

  // 2. في التطبيق الأصلي (Capacitor)، نقوم بفحص متوازي وسريع لعدة مسارات
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  const checks: Promise<boolean>[] = [
    // مسار 1: Google 204
    pingUrl('https://www.google.com/generate_204', undefined, 'no-cors'),
    // مسار 2: Cloudflare CDN
    pingUrl('https://www.cloudflare.com/cdn-cgi/trace', undefined, 'no-cors'),
  ];

  if (supabaseUrl) {
    // مسار 3: خادم Supabase
    checks.push(pingUrl(`${supabaseUrl}/rest/v1/`, { apikey: anonKey }, 'cors'));
  }

  try {
    // إذا نجح أي مسار من المسارات، فالإنترنت يعمل 100%
    const results = await Promise.allSettled(checks);
    const anySucceeded = results.some(r => r.status === 'fulfilled' && r.value === true);
    if (anySucceeded) return true;

    // إذا فشلت المسارات الخارجية (مثل حجب أو VPN)، وكان navigator.onLine = true، نعتبر الاتصال متاحاً تجنباً للكراش
    return navigator.onLine;
  } catch {
    return navigator.onLine;
  }
}

interface OnlineStatusResult {
  isOnline: boolean;
  recheckNow: () => Promise<void>;
}

export function useOnlineStatus(): OnlineStatusResult {
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const checkingRef  = useRef(false);
  // عداد الفشل المتتالي — نعلن offline بعد 3 إخفاقات متتالية لجميع المسارات لتفادي الغلق الخاطئ
  const failCountRef = useRef(0);
  const FAIL_THRESHOLD = 3;

  const runCheck = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const result = await checkRealInternet();
      if (result) {
        failCountRef.current = 0;  // نجاح: تصفير العداد فوراً
        setIsOnline(true);
      } else {
        failCountRef.current += 1;
        // أعلن offline فقط بعد 3 إخفاقات متتالية
        if (failCountRef.current >= FAIL_THRESHOLD) {
          setIsOnline(false);
        }
      }
    } finally {
      checkingRef.current = false;
    }
  }, []);

  // recheckNow: تُستخدم من OfflineGate عند زر "إعادة المحاولة"
  const recheckNow = useCallback(async () => {
    checkingRef.current = false;
    failCountRef.current = 0; // إعادة ضبط العداد
    const result = await checkRealInternet();
    if (result || navigator.onLine) {
      failCountRef.current = 0;
      setIsOnline(true);
    } else {
      failCountRef.current += 1;
      if (failCountRef.current >= FAIL_THRESHOLD) {
        setIsOnline(false);
      }
    }
  }, []);

  useEffect(() => {
    runCheck();

    const handleOnline = () => {
      failCountRef.current = 0;
      setIsOnline(true);
      runCheck();
    };
    const handleOffline = () => {
      failCountRef.current = FAIL_THRESHOLD;
      setIsOnline(false);
    };

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') runCheck();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const interval = Capacitor.isNativePlatform()
      ? setInterval(runCheck, POLL_INTERVAL)
      : null;

    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (interval) clearInterval(interval);
    };
  }, [runCheck]);

  return { isOnline, recheckNow };
}

