import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ══════════════════════════════════════════════════════════════
//  CORS — يسمح فقط للتطبيق الرسمي + Supabase Studio للأدمن
//  wildcard "*" خطر في production → نحدده بـ allowed origins
// ══════════════════════════════════════════════════════════════
const ALLOWED_ORIGINS = [
  "capacitor://localhost",        // APK release
  "ionic://localhost",            // Ionic fallback
  "http://localhost:8100",        // dev server
  "http://localhost:3000",
  "https://vchmsnavyhripakyvzom.supabase.co",   // Supabase Studio
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-build, x-app-version, x-idempotency-key, x-correlation-id, x-app-signature, x-build-hash, x-device-id, x-hardware-hash, x-nonce, x-request-signature, x-session-token, x-device-fp, x-app-secure-token",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Vary": "Origin",
  };
}

export function getCORSHeaders(req: Request) { return getCorsHeaders(req); }

// للتوافق مع الكود القديم الذي يستورد CORS_HEADERS كـ object ثابت
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-build, x-app-version, x-idempotency-key, x-correlation-id, x-app-signature, x-build-hash, x-device-id, x-hardware-hash, x-nonce, x-request-signature, x-session-token, x-device-fp, x-app-secure-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// ══════════════════════════════════════════════════════════════
//  In-memory Rate Limiter
//  يمنع brute-force من نفس الـ IP أو الـ device
//  يعمل داخل instance واحدة من Edge Function
// ══════════════════════════════════════════════════════════════
interface RateEntry { count: number; resetAt: number; }
const rateLimitMap = new Map<string, RateEntry>();
const RATE_LIMIT_MAX      = 30;   // max طلبات per window
const RATE_LIMIT_WINDOW   = 60_000; // 60 ثانية

function isRateLimited(key: string): boolean {
  const now = Date.now();
  let entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + RATE_LIMIT_WINDOW };
    rateLimitMap.set(key, entry);
    return false;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

// نظّف الـ map دورياً لمنع memory leak
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitMap.entries()) {
    if (now > v.resetAt) rateLimitMap.delete(k);
  }
}, 120_000);

