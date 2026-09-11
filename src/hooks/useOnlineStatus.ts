// P6: مراقبة حالة الشبكة — Offline First (نسخة محسّنة v2)
// ✅ يُرجع { isOnline, recheckNow } بدل قيمة مجردة
// ✅ multi-URL ping: يحاول 3 عناوين، يكفي نجاح واحد
// ✅ فشل الـ ping لا يعني offline — يتطلب فشل متكرر قبل إعلان offline
// ✅ navigator.onLine = false → offline فوري (بلا ping)
// ✅ فحص دوري + Page Visibility + Network events
import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

const PING_TIMEOUT  = 4_000;  // 4 ثوانٍ لكل محاولة
const POLL_INTERVAL = 15_000; // فحص دوري كل 15 ثانية في Capacitor

// عناوين متعددة — يكفي نجاح واحد لتأكيد الاتصال
const PING_URLS = [
  'https://www.gstatic.com/generate_204',
  'https://connectivitycheck.gstatic.com/generate_204',
  'https://clients3.google.com/generate_204',
];

// فحص الإنترنت الحقيقي — يجرب عدة عناوين بالتوازي
async function checkRealInternet(): Promise<boolean> {
  // في الويب — navigator.onLine كافٍ (ping يفشل بـ CORS في browser/iframe)
  if (!Capacitor.isNativePlatform()) return navigator.onLine;
  // Wi-Fi/Mobile غير متصل → offline فوراً
  if (!navigator.onLine) return false;

  // جرّب كل العناوين بالتوازي — يكفي نجاح واحد
  const results = await Promise.allSettled(
    PING_URLS.map(url => {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT);
      return fetch(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-store', signal: ctrl.signal })
        .then(res => { clearTimeout(timer); return res.type === 'opaque' || res.ok; })
        .catch(() => { clearTimeout(timer); return false; });
    })
  );
  // يكفي نجاح واحد من الثلاثة
  return results.some(r => r.status === 'fulfilled' && r.value === true);
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
