// P6: مراقبة حالة الشبكة — Offline First (نسخة محسّنة v3)
// ✅ native: ping لـ Supabase REST (بدون no-cors — مدعوم في WebView)
// ✅ web: navigator.onLine كافٍ (no-cors يفشل في browser بـ CORS)
// ✅ فشل الـ ping لا يعني offline — يتطلب فشل متكرر قبل إعلان offline
// ✅ فحص دوري + Page Visibility + Network events
import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

const PING_TIMEOUT  = 6_000;  // 6 ثوانٍ (زيادة عن 4 لضمان نجاح أول اتصال)
const POLL_INTERVAL = 15_000; // فحص دوري كل 15 ثانية في Capacitor

// فحص الإنترنت الحقيقي
async function checkRealInternet(): Promise<boolean> {
  // في الويب — navigator.onLine كافٍ (no-cors يفشل في iframe/browser)
  if (!Capacitor.isNativePlatform()) return navigator.onLine;
  // Wi-Fi/Mobile غير متصل → offline فوراً
  if (!navigator.onLine) return false;

  // Native: ping لـ Supabase REST API — يعمل دائماً في WebView بدون no-cors
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT);
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      cache:  'no-store',
      signal: ctrl.signal,
      headers: { 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string },
    });
    clearTimeout(timer);
    // أي رد من السيرفر (حتى 401/404) يعني الإنترنت شغّال
    return res.status < 600;
  } catch {
    return false;
  }
}

interface OnlineStatusResult {
  isOnline: boolean;
  recheckNow: () => Promise<void>;
}

export function useOnlineStatus(): OnlineStatusResult {
  const [isOnline, setIsOnline] = useState<boolean>(() => navigator.onLine);
  const checkingRef  = useRef(false);
  // عداد الفشل المتتالي — نعلن offline بعد فشلين متتاليين فقط
  const failCountRef = useRef(0);
  const FAIL_THRESHOLD = 2;

  const runCheck = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const result = await checkRealInternet();
      if (result) {
        failCountRef.current = 0;  // نجاح: أعِد العداد
        setIsOnline(true);
      } else {
        failCountRef.current += 1;
        // أعلن offline فقط بعد فشل متكرر (تجنب false positive)
        if (failCountRef.current >= FAIL_THRESHOLD) {
          setIsOnline(false);
        }
      }
    } finally {
      checkingRef.current = false;
    }
  }, []);

  // recheckNow: تُستخدم من OfflineGate عند زر "إعادة المحاولة" — فشل واحد يكفي للإعلان
  const recheckNow = useCallback(async () => {
    checkingRef.current = false;
    failCountRef.current = FAIL_THRESHOLD; // اضبط العداد ليعمل بعد فشل واحد
    await runCheck();
  }, [runCheck]);

  useEffect(() => {
    runCheck();

    const handleOnline  = () => { failCountRef.current = 0; runCheck(); };
    const handleOffline = () => { failCountRef.current = FAIL_THRESHOLD; setIsOnline(false); };

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
