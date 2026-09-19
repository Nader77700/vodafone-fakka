// Edge Function: admin-gift-notify
// v2 — إشعار إصلاح المشكلة التقنية + تعويض يومين لكل الأجهزة النشطة
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } });

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
  const pemBody = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\n/g, "");
  const der = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
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

async function sendFCM(accessToken: string, projectId: string, token: string, title: string, body: string, data: Record<string, string>): Promise<boolean> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        data,
        android: { priority: "high", notification: { sound: "default", channel_id: "default" } },
        apns: { payload: { aps: { sound: "default", "content-available": 1 } } },
      },
    }),
  });
  return res.ok;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "";
  if (!serviceAccountJson) return json({ error: "FIREBASE_SERVICE_ACCOUNT_JSON missing" }, 500);

  try {
    const sa = JSON.parse(serviceAccountJson);
    const accessToken = await getAccessToken(serviceAccountJson);

    const TITLE = "✅ تم إصلاح مشكلة الاشتراك — افتح التطبيق الآن";
    const BODY  =
      "🎉 تم حل مشكلة \"انتهى اشتراكك\" بالكامل!\n" +
      "كانت المشكلة تقنية في النظام ولم تكن بسببك 🙏\n" +
      "كتعويض عن الإزعاج، تمت إضافة يومَين مجانيَّين لاشتراكك 🎁\n" +
      "افتح التطبيق الآن واستمتع بجميع الخدمات! 🚀";

    // إدراج إشعار global واحد
    const { data: notifRow } = await supabase
      .from("notifications")
      .insert({
        title: TITLE, body: BODY,
        type: "announcement", priority: "urgent",
        action_url: "/home", is_global: true,
      })
      .select("id").single();

    const notifId = notifRow?.id ?? "unknown";

    // جلب كل FCM tokens النشطة
    const { data: allTokens } = await supabase
      .from("fcm_tokens")
      .select("token, user_id")
      .eq("is_active", true);

    const tokens = allTokens ?? [];
    let fcmSent = 0, fcmFailed = 0;

    // إرسال على دفعات 50 لتفادي timeout
    const BATCH = 50;
    for (let i = 0; i < tokens.length; i += BATCH) {
      const batch = tokens.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map((t: { token: string; user_id: string }) =>
          sendFCM(accessToken, sa.project_id, t.token, TITLE, BODY, {
            type: "announcement",
            notification_id: notifId,
            action_url: "/home",
          })
        )
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) fcmSent++;
        else fcmFailed++;
      }

      // تسجيل التسليم
      const deliveries = batch.map((t: { token: string; user_id: string }, idx: number) => ({
        notification_id: notifId,
        user_id: t.user_id,
        push_sent: results[idx].status === "fulfilled" && (results[idx] as PromiseFulfilledResult<boolean>).value,
      }));
      await supabase.from("notification_deliveries")
        .upsert(deliveries, { onConflict: "notification_id,user_id" });
    }

    return json({
      success: true,
      notification_id: notifId,
      fcm_sent: fcmSent,
      fcm_failed: fcmFailed,
      total_tokens: tokens.length,
      message: "تم إرسال إشعار الإصلاح لكل الأجهزة ✅",
    });

  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

