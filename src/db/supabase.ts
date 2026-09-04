
import { createClient } from "@supabase/supabase-js";
import { BUILD_INFO } from "@/lib/buildInfo";
import { Capacitor } from '@capacitor/core';
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
      // لا نستخدم document.body.innerHTML — يكسر React DOM ويسبب crash
      // نعرض overlay فوق React بدون مسح DOM
      setTimeout(() => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:#000;color:red;padding:20px;text-align:center;font-size:20px;z-index:999999;display:flex;align-items:center;justify-content:center;flex-direction:column;';
        overlay.innerHTML = '<h2>تم تدمير النسخة المسروقة.</h2><p>لا يمكنك استخدام هذا التطبيق لأنه مقرصن ومعدل.</p>';
        document.body.appendChild(overlay);
        localStorage.clear();
        sessionStorage.clear();
      }, 3000);
    }
  }).catch(() => {});
}

// DOM Tampering Check — لا يمس React DOM أبداً، يعمل فقط على platforms Native
// ملاحظة: لا نستخدم document.body.innerHTML لأنه يكسر React DOM ويسبب crash
if (Capacitor.isNativePlatform()) {
  setInterval(() => {
    try {
      const html = document.body?.innerHTML?.toLowerCase?.() ?? '';
      // تحقق فقط من المحتوى الخطير — لا نتحقق من appPackageName هنا
      // لأن appPackageName يُحدَّث بشكل async وقد يكون لا يزال القيمة الافتراضية
      if (html.includes('mostafa eid') || html.includes('مصطفى عيد tamper')) {
        localStorage.clear();
        sessionStorage.clear();
        // بدلاً من innerHTML، نستخدم window.location لإعادة التحميل بشكل آمن
        window.location.reload();
      }
    } catch (_) { /* silent — لا نريد crash من فحص الأمان */ }
  }, 15000); // كل 15 ثانية بدلاً من 7 ثواني لتقليل الضغط
}

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
            