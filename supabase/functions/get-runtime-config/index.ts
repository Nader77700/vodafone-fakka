// Edge Function: get-runtime-config
// نقطة واحدة تُعيد كل إعدادات التطبيق دفعة واحدة
// تعمل مع جميع إصدارات APK القديمة والجديدة (لا تحتاج auth)
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-cache" },
  });

// تحويل القيمة من نص إلى النوع المناسب
function parseValue(value: string, type: string): unknown {
  try {
    switch (type) {
      case "boolean": return value === "true";
      case "number":  return Number(value);
      case "json":    return JSON.parse(value);
      default:        return value;
    }
  } catch {
    return value;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // جلب كل الإعدادات العامة
    const { data: rows, error } = await supabase
      .from("app_config")
      .select("key, value, value_type, category, updated_at")
      .eq("is_public", true)
      .order("category")
      .order("key");

    if (error) throw error;

    // بناء الكائن المُهيكَل
    const config: Record<string, Record<string, unknown>> = {
      feature_flags: {},
      version:       {},
      security:      {},
      business:      {},
      ui:            {},
      general:       {},
    };

    let latestUpdatedAt = "";

    for (const row of rows ?? []) {
      const cat = row.category as string;
      if (!config[cat]) config[cat] = {};
      config[cat][row.key] = parseValue(row.value, row.value_type);
      if (row.updated_at > latestUpdatedAt) latestUpdatedAt = row.updated_at;
    }

    // ETag بسيط لتخفيف الضغط
    const etag = `"${latestUpdatedAt}"`;
    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch === etag) {
      return new Response(null, { status: 304, headers: { ...CORS, ETag: etag } });
    }

    return new Response(JSON.stringify({ ok: true, config, fetched_at: new Date().toISOString() }), {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "ETag": etag,
      },
    });
  } catch (e) {
    console.error("get-runtime-config error:", e);
    return json({ ok: false, error: String(e) }, 500);
  }
});
