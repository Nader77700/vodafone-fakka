// دالة Edge Function — تنفيذ طلبات فودافون فكة ومارد
// v3 — Server-side operation registration + Auto-retry 3999 + Offline-safe
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** تأخير بسيط */
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

import { zeroTrustCheck, CORS_HEADERS } from "../_shared/zero_trust.ts";

const DEVICE: Record<string, string> = {
  "User-Agent": "okhttp/4.12.0",
  "Connection": "Keep-Alive",
  "x-dynatrace": "MT_3_5_2386790616_1-0_a556db1b-4506-43f3-854a-1d2527767923_0_21317_157",
  "x-agent-operatingsystem": "13",
  "clientId": "AnaVodafoneAndroid",
  "Accept-Language": "ar",
  "x-agent-device": "LENOVO TB310XU",
  "x-agent-version": "2026.4.1",
  "x-agent-build": "1139",
  "digitalId": "25ZQ6VBSZPI1V",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

// fetch مع timeout بالثواني
async function fetchWithTimeout(url: string, opts: RequestInit, timeoutSec: number) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutSec * 1000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  // ── معرّفات التتبع — تُسجَّل في كل log ──
  const requestId     = crypto.randomUUID();
  const correlationId = req.headers.get("x-correlation-id") ?? requestId;
  const idempotencyKey = req.headers.get("x-idempotency-key") ?? null;
  const requestStartedAt = Date.now();

  // helper: log منظّم مع طبقة الخطأ
  const logStep = (step: string, status: "ok" | "fail" | "skip", detail: string, extra?: Record<string, unknown>) => {
    console.log(JSON.stringify({
      request_id: requestId, correlation_id: correlationId,
      idempotency_key: idempotencyKey,
      step, status, detail, latency_ms: Date.now() - requestStartedAt,
      ...extra,
    }));
  };

  try {
    const abortAndRefund = async (callerId: string, supabaseAdmin: any, payload: any, status = 400) => {
      await supabaseAdmin.rpc('atomic_refund_operation', { p_user_id: callerId });
      logStep("ops_refund", "ok", "refunded operation due to failure");
      return json(payload, status);
    };

    let opCallerId: string | null = null;
    let opsAdminClient: any = null;

    // ── Zero Trust Check (Layer 1-15) ──
    const zt = await zeroTrustCheck(req);
    if (zt.error) {
       logStep("zero_trust", "fail", zt.error);
       return json({ success: false, error: zt.error, error_code: "SECURITY_REJECT", layer: "EdgeFunction" }, zt.status);
    }
    const caller = zt.user!;
    const supabaseAdmin = zt.supabaseAdmin;
    opCallerId = caller.id;
    opsAdminClient = supabaseAdmin;
    const isAdmin = zt.isAdmin;
    const prof = zt.profile;

    logStep("auth", "ok", `user=${caller.id}`);

    // ── التحقق من الاشتراك وحالة القفل ──
    const { data: sub } = await supabaseAdmin
      .from("subscriptions").select("status, expires_at").eq("user_id", caller.id).maybeSingle();
    const hasActive = sub && sub.status === "active" && sub.expires_at && new Date(sub.expires_at) > new Date();

    if (!hasActive) {
      logStep("subscription", "fail", `sub status=${sub?.status ?? "none"}`);
      return json({ success: false, error: "اشتراكك منتهٍ — يرجى تجديد الاشتراك", layer: "Authorization" }, 403);
    }

    // ── فحص قفل Vodafone Cash (error 1118) — 24 ساعة ──
    if (prof?.vodafone_pin_locked_at) {
      const lockedAt = new Date(prof.vodafone_pin_locked_at).getTime();
      const hoursSinceLock = (Date.now() - lockedAt) / (1000 * 60 * 60);
      if (hoursSinceLock < 24) {
        const hoursLeft = Math.ceil(24 - hoursSinceLock);
        logStep("pin_lock_check", "fail", `locked ${hoursSinceLock.toFixed(1)}h ago, ${hoursLeft}h remaining`);
        return json({
          success: false,
          error: `🔒 حسابك مجمَّد مؤقتاً\nبسبب تكرار الرقم السري الخاطئ 3 مرات.\n\nالوقت المتبقي للفتح: ${hoursLeft} ساعة\nأو اتصل على 888 من خطك لإعادة التعيين`,
          error_code: "1118",
          layer: "Vodafone-AccountLocked",
          locked_until: new Date(lockedAt + 24 * 60 * 60 * 1000).toISOString(),
          hours_left: hoursLeft,
          request_id: requestId,
        }, 403);
      }
      // انتهت مدة القفل — ارفع القفل تلقائياً
      await supabaseAdmin.from("profiles").update({
        vodafone_pin_locked_at: null,
        vodafone_lock_reason: null,
      }).eq("id", caller.id);
      logStep("pin_lock_check", "ok", "lock expired automatically — cleared");
    }

    logStep("subscription", "ok", `status=${sub?.status ?? "admin"}`);

    // ── حماية السيرفر: خصم العملية فوراً لمنع التخطي ─────────────────────────────
    const { data: consumeData, error: consumeError } = await supabaseAdmin.rpc('atomic_consume_operation', { p_user_id: caller.id });
    if (consumeError || !consumeData || !consumeData.allowed) {
      logStep("subscription", "fail", "ops limit reached (server-side enforced)");
      return json({ success: false, error: "لقد استنفذت الحد الأقصى للعمليات في باقتك", layer: "Authorization" }, 403);
    }
    logStep("ops_consume", "ok", `used=${consumeData.ops_used}, remaining=${consumeData.ops_remaining}`);

    // ── جلب device_fp من الـ header (اختياري) ─────────────────────────────
    const deviceFp = req.headers.get("x-device-fp") ?? null;

    // ── فحص تقييد الشحن (تضارب الأجهزة) ─────────────────────────────────
    {
      const { data: activeThrottle } = await supabaseAdmin
        .from("charge_throttles")
        .select("id, expires_at, reason")
        .eq("user_id", caller.id)
        .eq("is_active", true)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (activeThrottle) {
        const minsLeft = Math.ceil(
          (new Date((activeThrottle as { expires_at: string }).expires_at).getTime() - Date.now()) / 60000
        );
        logStep("throttle_check", "fail", `user throttled, ${minsLeft}min left`);
        return json({
          success: false,
          error: `⛔ حسابك مقيَّد مؤقتاً لمدة ${minsLeft} دقيقة\nالسبب: ${(activeThrottle as { reason: string }).reason}\nسيتم رفع التقييد تلقائياً بعد انتهاء المدة.`,
          error_code: "CHARGE_THROTTLED",
          layer: "ConflictProtection",
          minutes_left: minsLeft,
        }, 429);
      }
    }

    // ── Idempotency Check — يمنع تنفيذ نفس العملية مرتين ──
    if (idempotencyKey) {
      const { data: existing } = await supabaseAdmin
        .from("operations")
        .select("id, status, created_at")
        .eq("user_id", caller.id)
        .filter("card_data->>idempotency_key", "eq", idempotencyKey)
        .maybeSingle();
      if (existing) {
        logStep("idempotency", "skip", `duplicate key=${idempotencyKey}, existing op=${existing.id}`);
        // إذا نجحت العملية السابقة → أعد نجاحها
        if (existing.status === "success") {
          return json({ success: true, message: "✅ العملية نُفِّذت مسبقاً بنجاح", idempotent: true });
        }
        // إذا فشلت → اسمح بإعادة المحاولة (لا ترفض)
      }
    }

    // ── قراءة البيانات ──
    let body: { product_id?: string; receiver?: string; pin?: string; sender?: string; seamless_token?: string | null; msisdn?: string | null; };
    try { body = await req.json(); } catch {
      logStep("parse_body", "fail", "invalid JSON");
      return await abortAndRefund(caller.id, supabaseAdmin, { success: false, error: "بيانات غير صالحة", layer: "Frontend" }, 400);
    }
    const { product_id, receiver, pin, sender, seamless_token, msisdn: payload_msisdn } = body;

    // ── LAYER 14 & 15: Validate product against Database ──
    const { data: productConfig } = await supabaseAdmin
      .from("product_config")
      .select("id, is_enabled, display_name, price")
      .eq("product_id", product_id)
      .single();

    if (productConfig && !productConfig.is_enabled) {
      logStep("product_validation", "fail", "product disabled by admin");
      return await abortAndRefund(caller.id, supabaseAdmin, { success: false, error: "تم إيقاف هذا المنتج مؤقتاً من قبل الإدارة" }, 400);
    }

    const appBuildStr = req.headers.get("x-app-build");
    const appBuild = appBuildStr ? parseInt(appBuildStr, 10) : 0;
    const legacyBlockedProducts = ['Fakka_2.5_Unite', 'Fakka_5_Unite', 'Fakka_6_NewUnite', 'Fakka_7_Unite', 'Fakka_9_Unite'];
    
    if (appBuild < 356 && legacyBlockedProducts.includes(product_id)) {
      logStep("product_validation", "fail", "legacy product blocked for old versions");
      return await abortAndRefund(caller.id, supabaseAdmin, { success: false, error: "تم إيقاف هذا المنتج للإصدارات القديمة. يرجى تحديث التطبيق إلى أحدث إصدار." }, 400);
    }

    // If !productConfig, we allow it to pass for backward compatibility since the DB table might not be fully seeded yet

    if (!product_id || !receiver || !pin) {
      logStep("validate", "fail", "missing fields");
      return await abortAndRefund(caller.id, supabaseAdmin, { success: false, error: "بيانات غير مكتملة — أدخل جميع الحقول المطلوبة", layer: "Frontend" }, 400);
    }
    if (!receiver.startsWith("01") || receiver.length !== 11) {
      return await abortAndRefund(caller.id, supabaseAdmin, { success: false, error: "رقم المستفيد غير صحيح — 11 رقم يبدأ بـ 01", layer: "Frontend" }, 400);
    }
    // تم إلغاء طلب الـ sender الإجباري لأن التطبيق يعتمد على التعرف التلقائي (Seamless)
    logStep("validate", "ok", `product=${product_id} receiver=${receiver}`);

    // ── Step 1: seamless token (timeout 8s) ──
    let seamlessToken: string | null = seamless_token || null;
    let msisdn: string = payload_msisdn || (sender && sender.length > 0 ? (sender.startsWith("0") ? sender.slice(1) : sender) : "");

    // إذا لم يرسل التطبيق التوكن، نحاول جلبه من السيرفر كحل بديل (وإن كان سيفشل غالبا)
    if (!seamlessToken) {
      try {
        const r = await fetchWithTimeout(
          "http://mobile.vodafone.com.eg/checkSeamless/realms/vf-realm/protocol/openid-connect/auth?client_id=ana-vodafone-app-seamless",
          { method: "GET", headers: DEVICE }, 8
        );
        const txt = await r.text();
        logStep("seamless", r.ok ? "ok" : "fail", `http=${r.status}`, { raw_prefix: txt.slice(0, 100) });
        if (r.ok) {
          const d = JSON.parse(txt);
          seamlessToken = d?.seamlessToken ?? null;
          if (d?.msisdn) msisdn = String(d.msisdn);
        }
      } catch (e) {
        logStep("seamless", "fail", `network: ${String(e).slice(0, 80)}`, { layer: "Network" });
      }
    }

    if (!seamlessToken) {
      return json({
        success: false,
        error: "فشل التعرف التلقائي: التطبيق الذي تستخدمه حالياً قديم ولا يقوم بإرسال بيانات الجسر إلى السيرفر.\n\nيرجى تحديث التطبيق (إعادة بناء APK) لكي يتمكن الموبايل من قراءة بيانات فودافون وإرسالها للسيرفر بنجاح.",
        layer: "Vodafone",
      }, 502);
    }

    // ── Step 2: access token (timeout 15s) ──
    const tokenRes = await fetchWithTimeout(
      "https://mobile.vodafone.com.eg/auth/realms/vf-realm/protocol/openid-connect/token",
      {
        method: "POST",
        headers: {
          ...DEVICE,
          "Accept": "application/json, text/plain, */*",
          "silentLogin": "true", "seamlessToken": seamlessToken,
          "firstTimeLogin": "true",
          "x-dynatrace": "MT_3_5_2386790616_1-0_a556db1b-4506-43f3-854a-1d2527767923_0_21520_165",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "password",
          client_secret: "b86e30a8-ae29-467a-a71f-65c73f2ff5e3",
          client_id: "cash-app",
        }).toString(),
      }, 15
    );
    const tokenTxt = await tokenRes.text();
    let accessToken: string | null = null;
    try { accessToken = JSON.parse(tokenTxt)?.access_token ?? null; } catch { /* ignore */ }
    logStep("token", accessToken ? "ok" : "fail", `http=${tokenRes.status}`, { layer: "Vodafone" });

    if (!accessToken) {
      return await abortAndRefund(caller.id, supabaseAdmin, { success: false, error: "فشل المصادقة — الرقم السري غير صحيح أو انتهت الجلسة", layer: "Vodafone" }, 502);
    }

    const formatted = msisdn.startsWith("0") ? msisdn : `0${msisdn}`;

    // ── Step 3: productOrder مع Retry تلقائي لكود 3999 (timeout 20s × 3 محاولات) ──
    const orderPayload = {
      channel: { name: "MobileApp" },
      orderItem: [{
        action: "insert", id: product_id,
        product: {
          characteristic: [
            { name: "PaymentMethod", value: "VFCash" },
            { name: "USE_EMONEY", value: "False" },
            { name: "MerchantCode", value: "" },
          ],
          id: product_id,
          relatedParty: [
            { id: msisdn, name: "MSISDN", role: "Subscriber" },
            { id: receiver, name: "Receiver", role: "Receiver" },
          ],
        },
        "@type": product_id, eCode: 0,
      }],
      relatedParty: [{ id: pin, name: "pin", role: "Requestor" }],
      "@type": "CashFakkaAndMared",
    };

    const MAX_ORDER_RETRIES = 3; // ← أقصى محاولات لكود 3999
    let result: Record<string, unknown> = {};
    let orderRes!: Response;

    for (let attempt = 1; attempt <= MAX_ORDER_RETRIES; attempt++) {
      if (attempt > 1) {
        // تأخير تصاعدي: 2s, 4s بين المحاولات
        const waitMs = attempt === 2 ? 2000 : 4000;
        logStep("order_retry", "ok", `attempt ${attempt}/${MAX_ORDER_RETRIES} — waiting ${waitMs}ms before retry`);
        await delay(waitMs);
      }

      orderRes = await fetchWithTimeout(
        "https://mobile.vodafone.com.eg/services/dxl/pom/productOrder",
        {
          method: "POST",
          headers: {
            ...DEVICE,
            "Accept": "application/json", "Content-Type": "application/json",
            "api-host": "ProductOrderingManagement", "useCase": "CashFakkaAndMared",
            "x-dynatrace": "MT_3_5_2386790616_1-0_a556db1b-4506-43f3-854a-1d2527767923_0_2_160",
            "api-version": "v2", "msisdn": formatted,
            "Authorization": `Bearer ${accessToken}`,
          },
          body: JSON.stringify(orderPayload),
        }, 20
      );
      const orderTxt = await orderRes.text();
      result = {};
      try { result = JSON.parse(orderTxt); } catch { /* ignore */ }

      logStep("order", result?.state === "Completed" || result?.complete === true ? "ok" : "fail",
        `attempt=${attempt} http=${orderRes.status} state=${result?.state ?? "?"}`,
        { layer: "Vodafone", raw_prefix: orderTxt.slice(0, 200), latency_ms: Date.now() - requestStartedAt }
      );

      // نجح ← خرج فوراً من حلقة الـ retry
      if (result?.state === "Completed" || result?.complete === true) break;

      // كود 3999 ← خطأ مؤقت ← أعد المحاولة (ما لم نكن في آخر محاولة)
      const errCode3999 = String(result?.code ?? "");
      if (errCode3999 === "3999" && attempt < MAX_ORDER_RETRIES) continue;

      // أي خطأ آخر أو آخر محاولة ← اخرج
      break;
    }

    const performedAt = new Date().toISOString();
    const latencyMs   = Date.now() - requestStartedAt;
    const { data: profFull } = await supabaseAdmin.from("profiles").select("username, role").eq("id", caller.id).single();
    const username = (profFull as { username?: string } | null)?.username ?? caller.email ?? "المستخدم";

    // ── نجاح الشحن: سجّل العملية سيرفر-سايد مباشرة (لا يحتاج إنترنت من المستخدم) ──
    if (result?.state === "Completed" || result?.complete === true) {
      logStep("charge", "ok", `product=${product_id} receiver=${receiver} latency=${latencyMs}ms`);

      // تسجيل العملية في قاعدة البيانات مباشرة من السيرفر
      const { data: opData, error: opInsertErr } = await supabaseAdmin
        .from("operations")
        .insert({
          user_id:          caller.id,
          phone_number:     receiver,
          card_type:        productConfig?.display_name || product_id,
          category:         product_id.toLowerCase().includes("mared") ? "مارد" : "فكة",
          amount:           productConfig?.price || 0,
          status:           "success",
          error_message:    null,
          performed_at:     performedAt,
          api_response:     "Completed",
          operation_source: "vodafone_cash",
          idempotency_key:  idempotencyKey,
          correlation_id:   correlationId,
          latency_ms:       latencyMs,
          device_fp:        deviceFp ?? null,
          execution_layer:  "edge_function",
          card_data: {
            product_id,
            receiver,
            via:               "server",
            idempotency_key:   idempotencyKey,
            correlation_id:    correlationId,
            latency_ms:        latencyMs,
            registered_by:     "edge_function",
            device_fp:         deviceFp ?? null,
          },
        })
        .select("operation_number")
        .maybeSingle();

      if (opInsertErr) {
        logStep("op_insert", "fail", `error=${JSON.stringify(opInsertErr)}`);
      }

      const opNumber = (opData as { operation_number?: number } | null)?.operation_number ?? null;
      const opId     = (opData as { id?: string } | null)?.id ?? null;
      logStep("op_insert", "ok", `op_number=${opNumber}`);

      // ── كشف التضارب: هل ثمة عملية أخرى لنفس المستخدم من جهاز مختلف خلال 60 ثانية؟ ──
      try {
        const since60s = new Date(Date.now() - 60_000).toISOString();
        const { data: recentOps } = await supabaseAdmin
          .from("operations")
          .select("id, performed_at, card_data")
          .eq("user_id", caller.id)
          .gte("performed_at", since60s)
          .neq("id", opId ?? "")
          .limit(5);

        const concurrent = (recentOps ?? []).filter((o: Record<string,unknown>) => {
          const cd = o.card_data as Record<string,unknown> | null;
          const otherFp = cd?.device_fp as string | null;
          return deviceFp && otherFp && otherFp !== deviceFp;
        });

        if (concurrent.length > 0) {
          const otherOp = concurrent[0] as Record<string,unknown>;
          const otherCd = otherOp.card_data as Record<string,unknown> | null;
          const other2Fp = otherCd?.device_fp as string | null;
          const throttleReason = "تضارب عمليات متزامنة من أجهزة متعددة";

          // أنشئ سجل التقييد
          await supabaseAdmin.from("charge_throttles").insert({
            user_id:     caller.id,
            throttled_at: new Date().toISOString(),
            expires_at:   new Date(Date.now() + 10 * 60_000).toISOString(),
            is_active:    true,
            reason:       throttleReason,
            device1_fp:   deviceFp,
            device2_fp:   other2Fp ?? null,
            op1_id:       opId ?? null,
            op2_id:       otherOp.id as string ?? null,
            ops_count:    concurrent.length + 1,
          });

          // أرسل إشعاراً للمستخدم
          await supabaseAdmin.from("notifications").insert({
            user_id:     caller.id,
            title:       "⛔ تقييد مؤقت للحساب",
            body:        `تم تقييد حسابك لمدة 10 دقائق بسبب اكتشاف عمليات متزامنة من أجهزة متعددة. سيُرفع التقييد تلقائياً.\nإذا لم تكن أنت، تواصل مع الإدارة فوراً.`,
            type:        "warning",
            is_global:   false,
            priority:    "high",
          });

          logStep("concurrent_conflict", "fail", `throttled user=${caller.id} devices=${deviceFp}/${other2Fp}`);
        }
      } catch (conflictErr) {
        logStep("concurrent_check", "skip", `error: ${String(conflictErr)}`);
      }

      // سجّل activity_log
      await supabaseAdmin.from("activity_log").insert({
        user_id:    caller.id,
        event_type: "recharge",
        title:      `شحن ناجح — ${product_id}`,
        description:`الرقم: ${receiver}${opNumber != null ? ` | #${opNumber}` : ""}`,
        metadata:   { product_id, phone: receiver, status: "success", operation_number: opNumber, operation_source: "vodafone_cash" },
      }).then(() => {}).catch(() => {});

      // سجّل system_logs
      await supabaseAdmin.from("system_logs").insert({
        user_id: caller.id,
        level:   "info",
        action:  "recharge_success",
        message: `شحن ناجح (Edge Function) — ${product_id} — ${receiver}${opNumber != null ? ` — #${opNumber}` : ""}`,
        metadata:{ product_id, phone: receiver, operation_source: "vodafone_cash", operation_number: opNumber, latency_ms: latencyMs },
      }).then(() => {}).catch(() => {});

      // أرسل إشعاراً
      await supabaseAdmin.from("notifications").insert({
        user_id:   caller.id,
        title:     `✅ تم شحن ${product_id}`,
        body:      `المستخدم: ${username}\nالرقم: ${receiver}${opNumber != null ? `\nرقم العملية: #${opNumber}` : ""}\nالحالة: ناجحة`,
        type:      "operation",
        is_global: false,
        is_read:   false,
      }).then(() => {}).catch(() => {});

      return json({
        success:          true,
        message:          "✅ تم الشحن بنجاح!",
        request_id:       requestId,
        operation_number: opNumber,
        performed_at:     performedAt,
        registered:       true, // ← العملية سُجِّلت سيرفر-سايد
      });
    }

    // ── فشل الشحن: سجّل العملية الفاشلة أيضاً سيرفر-سايد ──
    const rawErr  = String(result?.message ?? result?.description ?? result?.error ?? "");
    const errCode = String(result?.code ?? result?.errorCode ?? result?.error_code ?? "");
    let friendly = "فشل الطلب — تحقق من رصيدك وبيانات المحفظة";
    let errorLayer = "Vodafone";

    if      (errCode === "3999") friendly = "⚠️ خطأ مؤقت من خوادم فودافون\nأعد المحاولة بعد ثوانٍ — ليس خطأً في بياناتك";
    else if (errCode === "1118") {
      friendly = "🔒 تم تجميد حسابك بسبب تكرار الرقم الخاطئ 3 مرات\nانتظر 24 ساعة أو اتصل على 888";
      errorLayer = "Vodafone-AccountLocked";
      await supabaseAdmin.from("profiles").update({
        vodafone_pin_locked_at: new Date().toISOString(),
        vodafone_lock_reason: friendly,
      }).eq("id", caller.id);
      logStep("pin_lock", "ok", `recorded lock for user=${caller.id}`);
    }
    else if (errCode === "1056") { friendly = "❌ الرقم السري للمحفظة غير صحيح\n⚠️ تحذير: بعد 3 محاولات سيُقفل الحساب!"; errorLayer = "Vodafone-WrongPIN"; }
    else if (errCode === "1051") { friendly = "📵 الرقم غير مسجّل في Vodafone Cash\nتأكد أن الرقم مفعّل عليه محفظة فودافون كاش"; errorLayer = "Vodafone-NotRegistered"; }
    else if (["6051","1057","1058"].includes(errCode)) { friendly = "💳 رصيد محفظتك غير كافٍ\nاشحن المحفظة ثم أعد المحاولة"; errorLayer = "Vodafone-InsufficientBalance"; }
    else if (rawErr.toLowerCase().includes("insufficient") || rawErr.includes("رصيد")) { friendly = "❌ رصيد محفظتك غير كافٍ لإتمام العملية"; errorLayer = "Vodafone-InsufficientBalance"; }
    else if (rawErr.toLowerCase().includes("pin") || rawErr.includes("سري")) { friendly = "❌ الرقم السري للمحفظة غير صحيح"; errorLayer = "Vodafone-WrongPIN"; }
    else if (rawErr) { friendly = `❌ ${rawErr}`; }

    // سجّل العملية الفاشلة سيرفر-سايد أيضاً
    const { error: failInsertErr } = await supabaseAdmin.from("operations").insert({
      user_id:          caller.id,
      phone_number:     receiver,
      card_type:        productConfig?.display_name || product_id,
      category:         product_id.toLowerCase().includes("mared") ? "مارد" : "فكة",
      amount:           productConfig?.price || 0,
      status:           "failed",
      error_message:    friendly.split("\n")[0],
      performed_at:     performedAt,
      api_response:     friendly.split("\n")[0],
      operation_source: "vodafone_cash",
      idempotency_key:  idempotencyKey,
      correlation_id:   correlationId,
      latency_ms:       latencyMs,
      device_fp:        deviceFp ?? null,
      execution_layer:  "edge_function",
      card_data: {
        product_id,
        receiver,
        via:             "server",
        idempotency_key: idempotencyKey,
        correlation_id:  correlationId,
        latency_ms:      latencyMs,
        error_code:      errCode,
        registered_by:   "edge_function",
      },
    });
    if (failInsertErr) {
      logStep("op_insert_fail", "fail", `error=${JSON.stringify(failInsertErr)}`);
    }

    const lockUntil = errCode === "1118"
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    return json({
      success:    false,
      error:      friendly,
      error_code: errCode,
      layer:      errorLayer,
      request_id: requestId,
      registered: true, // ← العملية الفاشلة سُجِّلت أيضاً سيرفر-سايد
      ...(lockUntil ? { locked_until: lockUntil, hours_left: 24 } : {}),
    }, 422);

  } catch (err) {
    const errMsg = String(err);
    console.error(JSON.stringify({
      request_id: requestId, correlation_id: correlationId,
      step: "fatal", status: "fail", error: errMsg,
      latency_ms: Date.now() - requestStartedAt, layer: "EdgeFunction",
    }));
    // تحقق من نوع الخطأ — timeout له رسالة مختلفة
    if (opCallerId && opsAdminClient) {
      if (errMsg.includes("AbortError") || errMsg.includes("timeout")) {
        return await abortAndRefund(opCallerId, opsAdminClient, { success: false, error: "انتهت مهلة الاتصال بخوادم فودافون — أعد المحاولة", layer: "Network" }, 504);
      }
      return await abortAndRefund(opCallerId, opsAdminClient, { success: false, error: "خطأ داخلي في الخادم — يرجى المحاولة مرة أخرى", layer: "EdgeFunction" }, 500);
    }
    
    return json({ success: false, error: "خطأ داخلي في الخادم — يرجى المحاولة مرة أخرى", layer: "EdgeFunction" }, 500);
  }
});
