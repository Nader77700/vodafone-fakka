// Edge Function: register-fcm-token
// يخزّن/يحدّث رمز FCM للجهاز
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // التحقق من هوية المستخدم
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: authErr } = await anonClient.auth.getUser();
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

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
