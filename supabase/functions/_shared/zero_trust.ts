import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-build, x-app-version, x-idempotency-key, x-correlation-id, x-app-signature, x-build-hash, x-device-id, x-hardware-hash, x-nonce, x-request-signature, x-session-token, x-device-fp, x-app-secure-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export async function zeroTrustCheck(req: Request) {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: configs } = await supabaseAdmin.from('app_config').select('key, value').in('key', ['version_min_supported', 'banned_app_signatures', 'ff_maintenance_mode']);
  
  const isMaintenanceMode = configs?.find(c => c.key === 'ff_maintenance_mode')?.value === 'true';

  const authHeader = req.headers.get("Authorization");

  if (isMaintenanceMode) {
    // Attempt to extract user info for logging without failing if invalid
    let userId = null;
    let username = 'Unknown';
    if (authHeader) {
      const callerClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await callerClient.auth.getUser();
      if (user) {
        userId = user.id;
        const { data: p } = await supabaseAdmin.from("profiles").select("username, full_name").eq("id", user.id).maybeSingle();
        username = p?.username || p?.full_name || 'Unknown';
      }
    }
    
    await supabaseAdmin.from("maintenance_logs").insert({
      user_id: userId,
      username: username,
      device_id: req.headers.get("x-device-id") || 'unknown',
      build_version: req.headers.get("x-app-version") || 'unknown',
      version_code: req.headers.get("x-app-build") || 'unknown',
      build_hash: req.headers.get("x-build-hash") || 'unknown',
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || 'unknown',
      endpoint: req.url,
      user_agent: req.headers.get("user-agent") || 'unknown',
      rejection_result: "Blocked by Maintenance Mode"
    });

    return { error: "الخدمة متوقفة مؤقتًا للصيانة.", status: 503 };
  }

  if (!authHeader) {
    return { error: "Missing Authorization header", status: 401 };
  }

  const minConfig = configs?.find(c => c.key === 'version_min_supported');
  const appBuild = parseInt(req.headers.get("x-app-build") ?? "0", 10);
  const minBuildRequired = minConfig?.value ? parseInt(minConfig.value, 10) : 330;

  if (appBuild < minBuildRequired) {
    return { error: "Update Required: Version too old", status: 426 };
  }

  const secureToken = req.headers.get("x-app-secure-token");
  const hmacSig = req.headers.get("x-hmac-signature");
  
  if (secureToken !== 'vfp_secure_339_xyz_9988' && !hmacSig) {
    const deviceId = req.headers.get("x-device-id") || 'unknown';
    await supabaseAdmin.from('device_bans').insert({
      device_fp: req.headers.get("x-device-fp") || 'unknown',
      device_id: deviceId,
      ban_reason: `Missing verification tokens (Hacked App)`,
      ban_type: 'system',
      is_permanent: true,
      is_active: true
    }).catch(() => {});
    return { error: "Security Alert: Missing required verification tokens. يتم استخدام نسخة مهكرة أو معدلة غير رسمية.", status: 403 };
  }

  const appSignature = req.headers.get("x-app-signature");
  const bannedConfig = configs?.find(c => c.key === 'banned_app_signatures');
  if (bannedConfig?.value && appSignature) {
    const bannedSignatures = bannedConfig.value.split(',').map(s => s.trim());
    if (bannedSignatures.includes(appSignature)) {
      const deviceId = req.headers.get("x-device-id") || 'unknown';
      await supabaseAdmin.from('device_bans').insert({
        device_fp: req.headers.get("x-device-fp") || 'unknown',
        device_id: deviceId,
        ban_reason: `App Signature Banned: ${appSignature}`,
        ban_type: 'system',
        is_permanent: true,
        is_active: true
      });
      return { error: "Security Alert: Unofficial or Modified APK Detected. يتم استخدام نسخة مهكرة أو معدلة غير رسمية.", status: 403 };
    }
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
    .select("role, is_active, device_id")
    .eq("id", user.id)
    .single();

  if (!prof || !prof.is_active) {
    return { error: "Account Banned", status: 403 };
  }

  const reqDeviceId = req.headers.get("x-device-id");
  if (reqDeviceId && reqDeviceId !== 'unknown') {
    if (!prof.device_id) {
      // Bind device on first use
      await supabaseAdmin.from("profiles").update({ device_id: reqDeviceId }).eq("id", user.id);
    } else if (prof.device_id !== reqDeviceId) {
      // Log hijacking attempt
      await supabaseAdmin.from("security_logs").insert({
        user_id: user.id,
        action: "DEVICE_HIJACK_ATTEMPT",
        reason: `Expected: ${prof.device_id}, Received: ${reqDeviceId}`,
        is_blocked: true,
        ip_address: req.headers.get("x-forwarded-for") || 'unknown',
        device_fp: reqDeviceId,
        app_version: req.headers.get("x-app-version") || 'unknown',
      });
      return { error: "Security Alert: This account is bound to another device. لا يمكن استخدام نفس الحساب على جهازين مختلفين.", status: 403 };
    }
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
