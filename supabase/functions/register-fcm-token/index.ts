// Edge Function: register-fcm-token
// يخزّن/يحدّث رمز FCM للجهاز
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { zeroTrustCheck, CORS_HEADERS } from "../_shared/zero_trust.ts";

const CORS = CORS_HEADERS;
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const zt = await zeroTrustCheck(req);
  if ('error' in zt) return json({ error: zt.error }, zt.status);
  const { user, supabaseAdmin: supabase } = zt;
    if (!user) return json({ error: "Unauthorized" }, 401);

  try {
    const body = await req.json();

    // حذف الرمز عند تسجيل الخروج
    if (req.method === "DELETE") {
      const { token } = body;
      if (token) {
        await supabase.from("fcm_tokens").update({ is_active: false }).eq("token", token).eq("user_id", user.id);
      }
      return json({ success: true });
    }

    // تسجيل / تحديث الرمز
    const { token, device_info = {}, app_version, version_code } = body;
    if (!token) return json({ error: "token required" }, 400);

    const { error } = await supabase.from("fcm_tokens").upsert({
      user_id: user.id,
      token,
      device_info,
      app_version: app_version ?? null,
      version_code: version_code ?? null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "token" });

    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
