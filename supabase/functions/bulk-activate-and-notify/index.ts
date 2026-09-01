/**
 * bulk-activate-and-notify
 * ─────────────────────────────────────────────────────────────────
 * تفعيل اشتراك تعويضي 48 ساعة لكل المستخدمين غير المشتركين
 * + إرسال إشعار FCM لكل المستخدمين (مشتركين وغير مشتركين)
 *
 * POST /bulk-activate-and-notify
 * Authorization: Bearer <SERVICE_ROLE_KEY or admin JWT>
 * Body: {
 *   duration_hours?: number,     // مدة الاشتراك (افتراضي: 48)
 *   notify_title?: string,
 *   notify_body?: string,
 *   dry_run?: boolean            // true = حساب فقط بدون تنفيذ
 * }
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

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
  notifId: string
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
          data: { type: "compensation", notification_id: notifId, action_url: "/home" },
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
    // فحص صلاحية admin
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
    const body = await req.json().catch(() => ({}));
    const durationHours: number = body.duration_hours ?? 48;
    const dryRun: boolean = body.dry_run ?? false;
    const notifyTitle: string = body.notify_title ?? "🎁 هدية خاصة من Vodafone Fakka Premium";
    const notifyBody: string = body.notify_body ?? `تم تفعيل اشتراك مجاني لمدة ${durationHours} ساعة لك! افتح التطبيق الآن واستمتع بجميع الخدمات 🚀`;

    const expiresAt = new Date(Date.now() + durationHours * 3_600_000).toISOString();

    // ── 1. جلب كل المستخدمين غير المشتركين ──────────────────────────────────
    const { data: allUsers } = await supabase
      .from("core_profiles")
      .select("id")
      .eq("role", "user");

    const { data: activeSubUsers } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("status", "active")
      .neq("code_type", "trial");

    const activeSet = new Set((activeSubUsers ?? []).map((s: { user_id: string }) => s.user_id));
    const nonSubscribers = (allUsers ?? [])
      .map((u: { id: string }) => u.id)
      .filter((id: string) => !activeSet.has(id));

    console.log(`Total users: ${allUsers?.length ?? 0}, Active subscribers: ${activeSet.size}, Non-subscribers: ${nonSubscribers.length}`);

    let activatedCount = 0;

    if (!dryRun && nonSubscribers.length > 0) {
      // ── 2. إلغاء أي compensation subscription قديم لنفس المستخدمين ─────────
      await supabase
        .from("subscriptions")
        .update({ status: "replaced", replace_reason: "تجديد اشتراك تعويضي", updated_at: new Date().toISOString() })
        .in("user_id", nonSubscribers)
        .eq("code_type", "compensation")
        .eq("status", "active");

      // ── 3. إدراج subscriptions تعويضية دفعة واحدة ───────────────────────────
      const BATCH = 200;
      for (let i = 0; i < nonSubscribers.length; i += BATCH) {
        const batch = nonSubscribers.slice(i, i + BATCH);
        const rows = batch.map((userId: string) => ({
          user_id:      userId,
          status:       "active",
          code_type:    "compensation",
          code_used:    "ADMIN_COMPENSATION_48H",
          activated_at: new Date().toISOString(),
          expires_at:   expiresAt,
          ops_count:    0,
          ops_limit:    null,          // غير محدود
          duration_days: Math.ceil(durationHours / 24),
          created_at:   new Date().toISOString(),
          updated_at:   new Date().toISOString(),
        }));
        const { error: insertErr } = await supabase.from("subscriptions").insert(rows);
        if (insertErr) {
          console.error("Insert batch error:", insertErr.message);
        } else {
          activatedCount += batch.length;
        }
      }
    }

    // ── 4. إرسال إشعار عام لكل المستخدمين ──────────────────────────────────
    let fcmSent = 0;
    let notifId = "";

    if (!dryRun) {
      // إدراج إشعار global في notifications
      const { data: notif } = await supabase
        .from("notifications")
        .insert({
          title:     notifyTitle,
          body:      notifyBody,
          type:      "compensation",
          priority:  "important",
          is_global: true,
          action_url: "/home",
        })
        .select("id").single();

      notifId = notif?.id ?? "";

      // إرسال FCM لكل الأجهزة النشطة
      const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "";
      if (serviceAccountJson && notifId) {
        try {
          const sa = JSON.parse(serviceAccountJson);
          const accessToken = await getAccessToken(serviceAccountJson);

          // جلب كل FCM tokens نشطة
          const { data: tokens } = await supabase
            .from("fcm_tokens")
            .select("token, user_id")
            .eq("is_active", true);

          const tokenList = tokens ?? [];
          console.log(`Sending FCM to ${tokenList.length} devices...`);

          // إرسال على دفعات لتجنب timeout
          const FCM_BATCH = 50;
          for (let i = 0; i < tokenList.length; i += FCM_BATCH) {
            const batch = tokenList.slice(i, i + FCM_BATCH);
            const results = await Promise.allSettled(
              batch.map((t: { token: string; user_id: string }) =>
                sendFCM(accessToken, sa.project_id, t.token, notifyTitle, notifyBody, notifId)
              )
            );
            fcmSent += results.filter(
              (r) => r.status === "fulfilled" && (r as PromiseFulfilledResult<boolean>).value
            ).length;
          }

          // تسجيل التسليم
          if (tokenList.length > 0) {
            const deliveries = tokenList.map((t: { token: string; user_id: string }, i: number) => ({
              notification_id: notifId,
              user_id: t.user_id,
              push_sent: true,
            }));
            // deduplicate by user_id for upsert
            const uniqueDeliveries = Array.from(
              new Map(deliveries.map((d: { notification_id: string; user_id: string; push_sent: boolean }) => [d.user_id, d])).values()
            );
            await supabase.from("notification_deliveries")
              .upsert(uniqueDeliveries, { onConflict: "notification_id,user_id" });
          }
        } catch (fcmErr) {
          console.error("FCM batch error:", fcmErr);
        }
      }
    }

    return json({
      success: true,
      dry_run: dryRun,
      stats: {
        total_users:       allUsers?.length ?? 0,
        active_subscribers: activeSet.size,
        non_subscribers:   nonSubscribers.length,
        activated:         activatedCount,
        fcm_sent:          fcmSent,
        expires_at:        expiresAt,
        notification_id:   notifId,
      },
    });

  } catch (err) {
    console.error("bulk-activate-and-notify error:", err);
    return json({ error: String(err) }, 500);
  }
});
