import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { BUILD_INFO } from '@/lib/buildInfo';
import { getDeviceFingerprint, getHardwareHash } from '@/lib/deviceFingerprint';
import { checkDeviceIntegrity } from '@/lib/security';
import ForceUpdateScreen from '@/components/common/ForceUpdateScreen';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { WifiOff, ShieldAlert } from 'lucide-react';

export const SecurityHeartbeat = () => {
  const [isBurned, setIsBurned] = useState(false);
  const [burnReason, setBurnReason] = useState('');
  const [isForceUpdate, setIsForceUpdate] = useState(false);
  const [apkUrl, setApkUrl] = useState<string | undefined>(undefined);
  const [latestVersion, setLatestVersion] = useState<string | undefined>(undefined);
  const [hasVerifiedWithServer, setHasVerifiedWithServer] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const isOnline = useOnlineStatus();

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (!hasVerifiedWithServer) {
      timeout = setTimeout(() => setShowLoading(true), 3000);
    }
    return () => clearTimeout(timeout);
  }, [hasVerifiedWithServer]);

  const triggerBurn = async (reason: string, actionType: 'BURN' | 'FORCE_UPDATE' = 'BURN') => {
    setBurnReason(reason);
    if (actionType === 'FORCE_UPDATE') {
      setIsForceUpdate(true);
      // Fetch latest APK info for the Force Update screen
      try {
        const { data } = await supabase.from('app_versions').select('apk_url, version').eq('is_latest', true).maybeSingle();
        if (data) {
          setApkUrl(data.apk_url);
          setLatestVersion(data.version);
        }
      } catch { /* ignore */ }
    } else {
      setIsBurned(true);
      localStorage.clear();
      sessionStorage.clear();
      await supabase.auth.signOut();
    }
  };

  useEffect(() => {
    const runHeartbeat = async () => {
      if (!navigator.onLine) return; // Wait for internet

      try {
        const isClean = await checkDeviceIntegrity();
        if (!isClean) {
          await triggerBurn('بيئة نظام غير آمنة (تم اكتشاف روت / جليبريك أو محاكي).');
          return;
        }

        const deviceId = getDeviceFingerprint();
        const hwHash = getHardwareHash();

        const { data, error } = await supabase.rpc('security_heartbeat', {
          p_device_id: deviceId,
          p_hardware_hash: hwHash,
          p_version_code: BUILD_INFO.versionCode,
          p_build_hash: 'debug_hash',
          p_apk_signature: 'debug_sig'
        });

        if (error) throw error;

        setHasVerifiedWithServer(true);

        if (data && data.action === 'BURN') {
          // If the reason indicates an old version, show force update instead of black screen
          if (data.reason && (data.reason.includes('إصدار') || data.reason.includes('قديم'))) {
            await triggerBurn(data.reason, 'FORCE_UPDATE');
          } else {
            await triggerBurn(data.reason || 'TAMPER_DETECTED');
          }
        } else if (data && data.action === 'FORCE_UPDATE') {
          await triggerBurn(data.reason || 'OLD_VERSION', 'FORCE_UPDATE');
        }
      } catch (err) {
        console.error('Heartbeat failed', err);
      }
    };

    runHeartbeat();
    const interval = setInterval(runHeartbeat, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isOnline]); // Re-run when internet comes back

  if (isForceUpdate) {
    return <ForceUpdateScreen apkUrl={apkUrl} latestVersion={latestVersion} customMessage={burnReason} />;
  }

  // Strict Offline Protection for New Version 354+
  // If the app starts and hasn't verified with the server yet, block the UI
  // Delay showing the loading screen to avoid flashing if connection is fast
  if (!hasVerifiedWithServer && showLoading) {
    return (
      <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300" dir="rtl">
        {!isOnline ? (
          <>
            <WifiOff className="w-16 h-16 text-gray-500 mb-4 animate-pulse" />
            <h2 className="text-xl font-bold text-white mb-2">في انتظار الاتصال بالإنترنت</h2>
            <p className="text-gray-400 text-sm max-w-xs">
              لأسباب أمنية، لا يمكن تشغيل التطبيق في وضع عدم الاتصال (Offline). يرجى تفعيل الإنترنت والمحاولة مجدداً للتحقق من هويتك.
            </p>
          </>
        ) : (
          <>
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">جاري التحقق من الأمان...</h2>
            <p className="text-gray-400 text-sm max-w-xs">يرجى الانتظار لحظات للتحقق من هوية جهازك والاتصال الآمن مع الخوادم.</p>
          </>
        )}
      </div>
    );
  }

  if (isBurned) {
    return (
      <div className="fixed inset-0 bg-black z-[9999] flex flex-col items-center justify-center text-white p-6" dir="rtl">
        <ShieldAlert className="w-24 h-24 text-red-600 mb-6" />
        <h1 className="text-3xl font-bold text-red-500 mb-4">تم حظر هذا الجهاز</h1>
        <p className="text-gray-300 text-lg mb-8 max-w-md">
          لا يمكن استخدام تطبيق Vodafone Fakka من هذا الجهاز. لن تتمكن من تسجيل الدخول أو إنشاء حساب جديد.
        </p>
        <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-4 w-full max-w-sm">
          <p className="text-red-400 text-sm font-medium mb-1">سبب الحظر</p>
          <p className="text-red-200">{burnReason || 'اكتشاف تلاعب أو انتهاك لسياسات الاستخدام.'}</p>
        </div>
        <p className="text-gray-700 text-xs mt-8">ERR_DEVICE_BANNED</p>
      </div>
    );
  }

  return null;
};