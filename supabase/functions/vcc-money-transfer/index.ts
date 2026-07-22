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
  "x-agent-device": "OPPO CPH2701",
  "x-agent-version": "2026.7.1",
  "x-agent-build": "1176",
  "digitalId": "",
  "device-id": "8dd508efe17c496d",
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
  console.log("[vcc-money-transfer] invoked", new Date().toISOString());

  const debugSteps: any[] = [];
  const logStep = (step: string, status: string, detail: string, extra?: any) => {
    const msg = `[${step}] ${status.toUpperCase()} - ${detail}`;
    console.log(msg, extra || "");
    debugSteps.push({ step, status, detail, timestamp: new Date().toISOString(), ...extra });
  };

  try {
    let opCallerId: string | null = null;
    let opsAdminClient: any = null;

    const abortAndRefund = async (callerId: string | null, supabaseAdmin: any, payload: any, status = 400) => {
      if (callerId && supabaseAdmin) {
        await supabaseAdmin.rpc('atomic_refund_operation', { p_user_id: callerId });
        logStep("ops_refund", "ok", "refunded operation due to failure");
      }
      return json(payload, status);
    };

    const sbUrl = Deno.env.get("SUPABASE_URL") || "";
    const sbKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabase = createClient(sbUrl, sbKey, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } }
    });

    // Zero-Trust check
    const authRes = await zeroTrustCheck(req);
    if (!authRes.ok) return await abortAndRefund(opCallerId, opsAdminClient, { success: false, error: authRes.error, layer: "Supabase" }, 401);
    const user = authRes.user!;
    opCallerId = user.id;
    opsAdminClient = authRes.supabaseAdmin;
    logStep("auth", "ok", `user=${user.id}`);

    // Subscription check
    const { data: sub } = await supabase
      .from("subscriptions").select("status, expires_at").eq("user_id", user.id).maybeSingle();
    const hasActive = sub && sub.status === "active" && sub.expires_at && new Date(sub.expires_at) > new Date();

    if (!hasActive) {
      logStep("subscription", "fail", `sub status=${sub?.status ?? "none"}`);
      return await abortAndRefund(opCallerId, opsAdminClient, { success: false, error: "اشتراكك منتهٍ — يرجى تجديد الاشتراك", layer: "Authorization" }, 403);
    }

    // ── حماية السيرفر: خصم العملية فوراً لمنع التخطي ──
    const { data: consumeData, error: consumeError } = await supabase.rpc('atomic_consume_operation', { p_user_id: user.id });
    if (consumeError || !consumeData || !consumeData.allowed) {
      logStep("subscription", "fail", "ops limit reached (server-side enforced)");
      return await abortAndRefund(opCallerId, opsAdminClient, { success: false, error: "لقد استنفذت الحد الأقصى للعمليات في باقتك", layer: "Authorization" }, 403);
    }
    logStep("ops_consume", "ok", `allowed`);

    const payload = await req.json().catch(() => ({}));
    const { receiver, amount, pin, seamless_token, payload_msisdn } = payload;

    if (!receiver || !amount || !pin || !seamless_token) {
      logStep("validate", "fail", "missing fields");
      return await abortAndRefund(opCallerId, opsAdminClient, { success: false, error: "بيانات غير مكتملة — تأكد من إدخال الرقم والمبلغ وكلمة السر", layer: "Frontend" }, 400);
    }
    
    let msisdn = payload_msisdn || "";
    if (msisdn.startsWith("0")) msisdn = msisdn.slice(1);
    
    // 1. Get Access Token
    logStep("auth-voda", "pending", "requesting token");
    const tokenRes = await fetchWithTimeout(
      "https://mobile.vodafone.com.eg/auth/realms/vf-realm/protocol/openid-connect/token",
      {
        method: "POST",
        headers: {
          ...DEVICE,
          "CRP": "false",
          "seamlessToken": seamless_token,
          "firstTimeLogin": "false",
          "msisdn": msisdn,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "password",
          client_secret: "b86e30a8-ae29-467a-a71f-65c73f2ff5e3",
          client_id: "cash-app",
        }).toString(),
      }, 10
    );

    if (!tokenRes.ok) {
      const errTxt = await tokenRes.text();
      logStep("auth-voda", "fail", `http=${tokenRes.status}`, { raw: errTxt });
      return await abortAndRefund(opCallerId, opsAdminClient, { success: false, error: "فشل المصادقة مع فودافون كاش، تأكد من تشغيل بيانات فودافون", layer: "Vodafone", debugSteps }, 502);
    }
    
    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;
    if (!token) {
      logStep("auth-voda", "fail", "no token in response");
      return await abortAndRefund(opCallerId, opsAdminClient, { success: false, error: "فشل استخراج توكن المصادقة", layer: "Vodafone", debugSteps }, 502);
    }
    logStep("auth-voda", "ok", "got token");

    // 2. Get Receiver Details (GET)
    logStep("receiver-info", "pending", `getting info for ${receiver}`);
    const infoUrl = new URL("https://mobile.vodafone.com.eg/services/dxl/paymentmng/payment");
    infoUrl.searchParams.append("payer.id", String(msisdn));
    infoUrl.searchParams.append("$.paymentMethod.relatedParty.id", String(receiver));
    infoUrl.searchParams.append("$.amount.value", String(amount));
    infoUrl.searchParams.append("$.account.type", "Flat CashOut Promo");
    infoUrl.searchParams.append("@type", "CashMandate");

    const infoRes = await fetchWithTimeout(infoUrl.toString(), {
      method: "GET",
      headers: {
        ...DEVICE,
        "api-version": "v2",
        "msisdn": msisdn,
        "Authorization": `Bearer ${token}`,
        "X-Request-ID": "",
        "X-App-StackTrace": "onUiEvent triggered#onUiEvent triggered#onUiEvent triggered#onUiEvent triggered#onUiEvent triggered#onUiEvent triggered#onUiEvent triggered#onUiEvent triggered"
      }
    }, 10);

    let relatedId = receiver;
    let relatedName = "";

    if (infoRes.ok) {
      const infoData = await infoRes.json();
      if (infoData && infoData.length > 0 && infoData[0]?.paymentMethod?.relatedParty) {
        relatedId = infoData[0].paymentMethod.relatedParty.id || receiver;
        relatedName = infoData[0].paymentMethod.relatedParty.name || "";
        logStep("receiver-info", "ok", `found name=${relatedName}`);
      } else {
        logStep("receiver-info", "warn", "empty data returned, using fallback");
      }
    } else {
      const errTxt = await infoRes.text();
      logStep("receiver-info", "fail", `http=${infoRes.status}`, { raw: errTxt });
      // We don't fail hard here, we can still try to transfer.
    }

    // 3. Execute Transfer (POST)
    logStep("transfer", "pending", "executing transfer");
    const payloadTransfer = {
      amount: { value: String(amount) },
      authorizationCode: pin,
      characteristicsValueItem: [],
      payer: { name: "Consumer", "@referredType": "P2M-Merchant" },
      paymentItem: [ { item: { "@referredType": "CashWalletTransfer" } } ],
      paymentMethod: {
        relatedParty: {
          id: relatedId,
          name: relatedName,
          "@referredType": "OnUS",
          "@type": "receiver"
        }
      },
      "@type": "DigitalWallet"
    };

    const transferRes = await fetchWithTimeout("https://mobile.vodafone.com.eg/services/dxl/paymentmng/payment", {
      method: "POST",
      headers: {
        ...DEVICE,
        "api-version": "v2",
        "msisdn": msisdn,
        "Authorization": `Bearer ${token}`,
        "X-Request-ID": "",
        "X-App-StackTrace": "SendMoneyConfirmationScreen opened#onUiEvent triggered#Confirm Transfer button clicked to show Pin Screen#Pin Code entered#transferMoney started in Viewmodel#transferMoney started in UseCase#transferMoney started in Repository#transferMoney network service creation",
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify(payloadTransfer)
    }, 15);

    const txt = await transferRes.text();
    let data;
    try { data = JSON.parse(txt); } catch(e) {}

    const description = data?.description || data?.message || data?.error_description || "حدث خطأ غير معروف";
    
    // Check if success
    const isSuccess = transferRes.ok && (txt.includes("تم تحويل") || txt.includes("successfully") || data?.status === "completed" || data?.status === "Executed");

    if (isSuccess) {
      logStep("transfer", "ok", "transfer executed", { description });

      // Insert DB record
      const { error: dbErr } = await supabase.from("vcc_transfers").insert({
        user_id: user.id,
        receiver_number: receiver,
        amount: Number(amount),
        status: "completed",
        reference_number: data?.id || "",
        execution_time_ms: Date.now() - requestStartedAt
      });
      if (dbErr) logStep("db", "warn", dbErr.message);

      return json({ success: true, message: description, debugSteps });
    } else {
      logStep("transfer", "fail", `http=${transferRes.status}`, { description, raw: txt.slice(0, 200) });
      
      const { error: dbErr } = await supabase.from("vcc_transfers").insert({
        user_id: user.id,
        receiver_number: receiver,
        amount: Number(amount),
        status: "failed",
        failure_reason: description,
        execution_time_ms: Date.now() - requestStartedAt
      });

      return await abortAndRefund(opCallerId, opsAdminClient, { success: false, error: description, layer: "Vodafone", debugSteps }, 400);
    }

  } catch (err: any) {
    logStep("catch", "error", err.message);
    return await abortAndRefund(opCallerId, opsAdminClient, { success: false, error: "حدث خطأ غير متوقع في السيرفر", layer: "Server", debugSteps }, 500);
  }
});
