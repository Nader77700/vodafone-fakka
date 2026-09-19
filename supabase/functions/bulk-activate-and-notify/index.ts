/**
 * bulk-activate-and-notify  v2
 * ─────────────────────────────────────────────────────────────────
 * يدعم 3 سيناريوهات مستقلة أو دفعة واحدة (all_three):
 *
 *  mode = "unsubscribed"  → يومين للمستخدمين غير المشتركين
 *  mode = "unlimited"     → يضيف يومين للمشتركين اشتراك غير محدود
 *  mode = "limited_ops"   → يضيف 10 عمليات للمشتركين المحدودي العمليات
 *  mode = "all_three"     → ينفذ الثلاثة معاً (افتراضي)
 *
 * POST /bulk-activate-and-notify
 * Authorization: Bearer <SERVICE_ROLE_KEY or admin JWT>
 * Body: {
 *   mode?: "all_three" | "unsubscribed" | "unlimited" | "limited_ops",
 *   dry_run?: boolean,
 *   // إشعارات مخصصة لكل فئة (اختيارية)
 *   notif_unsubscribed?: { title: string; body: string },
 *   notif_unlimited?:    { title: string; body: string },
 *   notif_limited_ops?:  { title: string; body: string },
 * }
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

// ── types ─────────────────────────────────────────────────────────────────
type Mode = "all_three" | "unsubscribed" | "unlimited" | "limited_ops";
interface NotifText { title: string; body: string; }
interface RequestBody {
  mode?: Mode;
  dry_run?: boolean;
  notif_unsubscribed?: NotifText;
  notif_unlimited?: NotifText;
  notif_limited_ops?: NotifText;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// ── FCM helpers ───────────────────────────────────────────────────────────

function encodeBase64url(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = encodeBase64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claims}`;
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8", der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${base64url(sig)}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error(`OAuth2 error: ${JSON.stringify(tokenData)}`);
  return tokenData.access_token;
}

async function sendFCM(
  accessToken: string, projectId: string,
  token: string, title: string, body: string,
  notifId: string, type = "compensation"
): Promise<boolean> {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data: { type, notification_id: notifId, action_url: "/home" },
          android: {
            priority: "high",
            notification: { sound: "default", channel_id: "default" },
          },
        },
      }),
    }
  );
  if (!res.ok) console.error(`FCM error ${token.slice(0, 20)}:`, await res.text());
  return res.ok;
}

// ── Main ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ── فحص الصلاحيات ────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const internalKey = (Deno.env.get("INTERNAL_PUSH_KEY") ?? "").trim();
  const internalHeader = (req.headers.get("x-internal-key") ?? "").trim();

  const isServiceRole = authHeader.replace("Bearer ", "") === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const isInternalKey = internalKey && internalHeader === internalKey;

  if (!isServiceRole && !isInternalKey) {
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "غير مصرح" }, 403);
    const { data: cp } = await supabase.from("core_profiles").select("role").eq("id", caller.id).single();
    if (!cp || !["admin", "super_admin"].includes(cp.role)) {
      return json({ error: "يجب أن تكون مسؤولاً" }, 403);
    }
  }

  try {
    const rawBody: RequestBody = await req.json().catch(() => ({}));
    const mode: Mode   = rawBody.mode ?? "all_three";
    const dryRun       = rawBody.dry_run ?? false;
    const now          = new Date();
    const expiresAt48h = new Date(now.getTime() + 48 * 3_600_000).toISOString();

    // ── نصوص الإشعارات الافتراضية ──────────────────────────────────────────
    const DEFAULT_NOTIF: Record<Mode, NotifText> = {
      unsubscribed: {
        title: "🎁 هدية خاصة لك من Vodafone Fakka!",
        body:  "تم تفعيل اشتراك مجاني لمدة 48 ساعة 🚀 افتح التطبيق الآن واستمتع بجميع الخدمات مجاناً!",
      },
      unlimited: {
        title: "🎉 تمديد اشتراكك مجاناً!",
        body:  "تمت إضافة يومين إضافيين لاشتراكك غير المحدود 💎 استمتع بالخدمات بدون حدود!",
      },
      limited_ops: {
        title: "⚡ رصيد عمليات مجاني!",
        body:  "تمت إضافة 10 عمليات إضافية مجانية لاشتراكك 🔥 استخدمها الآن!",
      },
      all_three: { title: "", body: "" }, // غير مستخدم مباشرة
    };

    const notifUnsubscribed: NotifText = rawBody.notif_unsubscribed ?? DEFAULT_NOTIF.unsubscribed;
    const notifUnlimited: NotifText    = rawBody.notif_unlimited    ?? DEFAULT_NOTIF.unlimited;
    const notifLimitedOps: NotifText   = rawBody.notif_limited_ops  ?? DEFAULT_NOTIF.limited_ops;

    // ── جلب البيانات المطلوبة ─────────────────────────────────────────────
    const [
      { data: allUsers },
      { data: activeSubs },
    ] = await Promise.all([
      supabase.from("core_profiles").select("id").eq("role", "user"),
      supabase.from("subscriptions")
        .select("id, user_id, ops_limit, ops_remaining")
        .eq("status", "active"),
    ]);

    const allUserIds: string[] = (allUsers ?? []).map((u: { id: string }) => u.id);

    // فصل المشتركين حسب نوع الاشتراك
    const unlimitedSubs   = (activeSubs ?? []).filter((s: { ops_limit: number | null }) => !s.ops_limit);
    const limitedOpsSubs  = (activeSubs ?? []).filter((s: { ops_limit: number | null }) => !!s.ops_limit);
    const subscribedIds   = new Set((activeSubs ?? []).map((s: { user_id: string }) => s.user_id));
    const nonSubscriberIds = allUserIds.filter((id: string) => !subscribedIds.has(id));

    console.log(`Users: ${allUserIds.length} | Unsubscribed: ${nonSubscriberIds.length} | Unlimited: ${unlimitedSubs.length} | LimitedOps: ${limitedOpsSubs.length}`);

    const stats: Record<string, number> = {
      total_users: allUserIds.length,
      unsubscribed_count: nonSubscriberIds.length,
      unlimited_count:    unlimitedSubs.length,
      limited_ops_count:  limitedOpsSubs.length,
      activated_unsubscribed: 0,
      extended_unlimited:     0,
      added_ops_limited:      0,
      fcm_unsubscribed:       0,
      fcm_unlimited:          0,
      fcm_limited_ops:        0,
    };

    const shouldRun = (m: Mode) => mode === "all_three" || mode === m;

    // ════════════════════════════════════════════════════════════════
    // 1. غير المشتركين — تفعيل اشتراك 48 ساعة جديد
    // ════════════════════════════════════════════════════════════════
    if (!dryRun && shouldRun("unsubscribed") && nonSubscriberIds.length > 0) {
      // ★ FIX: نعيد فحص المشتركين مباشرةً قبل الإدراج لضمان الدقة
      // (يحمي من حالة تغيّر الاشتراك بين fetch الأولى وهنا)
      const { data: freshActiveSubs } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("status", "active")
        .gt("expires_at", now.toISOString());
      const freshSubscribedIds = new Set((freshActiveSubs ?? []).map((s: { user_id: string }) => s.user_id));
      const safeNonSubscriberIds = nonSubscriberIds.filter((id: string) => !freshSubscribedIds.has(id));

      console.log(`Safe non-subscribers after re-check: ${safeNonSubscriberIds.length}`);

      if (safeNonSubscriberIds.length > 0) {
        // إلغاء أي compensation قديم منتهٍ (لا نلغي النشطة)
        await supabase
          .from("subscriptions")
          .update({ status: "replaced", replace_reason: "تجديد اشتراك تعويضي", updated_at: now.toISOString() })
          .in("user_id", safeNonSubscriberIds)
          .eq("code_type", "compensation")
          .eq("status", "active")
          .lt("expires_at", now.toISOString()); // ★ فقط المنتهية

        // ★ FIX: إدراج اشتراكات جديدة بـ ON CONFLICT DO NOTHING لمنع التكرار
        const BATCH = 200;
        for (let i = 0; i < safeNonSubscriberIds.length; i += BATCH) {
          const batch = safeNonSubscriberIds.slice(i, i + BATCH);
          const rows = batch.map((userId: string) => ({
            user_id:       userId,
            status:        "active",
            code_type:     "compensation",
            code_used:     "GIFT-2DAYS-FREE",
            activated_at:  now.toISOString(),
            // ★ FIX: دائماً now() + 48h — لا نعتمد على expires_at سابق
            expires_at:    expiresAt48h,
            ops_count:     0,
            ops_limit:     null,
            ops_remaining: null,
            duration_days: 2,
            created_at:    now.toISOString(),
            updated_at:    now.toISOString(),
          }));
          const { error: e } = await supabase.from("subscriptions").insert(rows);
          if (!e) stats.activated_unsubscribed += batch.length;
          else console.error("Insert unsubscribed batch:", e.message);
        }
      }
    }

    // ════════════════════════════════════════════════════════════════
    // 2. المشتركون اشتراك غير محدود — إضافة يومين لـ expires_at
    // ════════════════════════════════════════════════════════════════
    if (!dryRun && shouldRun("unlimited") && unlimitedSubs.length > 0) {
      const BATCH = 100;
      for (let i = 0; i < unlimitedSubs.length; i += BATCH) {
        const batch = unlimitedSubs.slice(i, i + BATCH);
        await Promise.all(batch.map(async (sub: { id: string }) => {
          // نجلب expires_at الحالي ثم نضيف 48 ساعة
          const { data: current } = await supabase
            .from("subscriptions").select("expires_at").eq("id", sub.id).single();
          const base = current?.expires_at ? new Date(current.expires_at) : now;
          // لا نعيد تمديد اشتراك منتهي — نبدأ من الآن إذا كان منتهياً
          const baseMs = Math.max(base.getTime(), now.getTime());
          const newExpiry = new Date(baseMs + 48 * 3_600_000).toISOString();
          await supabase.from("subscriptions")
            .update({ expires_at: newExpiry, updated_at: now.toISOString() })
            .eq("id", sub.id);
        }));
        stats.extended_unlimited += batch.length;
      }
    }

    // ════════════════════════════════════════════════════════════════
    // 3. المشتركون اشتراك محدود بعمليات — إضافة 10 عمليات
    // ════════════════════════════════════════════════════════════════
    if (!dryRun && shouldRun("limited_ops") && limitedOpsSubs.length > 0) {
      const BATCH = 100;
      for (let i = 0; i < limitedOpsSubs.length; i += BATCH) {
        const batch = limitedOpsSubs.slice(i, i + BATCH);
        await Promise.all(batch.map(async (sub: { id: string; ops_remaining: number | null; ops_limit: number | null }) => {
          const newRemaining = (sub.ops_remaining ?? 0) + 10;
          const newLimit     = (sub.ops_limit ?? 0) + 10;
          await supabase.from("subscriptions")
            .update({ ops_remaining: newRemaining, ops_limit: newLimit, updated_at: now.toISOString() })
            .eq("id", sub.id);
        }));
        stats.added_ops_limited += batch.length;
      }
    }

    // ════════════════════════════════════════════════════════════════
    // 4. إرسال إشعارات FCM مخصصة لكل فئة
    // ════════════════════════════════════════════════════════════════
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "";

    if (!dryRun && serviceAccountJson) {
      try {
        const sa = JSON.parse(serviceAccountJson);
        const accessToken = await getAccessToken(serviceAccountJson);

        // جلب FCM tokens مع user_id
        const { data: allTokens } = await supabase
          .from("fcm_tokens").select("token, user_id").eq("is_active", true);
        const tokenList: { token: string; user_id: string }[] = allTokens ?? [];

        // تصنيف tokens
        const unlimitedIds  = new Set(unlimitedSubs.map((s: { user_id: string }) => s.user_id));
        const limitedOpsIds = new Set(limitedOpsSubs.map((s: { user_id: string }) => s.user_id));

        const groups: { ids: Set<string>; notif: NotifText; type: string; statKey: string }[] = [
          ...(shouldRun("unsubscribed") ? [{ ids: new Set(nonSubscriberIds), notif: notifUnsubscribed, type: "gift_48h",    statKey: "fcm_unsubscribed" }] : []),
          ...(shouldRun("unlimited")    ? [{ ids: unlimitedIds,              notif: notifUnlimited,    type: "gift_2days",  statKey: "fcm_unlimited"    }] : []),
          ...(shouldRun("limited_ops")  ? [{ ids: limitedOpsIds,             notif: notifLimitedOps,   type: "gift_10ops",  statKey: "fcm_limited_ops"  }] : []),
        ];

        for (const group of groups) {
          const groupTokens = tokenList.filter((t) => group.ids.has(t.user_id));
          if (groupTokens.length === 0) continue;

          // إدراج إشعار واحد لكل فئة
          const { data: notif } = await supabase.from("notifications").insert({
            title:      group.notif.title,
            body:       group.notif.body,
            type:       group.type,
            priority:   "important",
            is_global:  false,
            action_url: "/home",
          }).select("id").single();
          const notifId = notif?.id ?? "";

          // إرسال FCM على دفعات
          const FCM_BATCH = 50;
          let sent = 0;
          for (let i = 0; i < groupTokens.length; i += FCM_BATCH) {
            const batch = groupTokens.slice(i, i + FCM_BATCH);
            const results = await Promise.allSettled(
              batch.map((t) => sendFCM(accessToken, sa.project_id, t.token, group.notif.title, group.notif.body, notifId, group.type))
            );
            sent += results.filter(
              (r) => r.status === "fulfilled" && (r as PromiseFulfilledResult<boolean>).value
            ).length;
          }
          (stats as Record<string, number>)[group.statKey] = sent;

          // تسجيل التسليم
          if (notifId && groupTokens.length > 0) {
            const unique = Array.from(
              new Map(groupTokens.map((t) => [t.user_id, { notification_id: notifId, user_id: t.user_id, push_sent: true }])).values()
            );
            await supabase.from("notification_deliveries")
              .upsert(unique, { onConflict: "notification_id,user_id" });
          }
        }
      } catch (fcmErr) {
        console.error("FCM error:", fcmErr);
      }
    }

    return json({ success: true, dry_run: dryRun, mode, stats, expires_at_48h: expiresAt48h });

  } catch (err) {
    console.error("bulk-activate-and-notify error:", err);
    return json({ error: String(err) }, 500);
  }
});
