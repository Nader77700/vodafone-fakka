// Edge Function: whatsapp-automation-scheduler
// محرك الجدولة والأتمتة من جهة الخادم لرسائل WhatsApp وتذكيرات باقات فودافون RED والفواتير
// يدعم وضع التشغيل التجريبي الآمن (Dry-Run)، والقفل الذري (Atomic Claim)، ومنع التكرار التام
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

function sanitizePhone(phone: string): string {
  let clean = phone.replace(/[^0-9]/g, "");
  if (clean.startsWith("01") && clean.length === 11) {
    clean = "20" + clean.substring(1);
  } else if (clean.startsWith("1") && clean.length === 10) {
    clean = "20" + clean;
  }
  return clean;
}

// حساب أقرب موعد تجديد في المستقبل القريب انطلاقاً من اليوم بتوقيت القاهرة
function getNextRenewalDateForDay(activationDay: number, cairoDate: Date): { renewalDate: Date; daysDiff: number } {
  const currentDay = cairoDate.getDate();
  const currentMonth = cairoDate.getMonth();
  const currentYear = cairoDate.getFullYear();

  let targetDate: Date;
  if (currentDay <= activationDay) {
    targetDate = new Date(currentYear, currentMonth, activationDay);
  } else {
    targetDate = new Date(currentYear, currentMonth + 1, activationDay);
  }

  // حساب الفرق بالأيام الكاملة
  const msPerDay = 24 * 60 * 60 * 1000;
  const utcToday = Date.UTC(cairoDate.getFullYear(), cairoDate.getMonth(), cairoDate.getDate());
  const utcTarget = Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const daysDiff = Math.round((utcTarget - utcToday) / msPerDay);

  return { renewalDate: targetDate, daysDiff };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 1. Authorization check
    const authHeader = req.headers.get("Authorization");
    const internalKey = req.headers.get("x-internal-key");
    const isInternal = internalKey === "vfp_internal_push_2025" || (authHeader && authHeader.replace("Bearer ", "") === supabaseServiceKey);

    if (!isInternal) {
      if (!authHeader) {
        return json({ success: false, error: "Missing authorization header" }, 401);
      }
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) {
        return json({ success: false, error: "Invalid session token" }, 401);
      }
      const { data: profile } = await supabase
        .from("core_profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.role !== "admin" && profile?.role !== "super_admin") {
        return json({ success: false, error: "Unauthorized: Admin access required" }, 403);
      }
    }

    // 2. Determine Dry-Run mode
    const url = new URL(req.url);
    let isDryRun = url.searchParams.get("dry_run") === "true";
    let executionSource = url.searchParams.get("source") || "manual_admin";

    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.dry_run === true) isDryRun = true;
        if (body.source) executionSource = body.source;
      } catch {
        // empty body ok
      }
    }

    // 3. Fetch Automation Rules
    const { data: rules, error: rulesErr } = await supabase
      .from("whatsapp_automation_rules")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    if (rulesErr || !rules) {
      return json({ success: false, error: "فشل تحميل إعدادات وقواعد أتمتة الواتساب" }, 500);
    }

    // Global Pause check
    if (rules.is_global_paused) {
      if (!isDryRun) {
        await supabase
          .from("whatsapp_automation_rules")
          .update({
            last_scheduler_run_at: new Date().toISOString(),
            last_scheduler_status: "paused",
            last_scheduler_metrics: { note: "Global pause active, no messages queued or sent" },
          })
          .eq("id", "default");
      }
      return json({
        success: true,
        dry_run: isDryRun,
        global_paused: true,
        message: "الأتمتة متوقفة مؤقتاً على مستوى النظام بالكامل (Global Emergency Pause)",
        evaluated_candidates: 0,
        queued: 0,
        sent: 0,
        skipped: 0,
      });
    }

    // 4. Calculate Cairo Time
    const nowUtc = new Date();
    // Parse Cairo components
    const cairoDateStr = nowUtc.toLocaleString("en-US", { timeZone: rules.timezone || "Africa/Cairo" });
    const cairoDate = new Date(cairoDateStr);

    // 5. Fetch Monitored Lines
    const { data: lines, error: linesErr } = await supabase
      .from("vip_red_monitored_lines")
      .select("*, merchant:vip_red_merchants(name, phone)")
      .in("system_status", ["monitoring", "converted", "active"]);

    if (linesErr) {
      return json({ success: false, error: `فشل جلب خطوط فودافون ريد: ${linesErr.message}` }, 500);
    }

    // 6. Fetch Customer / Recipient Preferences
    const { data: preferences } = await supabase
      .from("whatsapp_customer_preferences")
      .select("*");

    const prefByLineId = new Map<string, any>();
    const prefByPhone = new Map<string, any>();
    for (const p of preferences || []) {
      if (p.entity_id) prefByLineId.set(p.entity_id, p);
      if (p.line_phone_number) prefByPhone.set(p.line_phone_number, p);
    }

    const leadDays = rules.lead_days_before_renewal || 2;
    const supportedDays = Array.isArray(rules.supported_activation_days) ? rules.supported_activation_days : [7, 11, 25];
    const templatesMapping = rules.templates_mapping || {};

    // 7. Evaluate Candidates
    interface Candidate {
      line_id: string;
      phone_number: string;
      customer_name: string;
      recipient_phone: string;
      event_category: string;
      source_event_id: string;
      template_name: string;
      template_language: string;
      template_parameters: Record<string, any>;
      eligible: boolean;
      skip_reason?: string;
      renewal_date_str: string;
      days_diff: number;
      activation_day: number;
      payment_status: string;
      package_price: number;
    }

    const candidates: Candidate[] = [];

    for (const line of lines || []) {
      const actDay = line.activation_day;
      if (!actDay || !supportedDays.includes(Number(actDay))) {
        continue;
      }

      const { renewalDate, daysDiff } = getNextRenewalDateForDay(Number(actDay), cairoDate);
      const renewalDateStr = renewalDate.toLocaleDateString("en-CA"); // YYYY-MM-DD
      const customerName = line.customer_name || line.merchant?.name || "عميل فودافون ريد";

      // Match preference
      const pref = prefByLineId.get(line.id) || prefByPhone.get(line.phone_number);

      // Determine recipient phone
      let rawRecipient = pref?.whatsapp_recipient || line.merchant?.phone || line.phone_number;
      let recipientPhone = sanitizePhone(rawRecipient);
      let isValidRecipient = recipientPhone.length >= 10 && recipientPhone.startsWith("20");

      // Shared eligibility checks
      const isCustomerPaused = pref?.is_paused === true || pref?.is_enabled === false;
      // Strict consent requirement: Only send if consent is explicitly recorded and verified
      const hasConsent = pref ? pref.consent_status === "consented" : false;

      // A. Candidate: Renewal Lead Reminder (e.g. 2 days before)
      if (daysDiff === leadDays && rules.renewal_reminder_enabled) {
        const eventCat = "renewal_lead";
        const templateName = templatesMapping.renewal_lead?.template_name || "red_renewal_lead_reminder";
        const sourceEventId = `renew_lead_${line.id}_${renewalDateStr}_lead${leadDays}`;

        let eligible = true;
        let skipReason: string | undefined;

        if (isCustomerPaused) {
          eligible = false;
          skipReason = "customer_paused";
        } else if (pref && pref.allow_renewal_reminders === false) {
          eligible = false;
          skipReason = "category_disabled_by_customer";
        } else if (!hasConsent) {
          eligible = false;
          skipReason = pref ? "missing_customer_consent" : "consent_not_recorded_pending_verification";
        } else if (!isValidRecipient) {
          eligible = false;
          skipReason = "invalid_recipient_phone";
        }

        candidates.push({
          line_id: line.id,
          phone_number: line.phone_number,
          customer_name: customerName,
          recipient_phone: recipientPhone,
          event_category: eventCat,
          source_event_id: sourceEventId,
          template_name: templateName,
          template_language: "ar",
          template_parameters: {
            customer_name: customerName,
            phone_number: line.phone_number,
            activation_day: actDay,
            renewal_date: renewalDateStr,
            package_tier: line.package_tier || "VIP RED",
            price: line.package_price || 0,
          },
          eligible,
          skip_reason: skipReason,
          renewal_date_str: renewalDateStr,
          days_diff: daysDiff,
          activation_day: actDay,
          payment_status: line.payment_status || "unpaid",
          package_price: line.package_price || 0,
        });
      }

      // B. Candidate: Renewal Same-Day Reminder
      if (daysDiff === 0 && rules.renewal_same_day_enabled) {
        const eventCat = "renewal_same_day";
        const templateName = templatesMapping.renewal_same_day?.template_name || "red_renewal_due_today";
        const sourceEventId = `renew_sameday_${line.id}_${renewalDateStr}`;

        let eligible = true;
        let skipReason: string | undefined;

        if (isCustomerPaused) {
          eligible = false;
          skipReason = "customer_paused";
        } else if (pref && pref.allow_renewal_reminders === false) {
          eligible = false;
          skipReason = "category_disabled_by_customer";
        } else if (!hasConsent) {
          eligible = false;
          skipReason = pref ? "missing_customer_consent" : "consent_not_recorded_pending_verification";
        } else if (!isValidRecipient) {
          eligible = false;
          skipReason = "invalid_recipient_phone";
        }

        candidates.push({
          line_id: line.id,
          phone_number: line.phone_number,
          customer_name: customerName,
          recipient_phone: recipientPhone,
          event_category: eventCat,
          source_event_id: sourceEventId,
          template_name: templateName,
          template_language: "ar",
          template_parameters: {
            customer_name: customerName,
            phone_number: line.phone_number,
            activation_day: actDay,
            renewal_date: renewalDateStr,
            package_tier: line.package_tier || "VIP RED",
            price: line.package_price || 0,
          },
          eligible,
          skip_reason: skipReason,
          renewal_date_str: renewalDateStr,
          days_diff: daysDiff,
          activation_day: actDay,
          payment_status: line.payment_status || "unpaid",
          package_price: line.package_price || 0,
        });
      }

      // C. Candidate: Invoice Due Alert (unpaid line on or after renewal date)
      if (daysDiff <= 0 && line.payment_status !== "paid" && rules.invoice_due_reminder_enabled) {
        const eventCat = "invoice_due";
        const templateName = templatesMapping.invoice_due?.template_name || "red_invoice_due_alert";
        const sourceEventId = `inv_due_${line.id}_${renewalDateStr}`;

        let eligible = true;
        let skipReason: string | undefined;

        if (isCustomerPaused) {
          eligible = false;
          skipReason = "customer_paused";
        } else if (pref && pref.allow_invoice_reminders === false) {
          eligible = false;
          skipReason = "category_disabled_by_customer";
        } else if (!hasConsent) {
          eligible = false;
          skipReason = pref ? "missing_customer_consent" : "consent_not_recorded_pending_verification";
        } else if (!isValidRecipient) {
          eligible = false;
          skipReason = "invalid_recipient_phone";
        }

        candidates.push({
          line_id: line.id,
          phone_number: line.phone_number,
          customer_name: customerName,
          recipient_phone: recipientPhone,
          event_category: eventCat,
          source_event_id: sourceEventId,
          template_name: templateName,
          template_language: "ar",
          template_parameters: {
            customer_name: customerName,
            phone_number: line.phone_number,
            amount: line.package_price || line.renewal_amount || 0,
            due_date: renewalDateStr,
          },
          eligible,
          skip_reason: skipReason,
          renewal_date_str: renewalDateStr,
          days_diff: daysDiff,
          activation_day: actDay,
          payment_status: line.payment_status || "unpaid",
          package_price: line.package_price || 0,
        });
      }
    }

    // 8. If Dry-Run, return preview immediately without writing DB or sending
    if (isDryRun) {
      return json({
        success: true,
        dry_run: true,
        message: "تم تنفيذ المحاكاة والتشغيل التجريبي بنجاح (بدون إرسال رسائل حقيقية)",
        cairo_date: cairoDateStr,
        evaluated_candidates_count: candidates.length,
        eligible_count: candidates.filter((c) => c.eligible).length,
        skipped_count: candidates.filter((c) => !c.eligible).length,
        candidates: candidates.map((c) => ({
          line_id: c.line_id,
          phone_number: c.phone_number,
          customer_name: c.customer_name,
          recipient_phone: c.recipient_phone.substring(0, 4) + "****" + c.recipient_phone.slice(-3),
          event_category: c.event_category,
          source_event_id: c.source_event_id,
          template_name: c.template_name,
          eligible: c.eligible,
          skip_reason: c.skip_reason || "جاهز للجدولة",
          renewal_date: c.renewal_date_str,
          days_until_renewal: c.days_diff,
          payment_status: c.payment_status,
        })),
      });
    }

    // 9. Real Execution: Insert eligible candidates into queue with ON CONFLICT DO NOTHING
    let newlyQueued = 0;
    for (const cand of candidates) {
      if (cand.eligible) {
        const { error: insErr } = await supabase
          .from("whatsapp_automation_queue")
          .insert({
            event_category: cand.event_category,
            source_event_id: cand.source_event_id,
            line_id: cand.line_id,
            customer_name: cand.customer_name,
            recipient_phone: cand.recipient_phone,
            template_name: cand.template_name,
            template_language: cand.template_language,
            template_parameters: cand.template_parameters,
            status: "pending",
          });

        if (!insErr) {
          newlyQueued++;
        }
      }
    }

    // 10. Atomic Claim via RPC whatsapp_claim_queue_jobs
    const workerId = `scheduler_${Date.now()}`;
    const rateLimit = rules.rate_limit_per_minute || 15;

    const { data: claimedJobs, error: claimErr } = await supabase
      .rpc("whatsapp_claim_queue_jobs", {
        p_worker_id: workerId,
        p_limit: rateLimit,
      });

    if (claimErr) {
      console.error("[whatsapp-automation-scheduler] Claim jobs error:", claimErr);
    }

    let sentCount = 0;
    let failedCount = 0;
    let skippedJobsCount = 0;

    // 11. Process Claimed Jobs through whatsapp-send-message
    for (const job of claimedJobs || []) {
      try {
        // Double check if invoice became paid before sending invoice reminder
        if (job.event_category.startsWith("invoice_")) {
          const { data: currentLine } = await supabase
            .from("vip_red_monitored_lines")
            .select("payment_status")
            .eq("id", job.line_id)
            .maybeSingle();

          if (currentLine?.payment_status === "paid") {
            await supabase
              .from("whatsapp_automation_queue")
              .update({
                status: "skipped",
                skip_reason: "invoice_already_paid",
                updated_at: new Date().toISOString(),
              })
              .eq("id", job.id);

            skippedJobsCount++;
            continue;
          }
        }

        // Format template variables array
        const params = job.template_parameters || {};
        const templateVariables = [
          params.customer_name || "العميل المحترم",
          params.phone_number || "",
          params.renewal_date || params.due_date || "",
          params.price ? `${params.price} ج.م` : "",
        ].filter(Boolean);

        // Invoke sender function with internal key
        const sendRes = await supabase.functions.invoke("whatsapp-send-message", {
          body: {
            recipient_phone: job.recipient_phone,
            message_type: "template",
            template_name: job.template_name,
            template_language: job.template_language || "ar",
            template_variables: templateVariables,
            source: `automation_${job.event_category}`,
          },
          headers: {
            "x-internal-key": "vfp_internal_push_2025",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
        });

        if (sendRes.data?.success) {
          await supabase
            .from("whatsapp_automation_queue")
            .update({
              status: "completed",
              whatsapp_message_id: sendRes.data.message_id || null,
              wamid: sendRes.data.wamid || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);
          sentCount++;
        } else {
          const errMsg = sendRes.data?.error || sendRes.error?.message || "فشل غير محدد من Meta API";
          const isMaxAttempts = (job.attempts || 1) >= (job.max_attempts || 3);

          await supabase
            .from("whatsapp_automation_queue")
            .update({
              status: isMaxAttempts ? "failed" : "pending",
              last_error: errMsg,
              scheduled_for: isMaxAttempts
                ? job.scheduled_for
                : new Date(Date.now() + (rules.retry_backoff_minutes || 30) * 60000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);
          failedCount++;
        }
      } catch (procErr: any) {
        console.error(`[whatsapp-automation-scheduler] Job ${job.id} processing error:`, procErr);
        await supabase
          .from("whatsapp_automation_queue")
          .update({
            status: "failed",
            last_error: procErr?.message || "Exception during job dispatch",
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        failedCount++;
      }
    }

    // 12. Update Rules status and metrics
    const metrics = {
      evaluated_candidates: candidates.length,
      newly_queued: newlyQueued,
      claimed: (claimedJobs || []).length,
      sent: sentCount,
      failed: failedCount,
      skipped: skippedJobsCount,
      source: executionSource,
      cairo_time: cairoDateStr,
    };

    await supabase
      .from("whatsapp_automation_rules")
      .update({
        last_scheduler_run_at: new Date().toISOString(),
        last_scheduler_status: "success",
        last_scheduler_metrics: metrics,
      })
      .eq("id", "default");

    return json({
      success: true,
      dry_run: false,
      message: "تم تشغيل الجدولة ومعالجة قائمة الانتظار بنجاح",
      metrics,
    });
  } catch (err: any) {
    console.error("[whatsapp-automation-scheduler] Fatal error:", err);
    return json({ success: false, error: err?.message || "خطأ غير متوقع في محرك الجدولة" }, 500);
  }
});
