// Edge Function: auto-version-notify
// يُطلق تلقائياً عند نشر إصدار جديد (is_latest = true)
// يرسل Push Notification لجميع المستخدمين عبر FCM HTTP v1
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// ─── JWT + OAuth2 لـ FCM HTTP v1 ──────────────────────────────────────────

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function encodeBase64url(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
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
    iat: now, exp: now + 3600,
  }));
  const signingInput = `${header}.${claims}`;
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const der = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8", der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
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

// ─── إرسال FCM v1 لجهاز واحد ──────────────────────────────────────────────

async function sendFCMv1(
  accessToken: string, projectId: string,
  token: string, title: string, body: string,
  data: Record<string, string>
): Promise<boolean> {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data,
          android: { priority: "high", notification: { sound: "default", channel_id: "default" } },
        },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    // إزالة التوكن الفاسد تلقائياً
    if (err.includes("UNREGISTERED") || err.includes("NOT_FOUND")) {
      return false; // سيتم تعطيله لاحقاً
    }
    console.error(`FCM v1 error token ${token.slice(0, 20)}…:`, err);
  }
  return res.ok;
}

// ─── Handler الرئيسي ──────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "";

  try {
    const payload = await req.json() as {
      version: string;
      version_code: number;
      apk_url?: string;
      release_notes?: string;
      version_id?: string;
    };

    const { version, version_code, apk_url, version_id } = payload;
    if (!version) return json({ error: "version required" }, 400);

    // ─── 1. منع التكرار ────────────────────────────────────────────────────
    // تحقق مباشر من قاعدة البيانات
    if (version_id) {
      const { data: vRow } = await supabase
        .from("app_versions").select("push_notif_sent").eq("id", version_id).maybeSingle();
      if (vRow?.push_notif_sent === true) {
        console.log(`Version ${version} already notified — skipping`);
        return json({ success: true, skipped: true, reason: "already_notified" });
      }
    } else {
      // تحقق عبر version + version_code
      const { data: vRow } = await supabase
        .from("app_versions").select("push_notif_sent, id")
        .eq("version", version).eq("version_code", version_code).maybeSingle();
      if (vRow?.push_notif_sent === true) {
        return json({ success: true, skipped: true, reason: "already_notified" });
      }
    }

    // ─── 2. محتوى الإشعار ──────────────────────────────────────────────────
    const notifTitle = "🚀 إصدار جديد متاح";
    const notifBody  = `تم إصدار النسخة ${version}. اضغط لتحميل التحديث من صفحة التحديثات.`;
    // ⚡ action_url = صفحة التحديث المخصصة (وليس رابط APK المباشر)
    // المستخدم يُوجَّه لصفحة update.html الجميلة — منها يقوم بالتحميل
    const UPDATE_PAGE = "https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/web-live/update.html";
    const actionUrl   = UPDATE_PAGE;

    // ─── 3. إدخال إشعار عام في notifications ──────────────────────────────
    const { data: notifRow, error: insertErr } = await supabase
      .from("notifications")
      .insert({
        title:      notifTitle,
        body:       notifBody,
        type:       "update_available",
        priority:   "important",
        is_global:  true,
        action_url: actionUrl,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("Failed to insert notification:", insertErr.message);
      return json({ error: insertErr.message }, 500);
    }

    // ─── 4. جلب جميع توكنات FCM الفعّالة ─────────────────────────────────
    const { data: tokensData } = await supabase
      .from("fcm_tokens")
      .select("token, user_id")
      .eq("is_active", true);

    const tokens = tokensData ?? [];
    const totalDevices = tokens.length;

    let sentCount  = 0;
    let failCount  = 0;
    const staleTokens: string[] = [];

    if (totalDevices > 0 && serviceAccountJson) {
      try {
        const sa = JSON.parse(serviceAccountJson);
        const accessToken = await getAccessToken(serviceAccountJson);
        const fcmData: Record<string, string> = {
          type:            "update_available",
          notification_id: notifRow.id,
          action_url:      actionUrl,
          version:         version,
          apk_url:         apk_url ?? "",
        };

        // إرسال دفعات من 500 في كل مرة لتجنب timeout
        const BATCH = 500;
        for (let i = 0; i < tokens.length; i += BATCH) {
          const batch = tokens.slice(i, i + BATCH);
          const results = await Promise.allSettled(
            batch.map(t => sendFCMv1(accessToken, sa.project_id, t.token, notifTitle, notifBody, fcmData))
          );

          results.forEach((r, idx) => {
            const ok = r.status === "fulfilled" && (r as PromiseFulfilledResult<boolean>).value;
            if (ok) sentCount++;
            else {
              failCount++;
              staleTokens.push(batch[idx].token);
            }
          });

          // تسجيل التسليم
          const deliveries = batch.map((t, idx) => ({
            notification_id: notifRow.id,
            user_id:         t.user_id,
            push_sent:       results[idx].status === "fulfilled" && (results[idx] as PromiseFulfilledResult<boolean>).value,
          }));
          await supabase
            .from("notification_deliveries")
            .upsert(deliveries, { onConflict: "notification_id,user_id" });
        }

        // ─── 5. تعطيل التوكنات الفاسدة تلقائياً ─────────────────────────
        if (staleTokens.length > 0) {
          await supabase
            .from("fcm_tokens")
            .update({ is_active: false })
            .in("token", staleTokens);
          console.log(`Deactivated ${staleTokens.length} stale FCM tokens`);
        }

      } catch (fcmErr) {
        console.error("FCM batch error:", fcmErr);
        failCount = totalDevices;
      }
    }

    // ─── 6. تحديث app_versions بإحصائيات الإرسال ─────────────────────────
    const updateQuery = version_id
      ? supabase.from("app_versions").update({
          push_notif_sent:    true,
          push_notif_sent_at: new Date().toISOString(),
          push_total_devices: totalDevices,
          push_sent_count:    sentCount,
          push_fail_count:    failCount,
        }).eq("id", version_id)
      : supabase.from("app_versions").update({
          push_notif_sent:    true,
          push_notif_sent_at: new Date().toISOString(),
          push_total_devices: totalDevices,
          push_sent_count:    sentCount,
          push_fail_count:    failCount,
        }).eq("version", version).eq("version_code", version_code);

    await updateQuery;

    console.log(`Version ${version} notify done: ${sentCount}/${totalDevices} sent, ${failCount} failed`);
    return json({
      success:        true,
      version,
      notification_id: notifRow.id,
      total_devices:  totalDevices,
      sent:           sentCount,
      failed:         failCount,
    });

  } catch (e) {
    console.error("auto-version-notify error:", e);
    return json({ error: String(e) }, 500);
  }
});
