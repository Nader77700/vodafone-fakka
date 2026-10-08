// Edge Function: vip-red-auto-scan
// فحص دوري تلقائي لخطوط فودافون ريد المستحقة في الخلفية على مستوى السيرفر
// يعمل بشكل مستقل تماماً عبر pg_cron بدون الحاجة لفتح المتصفح أو التطبيق
// يعتمد نظام الدفعات المقسمة (Chunked Batch Throttling) لتجنب الضغط أو الحظر
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

function isConvertedToRed(systemName: string | null | undefined): boolean {
  if (!systemName) return false;
  const s = systemName.toLowerCase();
  return (
    s.includes("enterprise member control") ||
    s.includes("enterprise") ||
    s.includes("red_") ||
    s.includes("red ") ||
    s === "red" ||
    systemName.includes("ريد") ||
    systemName.includes("RED")
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // 1. جلب إعدادات القسم لتحديد دورية الفحص (الافتراضي 4 ساعات)
    const { data: config } = await supabase
      .from("vip_red_config")
      .select("check_interval_hours, is_enabled_globally")
      .limit(1)
      .maybeSingle();

    const intervalHours = config?.check_interval_hours || 4;
    const nowIso = new Date().toISOString();

    // 2. فحص الأرقام بنظام الدفعات الصغيرة الآمنة (Chunked Batch)
    // نأخذ دفعة بحد أقصى 5 أرقام مستحقة في كل دورة cron لتجنب الضغط أو الحظر
    const CHUNK_SIZE = 5;
    const { data: dueLines, error: linesErr } = await supabase
      .from("vip_red_monitored_lines")
      .select("*, merchant:vip_red_merchants(name, user_id)")
      .eq("system_status", "monitoring")
      .or(`next_check_at.is.null,next_check_at.lte.${nowIso}`)
      .order("next_check_at", { ascending: true, nullsFirst: true })
      .limit(CHUNK_SIZE);

    if (linesErr) {
      console.error("[vip-red-auto-scan] Query error:", linesErr);
      return json({ error: linesErr.message }, 200);
    }

    if (!dueLines || dueLines.length === 0) {
      return json({
        message: "لا توجد أرقام مستحقة للفحص حالياً في هذه الدفعة",
        checked: 0,
        convertedNow: 0,
        timestamp: new Date().toISOString(),
      });
    }

    let checked = 0;
    let convertedNow = 0;
    let errors = 0;
    const convertedPhones: string[] = [];

    // معالجة كل رقم داخل الدفعة بتسلسل مع فاصل زمني آمن (2.5 ثانية بين كل رقم)
    for (let i = 0; i < dueLines.length; i++) {
      const line = dueLines[i];
      try {
        console.log(`[vip-red-auto-scan] Checking chunk item ${i + 1}/${dueLines.length}: ${line.phone_number}`);

        // استعلام حالة الخط من خلال line-info-query
        const queryRes = await supabase.functions.invoke("line-info-query", {
          body: { phone: line.phone_number },
        });

        if (queryRes.error || !queryRes.data?.success || !queryRes.data?.data) {
          console.warn(`[vip-red-auto-scan] Query failed for ${line.phone_number}:`, queryRes.error || queryRes.data);
          // في حال فشل الاستعلام، نؤخر موعد الفحص القادم 15 دقيقة لتفادي التكرار المباشر لنفس الرقم
          const retryLater = new Date(Date.now() + 15 * 60 * 1000).toISOString();
          await supabase
            .from("vip_red_monitored_lines")
            .update({
              next_check_at: retryLater,
              updated_at: new Date().toISOString(),
            })
            .eq("id", line.id);

          errors++;
          continue;
        }

        const lineData = queryRes.data.data;
        const currentSystem = lineData.system || null;
        const converted = isConvertedToRed(currentSystem);

        const updates: Record<string, unknown> = {
          current_system: currentSystem,
          last_line_info: lineData,
          last_checked_at: new Date().toISOString(),
          check_count: (line.check_count || 0) + 1,
          updated_at: new Date().toISOString(),
        };

        if (converted) {
          updates.system_status = "converted";
          updates.converted_at = new Date().toISOString();
          updates.next_check_at = null; // إيقاف المراقبة فور التحويل
        } else {
          // تجديد دورة الفحص القادمة (حسب الإعدادات مثلاً 4 ساعات)
          const nextCheck = new Date(Date.now() + intervalHours * 3600 * 1000).toISOString();
          updates.next_check_at = nextCheck;
        }

        const { error: updateErr } = await supabase
          .from("vip_red_monitored_lines")
          .update(updates)
          .eq("id", line.id);

        if (updateErr) {
          console.error(`[vip-red-auto-scan] Update error for ${line.phone_number}:`, updateErr);
          errors++;
          continue;
        }

        checked++;

        // إذا تم التحويل بنجاح، إرسال إشعار للمالك والتاجر في الخلفية
        if (converted && line.system_status !== "converted") {
          convertedNow++;
          convertedPhones.push(line.phone_number);
          const notifTitle = `🎉 تم تحويل الرقم ${line.phone_number} بنجاح لريد!`;
          const notifBody = `تم تحويل الرقم (${line.phone_number}) بنجاح إلى نظام فودافون ريد بيزنس (${currentSystem || "Enterprise member control"}) وهو جاهز للتفعيل وسداد الدورة الآن.`;

          // 1. إشعار المالك في notifications والـ Push
          if (line.user_id) {
            await supabase.from("notifications").insert({
              user_id: line.user_id,
              title: notifTitle,
              body: notifBody,
              type: "vip_red",
              priority: "urgent",
              action_url: "/vip-red",
              is_read: false,
              is_global: false,
            });

            try {
              await supabase.functions.invoke("send-push-notification", {
                body: {
                  user_id: line.user_id,
                  title: notifTitle,
                  body: notifBody,
                  type: "vip_red",
                  priority: "urgent",
                  action_url: "/vip-red",
                  send_push: true,
                },
              });
            } catch (pushE) {
              console.warn("[vip-red-auto-scan] Push notification failed:", pushE);
            }
          }

          // 2. إشعار المستخدم المطالب (claimed_by_user_id) إذا كان مختلفاً
          if (line.claimed_by_user_id && line.claimed_by_user_id !== line.user_id) {
            await supabase.from("notifications").insert({
              user_id: line.claimed_by_user_id,
              title: notifTitle,
              body: notifBody,
              type: "vip_red",
              priority: "urgent",
              action_url: "/vip-red",
              is_read: false,
              is_global: false,
            });
          }

          // 3. إشعار التاجر المرتبط إذا كان لديه حساب مستخدم
          const merchantUserId = line.merchant?.user_id;
          if (merchantUserId && merchantUserId !== line.user_id && merchantUserId !== line.claimed_by_user_id) {
            await supabase.from("notifications").insert({
              user_id: merchantUserId,
              title: `🎉 تحويل رقم للتاجر: ${line.phone_number}`,
              body: `تم تحويل الرقم (${line.phone_number}) التابع لـ ${line.merchant?.name || "حسابك"} إلى فودافون ريد بيزنس!`,
              type: "vip_red",
              priority: "urgent",
              action_url: "/vip-red",
              is_read: false,
              is_global: false,
            });
          }
        }

        // فاصل زمني آمن وتدريجي بين الأرقام داخل الدفعة (2000 مللي ثانية) لتفادي الحظر
        if (i < dueLines.length - 1) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch (lineErr) {
        console.error(`[vip-red-auto-scan] Error processing ${line.phone_number}:`, lineErr);
        errors++;
      }
    }

    return json({
      success: true,
      message: `تم فحص دفعة من ${checked} أرقام بنجاح بتدرج آمن`,
      checked,
      convertedNow,
      convertedPhones,
      errors,
      batchSize: CHUNK_SIZE,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[vip-red-auto-scan] Fatal error:", err);
    return json({ error: String(err) }, 200);
  }
});
