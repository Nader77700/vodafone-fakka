import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { VodafoneDetector } from '@/lib/vodafoneDetector';
import { checkRealConnectivity } from '@/lib/pendingOpsQueue';
import type { NetworkInfo } from '@/lib/vodafoneDetector';

/**
 * يتحقق من نفس شرط الشبكة المستخدم في قسم شحن الرصيد:
 * - اتصال فعلي بالسيرفر (checkRealConnectivity)
 * - على الجهاز الأصلي: يجب أن تكون شريحة البيانات فودافون (canExecuteNative)
 */
export function useVodafoneNetworkStatus() {
  const [ready, setReady] = useState(false);
  const [info, setInfo] = useState<NetworkInfo | null>(null);

  const check = useCallback(async () => {
    const connected = await checkRealConnectivity();
    if (!connected) {
      setReady(false);
      return;
    }
    try {
      const networkInfo = await VodafoneDetector.getNetworkInfo();
      setInfo(networkInfo);
      // على الويب لا يوجد canExecuteNative، فنكتفي بفحص الاتصال
      setReady(networkInfo.canExecuteNative || !Capacitor.isNativePlatform());
    } catch {
      // Fallback: إذا لم يكن البلوجن متاحاً نعتمد الاتصال فقط
      setReady(true);
    }
  }, []);

  useEffect(() => {
    check();

    let removeListener: (() => void) | undefined;
    // addListener غير متاح على الويب — نستخدمه فقط على الأجهزة الأصلية
    if (Capacitor.isNativePlatform()) {
      try {
        VodafoneDetector.addListener('networkStateChanged', check)
          .then((handle) => {
            removeListener = () => handle.remove();
          })
          .catch(() => {
            removeListener = undefined;
          });
      } catch {
        removeListener = undefined;
      }
    }

    const onOnline = () => check();
    const onOffline = () => setReady(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      removeListener?.();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [check]);

  return { ready, info };
}
