/**
 * fix-notification-blast
 * ─────────────────────────────────────────────────────────────────────────────
 * يُرسل إشعار الإصلاح لكل المستخدمين + يُضيف يومين تعويضاً لكل مشترك نشط
 *
 * POST /fix-notification-blast
 * Authorization: Bearer <SERVICE_ROLE_KEY>
 * Body: { dry_run?: boolean }
 *
 * الخطوات:
 *  1. يجلب كل المستخدمين (role=user)
 *  2. يُرسل إشعار داخلي global لكل المستخدمين
 *  3. يُضيف يومين لكل اشتراك نشط (trial + paid)
 *  4. يُرسل FCM push للجميع
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// ── FCM JWT helpers ───────────────────────────────────────────────────────

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
    false, ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${base64url(sig)}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error(`FCM OAuth2: ${JSON.stringify(tokenData)}`);
  return tokenData.access_token;
}

async function sendFCM(
  accessToken: string, projectId: string,
  token: string, title: string, body: string,
  notifId: string,
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
          data: {
            type: "fix_compensation",
            notification_id: notifId,
            action_url: "/home",
          },
          android: {
            priority: "high",
            notification: { sound: "default", channel_id: "default" },
          },
        },
      }),
    },
  );
  if (!res.ok) {
    console.error(`FCM error [${token.slice(0, 16)}]:`, await res.text());
  }
  return res.ok;
}

// ── Main ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ── التحقق من الصلاحيات ───────────────────────────────────────────────
  const authHeader  = req.headers.get("Authorization") ?? "";
  const internalKey = (Deno.env.get("INTERNAL_PUSH_KEY") ?? "vfp_internal_push_2025").trim();
  const internalHdr = (req.headers.get("x-internal-key") ?? "").trim();

  const isServiceRole = authHeader.replace("Bearer ", "") === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const isInternal    = internalHdr === internalKey;

  if (!isServiceRole && !isInternal) {
    if (!authHeader) return json({ error: "غير مصرح — x-internal-key أو service_role مطلوب" }, 401);
    const caller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "غير مصرح" }, 401);
    const { data: cp } = await supabase
      .from("core_profiles").select("role").eq("id", user.id).single();
    if (!cp || !["admin", "super_admin"].includes(cp.role)) {
      return json({ error: "يجب أن تكون مسؤولاً" }, 403);
    }
  }

  try {
    const rawBody = await req.json().catch(() => ({}));
    const dryRun: boolean = rawBody.dry_run ?? false;

    // ── 1. جلب كل المستخدمين ─────────────────────────────────────────────
    const { data: allUsers, error: usersErr } = await supabase
      .from("core_profiles")
      .select("id")
      .eq("role", "user");

    if (usersErr) return json({ error: usersErr.message }, 500);
    const userIds: string[] = (allUsers ?? []).map((u: { id: string }) => u.id);
    console.log(`[fix-blast] Total users: ${userIds.length}, dryRun=${dryRun}`);

    // ── 2. جلب الاشتراكات النشطة (trial + paid) لإضافة يومين ─────────────
    const { data: activeSubs, error: subsErr } = await supabase
      .from("subscriptions")
      .select("id, user_id, expires_at, code_type")
      .eq("status", "active")
      .or("expires_at.is.null,expires_at.gt." + new Date().toISOString());

    if (subsErr) return json({ error: subsErr.message }, 500);
    console.log(`[fix-blast] Active subscriptions: ${activeSubs?.length ?? 0}`);

    // ── 3. نص الإشعار ─────────────────────────────────────────────────────
    const TITLE = "✅ تم حل مشكلة الاشتراك — افتح التطبيق الآن";
    const BODY  =
      "عزيزي المستخدم، تم إصلاح مشكلة \"انتهى اشتراكك\" بالكامل 🎉\n" +
      "وكتعويض عن الإزعاج، تمت إضافة يومَين مجانيَّين لاشتراكك 🎁\n" +
      "افتح التطبيق الآن واستمتع بكل الخدمات!";

    if (dryRun) {
      return json({
        dry_run: true,
        users_count:      userIds.length,
        active_subs_count: activeSubs?.length ?? 0,
        notification:     { title: TITLE, body: BODY },
        message:          "dry_run=true — لم يُنفَّذ أي تغيير فعلي",
      });
    }

    // ── 4. إدخال إشعار global في notifications ────────────────────────────
    const { data: notif, error: notifErr } = await supabase
      .from("notifications")
      .insert({
        title:     TITLE,
        body:      BODY,
        type:      "fix_compensation",
        priority:  "urgent",
        is_global: true,
        action_url: "/home",
      })
      .select("id")
      .single();

    if (notifErr || !notif) {
      return json({ error: `فشل إدخال الإشعار: ${notifErr?.message}` }, 500);
    }
    console.log(`[fix-blast] Global notification inserted: ${notif.id}`);

    // ── 5. إضافة يومين لكل اشتراك نشط ────────────────────────────────────
    let subsUpdated = 0;
    const TWO_DAYS_MS = 2 * 24 * 3_600_000;

    if (activeSubs && activeSubs.length > 0) {
      // معالجة على دُفعات لتفادي timeout
      const BATCH = 50;
      for (let i = 0; i < activeSubs.length; i += BATCH) {
        const batch = activeSubs.slice(i, i + BATCH);
        await Promise.all(
          batch.map(async (sub: { id: string; expires_at: string | null }) => {
            const currentExpiry = sub.expires_at
              ? new Date(sub.expires_at).getTime()
              : Date.now();
            // نضيف يومين فوق التاريخ الحالي (أو فوق الآن إذا لم يكن محدداً)
            const newExpiry = new Date(
              Math.max(currentExpiry, Date.now()) + TWO_DAYS_MS
            ).toISOString();

            const { error: upErr } = await supabase
              .from("subscriptions")
              .update({
                expires_at: newExpiry,
                updated_at: new Date().toISOString(),
              })
              .eq("id", sub.id);

            if (!upErr) subsUpdated++;
            else console.error(`[fix-blast] Update sub ${sub.id}:`, upErr.message);
          }),
        );
      }
      console.log(`[fix-blast] Subscriptions extended: ${subsUpdated}/${activeSubs.length}`);
    }

    // ── 6. إرسال FCM push لكل الأجهزة النشطة ────────────────────────────
    let fcmSent = 0;
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "";

    if (serviceAccountJson) {
      try {
        const sa = JSON.parse(serviceAccountJson);
        const accessToken = await getAccessToken(serviceAccountJson);

        // جلب كل FCM tokens نشطة
        const { data: fcmTokens } = await supabase
          .from("fcm_tokens")
          .select("token, user_id")
          .eq("is_active", true);

        const tokens = fcmTokens ?? [];
        console.log(`[fix-blast] FCM tokens to notify: ${tokens.length}`);

        // إرسال على دُفعات 100
        const FCM_BATCH = 100;
        for (let i = 0; i < tokens.length; i += FCM_BATCH) {
          const batch = tokens.slice(i, i + FCM_BATCH);
          const results = await Promise.allSettled(
            batch.map((t: { token: string; user_id: string }) =>
              sendFCM(accessToken, sa.project_id, t.token, TITLE, BODY, notif.id)
            ),
          );
          const batchSent = results.filter(
            (r) => r.status === "fulfilled" && (r as PromiseFulfilledResult<boolean>).value
          ).length;
          fcmSent += batchSent;

          // تسجيل التسليم
          const deliveries = batch.map((t: { token: string; user_id: string }, idx: number) => ({
            notification_id: notif.id,
            user_id: t.user_id,
            push_sent:
              results[idx].status === "fulfilled" &&
              (results[idx] as PromiseFulfilledResult<boolean>).value,
          }));
          await supabase
            .from("notification_deliveries")
            .upsert(deliveries, { onConflict: "notification_id,user_id" })
            .catch((e: Error) => console.error("[fix-blast] delivery upsert:", e));
        }

        console.log(`[fix-blast] FCM sent: ${fcmSent}/${tokens.length}`);
      } catch (fcmErr) {
        console.error("[fix-blast] FCM error:", fcmErr);
        // الإشعار الداخلي تم — FCM failure لا يُوقف العملية
      }
    } else {
      console.warn("[fix-blast] FIREBASE_SERVICE_ACCOUNT_JSON not set — skipping FCM");
    }

    return json({
      success:       true,
      notification_id: notif.id,
      users_count:   userIds.length,
      subs_extended: subsUpdated,
      fcm_sent:      fcmSent,
      message:       "تم إرسال الإشعار وتعويض يومين لكل المشتركين بنجاح ✅",
    });

  } catch (err) {
    console.error("[fix-blast] Unexpected:", err);
    return json({ error: String(err) }, 500);
  }
});