// ══════════════════════════════════════════════════════════════
//  zeroTrustCheck — الفلتر الأمني الرئيسي لكل Edge Function
// ══════════════════════════════════════════════════════════════
export async function zeroTrustCheck(req: Request) {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ── 1. Rate Limiting — IP + device ───────────────────────────
  const ip       = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
                ?? req.headers.get("cf-connecting-ip")
                ?? "unknown";
  const deviceId = req.headers.get("x-device-id") ?? "unknown";
  const rlKey    = `${ip}:${deviceId}`;

  if (isRateLimited(rlKey)) {
    console.warn(`[zero_trust] Rate limit hit: ${rlKey}`);
    return { error: "طلبات كثيرة — انتظر دقيقة ثم أعد المحاولة.", status: 429 };
  }

  // ── 2. قراءة الإعدادات من DB ──────────────────────────────────
  const { data: configs } = await supabaseAdmin
    .from('core_app_config')
    .select('key, value')
    .in('key', ['version_min_supported', 'banned_app_signatures', 'ff_maintenance_mode', 'allowed_app_origins']);

  const cfgMap: Record<string, string> = {};
  for (const c of configs ?? []) cfgMap[c.key] = c.value;

  // ── 3. وضع الصيانة ───────────────────────────────────────────
  const isMaintenanceMode = cfgMap['ff_maintenance_mode'] === 'true';
  const authHeader = req.headers.get("Authorization");

  if (isMaintenanceMode) {
    let userId = null, username = 'Unknown';
    if (authHeader) {
      const callerClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await callerClient.auth.getUser();
      if (user) {
        userId = user.id;
        const { data: p } = await supabaseAdmin.from("profiles").select("username, full_name").eq("id", user.id).maybeSingle();
        username = p?.username || p?.full_name || 'Unknown';
      }
    }
    await supabaseAdmin.from("maintenance_logs").insert({
      user_id: userId, username,
      device_id:     deviceId,
      build_version: req.headers.get("x-app-version") || 'unknown',
      version_code:  req.headers.get("x-app-build")   || 'unknown',
      build_hash:    req.headers.get("x-build-hash")   || 'unknown',
      ip_address:    ip,
      endpoint:      req.url,
      user_agent:    req.headers.get("user-agent") || 'unknown',
      rejection_result: "Blocked by Maintenance Mode"
    });
    return { error: "الخدمة متوقفة مؤقتًا للصيانة.", status: 503 };
  }

  // ── 4. Authorization header مطلوب ────────────────────────────
  if (!authHeader) return { error: "Missing Authorization header", status: 401 };

  // ── 5. فحص الإصدار الأدنى ────────────────────────────────────
  const appBuild       = parseInt(req.headers.get("x-app-build") ?? "0", 10);
  const minBuild       = cfgMap['version_min_supported'] ? parseInt(cfgMap['version_min_supported'], 10) : 330;
  if (appBuild < minBuild) return { error: "Update Required: Version too old", status: 426 };

  // ── 6. Secure Token — فحص صارم (anti-replay + version pinning) ──
  const secureToken = req.headers.get("x-app-secure-token");
  const validTokens = new Set([
    'vfp_secure_356_kill_switch',
    'vfp_secure_355_kill_switch',
  ]);
  // debug_sig مسموح فقط في dev (build < 400)
  if (appBuild < 400) validTokens.add('debug_sig');

  if (!secureToken || !validTokens.has(secureToken)) {
    return {
      error: "تنبيه أمني: إصدار غير مصرح له أو معدَّل. تم إيقاف محرك التنفيذ، يُرجى التحديث.",
      status: 403,
    };
  }

  // ── 7. فحص التوقيع — كشف APK المهكّرة ────────────────────────
  const appSignature = req.headers.get("x-app-signature");
  if (cfgMap['banned_app_signatures'] && appSignature) {
    const banned = cfgMap['banned_app_signatures'].split(',').map((s: string) => s.trim());
    if (banned.includes(appSignature)) {
      await supabaseAdmin.from('device_bans').insert({
        device_fp:    req.headers.get("x-device-fp") || 'unknown',
        device_id:    deviceId,
        ban_reason:   `App Signature Banned: ${appSignature}`,
        ban_type:     'system',
        is_permanent: true,
        is_active:    true,
      });
      return { error: "Security Alert: Unofficial or Modified APK Detected.", status: 403 };
    }
  }

  // ── 8. التحقق من هوية المستخدم ───────────────────────────────
  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: authErr } = await callerClient.auth.getUser();
  if (authErr || !user) return { error: "Invalid Session", status: 401 };

  // ── 9. فحص الحساب + Device Binding ──────────────────────────
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("role, is_active, device_id, vodafone_pin_locked_at, access_mode")
    .eq("id", user.id)
    .single();

  if (!prof || !prof.is_active) return { error: "Account Banned", status: 403 };

  const reqDeviceId = req.headers.get("x-device-id");
  if (reqDeviceId && reqDeviceId !== 'unknown') {
    if (!prof.device_id) {
      await supabaseAdmin.from("profiles").update({ device_id: reqDeviceId }).eq("id", user.id);
    } else if (prof.device_id !== reqDeviceId) {
      await supabaseAdmin.from("security_logs").insert({
        user_id:     user.id,
        action:      "DEVICE_HIJACK_ATTEMPT",
        reason:      `Expected: ${prof.device_id}, Received: ${reqDeviceId}`,
        is_blocked:  true,
        ip_address:  ip,
        device_fp:   reqDeviceId,
        app_version: req.headers.get("x-app-version") || 'unknown',
      });
      return { error: "Security Alert: This account is bound to another device.", status: 403 };
    }
  }

  const isAdmin = ["admin", "super_admin"].includes(prof.role);

  return {
    user,
    isAdmin,
    profile: prof,
    supabaseAdmin,
  };
}
