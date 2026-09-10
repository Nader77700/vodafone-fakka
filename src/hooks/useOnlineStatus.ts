// P6: مراقبة حالة الشبكة — Offline First
// استراتيجية مزدوجة:
//   • في المتصفح (Web): navigator.onLine فقط — ping يفشل بسبب CORS في الـ iframe/browser
//   • في التطبيق الأصلي (Capacitor): ping حقيقي للتأكد من الإنترنت الفعلي
import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';

const PING_URL = 'https://www.gstatic.com/generate_204';
const PING_TIMEOUT_MS = 5000;

// فحص الإنترنت الحقيقي — يعمل فقط في التطبيق الأصلي
async function checkRealInternet(): Promise<boolean> {
  // في الويب → navigator.onLine كافٍ (ping يُعطي false خاطئ بسبب CORS)
  if (!Capacitor.isNativePlatform()) {
    return navigator.onLine;
  }
  if (!navigator.onLine) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    const res = await fetch(PING_URL, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);
    // no-cors → opaque response: لم يُرمَ exception = إنترنت موجود
    return res.type === 'opaque' || res.ok;
  } catch {
    return false;
  }
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const checkingRef = useRef(false);

  const runCheck = async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const result = await checkRealInternet();
      setIsOnline(result);
    } finally {
      checkingRef.current = false;
    }
  };

  useEffect(() => {
    runCheck();

    const handleOnline  = () => runCheck();
    const handleOffline = () => { setIsOnline(false); };
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    // فحص دوري كل 30 ثانية في التطبيق الأصلي فقط
    const interval = Capacitor.isNativePlatform()
      ? setInterval(runCheck, 30_000)
      : null;

    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (interval) clearInterval(interval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return isOnline;
}
