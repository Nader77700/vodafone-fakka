import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { BUILD_INFO } from '@/lib/buildInfo';
import { getDeviceFingerprint, getHardwareHash } from '@/lib/deviceFingerprint';
import { checkDeviceIntegrity } from '@/lib/security';
import ForceUpdateScreen from '@/components/common/ForceUpdateScreen';

export const SecurityHeartbeat = () => {
  const [isBurned, setIsBurned] = useState(false);
  const [burnReason, setBurnReason] = useState('');
  const [isForceUpdate, setIsForceUpdate] = useState(false);
  const [apkUrl, setApkUrl] = useState<string | undefined>(undefined);
  const [latestVersion, setLatestVersion] = useState<string | undefined>(undefined);

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
    const interval = setInterval(runHeartbeat, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (isForceUpdate) {
    return <ForceUpdateScreen apkUrl={apkUrl} latestVersion={latestVersion} customMessage={burnReason} />;
  }

  if (isBurned) {
    return (
      <div className="fixed inset-0 bg-black z-[9999] flex flex-col items-center justify-center text-white p-6">
        <h1 className="text-4xl font-bold mb-4 text-red-500">Security Violation Detected</h1>
        <p className="text-lg text-center mb-8">
          This device or application version has been permanently blocked due to a security policy violation ({burnReason}).
        </p>
        <p className="text-sm text-gray-500">
          Error Code: SEC_VIO_{Math.floor(Date.now() / 1000).toString(16).toUpperCase()}
        </p>
      </div>
    );
  }

  return null;
};