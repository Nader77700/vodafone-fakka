// Edge Function: manage-subscriptions-pause
// POST { action: "pause" | "resume" }
// تعليق كل الاشتراكات النشطة أو استئنافها من حيث كانت
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-key",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // حماية: service role أو internal key
  const authHeader = req.headers.get("authorization") ?? "";
  const internalKey = req.headers.get("x-internal-key") ?? "";
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const intKey      = Deno.env.get("INTERNAL_PUSH_KEY") ?? "vfp_internal_push_2025";

  const isServiceRole = authHeader === `Bearer ${serviceKey}`;
  const isInternal    = internalKey === intKey;
  if (!isServiceRole && !isInternal) {
    return json({ error: "غير مصرح" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceKey
  );

  const body  = await req.json().catch(() => ({}));
  const action: "pause" | "resume" = body.action ?? "pause";
  const now   = new Date().toISOString();

  if (action === "pause") {
    // ── تعليق: نحفظ snapshot ونضع status = 'suspended' ──────────────
    // جلب كل الاشتراكات النشطة أو في grace غير معلّقة
    const { data: subs, error: fetchErr } = await supabase
      .from("subscriptions")
      .select("id, status, expires_at, days_remaining, ops_remaining")
      .in("status", ["active", "grace_period"])
      .eq("is_paused", false);

    if (fetchErr) return json({ error: fetchErr.message }, 500);
    if (!subs || subs.length === 0) return json({ message: "لا توجد اشتراكات نشطة لتعليقها", paused: 0 });

    // تحديث على دفعات
    const BATCH = 200;
    let totalPaused = 0;
    for (let i = 0; i < subs.length; i += BATCH) {
      const batch = subs.slice(i, i + BATCH);
      const ids   = batch.map((s: { id: string }) => s.id);

      // نحدّث كل اشتراك بـ snapshot خاص به
      const updates = batch.map((s: {
        id: string; status: string; expires_at: string | null;
        days_remaining: number | null; ops_remaining: number | null;
      }) => ({
        id: s.id,
        is_paused:          true,
        paused_at:          now,
        paused_status:      s.status,
        paused_expires_at:  s.expires_at,
        paused_days_rem:    s.days_remaining,
        paused_ops_rem:     s.ops_remaining,
        status:             "suspended",
        suspended_at:       now,
        suspend_reason:     "إيقاف التطبيق مؤقتاً من قِبَل المشرف",
        updated_at:         now,
      }));

      const { error: upErr } = await supabase
        .from("subscriptions")
        .upsert(updates, { onConflict: "id" });

      if (upErr) return json({ error: upErr.message, paused_so_far: totalPaused }, 500);
      totalPaused += batch.length;
    }

    return json({
      success: true,
      action: "pause",
      paused: totalPaused,
      paused_at: now,
      message: `✅ تم تعليق ${totalPaused} اشتراك — يمكنك استئنافها لاحقاً`,
    });

  } else if (action === "resume") {
    // ── استئناف: نرجع الـ snapshot ونحسب expires_at جديد ─────────────
    const { data: paused, error: fetchErr } = await supabase
      .from("subscriptions")
      .select("id, paused_status, paused_expires_at, paused_days_rem, paused_ops_rem, paused_at")
      .eq("is_paused", true)
      .eq("status", "suspended");

    if (fetchErr) return json({ error: fetchErr.message }, 500);
    if (!paused || paused.length === 0) return json({ message: "لا توجد اشتراكات معلّقة لاستئنافها", resumed: 0 });

    const BATCH = 200;
    let totalResumed = 0;
    const nowMs = Date.now();

    for (let i = 0; i < paused.length; i += BATCH) {
      const batch = paused.slice(i, i + BATCH);

      const updates = batch.map((s: {
        id: string;
        paused_status: string | null;
        paused_expires_at: string | null;
        paused_days_rem: number | null;
        paused_ops_rem: number | null;
        paused_at: string | null;
      }) => {
        // نحسب expires_at جديد = الأيام المتبقية من الآن
        let newExpiresAt: string | null = null;
        if (s.paused_days_rem != null && s.paused_days_rem > 0) {
          const newExpiry = new Date(nowMs + s.paused_days_rem * 24 * 60 * 60 * 1000);
          newExpiresAt = newExpiry.toISOString();
        } else if (s.paused_expires_at) {
          // إذا لم تكن الأيام محفوظة نرجع القيمة القديمة كما هي
          newExpiresAt = s.paused_expires_at;
        }

        return {
          id:              s.id,
          is_paused:       false,
          status:          s.paused_status ?? "active",
          expires_at:      newExpiresAt,
          days_remaining:  s.paused_days_rem,
          ops_remaining:   s.paused_ops_rem,
          suspended_at:    null,
          suspend_reason:  null,
          // نمسح الـ snapshot بعد الاستئناف
          paused_at:       null,
          paused_status:   null,
          paused_expires_at: null,
          paused_days_rem: null,
          paused_ops_rem:  null,
          updated_at:      now,
        };
      });

      const { error: upErr } = await supabase
        .from("subscriptions")
        .upsert(updates, { onConflict: "id" });

      if (upErr) return json({ error: upErr.message, resumed_so_far: totalResumed }, 500);
      totalResumed += batch.length;
    }

    return json({
      success: true,
      action: "resume",
      resumed: totalResumed,
      resumed_at: now,
      message: `✅ تم استئناف ${totalResumed} اشتراك من حيث توقف`,
    });

  } else {
    return json({ error: "action غير صحيح — استخدم pause أو resume" }, 400);
  }
});
