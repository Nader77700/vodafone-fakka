/**
 * Edge Function: check-user-status
 * 
 * يُعيد للتطبيق حالة المستخدم الكاملة من السيرفر:
 * - is_admin       → الأدمن مُستثنى من كل القيود
 * - maintenance    → هل وضع الصيانة مفعّل (الأدمن لا يراه)
 * - subscription   → حالة الاشتراك (الأدمن دائماً active)
 * - is_paused      → هل الاشتراكات معلّقة (الأدمن مُستثنى)
 * 
 * الفرونت يستدعي هذه الدالة عند فتح التطبيق ليعرف ما يعرضه.
 */
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-build, x-app-secure-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ── تحقق من Authorization ─────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authErr } = await anonClient.auth.getUser();
  if (authErr || !user) return json({ error: "Invalid Session" }, 401);

  // ── جلب البيانات بالتوازي ──────────────────────────────────────
  const [profileRes, subscriptionRes, configRes] = await Promise.all([
    // 1. بيانات المستخدم
    supabaseAdmin
      .from("core_profiles")
      .select("role, is_active, username")
      .eq("id", user.id)
      .single(),

    // 2. الاشتراك الأحدث (أي status)
    supabaseAdmin
      .from("subscriptions")
      .select("id, status, expires_at, is_paused, paused_at, days_remaining, ops_remaining, code_type")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // 3. إعداد الصيانة
    supabaseAdmin
      .from("core_app_config")
      .select("key, value")
      .eq("key", "ff_maintenance_mode")
      .maybeSingle(),
  ]);

  const profile = profileRes.data;
  if (!profile || !profile.is_active) return json({ error: "Account Banned" }, 403);

  // ── تحديد هل هو أدمن ──────────────────────────────────────────
  const isAdmin = ["admin", "super_admin"].includes(profile.role ?? "");

  // ── حالة الصيانة (الأدمن لا يراها) ───────────────────────────
  const maintenanceActive = configRes.data?.value === "true";
  const maintenanceForUser = maintenanceActive && !isAdmin;

  // ── حالة الاشتراك ──────────────────────────────────────────────
  const sub = subscriptionRes.data;
  let subscriptionStatus: string;
  let subscriptionExpiry: string | null = null;
  let isPaused = false;

  if (isAdmin) {
    // الأدمن دائماً له وصول كامل بغض النظر عن الاشتراك
    subscriptionStatus = "admin_bypass";
  } else if (!sub) {
    subscriptionStatus = "no_subscription";
  } else if (sub.is_paused) {
    // الاشتراك معلّق (التطبيق موقوف) — العميل العادي يُوقف
    subscriptionStatus = "paused";
    isPaused = true;
    subscriptionExpiry = sub.paused_at;
  } else {
    subscriptionStatus = sub.status;
    subscriptionExpiry = sub.expires_at;

    // التحقق من انتهاء الصلاحية فعلياً
    if (sub.status === "active" && sub.expires_at) {
      const expDate = new Date(sub.expires_at);
      if (expDate.getTime() < Date.now()) {
        subscriptionStatus = "expired";
      }
    }
  }

  return json({
    ok:        true,
    user_id:   user.id,
    username:  profile.username,
    role:      profile.role,
    is_admin:  isAdmin,

    // وضع الصيانة — false دائماً للأدمن
    maintenance: maintenanceForUser,

    // حالة الاشتراك
    subscription: {
      status:          subscriptionStatus,
      expires_at:      subscriptionExpiry,
      is_paused:       isPaused,
      days_remaining:  sub?.days_remaining ?? null,
      ops_remaining:   sub?.ops_remaining  ?? null,
      code_type:       sub?.code_type      ?? null,
    },

    // الأدمن: كل الخدمات متاحة
    access: {
      full_access:   isAdmin || subscriptionStatus === "active",
      is_restricted: !isAdmin && ["no_subscription", "expired", "suspended", "paused"].includes(subscriptionStatus),
      bypass_reason: isAdmin ? "ADMIN_BYPASS" : null,
    },

    checked_at: new Date().toISOString(),
  });
});
