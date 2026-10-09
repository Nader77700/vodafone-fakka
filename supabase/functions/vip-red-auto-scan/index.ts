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

function is14ptRaya7Balak(systemName: string | null | undefined): boolean {
  if (!systemName) return false;
  const s = systemName.toLowerCase();
  return (
    s.includes("14pt") ||
    s.includes("raya7balak") ||
    s.includes("raya7_balak") ||
    s.includes("14 قرش") ||
    s.includes("ريح بالك")
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let reqBody: Record<string, unknown> = {};
    if (req.method === "POST") {
      try {
        reqBody = await req.json();
      } catch {
        // empty body ok
      }
    }
    const targetPhone = typeof reqBody.phone === "string" ? reqBody.phone.trim() : null;
    const forceAll = reqBody.force_all === true || reqBody.all_monitoring === true;
    const filterUserId = typeof reqBody.user_id === "string" ? reqBody.user_id : null;
    const executionSource = typeof reqBody.execution_source === "string" 
      ? reqBody.execution_source 
      : (targetPhone ? "server_manual" : (forceAll ? "server_batch" : "server_cron"));

    // 1. جلب إعدادات القسم لتحديد دورية الفحص (الافتراضي 0.5 ساعة = 30 دقيقة)
    const { data: config } = await supabase
      .from("vip_red_config")
      .select("check_interval_hours, is_enabled_globally")
      .limit(1)
      .maybeSingle();

    const intervalHours = config?.check_interval_hours ? Number(config.check_interval_hours) : 0.5;
    const nowIso = new Date().toISOString();

    // 2. فحص الأرقام بنظام الدفعات الآمنة (Chunked Batch)
    let dueLines: any[] = [];
    if (targetPhone) {
      const { data, error } = await supabase
        .from("vip_red_monitored_lines")
        .select("*, merchant:vip_red_merchants(name, user_id)")
        .eq("phone_number", targetPhone)
        .limit(1);
      if (error) {
        console.error("[vip-red-auto-scan] Query targetPhone error:", error);
      }
      dueLines = data || [];
      if (dueLines.length > 0) {
        // وسم الخط فوراً بحالة جاري الفحص
        await supabase
          .from("vip_red_monitored_lines")
          .update({ is_scanning: true })
          .eq("id", dueLines[0].id);
      }
    } else if (forceAll) {
      // فحص جماعي لكافة خطوط المراقبة وغير المؤهلة بطلب مباشر من المستخدم أو الآدمن
      let q = supabase
        .from("vip_red_monitored_lines")
        .select("*, merchant:vip_red_merchants(name, user_id)")
        .in("system_status", ["monitoring", "ineligible"]);

      if (filterUserId) {
        q = q.eq("user_id", filterUserId);
      }

      const { data, error } = await q
        .order("last_checked_at", { ascending: true, nullsFirst: true })
        .limit(50);

      if (error) {
        console.error("[vip-red-auto-scan] Query forceAll error:", error);
        return json({ error: error.message }, 200);
      }
      dueLines = data || [];

      // وسم كافة الخطوط المستهدفة بحالة جاري الفحص بالسيرفر
      if (dueLines.length > 0) {
        const ids = dueLines.map(l => l.id);
        await supabase
          .from("vip_red_monitored_lines")
          .update({ is_scanning: true })
          .in("id", ids);
      }
    } else {
      // الأولوية القصوى للأرقام الجديدة التي لم تفحص بعد (last_checked_at is null)
      // ثم الأرقام المستحقة لموعد فحصها
      const { data, error } = await supabase
        .from("vip_red_monitored_lines")
        .select("*, merchant:vip_red_merchants(name, user_id)")
        .in("system_status", ["monitoring", "ineligible"])
        .or(`next_check_at.is.null,next_check_at.lte.${nowIso}`)
        .order("last_checked_at", { ascending: true, nullsFirst: true })
        .order("next_check_at", { ascending: true, nullsFirst: true })
        .limit(10);

      if (error) {
        console.error("[vip-red-auto-scan] Query error:", error);
        return json({ error: error.message }, 200);
      }
      dueLines = data || [];
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

    // معالجة كل رقم داخل الدفعة بتسلسل مع فاصل زمني آمن
    for (let i = 0; i < dueLines.length; i++) {
      const line = dueLines[i];
      const startTime = Date.now();
      try {
        console.log(`[vip-red-auto-scan] Checking line ${i + 1}/${dueLines.length}: ${line.phone_number} (source: ${executionSource})`);

        // استعلام حالة الخط من خلال line-info-query مع الترويسات الداخلية الموثوقة
        const queryRes = await supabase.functions.invoke("line-info-query", {
          body: { phone: line.phone_number },
          headers: {
            "x-internal-key": "vfp_internal_push_2025",
            "Authorization": `Bearer ${serviceKey}`,
          },
        });

        const durationMs = Date.now() - startTime;

        if (queryRes.error || !queryRes.data?.success || !queryRes.data?.data) {
          const errDetail = queryRes.data?.message || queryRes.error?.message || "فشل الاستعلام من شبكة فودافون";
          console.warn(`[vip-red-auto-scan] Query failed for ${line.phone_number}:`, errDetail);
          
          // تسجيل في سجلات التشخيص بدقة
          await supabase.from("vip_red_scan_logs").insert({
            line_id: line.id,
            phone_number: line.phone_number,
            execution_source: executionSource,
            status: "failed",
            error_message: errDetail,
            duration_ms: durationMs,
          });

          // في حال فشل الاستعلام، نؤخر موعد الفحص القادم 15 دقيقة لتفادي التكرار المباشر لنفس الرقم
          const retryLater = new Date(Date.now() + 15 * 60 * 1000).toISOString();
          await supabase
            .from("vip_red_monitored_lines")
            .update({
              is_scanning: false,
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
        const is14pt = is14ptRaya7Balak(currentSystem);

        const updates: Record<string, unknown> = {
          is_scanning: false,
          current_system: currentSystem,
          last_line_info: lineData,
          last_checked_at: new Date().toISOString(),
          check_count: (line.check_count || 0) + 1,
          updated_at: new Date().toISOString(),
        };

        let scanStatus = "success";
        if (converted) {
          scanStatus = "converted";
          updates.system_status = "converted";
          updates.converted_at = new Date().toISOString();
          updates.next_check_at = null; // إيقاف المراقبة فور التحويل
        } else if (is14pt) {
          scanStatus = "success";
          updates.system_status = "monitoring";
          updates.next_check_at = new Date(Date.now() + intervalHours * 3600 * 1000).toISOString();
        } else {
          scanStatus = "ineligible";
          updates.system_status = "ineligible";
          updates.next_check_at = new Date(Date.now() + intervalHours * 3600 * 1000).toISOString();
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

        // تسجيل في سجلات التشخيص
        await supabase.from("vip_red_scan_logs").insert({
          line_id: line.id,
          phone_number: line.phone_number,
          execution_source: executionSource,
          status: scanStatus,
          system_detected: currentSystem,
          duration_ms: durationMs,
        });

        checked++;

        // إذا تم التحويل بنجاح، إرسال إشعار للمالك والتاجر في الخلفية
        if (converted && line.system_status !== "converted") {
          convertedNow++;
          convertedPhones.push(line.phone_number);
          const notifTitle = `🎉 تم تحويل الرقم ${line.phone_number} بنجاح لريد!`;
          const notifBody = `تم تحويل الرقم (${line.phone_number}) بنجاح إلى نظام فودافون ريد بيزنس (${currentSystem || "Enterprise member control"}) وهو جاهز للتفعيل وسداد الدورة الآن.`;

          // 1. تحديد جميع المستخدمين المعنيين (المالك، المطالب، التاجر، والمشرفين/الآدمن)
          const targetRecipients = new Set<string>();
          if (line.user_id) targetRecipients.add(line.user_id);
          if (line.claimed_by_user_id) targetRecipients.add(line.claimed_by_user_id);
          const merchantUserId = line.merchant?.user_id;
          if (merchantUserId) targetRecipients.add(merchantUserId);

          // التأكد من وصول الإشعار دائماً لحسابات المشرفين والمدير العام
          try {
            const { data: adminProfiles } = await supabase
              .from("profiles")
              .select("id")
              .in("role", ["admin", "super_admin"]);
            for (const adm of adminProfiles ?? []) {
              if (adm.id) targetRecipients.add(adm.id);
            }
          } catch (admErr) {
            console.warn("[vip-red-auto-scan] Failed fetching admins for notif:", admErr);
          }

          // 2. إرسال الإشعار والتنبيه الفوري لكل المستهدفين
          for (const recipientId of targetRecipients) {
            try {
              // إرسال FCM Push Notification للشاشة وستارة الهاتف وحفظ الإشعار تلقائياً
              const pushRes = await supabase.functions.invoke("send-push-notification", {
                body: {
                  user_id: recipientId,
                  title: notifTitle,
                  body: notifBody,
                  type: "vip_red",
                  priority: "urgent",
                  action_url: "/vip-red",
                  send_push: true,
                  skip_duplicate_check: true,
                },
                headers: {
                  "x-internal-key": "vfp_internal_push_2025",
                  "Authorization": `Bearer ${serviceKey}`,
                },
              });

              if (pushRes.error) {
                console.warn(`[vip-red-auto-scan] Push invoke error for ${recipientId}:`, pushRes.error);
                // احتياطي: حفظ الإشعار في جدول notifications مباشرة
                await supabase.from("notifications").insert({
                  user_id: recipientId,
                  title: notifTitle,
                  body: notifBody,
                  type: "vip_red",
                  priority: "urgent",
                  action_url: "/vip-red",
                  is_read: false,
                  is_global: false,
                });
              }
            } catch (notifErr) {
              console.warn(`[vip-red-auto-scan] Notification failed for ${recipientId}:`, notifErr);
            }
          }
        }

        // فاصل زمني آمن وتدريجي بين الأرقام داخل الدفعة (2000 مللي ثانية) لتفادي الحظر
        if (i < dueLines.length - 1) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch (lineErr) {
        console.error(`[vip-red-auto-scan] Error processing ${line.phone_number}:`, lineErr);
        await supabase
          .from("vip_red_monitored_lines")
          .update({ is_scanning: false })
          .eq("id", line.id);
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
