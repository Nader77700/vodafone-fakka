import React, { useEffect, useState, useCallback, useRef } from 'react';
import { VodafoneDetector, isNativeAndroid } from '@/lib/vodafoneDetector';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

export default function VpnBlockerGate() {
  const [isVpnBlocked, setIsVpnBlocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const lastCheckTime = useRef(0);

  const performVpnCheck = useCallback(async () => {
    // Avoid double triggering in rapid succession
    const now = Date.now();
    if (now - lastCheckTime.current < 1000) return;
    lastCheckTime.current = now;

    setChecking(true);
    try {
      if (Capacitor.isNativePlatform()) {
        const info = await VodafoneDetector.getNetworkInfo();
        setIsVpnBlocked(Boolean(info.isVpnActive));
      } else {
        // In web / browser testing mode, check if session simulated VPN is active
        const simulatedVpn = sessionStorage.getItem('sim_vpn_active') === 'true';
        setIsVpnBlocked(simulatedVpn);
      }
    } catch (err) {
      console.warn('[VpnBlockerGate] VPN detection error:', err);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    performVpnCheck();

    // Check periodically every 3 seconds
    const interval = setInterval(() => {
      performVpnCheck();
    }, 3000);

    // Also listen to native network change events
    let subHandle: any = null;
    if (Capacitor.isNativePlatform()) {
      VodafoneDetector.addListener('networkStateChanged', () => {
        performVpnCheck();
      }).then((handle) => {
        subHandle = handle;
      }).catch(() => {});
    }

    // Also listen to visibility / resume changes
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        performVpnCheck();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      if (subHandle && typeof subHandle.remove === 'function') {
        subHandle.remove();
      }
    };
  }, [performVpnCheck]);

  if (!isVpnBlocked) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] bg-background/95 backdrop-blur-xl flex items-center justify-center p-4 select-none"
      dir="rtl"
    >
      <Card className="max-w-md w-full border-2 border-destructive bg-card/95 shadow-2xl p-6 text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
        <div className="w-16 h-16 rounded-2xl bg-destructive/15 border-2 border-destructive/30 flex items-center justify-center mx-auto text-destructive animate-pulse">
          <ShieldAlert className="w-9 h-9" />
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-black text-foreground">
            تم اكتشاف اتصال VPN نشط
          </h2>
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive font-black text-sm">
            يرجى إغلاق الـ VPN والمحاولة مرة أخرى
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed pt-1">
            لأسباب أمنية مشددة وحماية لحسابات الباقات وأرصدة الميكسات والعمليات السحابية، يُمنع فتح التطبيق أو تسجيل الدخول أثناء تفعيل أي تطبيق VPN أو بروكسي.
          </p>
        </div>

        <div className="pt-2">
          <Button
            onClick={performVpnCheck}
            disabled={checking}
            className="w-full gap-2 font-bold h-10"
            variant="destructive"
          >
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'جاري الفحص...' : 'إعادة الفحص الآن'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
