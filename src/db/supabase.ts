
import { createClient } from "@supabase/supabase-js";
import { BUILD_INFO } from "@/lib/buildInfo";
import { Capacitor } from '@capacitor/core';
import { securityManager } from "@/lib/security";
import { generateRequestSignature } from "@/lib/hmac";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let cachedSignature: string | null = null;
let cachedBuildHash: string | null = null;

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
      } else if (Array.isArray(options.headers)) {
        options.headers.push(['x-app-signature', cachedSignature]);
        options.headers.push(['x-build-hash', cachedBuildHash]);
        options.headers.push(['x-hmac-signature', signature]);
        options.headers.push(['x-timestamp', timestamp]);
      } else {
        const headers = options.headers as Record<string, string>;
        headers['x-app-signature'] = cachedSignature;
        headers['x-build-hash'] = cachedBuildHash;
        headers['x-hmac-signature'] = signature;
        headers['x-timestamp'] = timestamp;
      }
    } catch (err) { console.error('Error generating signature', err) }
  }

  return fetch(url, options);
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    headers: {
      'x-app-build': BUILD_INFO.versionCode.toString(),
      'x-app-version': BUILD_INFO.appVersion,
      'x-app-secure-token': 'vfp_secure_351_ULTIMATE_X9'
    },
    fetch: customFetch
  }
});
            