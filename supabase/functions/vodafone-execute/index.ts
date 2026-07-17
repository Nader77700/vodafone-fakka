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
    // ── Zero Trust Check (Layer 1-15) ──
    const zt = await zeroTrustCheck(req);
    if (zt.error) {
       logStep("zero_trust", "fail", zt.error);
       return json({ success: false, error: zt.error, error_code: "SECURITY_REJECT", layer: "EdgeFunction" }, zt.status);
    }
    const caller = zt.user!;
    const supabaseAdmin = zt.supabaseAdmin;
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
    let body: { product_id?: string; receiver?: string; pin?: string; sender?: string };
    try { body = await req.json(); } catch {
      logStep("parse_body", "fail", "invalid JSON");
      return json({ success: false, error: "بيانات غير صالحة", layer: "Frontend" }, 400);
    }
    const { product_id, receiver, pin, sender } = body;

    // ── LAYER 14 & 15: Validate product against Database ──
    const { data: productConfig } = await supabaseAdmin
      .from("product_config")
      .select("id, is_active")
      .eq("product_id", product_id)
      .single();

    if (!productConfig || !productConfig.is_active) {
      logStep("product_validation", "fail", "invalid product");
      return json({ success: false, error: "المنتج غير صالح أو تم إيقافه من السيرفر" }, 400);
    }

    if (!product_id || !receiver || !pin || !sender) {
      logStep("validate", "fail", "missing fields");
      return json({ success: false, error: "بيانات غير مكتملة — أدخل جميع الحقول", layer: "Frontend" }, 400);
    }
    if (!receiver.startsWith("01") || receiver.length !== 11) {
      return json({ success: false, error: "رقم المستفيد غير صحيح — 11 رقم يبدأ بـ 01", layer: "Frontend" }, 400);
    }
    if (!sender.startsWith("01") || sender.length !== 11) {
      return json({ success: false, error: "رقم محفظتك غير صحيح — 11 رقم يبدأ بـ 01", layer: "Frontend" }, 400);
    }
    logStep("validate", "ok", `product=${product_id} receiver=${receiver}`);

    // ── Step 1: seamless token (timeout 8s) ──
    let seamlessToken: string | null = null;
    let msisdn: string = sender.startsWith("0") ? sender.slice(1) : sender;

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

    if (!seamlessToken) {
      return json({
        success: false,
        error: "يلزم تشغيل جسر الشحن على الموبايل\n\nشغّل ملف vodafone_bridge.py على موبايلك (بيانات فودافون) ثم أعد المحاولة.",
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
      return json({ success: false, error: "فشل المصادقة — الرقم السري غير صحيح أو انتهت الجلسة", layer: "Vodafone" }, 502);
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
      const { data: opData } = await supabaseAdmin
        .from("operations")
        .insert({
          user_id:          caller.id,
          phone_number:     receiver,
          card_type:        product_id,
          category:         product_id.toLowerCase().includes("mared") ? "مارد" : "فكة",
          amount:           0, // سيُحدَّث من العميل إذا أمكن — السيرفر لا يعرف السعر
          status:           "success",
          error_message:    null,
          performed_at:     performedAt,
          api_response:     "Completed",
          operation_source: "vodafone_cash",
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
    await supabaseAdmin.from("operations").insert({
      user_id:          caller.id,
      phone_number:     receiver,
      card_type:        product_id,
      category:         product_id.toLowerCase().includes("mared") ? "مارد" : "فكة",
      amount:           0,
      status:           "failed",
      error_message:    friendly.split("\n")[0],
      performed_at:     performedAt,
      api_response:     friendly.split("\n")[0],
      operation_source: "vodafone_cash",
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
    }).then(() => {}).catch(() => {});

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
    if (errMsg.includes("AbortError") || errMsg.includes("timeout")) {
      return json({ success: false, error: "انتهت مهلة الاتصال بخوادم فودافون — أعد المحاولة", layer: "Network" }, 504);
    }
    return json({ success: false, error: "خطأ داخلي في الخادم — يرجى المحاولة مرة أخرى", layer: "EdgeFunction" }, 500);
  }
});

// ── الحد الأدنى المطلوب من build code ─────────────────────────────────────
// تم تعطيل فحص الإصدار — أي اشتراك فعّال مسموح بغض النظر عن إصدار التطبيق
const MIN_BUILD_REQUIRED = 0;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-build, x-app-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    headers: { ...CORS, "Content-Type": "application/json" },
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // ── Server-side Version Block ───────────────────────────────────────────
    // يرفض الإصدارات القديمة التي لا ترسل X-App-Build أو ترسل قيمة أقل من الحد الأدنى
    // الإصدارات الجديدة (v3.0.53+) ترسل هذا الـ header تلقائياً من supabase.ts
    const appBuildHeader = req.headers.get("x-app-build");
    const appBuild = appBuildHeader ? parseInt(appBuildHeader, 10) : 0;

    if (appBuild < MIN_BUILD_REQUIRED) {
      return json({
        success: false,
        error: "إصدارك قديم — يجب تحديث التطبيق لاستخدام هذه الخدمة",
        error_code: "UPDATE_REQUIRED",
        min_build: MIN_BUILD_REQUIRED,
        your_build: appBuild,
      }, 426); // 426 = Upgrade Required
    }

    // ── التحقق من المصادقة والاشتراك ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "غير مصرح — يجب تسجيل الدخول" }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !caller) return json({ success: false, error: "غير مصرح — جلسة منتهية أو غير صحيحة" }, 401);

    // التحقق من وجود اشتراك نشط
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("status, expires_at")
      .eq("user_id", caller.id)
      .maybeSingle();

    const hasActive = sub && sub.status === "active" && sub.expires_at && new Date(sub.expires_at) > new Date();
    // السماح للأدمن دائماً
    const { data: prof } = await supabaseAdmin.from("profiles").select("role, is_active").eq("id", caller.id).single();
    const isAdmin = prof && ["admin", "super_admin"].includes(prof.role);

    if (!prof?.is_active) return json({ success: false, error: "حسابك محظور — تواصل مع الإدارة" }, 403);
    if (!hasActive) return json({ success: false, error: "اشتراكك منتهٍ — يرجى تجديد الاشتراك لاستخدام هذه الخدمة" }, 403);

    const { product_id, receiver, pin, sender } = await req.json();
    console.log("[vf] start", { product_id, receiver });

    if (!product_id || !receiver || !pin || !sender)
      return json({ success: false, error: "بيانات غير مكتملة — أدخل جميع الحقول" }, 400);
    if (!receiver.startsWith("01") || receiver.length !== 11)
      return json({ success: false, error: "رقم المستفيد غير صحيح — 11 رقم يبدأ بـ 01" }, 400);
    if (!sender.startsWith("01") || sender.length !== 11)
      return json({ success: false, error: "رقم محفظتك غير صحيح — 11 رقم يبدأ بـ 01" }, 400);

    // ── خطوة 1: seamless (timeout 8s) ──
    let seamlessToken: string | null = null;
    let msisdn: string = sender.startsWith("0") ? sender.slice(1) : sender;

    try {
      const r = await fetchWithTimeout(
        "http://mobile.vodafone.com.eg/checkSeamless/realms/vf-realm/protocol/openid-connect/auth?client_id=ana-vodafone-app-seamless",
        { method: "GET", headers: DEVICE },
        8
      );
      const txt = await r.text();
      console.log("[vf] seamless:", r.status, txt.slice(0, 150));
      if (r.ok) {
        const d = JSON.parse(txt);
        seamlessToken = d?.seamlessToken ?? null;
        if (d?.msisdn) msisdn = String(d.msisdn);
      }
    } catch (e) {
      console.log("[vf] seamless failed:", String(e).slice(0, 100));
    }

    if (!seamlessToken) {
      return json({
        success: false,
        error: "يلزم تشغيل جسر الشحن على الموبايل\n\nشغّل ملف vodafone_bridge.py على موبايلك (بيانات فودافون) ثم أعد المحاولة.\n\nالجسر يسمح للموقع بالشحن مباشرة من جهازك."
      }, 502);
    }
    console.log("[vf] seamless OK, msisdn:", msisdn);

    // ── خطوة 2: access token ──
    const tokenRes = await fetchWithTimeout(
      "https://mobile.vodafone.com.eg/auth/realms/vf-realm/protocol/openid-connect/token",
      {
        method: "POST",
        headers: {
          ...DEVICE,
          "Accept": "application/json, text/plain, */*",
          "silentLogin": "true",
          "seamlessToken": seamlessToken,
          "firstTimeLogin": "true",
          "x-dynatrace": "MT_3_5_2386790616_1-0_a556db1b-4506-43f3-854a-1d2527767923_0_21520_165",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "password",
          client_secret: "b86e30a8-ae29-467a-a71f-65c73f2ff5e3",
          client_id: "cash-app",
        }).toString(),
      },
      15
    );
    const tokenTxt = await tokenRes.text();
    console.log("[vf] token:", tokenRes.status, tokenTxt.slice(0, 200));
    let accessToken: string | null = null;
    try { accessToken = JSON.parse(tokenTxt)?.access_token ?? null; } catch { /* ignore */ }

    if (!accessToken) {
      return json({ success: false, error: "فشل المصادقة — الرقم السري غير صحيح أو انتهت الجلسة" }, 502);
    }

    const formatted = msisdn.startsWith("0") ? msisdn : `0${msisdn}`;

    // ── خطوة 3: productOrder مع Retry تلقائي لكود 3999 ──
    const orderPayload2 = {
      channel: { name: "MobileApp" },
      orderItem: [{
        action: "insert",
        id: product_id,
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
        "@type": product_id,
        eCode: 0,
      }],
      relatedParty: [{ id: pin, name: "pin", role: "Requestor" }],
      "@type": "CashFakkaAndMared",
    };

    const MAX_ORDER_RETRIES2 = 3;
    let result2: Record<string, unknown> = {};
    const startedAt2 = Date.now();
    for (let attempt = 1; attempt <= MAX_ORDER_RETRIES2; attempt++) {
      if (attempt > 1) await delay(attempt === 2 ? 2000 : 4000);

      const orderRes2 = await fetchWithTimeout(
        "https://mobile.vodafone.com.eg/services/dxl/pom/productOrder",
        {
          method: "POST",
          headers: {
            ...DEVICE,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "api-host": "ProductOrderingManagement",
            "useCase": "CashFakkaAndMared",
            "x-dynatrace": "MT_3_5_2386790616_1-0_a556db1b-4506-43f3-854a-1d2527767923_0_2_160",
            "api-version": "v2",
            "msisdn": formatted,
            "Authorization": `Bearer ${accessToken}`,
          },
          body: JSON.stringify(orderPayload2),
        },
        20
      );
      const orderTxt2 = await orderRes2.text();
      console.log("[vf] order attempt", attempt, orderRes2.status, orderTxt2.slice(0, 200));
      result2 = {};
      try { result2 = JSON.parse(orderTxt2); } catch { /* ignore */ }
      if (result2?.state === "Completed" || result2?.complete === true) break;
      const code2 = String(result2?.code ?? "");
      if (code2 === "3999" && attempt < MAX_ORDER_RETRIES2) continue;
      break;
    }

    const performedAt2 = new Date().toISOString();
    const latencyMs2   = Date.now() - startedAt2;
    const { data: profV2 } = await supabaseAdmin.from("profiles").select("username").eq("id", caller.id).single();
    const username2 = (profV2 as { username?: string } | null)?.username ?? caller.email ?? "المستخدم";

    if (result2?.state === "Completed" || result2?.complete === true) {
      // تسجيل سيرفر-سايد فوري
      const { data: opData2 } = await supabaseAdmin.from("operations").insert({
        user_id: caller.id, phone_number: receiver, card_type: product_id,
        category: product_id.toLowerCase().includes("mared") ? "مارد" : "فكة",
        amount: 0, status: "success", error_message: null,
        performed_at: performedAt2, api_response: "Completed",
        operation_source: "vodafone_cash",
        card_data: { product_id, receiver, via: "server", latency_ms: latencyMs2, registered_by: "edge_function" },
      }).select("operation_number").maybeSingle();
      const opNum2 = (opData2 as { operation_number?: number } | null)?.operation_number ?? null;

      await Promise.all([
        supabaseAdmin.from("activity_log").insert({
          user_id: caller.id, event_type: "recharge",
          title: `شحن ناجح — ${product_id}`,
          description: `الرقم: ${receiver}${opNum2 != null ? ` | #${opNum2}` : ""}`,
          metadata: { product_id, phone: receiver, status: "success", operation_number: opNum2 },
        }).then(()=>{}).catch(()=>{}),
        supabaseAdmin.from("notifications").insert({
          user_id: caller.id, title: `✅ تم شحن ${product_id}`,
          body: `المستخدم: ${username2}\nالرقم: ${receiver}${opNum2 != null ? `\nرقم العملية: #${opNum2}` : ""}\nالحالة: ناجحة`,
          type: "operation", is_global: false, is_read: false,
        }).then(()=>{}).catch(()=>{}),
      ]);

      return json({ success: true, message: "✅ تم الشحن بنجاح!", operation_number: opNum2, performed_at: performedAt2, registered: true });
    }

    const rawErr = String(result2?.message ?? result2?.description ?? result2?.error ?? "");
    const errCode = String(result2?.code ?? result2?.errorCode ?? result2?.error_code ?? "");
    let friendly = "فشل الطلب — تحقق من رصيدك وبيانات المحفظة";
    if      (errCode === "3999") friendly = "⚠️ خطأ مؤقت من خوادم فودافون\nأعد المحاولة بعد ثوانٍ — ليس خطأً في بياناتك";
    else if (errCode === "1118") friendly = "🔒 تم تجميد حسابك بسبب تكرار الرقم الخاطئ 3 مرات\nانتظر 24 ساعة أو اتصل على 888 من خطك";
    else if (errCode === "1056") friendly = "❌ الرقم السري للمحفظة غير صحيح\n⚠️ تحذير: بعد 3 محاولات سيُقفل الحساب!";
    else if (errCode === "1051") friendly = "📵 الرقم غير مسجّل في Vodafone Cash\nتأكد أن الرقم مفعّل عليه محفظة فودافون كاش";
    else if (["6051","1057","1058"].includes(errCode)) friendly = "💳 رصيد محفظتك غير كافٍ\nاشحن المحفظة ثم أعد المحاولة";
    else if (rawErr.toLowerCase().includes("insufficient") || rawErr.includes("رصيد")) friendly = "❌ رصيد محفظتك غير كافٍ لإتمام العملية";
    else if (rawErr.toLowerCase().includes("pin") || rawErr.toLowerCase().includes("password") || rawErr.includes("سري")) friendly = "❌ الرقم السري للمحفظة غير صحيح";
    else if (rawErr) friendly = `❌ ${rawErr}`;

    // تسجيل الفشل سيرفر-سايد
    await supabaseAdmin.from("operations").insert({
      user_id: caller.id, phone_number: receiver, card_type: product_id,
      category: product_id.toLowerCase().includes("mared") ? "مارد" : "فكة",
      amount: 0, status: "failed", error_message: friendly.split("\n")[0],
      performed_at: performedAt2, api_response: friendly.split("\n")[0],
      operation_source: "vodafone_cash",
      card_data: { product_id, receiver, via: "server", error_code: errCode, latency_ms: latencyMs2, registered_by: "edge_function" },
    }).then(()=>{}).catch(()=>{});

    return json({ success: false, error: friendly, error_code: errCode, registered: true }, 422);

  } catch (err) {
    console.error("[vf] fatal:", String(err));
    return json({ success: false, error: "خطأ داخلي في الخادم — يرجى المحاولة مرة أخرى" }, 500);
  }
});
