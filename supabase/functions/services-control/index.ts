/**
 * Edge Function: services-control
 * GET  /services-control           → قراءة كل الإعدادات (عام — بدون auth)
 * PATCH /services-control          → تحديث إعداد واحد (admin فقط)
 */
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
};

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey    = Deno.env.get("SUPABASE_ANON_KEY")!;

  // ── GET: قراءة عامة (تستخدم anon key + RLS public_read) ──────
  if (req.method === "GET") {
    const sb = createClient(url, anonKey);
    const { data, error } = await sb
      .from("services_control")
      .select("id,visible,status,access_mode,maintenance_message,display_order")
      .order("display_order");
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, services: data });
  }

  // ── PATCH: تحديث (admin فقط — يتحقق بـ service role + RLS) ──
  if (req.method === "PATCH") {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json({ ok: false, error: "Unauthorized" }, 401);

    // تحقق من هوية المستخدم
    const sbUser = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authErr } = await sbUser.auth.getUser();
    if (authErr || !user) return json({ ok: false, error: "Unauthorized" }, 401);

    // تحقق من الدور
    const sbAdmin = createClient(url, serviceKey);
    const { data: profile } = await sbAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "super_admin"].includes(profile.role)) {
      return json({ ok: false, error: "Forbidden — admins only" }, 403);
    }

    // تطبيق التحديث
    const body = await req.json() as {
      id: string;
      patch: Record<string, unknown>;
    };
    if (!body.id || !body.patch) return json({ ok: false, error: "id + patch required" }, 400);

    const { error: upErr } = await sbAdmin
      .from("services_control")
      .update({ ...body.patch, updated_by: user.id })
      .eq("id", body.id);

    if (upErr) return json({ ok: false, error: upErr.message }, 500);
    return json({ ok: true });
  }

  return json({ ok: false, error: "Method not allowed" }, 405);
});
