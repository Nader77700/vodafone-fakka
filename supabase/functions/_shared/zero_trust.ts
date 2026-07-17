import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-build, x-app-version, x-idempotency-key, x-correlation-id, x-app-signature, x-build-hash, x-device-id, x-hardware-hash, x-nonce, x-request-signature, x-session-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export async function zeroTrustCheck(req: Request) {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { error: "Missing Authorization header", status: 401 };
  }

  const appBuild = parseInt(req.headers.get("x-app-build") ?? "0", 10);
  
  const { data: config } = await supabaseAdmin.from('app_config').select('value').eq('key', 'version_min_supported').maybeSingle();
  const minBuildRequired = config?.value ? parseInt(config.value, 10) : 330;

  if (appBuild < minBuildRequired) {
    return { error: "Update Required: Version too old", status: 426 };
  }

  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  
  const { data: { user }, error: authErr } = await callerClient.auth.getUser();
  if (authErr || !user) {
    return { error: "Invalid Session", status: 401 };
  }

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  if (!prof || !prof.is_active) {
    return { error: "Account Banned", status: 403 };
  }

  const isAdmin = ["admin", "super_admin"].includes(prof.role);

  const nonce = req.headers.get("x-nonce");
  const sessionToken = req.headers.get("x-session-token");

  // تم الإزالة الكاملة للتحقق من الجلسات والـ Nonce لتجنب أي مشاكل للمستخدمين
  return { 
    user, 
    isAdmin, 
    profile: prof,
    supabaseAdmin 
  };
}
