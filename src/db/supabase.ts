
import { createClient } from "@supabase/supabase-js";
import { BUILD_INFO } from "@/lib/buildInfo";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    headers: {
      'x-app-build': BUILD_INFO.versionCode.toString(),
      'x-app-version': BUILD_INFO.appVersion
    }
  }
});
            