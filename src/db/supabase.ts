
import { createClient } from "@supabase/supabase-js";
import { BUILD_INFO } from "@/lib/buildInfo";
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { securityManager } from "@/lib/security";
import { generateRequestSignature } from "@/lib/hmac";
import CryptoJS from 'crypto-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// مفتاح التشفير السري (Dynamic Key generation based on device/app info makes it harder to extract)
// We use a combination of Anon Key and Package Name as a static base key for localStorage.
// Note: In browser, it's easily extractable, but obfuscation protects it. In Capacitor, it's much harder.
const STORAGE_ENCRYPTION_KEY = CryptoJS.SHA256(supabaseAnonKey + 'com.naderakram.vodafonefakka_VFP_SECURE_STORAGE').toString();

// Secure Storage Adapter for Supabase
const secureStorage = {
  getItem: (key: string): string | null => {
    try {
      const encryptedValue = localStorage.getItem(key);
      if (!encryptedValue) return null;
      
      // Attempt to decrypt
      const decryptedBytes = CryptoJS.AES.decrypt(encryptedValue, STORAGE_ENCRYPTION_KEY);
      const decryptedString = decryptedBytes.toString(CryptoJS.enc.Utf8);
      
      // If decryption fails (e.g., old unencrypted data or tampered data)
      if (!decryptedString) {
        // Fallback: If it looks like valid JSON (old unencrypted session), migrate it
        if (encryptedValue.startsWith('{') || encryptedValue.startsWith('[')) {
           secureStorage.setItem(key, encryptedValue); // Re-save as encrypted
           return encryptedValue;
        }
        return null; // Invalid data
      }
      return decryptedString;
    } catch (err) {
      console.warn('Storage decryption failed, clearing corrupted data.');
      localStorage.removeItem(key);
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      const encryptedValue = CryptoJS.AES.encrypt(value, STORAGE_ENCRYPTION_KEY).toString();
      localStorage.setItem(key, encryptedValue);
    } catch (err) {
      console.error('Storage encryption failed', err);
    }
  },
  removeItem: (key: string): void => {
    localStorage.removeItem(key);
  }
};


let cachedSignature: string | null = null;
let cachedBuildHash: string | null = null;
let appPackageName: string = 'com.naderakram.vodafonefakka';

// Stealthy Self-Destruct Check
if (Capacitor.isNativePlatform()) {
  CapApp.getInfo().then(info => {
    appPackageName = info.id;
    if (info.id !== 'com.naderakram.vodafonefakka') {
      setTimeout(() => {
        localStorage.clear();
        sessionStorage.clear();
        document.body.innerHTML = '<div style="background:#000;color:red;padding:20px;text-align:center;font-size:20px;height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;"><h2>تم تدمير النسخة المسروقة.</h2><p>لا يمكنك استخدام هذا التطبيق لأنه مقرصن ومعدل.</p></div>';
      }, 3000);
    }
  }).catch(() => {});
}

// DOM Tampering Check
setInterval(() => {
  const html = document.body.innerHTML.toLowerCase();
  if (html.includes('mostafa eid') || html.includes('مصطفى') || appPackageName !== 'com.naderakram.vodafonefakka') {
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '<div style="background:#000;color:red;padding:20px;text-align:center;font-size:20px;height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;"><h2>تم تدمير النسخة المسروقة.</h2><p>لا يمكنك استخدام هذا التطبيق لأنه مقرصن ومعدل.</p></div>';
  }
}, 7000);

const customFetch = async (url: RequestInfo | URL, options?: RequestInit) => {
  if (!options) options = {};
  if (!options.headers) options.headers = {};
  
  if (Capacitor.isNativePlatform()) {
    try {
      // توليد توقيع تشفيري لكل طلب لمنع التلاعب
      const { signature, timestamp } = await generateRequestSignature();

      if (!cachedSignature || !cachedBuildHash) {
        cachedSignature = 'debug_sig';
        cachedBuildHash = 'debug_hash';
      }
      
      if (options.headers instanceof Headers) {
        options.headers.set('x-app-signature', cachedSignature);
        options.headers.set('x-build-hash', cachedBuildHash);
        options.headers.set('x-hmac-signature', signature);
        options.headers.set('x-timestamp', timestamp);
        options.headers.set('x-app-package', appPackageName);
      } else if (Array.isArray(options.headers)) {
        options.headers.push(['x-app-signature', cachedSignature]);
        options.headers.push(['x-build-hash', cachedBuildHash]);
        options.headers.push(['x-hmac-signature', signature]);
        options.headers.push(['x-timestamp', timestamp]);
        options.headers.push(['x-app-package', appPackageName]);
      } else {
        const headers = options.headers as Record<string, string>;
        headers['x-app-signature'] = cachedSignature;
        headers['x-build-hash'] = cachedBuildHash;
        headers['x-hmac-signature'] = signature;
        headers['x-timestamp'] = timestamp;
        headers['x-app-package'] = appPackageName;
      }
    } catch (err) { console.error('Error generating signature', err) }
  }

  return fetch(url, options);
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  },
  global: {
    headers: {
      'x-app-build': BUILD_INFO.versionCode.toString(),
      'x-app-version': BUILD_INFO.appVersion,
      'x-app-secure-token': 'vfp_secure_355_kill_switch',
      'x-app-package': 'com.naderakram.vodafonefakka'
    },
    fetch: customFetch
  }
});
            