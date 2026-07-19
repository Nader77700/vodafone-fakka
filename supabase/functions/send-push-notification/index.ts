// Edge Function: send-push-notification
// يرسل إشعار FCM HTTP v1 لمستخدم محدد أو لجميع المستخدمين
// يستخدم Firebase Service Account JWT (غير مُهمل — HTTP v1 API)
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

interface NotifPayload {
  title: string;
  body: string;
  type?: string;
  priority?: "normal" | "important" | "urgent";
  action_url?: string;
  user_id?: string;
  is_global?: boolean;
  send_push?: boolean;
  dedup_key?: string;
}

// ─── JWT + OAuth2 token for FCM HTTP v1 ───────────────────────────────────

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

  // بناء JWT
  const header = encodeBase64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = encodeBase64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claims}`;

  // استيراد المفتاح الخاص PKCS8
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

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${base64url(sig)}`;

  // تبادل JWT بـ Access Token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error(`OAuth2 error: ${JSON.stringify(tokenData)}`);
  return tokenData.access_token;
}

// ─── إرسال إشعار FCM HTTP v1 ───────────────────────────────────────────────

async function sendFCMv1(
  accessToken: string, projectId: string,
  token: string, title: string, body: string,
  data: Record<string, string>, highPriority: boolean
): Promise<boolean> {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data,
          android: {
            priority: highPriority ? "high" : "normal",
            notification: { sound: "default", channel_id: "default" },
          },
        },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    console.error(`FCM v1 error for token ${token.slice(0,20)}:`, err);
  }
  return res.ok;
}

// ─── Main Handler ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  // ── التحقق من صلاحيات الإدارة ──
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "غير مصرح" }, 401);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // السماح للاستدعاء الداخلي (server-to-server) عبر مفتاح داخلي سري
  const internalKey = (Deno.env.get("INTERNAL_PUSH_KEY") ?? "").trim();
  const internalHeader = (req.headers.get("x-internal-key") ?? "").trim();
  const isInternalCall = (internalKey.length > 0 && internalHeader === internalKey) || authHeader.replace('Bearer ', '') === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!isInternalCall) {
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !caller) return json({ error: "غير مصرح — جلسة غير صحيحية" }, 401);

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles").select("role").eq("id", caller.id).single();
    if (!callerProfile || !["admin", "super_admin"].includes(callerProfile.role)) {
      return json({ error: "غير مصرح — يجب أن تكون مسؤولاً للوصول إلى هذه الخدمة" }, 403);
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "";

  try {
    const payload: NotifPayload = await req.json();
    const { title, body, type = "info", priority = "normal", action_url, user_id, is_global, send_push = true } = payload;

    if (!title?.trim() || !body?.trim()) return json({ error: "title and body required" }, 400);

    // منع التكرار: إشعارات مطابقة خلال 10 ثوانٍ
    if (user_id) {
      const since = new Date(Date.now() - 10_000).toISOString();
      const { data: dup } = await supabase
        .from("notifications").select("id")
        .eq("user_id", user_id).eq("title", title).gte("created_at", since).limit(1).maybeSingle();
      if (dup) return json({ success: true, skipped: true, reason: "duplicate" });
    }

    // إدخال الإشعار في قاعدة البيانات
    const insert: Record<string, unknown> = { title, body, type, priority, is_global: is_global ?? !user_id };
    if (user_id) insert.user_id = user_id;
    if (action_url) insert.action_url = action_url;

    const { data: notif, error: insertErr } = await supabase
      .from("notifications").insert(insert).select("id").single();
    if (insertErr) return json({ error: insertErr.message }, 500);

    // إرسال FCM HTTP v1
    let fcmSent = 0;
    if (send_push && serviceAccountJson) {
      try {
        const sa = JSON.parse(serviceAccountJson);
        const accessToken = await getAccessToken(serviceAccountJson);
        const highPriority = priority === "urgent" || priority === "important";

        let tokens: { token: string; user_id: string }[] = [];
        if (user_id) {
          const { data } = await supabase
            .from("fcm_tokens").select("token, user_id").eq("user_id", user_id).eq("is_active", true);
          tokens = data ?? [];
        } else {
          const { data } = await supabase
            .from("fcm_tokens").select("token, user_id").eq("is_active", true);
          tokens = data ?? [];
        }

        const fcmData: Record<string, string> = {
          type,
          notification_id: notif.id,
        };
        // ⚡ تمرير action_url دائماً في data حتى يعمل التوجيه عند tap
        if (action_url) fcmData.action_url = action_url;
        // تمرير نوع الإشعار الإضافي للمساعدة في resolveAction
        fcmData.notif_type = type;

        const results = await Promise.allSettled(
          tokens.map(t => sendFCMv1(accessToken, sa.project_id, t.token, title, body, fcmData, highPriority))
        );
        fcmSent = results.filter(r => r.status === "fulfilled" && (r as PromiseFulfilledResult<boolean>).value).length;

        // تسجيل التسليم
        if (tokens.length > 0 && notif?.id) {
          const deliveries = tokens.map((t, i) => ({
            notification_id: notif.id,
            user_id: t.user_id,
            push_sent: results[i].status === "fulfilled" && (results[i] as PromiseFulfilledResult<boolean>).value,
          }));
          await supabase.from("notification_deliveries").upsert(deliveries, { onConflict: "notification_id,user_id" });
        }
      } catch (fcmErr) {
        console.error("FCM send error:", fcmErr);
        // الإشعار الداخلي تم بنجاح حتى لو فشل FCM
      }
    }

    return json({ success: true, notification_id: notif.id, fcm_sent: fcmSent });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
