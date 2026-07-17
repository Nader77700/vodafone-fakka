import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { BUILD_INFO } from '@/lib/buildInfo';
import { getDeviceFingerprint, getHardwareHash } from '@/lib/deviceFingerprint';

export const SecurityHeartbeat = () => {
  const [isBurned, setIsBurned] = useState(false);
  const [burnReason, setBurnReason] = useState('');

  useEffect(() => {
    const runHeartbeat = async () => {
      try {
        const deviceId = getDeviceFingerprint();
        const hwHash = getHardwareHash();

        const { data, error } = await supabase.rpc('security_heartbeat', {
          p_device_id: deviceId,
          p_hardware_hash: hwHash,
          p_version_code: BUILD_INFO.versionCode,
          p_build_hash: 'debug_hash', // In production, native plugin sets this
          p_apk_signature: 'debug_sig'
        });

        if (error) throw error;

        if (data && data.action === 'BURN') {
          setIsBurned(true);
          setBurnReason(data.reason || 'TAMPER_DETECTED');
          
          // Clear all local data silently
          localStorage.clear();
          sessionStorage.clear();
          
          // Attempt to log out
          await supabase.auth.signOut();
        }
      } catch (err) {
        // Silently fail if network error, don't block legitimate users on poor connection
        console.error('Heartbeat failed', err);
      }
    };

    runHeartbeat();
    // Run heartbeat every 5 minutes
    const interval = setInterval(runHeartbeat, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

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