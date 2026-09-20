
import { createClient } from "@supabase/supabase-js";
import { BUILD_INFO } from "@/lib/buildInfo";
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { securityManager } from "@/lib/security";
import { generateRequestSignature } from "@/lib/hmac";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const STORAGE_ENCRYPTION_KEY = supabaseAnonKey + 'com.naderakram.vodafonefakka_VFP_SECURE_STORAGE';

// Secure Storage Adapter for Supabase (XOR + Base64 Obfuscation)
const secureStorage = {
  getItem: (key: string): string | null => {
    try {
      const encryptedValue = localStorage.getItem(key);
      if (!encryptedValue) return null;
      
      // Fallback: If it looks like valid JSON (old unencrypted session), migrate it
      if (encryptedValue.startsWith('{') || encryptedValue.startsWith('[')) {
         secureStorage.setItem(key, encryptedValue);
         return encryptedValue;
      }
      
      const decoded = atob(encryptedValue);
      let result = '';
      for (let i = 0; i < decoded.length; i++) {
        result += String.fromCharCode(decoded.charCodeAt(i) ^ STORAGE_ENCRYPTION_KEY.charCodeAt(i % STORAGE_ENCRYPTION_KEY.length));
      }
      return decodeURIComponent(escape(result));
    } catch (err) {
      console.warn('Storage decryption failed, clearing corrupted data.');
      localStorage.removeItem(key);
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      const utf8Value = unescape(encodeURIComponent(value));
      let encrypted = '';
      for (let i = 0; i < utf8Value.length; i++) {
        encrypted += String.fromCharCode(utf8Value.charCodeAt(i) ^ STORAGE_ENCRYPTION_KEY.charCodeAt(i % STORAGE_ENCRYPTION_KEY.length));
      }
      localStorage.setItem(key, btoa(encrypted));
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

// customFetch: يضيف security headers فقط، ثم يستخدم fetch العادي
// CapacitorHttp.request() تم إلغاؤه — كان يسبب SSL failure على بعض الأجهزة
// WebView fetch يعمل بنفس طريقة المتصفح = يشتغل دايماً
const customFetch = async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
  if (!options) options = {};
  if (!options.headers) options.headers = {};

  // ── تجميع الـ headers في plain object ──
  let flatHeaders: Record<string, string> = {};
  if (options.headers instanceof Headers) {
    options.headers.forEach((v, k) => { flatHeaders[k] = v; });
  } else if (Array.isArray(options.headers)) {
    for (const [k, v] of options.headers) flatHeaders[k] = v;
  } else {
    flatHeaders = { ...(options.headers as Record<string, string>) };
  }

  // ── إضافة security headers على الأجهزة فقط ──
  if (Capacitor.isNativePlatform()) {
    try {
      const { signature, timestamp } = await generateRequestSignature();
      flatHeaders['x-app-signature'] = cachedSignature || 'debug_sig';
      flatHeaders['x-build-hash']    = cachedBuildHash  || 'debug_hash';
      flatHeaders['x-hmac-signature']= signature;
      flatHeaders['x-timestamp']     = timestamp;
      flatHeaders['x-app-package']   = appPackageName;
    } catch (err) {
      console.error('[customFetch] signature error:', err);
    }
  }

  // ── استخدام fetch العادي (WebView) — يعمل مثل المتصفح تماماً ──
  options.headers = flatHeaders;
  return fetch(url, options);
};
export { customFetch };

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
      'x-app-secure-token': 'vfp_secure_356_kill_switch',
      'x-app-package': 'com.naderakram.vodafonefakka'
    },
    fetch: customFetch
  }
});
            