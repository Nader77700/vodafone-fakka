import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function encodeBase64url(str: string): string {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = encodeBase64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const signingInput = `${header}.${claims}`;
  const pemBody = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\n/g, "");
  const der = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${base64url(sig)}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}` });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error(`OAuth2 error: ${JSON.stringify(tokenData)}`);
  return tokenData.access_token;
}

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: notifs } = await supabase.from('notifications').select('id, user_id, title, body').eq('title', '🎁 تعويض انقطاع الخدمة').gt('created_at', new Date(Date.now() - 3600000 * 2).toISOString());

  if (!notifs) return new Response(JSON.stringify({ error: "No notifs" }), { status: 500 });

  const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!serviceAccountJson) return new Response(JSON.stringify({ error: "No FIREBASE_SERVICE_ACCOUNT_JSON" }), { status: 500 });

  const accessToken = await getAccessToken(serviceAccountJson);
  const sa = JSON.parse(serviceAccountJson);

  let successCount = 0;
  for (const n of notifs) {
    const { data: tokens } = await supabase.from("fcm_tokens").select("token").eq("user_id", n.user_id).eq("is_active", true);
    if (!tokens || tokens.length === 0) continue;
    
    for (const t of tokens) {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token: t.token,
            notification: { title: n.title, body: n.body },
            data: { type: "system", notification_id: n.id },
            android: { priority: "high", notification: { sound: "default", channel_id: "default" } }
          }
        })
      });
      if (res.ok) successCount++;
    }
  }

  // Not deleting them! They will stay in the DB.
  
  return new Response(JSON.stringify({ success: true, count: successCount, fetchedCount: notifs.length }), { status: 200, headers: {"Content-Type": "application/json"} });
});
