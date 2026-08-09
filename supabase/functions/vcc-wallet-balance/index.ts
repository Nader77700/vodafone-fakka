import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { zeroTrustCheck, CORS_HEADERS } from "../_shared/zero_trust.ts";

// ────────────────────────────────────────────────────
// ثوابت الجهاز — مطابقة لـ vcc-money-transfer
// ────────────────────────────────────────────────────
const DEVICE = {
  "User-Agent": "okhttp/4.12.0",
  "Connection": "close",
  "Accept": "application/json",
  "Accept-Encoding": "gzip",
  "x-agent-operatingsystem": "16",
  "clientId": "AnaVodafoneAndroid",
  "Accept-Language": "ar",
  "x-agent-device": "OPPO CPH2737",
  "x-agent-version": "2026.7.1",
  "x-agent-build": "1176",
  "digitalId": "",
  "device-id": "",
};

const CLIENT_ID = "cash-app";

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

// تنسيق تاريخ API: DD-MonthName-YY (كما في السكريبت)
function apiDate(date: Date): string {
  const months = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];
  const d = date.getDate().toString().padStart(2, "0");
  const m = months[date.getMonth()];
  const y = date.getFullYear().toString().slice(2);
  return `${d}-${m}-${y}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  console.log("[vcc-wallet-balance] invoked", new Date().toISOString());
  const debugSteps: any[] = [];
  const logStep = (step: string, status: string, detail: string, extra?: any) => {
    const msg = `[${step}] ${status.toUpperCase()} - ${detail}`;
    console.log(msg, extra || "");
    debugSteps.push({ step, status, detail, timestamp: new Date().toISOString(), ...extra });
  };

  try {
    // ────────────────────────
    // 0. Zero-Trust Auth
    // ────────────────────────
    const authRes = await zeroTrustCheck(req);
    if ("error" in authRes) {
      logStep("auth", "fail", authRes.error as string);
      return json({ success: false, error: authRes.error, debugSteps }, 200);
    }
    const user = authRes.user!;
    logStep("auth", "ok", `user=${user.id}`);

    // ────────────────────────
    // 1. Body Parsing
    // ────────────────────────
    let body: any = {};
    try { body = await req.json(); } catch { /* ok */ }

    const { action, pin, seamless_token, payload_msisdn } = body;

    if (!action || !["balance", "transactions"].includes(action)) {
      return json({ success: false, error: "action غير صالح. القيم المسموحة: balance أو transactions", debugSteps }, 200);
    }

    if (!pin) {
      return json({ success: false, error: "يجب إدخال PIN المحفظة", debugSteps }, 200);
    }

    logStep("body", "ok", `action=${action}`);

    // ────────────────────────
    // 2. CLIENT_SECRET من السيرفر
    // ────────────────────────
    const CLIENT_SECRET = Deno.env.get("VCC_CLIENT_SECRET") || "b86e30a8-ae29-467a-a71f-65c73f2ff5e3";

    // ────────────────────────
    // 3. Access Token (Seamless → Token)
    // ────────────────────────
    logStep("auth-voda", "pending", "getting access token");

    const seamless = seamless_token;
    const msisdn = payload_msisdn;

    if (!seamless || !msisdn) {
      logStep("auth-voda", "fail", "missing seamless token or msisdn");
      return json({ success: false, error: "تعذر التعرف على خط فودافون. تأكد من تشغيل بيانات فودافون.", debugSteps }, 200);
    }

    const formattedMsisdn = String(msisdn).padStart(11, "0");

    const tokenRes = await fetchWithTimeout(
      "https://mobile.vodafone.com.eg/auth/realms/vf-realm/protocol/openid-connect/token",
      {
        method: "POST",
        headers: {
          ...DEVICE,
          "Content-Type": "application/x-www-form-urlencoded",
          "CRP": "false",
          "seamlessToken": seamless,
          "firstTimeLogin": "false",
          "msisdn": formattedMsisdn,
          "api-host": "IdP",
        },
        body: new URLSearchParams({
          grant_type: "password",
          client_secret: CLIENT_SECRET,
          client_id: CLIENT_ID,
        }).toString(),
      },
      15
    );

    if (!tokenRes.ok) {
      const errTxt = await tokenRes.text();
      logStep("auth-voda", "fail", `http=${tokenRes.status}`, { raw: errTxt.slice(0, 300) });
      return json({ success: false, error: "فشل تسجيل الدخول إلى Vodafone Cash", debugSteps }, 200);
    }

    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;
    if (!token) {
      logStep("auth-voda", "fail", "no access_token");
      return json({ success: false, error: "فشل استخراج توكن المصادقة", debugSteps }, 200);
    }
    logStep("auth-voda", "ok", "token acquired");

    // Headers المشتركة
    const baseHeaders = {
      ...DEVICE,
      "api-version": "v2",
      "msisdn": formattedMsisdn,
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
    };

    // ────────────────────────
    // 4A. معرفة الرصيد
    // ────────────────────────
    if (action === "balance") {
      logStep("balance", "pending", "fetching wallet balance");

      const balUrl = new URL(
        `https://mobile.vodafone.com.eg/services/dxl/pm/paymentMethod/${formattedMsisdn}`
      );
      balUrl.searchParams.append("@type", "DigitalWallet");
      balUrl.searchParams.append("@referredType", "CashBalance");

      const balRes = await fetchWithTimeout(balUrl.toString(), {
        method: "GET",
        headers: {
          ...baseHeaders,
          "pinCode": pin,
        },
      }, 15);

      const balTxt = await balRes.text();
      let balData: any = null;
      try { balData = JSON.parse(balTxt); } catch { /* ok */ }

      if (!balRes.ok) {
        logStep("balance", "fail", `http=${balRes.status}`, { raw: balTxt.slice(0, 300) });
        if (balRes.status === 401 || balRes.status === 403) {
          return json({ success: false, error: "PIN غير صحيح أو انتهت صلاحية الجلسة", debugSteps }, 200);
        }
        return json({ success: false, error: "تعذر الحصول على الرصيد. حاول مرة أخرى.", debugSteps }, 200);
      }

      // استخراج balance من characteristics
      let balance: string | null = null;
      const items = Array.isArray(balData) ? balData : (balData?.characteristics || []);
      for (const item of items) {
        if (item?.name === "balance") {
          balance = item?.value ?? null;
          break;
        }
      }
      // بحث أعمق لو مش مصفوفة مباشرة
      if (balance === null && Array.isArray(balData)) {
        for (const entry of balData) {
          for (const char of (entry?.characteristics || [])) {
            if (char?.name === "balance") { balance = char?.value ?? null; break; }
          }
          if (balance !== null) break;
        }
      }

      if (balance === null) {
        logStep("balance", "warn", "balance characteristic not found", { raw: balTxt.slice(0, 300) });
        return json({ success: false, error: "تعذر استخراج الرصيد من الرد. قد يكون الـ PIN خاطئاً أو الخدمة غير متاحة.", debugSteps }, 200);
      }

      logStep("balance", "ok", `balance=${balance}`);

      // تسجيل metadata فقط (بدون PIN أو Token)
      const sbAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      await sbAdmin.from("vcc_wallet_queries").insert({
        user_id: user.id,
        msisdn: formattedMsisdn,
        action: "balance",
        status: "success",
        created_at: new Date().toISOString(),
      }).then(() => {});

      return json({
        success: true,
        action: "balance",
        msisdn: formattedMsisdn,
        balance,
        queried_at: new Date().toISOString(),
        debugSteps,
      }, 200);
    }

    // ────────────────────────
    // 4B. سجل العمليات
    // ────────────────────────
    if (action === "transactions") {
      const { start_date, end_date } = body;

      if (!start_date || !end_date) {
        return json({ success: false, error: "يجب تحديد تاريخ البداية والنهاية", debugSteps }, 200);
      }

      // تحويل ISO strings إلى Date
      const startDt = new Date(start_date);
      const endDt   = new Date(end_date);

      if (isNaN(startDt.getTime()) || isNaN(endDt.getTime())) {
        return json({ success: false, error: "صيغة التاريخ غير صحيحة", debugSteps }, 200);
      }
      if (startDt > endDt) {
        return json({ success: false, error: "تاريخ البداية يجب أن يكون قبل تاريخ النهاية", debugSteps }, 200);
      }

      logStep("transactions", "pending", `from=${apiDate(startDt)} to=${apiDate(endDt)}`);

      const allTx: any[] = [];
      let offset = 0;
      const limit = 20;
      let paginationError = false;

      while (true) {
        const txUrl = new URL("https://mobile.vodafone.com.eg/services/dxl/paymentmng/payment");
        txUrl.searchParams.append("$.paymentMethod.id", "");
        txUrl.searchParams.append("offset", String(offset));
        txUrl.searchParams.append("$.paymentMethod.validFor.endDateTime", apiDate(endDt));
        txUrl.searchParams.append("@type", "CashTRXHistory");
        txUrl.searchParams.append("limit", String(limit));
        txUrl.searchParams.append("$.paymentMethod.validFor.startDateTime", apiDate(startDt));
        txUrl.searchParams.append("$.status", "200");
        txUrl.searchParams.append("$.paymentMethod.relatedParty.id", "");
        txUrl.searchParams.append('$.paymentMethod.characteristicsValueItem.characteristicsValue[name="service"]', "");

        let txRes: Response;
        try {
          txRes = await fetchWithTimeout(txUrl.toString(), {
            method: "GET",
            headers: {
              ...baseHeaders,
              "pinCode": pin,
            },
          }, 20);
        } catch (e: any) {
          logStep("transactions-page", "fail", `offset=${offset} timeout/network: ${e.message}`);
          paginationError = true;
          break;
        }

        if (!txRes.ok) {
          const errTxt = await txRes.text();
          logStep("transactions-page", "fail", `offset=${offset} http=${txRes.status}`, { raw: errTxt.slice(0, 200) });
          if (txRes.status === 401 || txRes.status === 403) {
            return json({ success: false, error: "PIN غير صحيح أو انتهت صلاحية الجلسة", debugSteps }, 200);
          }
          paginationError = true;
          break;
        }

        let pageData: any;
        const pageTxt = await txRes.text();
        try { pageData = JSON.parse(pageTxt); } catch {
          logStep("transactions-page", "fail", `offset=${offset} JSON parse error`);
          paginationError = true;
          break;
        }

        if (!Array.isArray(pageData)) {
          logStep("transactions-page", "warn", `offset=${offset} non-array response`);
          break;
        }
        if (pageData.length === 0) break;

        allTx.push(...pageData);
        logStep("transactions-page", "ok", `offset=${offset} count=${pageData.length}`);

        if (pageData.length < limit) break;
        offset += limit;
      }

      logStep("transactions", paginationError ? "warn" : "ok", `total=${allTx.length} paginationError=${paginationError}`);

      // تسجيل metadata فقط
      const sbAdmin2 = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      await sbAdmin2.from("vcc_wallet_queries").insert({
        user_id: user.id,
        msisdn: formattedMsisdn,
        action: "transactions",
        status: paginationError ? "partial" : "success",
        tx_count: allTx.length,
        created_at: new Date().toISOString(),
      }).then(() => {});

      return json({
        success: true,
        action: "transactions",
        msisdn: formattedMsisdn,
        transactions: allTx,
        total: allTx.length,
        pagination_error: paginationError,
        period: { start: apiDate(startDt), end: apiDate(endDt) },
        queried_at: new Date().toISOString(),
        debugSteps,
      }, 200);
    }

    return json({ success: false, error: "action غير معروف", debugSteps }, 200);

  } catch (e: any) {
    console.error("[vcc-wallet-balance] unhandled error:", e);
    return json({ success: false, error: "خطأ داخلي في الخادم", detail: e.message }, 200);
  }
});
