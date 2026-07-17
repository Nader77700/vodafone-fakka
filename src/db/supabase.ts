
import { createClient } from "@supabase/supabase-js";
import { BUILD_INFO } from "@/lib/buildInfo";
import { Capacitor } from '@capacitor/core';
import { securityManager } from "@/lib/security";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let cachedSignature: string | null = null;
let cachedBuildHash: string | null = null;

const customFetch = async (url: RequestInfo | URL, options?: RequestInit) => {
  if (!options) options = {};
  if (!options.headers) options.headers = {};
  
  if (Capacitor.isNativePlatform()) {
    try {
      if (!cachedSignature || !cachedBuildHash) {
        // Fallback or placeholder until native plugin is fully implemented
        // Since we removed the hard signature check for missing headers, it's safer
        cachedSignature = 'debug_sig';
        cachedBuildHash = 'debug_hash';
      }
      if (cachedSignature && cachedBuildHash) {
        if (options.headers instanceof Headers) {
          options.headers.set('x-app-signature', cachedSignature);
          options.headers.set('x-build-hash', cachedBuildHash);
        } else if (Array.isArray(options.headers)) {
          options.headers.push(['x-app-signature', cachedSignature]);
          options.headers.push(['x-build-hash', cachedBuildHash]);
        } else {
          const headers = options.headers as Record<string, string>;
          headers['x-app-signature'] = cachedSignature;
          headers['x-build-hash'] = cachedBuildHash;
        }
      }
    } catch { /* ignore */ }
  }

  return fetch(url, options);
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    headers: {
      'x-app-build': BUILD_INFO.versionCode.toString(),
      'x-app-version': BUILD_INFO.appVersion
    },
    fetch: customFetch
  }
});
            