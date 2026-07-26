import { useState, useEffect, useCallback } from 'react';
import { isNativeAndroid } from '../lib/vodafoneDetector';

// @ts-ignore
const VodafoneDetector = typeof window !== 'undefined' && window.Capacitor?.Plugins?.VodafoneDetector;

export interface NetworkInfo {
  canExecuteNative: boolean;
  isVodafoneSim: boolean;
  isVodafoneMobile: boolean;
  isMobileDataActive: boolean;
  isWifiActive: boolean;
  activeNetwork: string;
  activeDataSimOperatorName: string;
  simOperatorName: string;
  networkOperatorName: string;
}

export function useNetworkInfo() {
  const isNativeAPK = isNativeAndroid();
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNetworkInfo = useCallback(async () => {
    if (!isNativeAPK) {
      setNetworkInfo({
        canExecuteNative: false,
        isVodafoneSim: false,
        isVodafoneMobile: false,
        isMobileDataActive: false,
        isWifiActive: false,
        activeNetwork: 'web_fallback',
        activeDataSimOperatorName: 'Web (Fallback)',
        simOperatorName: 'Web',
        networkOperatorName: 'Web'
      });
      setIsLoading(false);
      return;
    }
    
    try {
      const result = await Promise.race([
        (async () => {
          if (VodafoneDetector && VodafoneDetector.requestPhonePermission) {
            await VodafoneDetector.requestPhonePermission();
            return await VodafoneDetector.getNetworkInfo();
          }
          return null;
        })(),
        new Promise<any>((resolve) => setTimeout(() => resolve(null), 4000))
      ]);
      if (result) {
        setNetworkInfo(result);
      } else {
        setNetworkInfo({ 
          canExecuteNative: false, isVodafoneSim: false, isVodafoneMobile: false,
          isMobileDataActive: false, isWifiActive: false, activeNetwork: 'error_fallback', 
          activeDataSimOperatorName: 'Error', simOperatorName: 'Error', networkOperatorName: 'Error' 
        } as any);
      }
    } catch (e) {
      setNetworkInfo({ 
        canExecuteNative: false, isVodafoneSim: false, isVodafoneMobile: false,
        isMobileDataActive: false, isWifiActive: false, activeNetwork: 'error_fallback', 
        activeDataSimOperatorName: 'Error', simOperatorName: 'Error', networkOperatorName: 'Error' 
      } as any);
    } finally {
      setIsLoading(false);
    }
  }, [isNativeAPK]);

  useEffect(() => {
    fetchNetworkInfo();

    if (!isNativeAPK) return;

    // (A) TelephonyCallback native event
    const nativeHandlePromise = (VodafoneDetector && VodafoneDetector.addListener) ? VodafoneDetector.addListener(
      'networkStateChanged',
      () => { fetchNetworkInfo(); }
    ).catch((e: any) => null) : Promise.resolve(null);

    // (B) Web events as backup
    const handleOnline  = () => fetchNetworkInfo();
    const handleOffline = () => fetchNetworkInfo();
    const handleVisible = () => {
      if (document.visibilityState === 'visible') fetchNetworkInfo();
    };
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisible);

    // (C) Polling
    const interval = setInterval(fetchNetworkInfo, 5000);

    return () => {
      nativeHandlePromise.then((handle: any) => {
        if (handle && handle.remove) handle.remove();
      });
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisible);
      clearInterval(interval);
    };
  }, [fetchNetworkInfo, isNativeAPK]);

  return { networkInfo, isLoading, fetchNetworkInfo, isNativeAPK };
}
