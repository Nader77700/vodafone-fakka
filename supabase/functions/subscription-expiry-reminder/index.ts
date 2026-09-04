// Edge Function: subscription-expiry-reminder
// تبعت إشعار push قبل 48h و 24h من انتهاء الاشتراك
// يُستدعى من pg_cron كل ساعة
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
  const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase     = createClient(supabaseUrl, serviceKey);

  const now = new Date();
  const results: { window: string; processed: number; sent: number }[] = [];

  // ─── نافذتا الإشعار: 48h و 24h ─────────────────────────────────────────
  const windows = [
    {
      label: "48h",
      field: "expiry_notif_48h_sent" as const,
      fromMs: 47 * 60 * 60 * 1000,   // >= 47h بعد الآن
      toMs:   49 * 60 * 60 * 1000,   // <= 49h بعد الآن
      title:  "⏰ اشتراكك ينتهي بعد يومين",
      body:   "ينتهي اشتراكك بعد 48 ساعة. جدّد الآن للاستمرار في الاستمتاع بالخدمة دون انقطاع.",
    },
    {
      label: "24h",
      field: "expiry_notif_24h_sent" as const,
      fromMs: 23 * 60 * 60 * 1000,
      toMs:   25 * 60 * 60 * 1000,
      title:  "🚨 اشتراكك ينتهي غداً",
      body:   "ينتهي اشتراكك خلال 24 ساعة. جدّد الآن لتجنّب انقطاع الخدمة!",
    },
  ] as const;

  for (const w of windows) {
    const fromAt = new Date(now.getTime() + w.fromMs).toISOString();
    const toAt   = new Date(now.getTime() + w.toMs).toISOString();

    // جلب الاشتراكات النشطة التي تقع نافذة انتهائها في المدى المطلوب
    const { data: subs, error } = await supabase
      .from("subscriptions")
      .select("id, user_id, expires_at")
      .eq("status", "active")
      .eq(w.field, false)
      .gte("expires_at", fromAt)
      .lte("expires_at", toAt);

    if (error) {
      console.error(`[${w.label}] query error:`, error.message);
      results.push({ window: w.label, processed: 0, sent: 0 });
      continue;
    }

    let sent = 0;
    for (const sub of (subs ?? [])) {
      try {
        // 1. تحديث الـ guard أولاً لمنع الإرسال المزدوج لو استُدعيت الـ function مرتين
        const { error: updateErr } = await supabase
          .from("subscriptions")
          .update({ [w.field]: true })
          .eq("id", sub.id)
          .eq(w.field, false); // optimistic lock: يتجاهل لو تغيّر بالفعل

        if (updateErr) {
          console.warn(`[${w.label}] skip ${sub.id}: guard update failed`, updateErr.message);
          continue;
        }

        // 2. إرسال الإشعار عبر send-push-notification الموجودة
        const notifRes = await fetch(
          `${supabaseUrl}/functions/v1/send-push-notification`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              user_id:    sub.user_id,
              title:      w.title,
              body:       w.body,
              type:       "subscription_expiry",
              priority:   "important",
              action_url: "/subscription-history",
              send_push:  true,
              dedup_key:  `expiry_${w.label}_${sub.id}`,
            }),
          }
        );

        if (!notifRes.ok) {
          const txt = await notifRes.text();
          console.warn(`[${w.label}] push failed for ${sub.user_id}:`, txt);
        } else {
          sent++;
        }
      } catch (e) {
        console.error(`[${w.label}] error for sub ${sub.id}:`, e);
      }
    }

    results.push({ window: w.label, processed: subs?.length ?? 0, sent });
  }

  return json({ success: true, results, at: now.toISOString() });
});
