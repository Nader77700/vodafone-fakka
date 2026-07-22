import { generateUUID } from "./uuid";
import { BUILD_INFO } from './buildInfo';
import { getStableDeviceIdentity } from './deviceFingerprint';
import { IsRoot } from '@capgo/capacitor-is-root';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/db/supabase';

export async function checkDeviceIntegrity() {
  if (!Capacitor.isNativePlatform()) return true;

  try {
    const rootCheck = await IsRoot.isRooted();
    const emulatorCheck = Capacitor.getPlatform() === 'android' ? await IsRoot.isRunningOnEmulator() : { result: false };

    if (rootCheck.result || emulatorCheck.result) {
      // الجهاز عليه روت أو محاكي
      const fp = getStableDeviceIdentity();
      
      // التبليغ عن التلاعب بصمت
      await supabase.rpc('report_security_breach', {
        p_device_fp: fp.device_fp,
        p_hardware_hash: fp.hardware_hash,
        p_action: 'ROOT_EMULATOR_DETECTED',
        p_reason: `Rooted: ${rootCheck.result}, Emulator: ${emulatorCheck.result}`
      });

      return false; // Integrity failed
    }

    return true; // Clean
  } catch (err) {
    console.error('Integrity check error', err);
    return true; // Default to pass on error to avoid false positives
  }
}

class SecurityManager {
  private sessionToken: string | null = null;
  private sessionSecret: string | null = null;

  async initSession() {
    // In a real native environment, this would call native plugins
    // For now, we mock the session binding
    this.sessionToken = `st_${Math.random().toString(36).substr(2, 9)}`;
    this.sessionSecret = `sec_${Math.random().toString(36).substr(2, 9)}`;
    
    // Simulate Anti-Patch Checks
    this.performAntiPatchChecks();
  }

  private performAntiPatchChecks() {
    // Basic web-based anti-patch checks
    const isFrida = (window as any).Frida !== undefined;
    const isMagisk = false; // Requires native
    
    if (isFrida || isMagisk) {
      console.error("SECURITY VIOLATION: Tampering detected");
      // Could lock the app here
      document.body.innerHTML = "<div style='color:red;padding:20px'>التطبيق غير مدعوم على هذه البيئة لأسباب أمنية.</div>";
    }
  }

  generateNonce(): string {
    return generateUUID();
  }

  async signRequest(payload: string, nonce: string): Promise<string> {
    if (!this.sessionSecret) return "unsigned";
    
    const encoder = new TextEncoder();
    const data = encoder.encode(`${payload}:${nonce}`);
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(this.sessionSecret),
      { name: "HMAC", hash: "SHA-256" },
      false, ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, data);
    return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  getSecurityHeaders(nonce: string, signature: string): Record<string, string> {
    const identity = getStableDeviceIdentity();
    return {
      'x-app-build': BUILD_INFO.versionCode.toString(),
      'x-app-signature': 'debug_sig', // In production, retrieved from Native Plugin
      'x-build-hash': (BUILD_INFO as any).bundleHash || (BUILD_INFO as any).apkHash || 'apk_v3_0_355_code355',
      'x-app-secure-token': 'vfp_secure_355_kill_switch',
      'x-device-id': identity.device_id || 'unknown',
      'x-hardware-hash': identity.hardware_hash,
      'x-nonce': nonce,
      'x-request-signature': signature,
      'x-session-token': this.sessionToken || ''
    };
  }
}

export const securityManager = new SecurityManager();