// Edge Function: subscription-expiry-notifier
// تُشغَّل يومياً — ترسل إشعار تحذير 3 أيام قبل انتهاء الاشتراك
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase    = createClient(supabaseUrl, serviceKey);

    const now      = new Date();
    // نافذة البحث: الاشتراكات التي تنتهي خلال 24 ساعة من الآن + 3 أيام
    // أي expires_at بين [now+2d, now+3d] — إشعار يُرسل مرة واحدة بين 2-3 أيام قبل الانتهاء
    const windowStart = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const windowEnd   = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const todayStart  = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd    = new Date(now); todayEnd.setHours(23, 59, 59, 999);

    // جلب الاشتراكات النشطة التي تنتهي في النافذة المحددة
    const { data: expiringSubs, error: subsErr } = await supabase
      .from("subscriptions")
      .select("id, user_id, expires_at")
      .eq("status", "active")
      .gte("expires_at", windowStart)
      .lte("expires_at", windowEnd);

    if (subsErr) {
      console.error("[expiry-notifier] Error fetching subscriptions:", subsErr);
      return json({ error: subsErr.message }, 500);
    }

    if (!expiringSubs || expiringSubs.length === 0) {
      return json({ message: "لا توجد اشتراكات منتهية قريباً", sent: 0 });
    }

    let sent = 0;
    let skipped = 0;

    for (const sub of expiringSubs) {
      // تحقق من عدم إرسال إشعار مماثل اليوم لهذا المستخدم
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", sub.user_id)
        .eq("type", "subscription_renewal")
        .ilike("title", "%ينتهي اشتراكك%")
        .gte("created_at", todayStart.toISOString())
        .lte("created_at", todayEnd.toISOString())
        .maybeSingle();

      if (existing) {
        skipped++;
        continue; // تم إرسال إشعار اليوم مسبقاً
      }

      const expiryDate = new Date(sub.expires_at);
      const daysLeft   = Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000);

      const { error: notifErr } = await supabase.from("notifications").insert({
        user_id:   sub.user_id,
        title:     `⚠️ ينتهي اشتراكك خلال ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'}`,
        body:      `اشتراكك سينتهي في ${expiryDate.toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}. جدّد الآن لتجنب الانقطاع.`,
        type:      "subscription_renewal",
        is_read:   false,
        is_global: false,
      });

      if (notifErr) {
        console.error(`[expiry-notifier] Failed to notify user ${sub.user_id}:`, notifErr);
      } else {
        sent++;
      }
    }

    console.log(`[expiry-notifier] Done — sent: ${sent}, skipped: ${skipped}`);
    return json({ message: "اكتمل الإشعار التلقائي", sent, skipped });
  } catch (err) {
    console.error("[expiry-notifier] Unexpected error:", err);
    return json({ error: String(err) }, 500);
  }
});
