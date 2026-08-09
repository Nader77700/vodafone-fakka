/**
 * vcc-recharge — Vodafone Cash شحن الرصيد
 * بنفس بنية vcc-money-transfer تماماً.
 * السكريبت المرجعي: vodafone_cash_recharge.py
 *
 * الخطوات:
 *  1. Seamless → token
 *  2. productOrder recharge (paymentRecharge)
 *  3. Insert vcc_recharges
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { zeroTrustCheck, CORS_HEADERS } from "../_shared/zero_trust.ts";

const DEVICE = {
  "User-Agent": "okhttp/4.12.0",
  "Connection": "close",
  "Accept": "application/json",
  "Accept-Encoding": "gzip",
  "x-agent-operatingsystem": "16",
  "clientId": "AnaVodafoneAndroid",
  "Accept-Language": "ar",
  "x-agent-device": "OPPO CPH2737",
  "x-agent-version": "2026.4.1",
  "x-agent-build": "1139",
  "digitalId": "2BD5YKHMAV6VL",
  "device-id": "b61c90c58c612671",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

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

  const requestStartedAt = Date.now();
  console.log("[vcc-recharge] invoked", new Date().toISOString());

  const debugSteps: any[] = [];
  const logStep = (step: string, status: string, detail: string, extra?: any) => {
    const msg = `[${step}] ${status.toUpperCase()} - ${detail}`;
    console.log(msg, extra || "");
    debugSteps.push({ step, status, detail, timestamp: new Date().toISOString(), ...extra });
  };

  let opCallerId: string | null = null;
  let opsAdminClient: any = null;

  const abortAndRefund = async (callerId: string | null, supabaseAdmin: any, payload: any) => {
    if (callerId && supabaseAdmin) {
      await supabaseAdmin.rpc("atomic_refund_operation", { p_user_id: callerId });
      logStep("ops_refund", "ok", "refunded operation due to failure");
    }
    return json({ ...payload, debugSteps }, 200);
  };

  try {
    const sbUrl = Deno.env.get("SUPABASE_URL") || "";
    const sbKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabase = createClient(sbUrl, sbKey, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
    });

    // ── Zero-Trust ───────────────────────────────────────────────
    const authRes = await zeroTrustCheck(req);
    if ("error" in authRes) {
      logStep("auth", "fail", authRes.error as string);
      return await abortAndRefund(null, null, { success: false, error: authRes.error, layer: "Supabase" });
    }
    const user = authRes.user!;
    opCallerId = user.id;
    opsAdminClient = authRes.supabaseAdmin;
    logStep("auth", "ok", `user=${user.id}`);

    // ── Subscription ─────────────────────────────────────────────
    const { data: sub } = await opsAdminClient
      .from("subscriptions")
      .select("status, expires_at")
      .eq("user_id", user.id)
      .maybeSingle();

    const hasActive =
      sub &&
      sub.status === "active" &&
      sub.expires_at &&
      new Date(sub.expires_at) > new Date();

    if (!hasActive) {
      logStep("subscription", "fail", `sub status=${sub?.status ?? "none"}`);
      return await abortAndRefund(opCallerId, opsAdminClient, {
        success: false,
        error: "اشتراكك منتهٍ — يرجى تجديد الاشتراك",
        layer: "Authorization",
      });
    }

    // ── Consume Operation ────────────────────────────────────────
    const { data: consumeData, error: consumeError } = await opsAdminClient.rpc(
      "atomic_consume_operation",
      { p_user_id: user.id }
    );
    if (consumeError || !consumeData || !consumeData.allowed) {
      logStep("subscription", "fail", "ops limit reached");
      return await abortAndRefund(opCallerId, opsAdminClient, {
        success: false,
        error: "لقد استنفذت الحد الأقصى للعمليات في باقتك",
        layer: "Authorization",
      });
    }
    logStep("ops_consume", "ok", "allowed");

    // ── Payload ──────────────────────────────────────────────────
    const payload = await req.json().catch(() => ({}));
    const { receiver, amount, pin, seamless_token, payload_msisdn } = payload;

    if (!receiver || !amount || !pin || !seamless_token) {
      logStep("validate", "fail", "missing fields");
      return await abortAndRefund(opCallerId, opsAdminClient, {
        success: false,
        error: "بيانات غير مكتملة — تأكد من إدخال الرقم والمبلغ وكلمة السر",
        layer: "Frontend",
      });
    }

    let msisdn = payload_msisdn || "";
    if (msisdn.startsWith("0")) msisdn = msisdn.slice(1);
    const formattedMsisdn = `0${msisdn}`;

    const clientIp =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("cf-connecting-ip") ||
      "163.121.214.12";

    // ── الخطوة 1: Access Token ────────────────────────────────────
    logStep("auth-voda", "pending", "requesting token");
    const tokenRes = await fetchWithTimeout(
      "https://mobile.vodafone.com.eg/auth/realms/vf-realm/protocol/openid-connect/token",
      {
        method: "POST",
        headers: {
          ...DEVICE,
          "CRP": "false",
          "seamlessToken": seamless_token,
          "silentLogin": "true",
          "firstTimeLogin": "true",
          "msisdn": msisdn,
          "X-Forwarded-For": clientIp,
          "True-Client-IP": clientIp,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "password",
          client_secret: "b86e30a8-ae29-467a-a71f-65c73f2ff5e3",
          client_id: "cash-app",
        }).toString(),
      },
      10
    );

    if (!tokenRes.ok) {
      const errTxt = await tokenRes.text();
      logStep("auth-voda", "fail", `http=${tokenRes.status}`, { raw: errTxt });
      return await abortAndRefund(opCallerId, opsAdminClient, {
        success: false,
        error: "فشل المصادقة مع فودافون كاش، تأكد من تشغيل بيانات فودافون",
        layer: "Vodafone",
        debugSteps,
      });
    }

    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;
    if (!token) {
      logStep("auth-voda", "fail", "no token in response");
      return await abortAndRefund(opCallerId, opsAdminClient, {
        success: false,
        error: "فشل استخراج توكن المصادقة",
        layer: "Vodafone",
        debugSteps,
      });
    }
    logStep("auth-voda", "ok", "got token");

    // ── الخطوة 2: تنفيذ شحن الرصيد (productOrder) ───────────────
    logStep("recharge", "pending", `receiver=${receiver} amount=${amount}`);

    const transactionId = `2BD5YKHMAV${(Date.now() % 1_000_000).toString().padStart(6, "0")}`;

    const rechargePayload = {
      payment: [
        {
          characteristics: [
            { name: "authorizationCode", value: pin },
            { name: "digitalTransactionId", value: transactionId },
          ],
          "@type": "digitalWallet",
        },
      ],
      productOrderItem: [
        {
          characteristics: [
            { name: "MSISDN", "@type": "receiver", value: receiver },
            { name: "MSISDN", "@type": "sender", value: formattedMsisdn },
          ],
          itemTotalPrice: [
            {
              price: {
                taxIncludedAmount: {
                  unit: "EGP",
                  value: Number(amount),
                },
              },
            },
          ],
        },
      ],
      "@type": "paymentRecharge",
    };

    const rechargeRes = await fetchWithTimeout(
      "https://mobile.vodafone.com.eg/services/dxl/orderor/productOrder",
      {
        method: "POST",
        headers: {
          ...DEVICE,
          "api-version": "v2",
          "msisdn": formattedMsisdn,
          "Authorization": `Bearer ${token}`,
          "X-Forwarded-For": clientIp,
          "True-Client-IP": clientIp,
          "X-Request-ID": transactionId,
          "X-App-StackTrace": "",
          "X-Network-StackTrace": "VFCashBaseNetworkManager initialized with config#createService called with service#getOkHttpBuilderInstance called#OkHttpClient.Builder configured with interceptor",
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify(rechargePayload),
      },
      15
    );

    const txt = await rechargeRes.text();
    let data: any;
    try {
      data = JSON.parse(txt);
    } catch {
      data = null;
    }

    // استخراج أي رسالة عربية من الاستجابة
    const extractArabicText = (obj: any): string | null => {
      if (!obj) return null;
      if (typeof obj === "string" && /[\u0600-\u06FF]/.test(obj)) return obj;
      if (typeof obj === "object") {
        for (const key in obj) {
          const res = extractArabicText(obj[key]);
          if (res) return res;
        }
      }
      return null;
    };

    let description =
      data?.description ||
      data?.message ||
      data?.error_description ||
      "حدث خطأ غير معروف";

    const arabicError = extractArabicText(data);
    if (arabicError) description = arabicError;

    if (
      txt.trim().toLowerCase().startsWith("<html") ||
      txt.trim().toLowerCase().startsWith("<!doctype html>")
    ) {
      description = "خوادم فودافون محجوبة أو تحت الصيانة (WAF HTML Response)";
    }

    // HTTP 201 = نجاح تام في السكريبت
    const txId =
      data?.payment?.[0]?.characteristics?.find((c: any) => c.name === "transactionId")?.value ||
      data?.id ||
      transactionId;

    const isSuccess =
      rechargeRes.status === 201 ||
      (rechargeRes.ok && !!data?.id) ||
      (rechargeRes.ok && String(data?.status ?? "").toLowerCase() === "completed");

    if (isSuccess) {
      logStep("recharge", "ok", `txId=${txId}`);

      await opsAdminClient.from("vcc_recharges").insert({
        user_id: user.id,
        receiver_number: receiver,
        sender_number: formattedMsisdn,
        amount: Number(amount),
        status: "completed",
        reference_number: String(txId),
        execution_time_ms: Date.now() - requestStartedAt,
      });

      return json({
        success: true,
        message: `تم شحن ${amount} جنيه إلى ${receiver} بنجاح ✅`,
        reference: txId,
        debugSteps,
      });
    } else {
      logStep("recharge", "fail", `http=${rechargeRes.status}`, {
        description,
        raw: txt.slice(0, 300),
      });

      await opsAdminClient.from("vcc_recharges").insert({
        user_id: user.id,
        receiver_number: receiver,
        sender_number: formattedMsisdn,
        amount: Number(amount),
        status: "failed",
        failure_reason: description,
        execution_time_ms: Date.now() - requestStartedAt,
      });

      return await abortAndRefund(opCallerId, opsAdminClient, {
        success: false,
        error: description,
        layer: "Vodafone",
        debugSteps,
      });
    }
  } catch (err: any) {
    logStep("catch", "error", err.message);
    return await abortAndRefund(opCallerId, opsAdminClient, {
      success: false,
      error: "حدث خطأ غير متوقع في السيرفر",
      layer: "Server",
      debugSteps,
    });
  }
});
