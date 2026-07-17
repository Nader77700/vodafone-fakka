import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // Will be replaced by app's specific domains if needed, but for Capacitor * is common. However, for zero trust, we restrict headers.
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

  // LAYER 2 & 3: APK Signature and Build Fingerprint
  const appBuild = parseInt(req.headers.get("x-app-build") ?? "0", 10);
  const appSignature = req.headers.get("x-app-signature");
  const buildHash = req.headers.get("x-build-hash");
  
  // LAYER 9: Remote Config (Minimum Supported Version)
  const { data: config } = await supabaseAdmin.from('app_config').select('value').eq('key', 'version_min_supported').maybeSingle();
  const minBuildRequired = config?.value ? parseInt(config.value, 10) : 320;

  if (appBuild < minBuildRequired) {
    return { error: "Update Required: Version too old", status: 426 };
  }

  // Strict verification only applied if appBuild >= 326 as an upgrade path
  if (appBuild >= 326) {
    // In production, we strictly verify these
    if (!appSignature || !buildHash) {
      return { error: "Missing Security Fingerprints (Signature/Hash)", status: 403 };
    }
    
    // Verify against build_registry
    const { data: registry } = await supabaseAdmin
      .from('build_registry')
      .select('id')
      .eq('version_code', appBuild)
      .eq('build_hash', buildHash)
      .eq('apk_signature', appSignature)
      .eq('is_active', true)
      .single();
      
    if (!registry) {
      // LAYER 12 & 13: Log failure and potentially ban
      const ip = req.headers.get("x-forwarded-for") || "unknown";
      await supabaseAdmin.from('security_logs').insert({
        user_id: null,
        event_type: 'TAMPER_DETECTED',
        details: { appBuild, buildHash, appSignature, ip },
        risk_level: 'critical',
        action_taken: 'blocked_request'
      });
      return { error: "Integrity Check Failed: Invalid Signature or Build Hash", status: 403 };
    }
  }

  // Retrieve user
  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  
  const { data: { user }, error: authErr } = await callerClient.auth.getUser();
  if (authErr || !user) {
    return { error: "Invalid Session", status: 401 };
  }

  // Get Profile
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  if (!prof || !prof.is_active) {
    return { error: "Account Banned", status: 403 };
  }

  const isAdmin = ["admin", "super_admin"].includes(prof.role);

  // LAYER 6 & 7: Request Signing and Nonce
  const nonce = req.headers.get("x-nonce");
  const requestSignature = req.headers.get("x-request-signature");
  const sessionToken = req.headers.get("x-session-token");

    if (sessionToken) {
    const { data: session } = await supabaseAdmin
      .from('security_sessions')
      .select('session_secret, expires_at, device_id')
      .eq('session_token', sessionToken)
      .eq('user_id', user.id)
      .eq('is_valid', true)
      .single();

    if (!session || new Date(session.expires_at) < new Date()) {
      return { error: "Invalid or Expired Session Token", status: 401 };
    }

    const deviceId = req.headers.get("x-device-id");
    if (session.device_id && session.device_id !== deviceId) {
      await supabaseAdmin.from('security_logs').insert({
        user_id: user.id,
        event_type: 'SESSION_HIJACK_ATTEMPT',
        details: { expected: session.device_id, received: deviceId },
        risk_level: 'high',
        action_taken: 'blocked_request'
      });
      return { error: "Session Device Mismatch", status: 403 };
    }

    if (nonce) {
      const { data: nonceExists } = await supabaseAdmin
        .from('security_nonces')
        .select('id')
        .eq('nonce', nonce)
        .single();
      if (nonceExists) {
         return { error: "Replay Attack Detected", status: 403 };
      }
      
      // Store nonce to prevent replay
      await supabaseAdmin.from('security_nonces').insert({
         nonce,
         user_id: user.id,
         action: req.url,
         expires_at: new Date(Date.now() + 60000).toISOString() // 60s
      });
    }

    // Note: Request HMAC validation would happen here.
  }

  // LAYER 4: Device Verification
  // In production, we'd check device_fp against the banned list here
  
  return { 
    user, 
    isAdmin, 
    profile: prof,
    supabaseAdmin 
  };
}