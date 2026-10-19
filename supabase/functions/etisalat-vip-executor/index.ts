import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const BASE_URL = "https://mab.etisalat.com.eg:11003";
const DEVICE_ID = "b61c90c58c612671";

const BASE_HEADERS: Record<string, string> = {
  "applicationVersion": "2",
  "applicationName": "MAB",
  "Accept": "text/xml",
  "Language": "ar",
  "APP-BuildNumber": "10744",
  "APP-Version": "36.1.0",
  "OS-Type": "Android",
  "OS-Version": "16",
  "APP-STORE": "GOOGLE",
  "C-Type": "WIFI",
  "Is-Corporate": "false",
  "User-Agent": "okhttp/5.0.0-alpha.11",
  "Content-Type": "text/xml; charset=UTF-8",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sha256Hex(str: string): Promise<string> {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function generateSignatures(urlPath: string, bodyXml: string) {
  const headerSig = await sha256Hex(`${urlPath}${DEVICE_ID}`);
  const urlSig = await sha256Hex(urlPath);
  const bodySig = bodyXml ? await sha256Hex(bodyXml) : "";
  return { headerSig, urlSig, bodySig };
}

function decodeStoredPassword(pw: string): string {
  if (!pw) return "";
  try {
    const decoded = atob(pw);
    if (btoa(decoded) === pw) return decoded;
  } catch {
    // Not valid base64, return as is
  }
  return pw;
}

class EtisalatEngine {
  private authToken: string | null = null;
  public currentDial: string | null = null;
  public ownerDial: string | null = null;
  public logs: Array<{ time: string; level: 'info' | 'success' | 'warn' | 'error'; message: string }> = [];

  private log(message: string, level: 'info' | 'success' | 'warn' | 'error' = 'info') {
    const time = new Date().toLocaleTimeString('ar-EG', { hour12: false });
    this.logs.push({ time, level, message });
    console.log(`[${time}] ${message}`);
  }

  async login(email: string, rawPassword: string, isOwner = false): Promise<boolean> {
    const cleanPw = decodeStoredPassword(rawPassword);
    const masked = email.includes("@") ? `${email.substring(0, 3)}***@${email.split("@")[1]}` : email;
    this.log(`[*] جاري تسجيل الدخول للحساب: ${masked} ...`, "info");

    const authB64 = btoa(`${email}:${cleanPw}`);
    const loginXml = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><loginRequest><deviceId>${DEVICE_ID}</deviceId><firstLoginAttempt>true</firstLoginAttempt><modelType>CPH2737</modelType><osVersion>16</osVersion><platform>Android</platform><udid>${DEVICE_ID}</udid></loginRequest>`;
    const urlPath = "/Saytar/rest/authentication/loginWithPlan";

    const { headerSig, urlSig, bodySig } = await generateSignatures(urlPath, loginXml);
    const headers = {
      ...BASE_HEADERS,
      "Authorization": `Basic ${authB64}`,
      "headerSignature": headerSig,
      "urlSignature": urlSig,
      "bodySignature": bodySig,
    };

    try {
      const res = await fetch(`${BASE_URL}${urlPath}`, {
        method: "POST",
        headers,
        body: loginXml,
      });

      const text = await res.text();
      if (res.status === 200 && text.includes("<status>true</status>")) {
        const auth = res.headers.get("auth");
        if (auth) {
          this.authToken = auth;
          const tokenPayload = auth.split(".")[1];
          const padded = tokenPayload + "=".repeat((4 - (tokenPayload.length % 4)) % 4);
          const decoded = JSON.parse(atob(padded));
          this.currentDial = decoded.selectedDial || null;
          if (isOwner) {
            this.ownerDial = this.currentDial;
          }
          this.log(`[+] تم الدخول بنجاح! (الرقم: ${this.currentDial})`, "success");
          return true;
        }
      }
      this.log(`[-] فشل تسجيل الدخول للحساب (${masked}).`, "error");
      return false;
    } catch (err: any) {
      this.log(`[-] خطأ اتصال أثناء تسجيل الدخول: ${err?.message || err}`, "error");
      return false;
    }
  }

  async getStatusAndChild(): Promise<{
    planId: string;
    remainingMix: number;
    childNumber: string | null;
  }> {
    if (!this.currentDial || !this.authToken) {
      return { planId: "غير معروف", remainingMix: 0, childNumber: null };
    }

    const xmlBody = `<dialAndLanguageRequest><segmentId>XRP</segmentId><subscriberNumber>${this.currentDial}</subscriberNumber><language>1</language><shortCode>ALFTL</shortCode></dialAndLanguageRequest>`;
    const encodedReq = encodeURIComponent(xmlBody);
    const urlPath = `/Saytar/rest/servicemanagement/getGenericConsumptionsV2?requestParam=${encodedReq}`;

    const { headerSig, urlSig } = await generateSignatures(urlPath, "");
    const headers = {
      ...BASE_HEADERS,
      "auth": `Bearer ${this.authToken}`,
      "headerSignature": headerSig,
      "urlSignature": urlSig,
    };

    try {
      const res = await fetch(`${BASE_URL}${urlPath}`, {
        method: "GET",
        headers,
      });

      if (res.status === 200) {
        const text = await res.text();
        const planMatch = text.match(/<productId>([^<]+)<\/productId>/);
        const planId = planMatch ? planMatch[1] : "غير معروف";

        const mixMatch = text.match(/<remainingValue>([^<]+)<\/remainingValue>/);
        const remainingMix = mixMatch ? parseInt(mixMatch[1], 10) || 0 : 0;

        let childNumber: string | null = null;
        const fafMatches = Array.from(text.matchAll(/<value>([^<]+)<\/value>/g));
        for (const m of fafMatches) {
          const num = m[1].trim();
          if (num && num !== this.currentDial) {
            childNumber = num;
            break;
          }
        }

        return { planId, remainingMix, childNumber };
      }
    } catch (err: any) {
      this.log(`[-] خطأ أثناء فحص الباقة: ${err?.message || err}`, "warn");
    }

    return { planId: "غير معروف", remainingMix: 0, childNumber: null };
  }

  async changePlan(planName: string, planId: string): Promise<boolean> {
    this.log(`[*] جاري إرسال أمر تغيير النظام إلى: ${planName} ...`, "info");
    const xmlBody = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><migrateRequest><addonName></addonName><oMSRatePlan>true</oMSRatePlan><operation>FULL_MIGRATE</operation><productName>${planName}</productName><ratePlanID>${planId}</ratePlanID><subscriberNumber>${this.currentDial}</subscriberNumber></migrateRequest>`;
    const urlPath = "/Saytar/rest/HekayaPartial/migrate";

    const { headerSig, urlSig, bodySig } = await generateSignatures(urlPath, xmlBody);
    const headers = {
      ...BASE_HEADERS,
      "auth": `Bearer ${this.authToken}`,
      "headerSignature": headerSig,
      "urlSignature": urlSig,
      "bodySignature": bodySig,
    };

    try {
      const res = await fetch(`${BASE_URL}${urlPath}`, {
        method: "POST",
        headers,
        body: xmlBody,
      });
      const text = await res.text();
      const ok = res.status === 200 && text.includes("<status>true</status>");
      if (ok) {
        this.log(`[+] تم إرسال أمر ترحيل النظام بنجاح إلى (${planName})`, "success");
      } else {
        this.log(`[-] السيرفر رفض ترحيل النظام إلى (${planName})`, "error");
      }
      return ok;
    } catch (err: any) {
      this.log(`[-] خطأ أثناء تغيير النظام: ${err?.message || err}`, "error");
      return false;
    }
  }

  async renewBundle(planName: string, amount: string): Promise<boolean> {
    this.log(`[*] جاري تجديد باقة ${planName} بمبلغ ${amount} ج ...`, "info");
    const xmlBody = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><generalSubmitOrderRequest><msisdn>${this.currentDial}</msisdn><operation>FULL_RENEW</operation><parameters /><paymentOptions><paymentOption><amount>${amount}</amount><optionID>BALANCE</optionID></paymentOption></paymentOptions><productName>${planName}</productName><requestId>ALFA_PAYMENT_OPTIONS</requestId></generalSubmitOrderRequest>`;
    const urlPath = "/Saytar/rest/General/submitOrder";

    const { headerSig, urlSig, bodySig } = await generateSignatures(urlPath, xmlBody);
    const headers = {
      ...BASE_HEADERS,
      "auth": `Bearer ${this.authToken}`,
      "headerSignature": headerSig,
      "urlSignature": urlSig,
      "bodySignature": bodySig,
    };

    try {
      const res = await fetch(`${BASE_URL}${urlPath}`, {
        method: "POST",
        headers,
        body: xmlBody,
      });
      const text = await res.text();
      const ok = res.status === 200 && text.includes("<status>true</status>");
      if (ok) {
        this.log(`[+] تم تجديد الباقة بنجاح (${amount} ج)!`, "success");
      } else {
        this.log(`[-] فشل تجديد الباقة من الخادم.`, "error");
      }
      return ok;
    } catch (err: any) {
      this.log(`[-] خطأ أثناء طلب التجديد: ${err?.message || err}`, "error");
      return false;
    }
  }

  async transferMix(receiverNumber: string, quotaAmount: number, productName: string): Promise<boolean> {
    const quota = Math.floor(quotaAmount);
    this.log(`[*] جاري تحويل ${quota.toLocaleString('ar-EG')} ميكس إلى (${receiverNumber}) ...`, "info");
    const xmlBody = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><newFamilyTransferRequest><distribute>false</distribute><msisdn>${this.currentDial}</msisdn><productName>${productName}</productName><quota>${quota}</quota><receiverMsisdn>${receiverNumber}</receiverMsisdn><senderMsisdn>${this.currentDial}</senderMsisdn><type>UNITS</type></newFamilyTransferRequest>`;
    const urlPath = "/Saytar/rest/services/newTransfer/v2";

    const { headerSig, urlSig, bodySig } = await generateSignatures(urlPath, xmlBody);
    const headers = {
      ...BASE_HEADERS,
      "auth": `Bearer ${this.authToken}`,
      "headerSignature": headerSig,
      "urlSignature": urlSig,
      "bodySignature": bodySig,
    };

    try {
      const res = await fetch(`${BASE_URL}${urlPath}`, {
        method: "POST",
        headers,
        body: xmlBody,
      });
      const text = await res.text();
      const ok = res.status === 200 && text.includes("<status>true</status>");
      if (ok) {
        this.log(`[+] تم تحويل ${quota.toLocaleString('ar-EG')} ميكس بنجاح!`, "success");
      } else {
        this.log(`[-] فشل تحويل الميكسات إلى (${receiverNumber}).`, "error");
      }
      return ok;
    } catch (err: any) {
      this.log(`[-] خطأ أثناء تحويل الميكسات: ${err?.message || err}`, "error");
      return false;
    }
  }

  async addChild(childNumber: string, planName: string): Promise<boolean> {
    const childIntl = childNumber.startsWith("0") ? "20" + childNumber.slice(1) : childNumber;
    this.log(`[*] جاري إرسال دعوة لإضافة الرقم ${childIntl} للعائلة ...`, "info");
    const xmlBody = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><addChildRequest><childNumber>${childIntl}</childNumber><childPercentage>0.10</childPercentage><productId>${planName}</productId><subscriberNumber>${this.currentDial}</subscriberNumber></addChildRequest>`;
    const urlPath = "/Saytar/rest/services/addChild";

    const { headerSig, urlSig, bodySig } = await generateSignatures(urlPath, xmlBody);
    const headers = {
      ...BASE_HEADERS,
      "auth": `Bearer ${this.authToken}`,
      "headerSignature": headerSig,
      "urlSignature": urlSig,
      "bodySignature": bodySig,
    };

    try {
      const res = await fetch(`${BASE_URL}${urlPath}`, {
        method: "POST",
        headers,
        body: xmlBody,
      });
      const text = await res.text();
      const ok = res.status === 200 && text.includes("<status>true</status>");
      if (ok) {
        this.log(`[+] تم إرسال دعوة إضافة الفرد (${childIntl}) بنجاح!`, "success");
      } else {
        this.log(`[-] فشل إرسال دعوة إضافة الفرد. تأكد من صحة الرقم وأهليته.`, "error");
      }
      return ok;
    } catch (err: any) {
      this.log(`[-] خطأ أثناء دعوة الفرد: ${err?.message || err}`, "error");
      return false;
    }
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const { action, session_id } = body;

    if (!session_id) {
      return new Response(JSON.stringify({ success: false, error: "Missing session_id" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // 1. Fetch Session from Supabase
    const { data: session, error: sessErr } = await supabase
      .from("vip_sessions")
      .select("*")
      .eq("id", session_id)
      .single();

    if (sessErr || !session) {
      return new Response(JSON.stringify({ success: false, error: "Session not found" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const ownerEmail = body.owner_email || session.owner_email;
    const ownerPass = body.owner_password || session.owner_password_enc;
    const childEmail = body.individual_email || session.individual_email;
    const childPass = body.individual_password || session.individual_password_enc;

    if (!ownerEmail || !ownerPass) {
      return new Response(JSON.stringify({
        success: false,
        error: "بيانات اعتماد حساب الأونر (البريد وكلمة المرور) غير متوفرة في هذه الجلسة.",
      }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const engine = new EtisalatEngine();

    // ── Action: check_status ──────────────────────────────────
    if (action === "check_status") {
      const loginOk = await engine.login(ownerEmail, ownerPass, true);
      if (!loginOk) {
        return new Response(JSON.stringify({
          success: false,
          error: "فشل تسجيل الدخول لحساب الأونر. تأكد من صحة البريد وكلمة المرور.",
          logs: engine.logs,
        }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const status = await engine.getStatusAndChild();
      const hasChild = !!status.childNumber;
      engine.log(`[+] فحص الأونر: النظام (${status.planId}) | الميكسات: ${status.remainingMix.toLocaleString('ar-EG')}`, "success");
      if (hasChild) {
        engine.log(`[+] تم اكتشاف فرد مربوط بالعائلة: ${status.childNumber}`, "success");
      } else {
        engine.log(`[!] لا يوجد فرد مربوط بالعائلة حالياً.`, "warn");
      }

      // Check child account balance if child credentials exist
      let childBalance: number | null = null;
      if (childEmail && childPass) {
        const childEngine = new EtisalatEngine();
        if (await childEngine.login(childEmail, childPass, false)) {
          const childStatus = await childEngine.getStatusAndChild();
          childBalance = childStatus.remainingMix;
          engine.log(`[+] حالة الفرد: الميكسات لديه = ${childBalance.toLocaleString('ar-EG')}`, "info");
        }
      }

      // Update Supabase
      const updateData: Record<string, any> = {
        owner_account_identifier: engine.ownerDial,
        owner_account_status: "connected",
        owner_current_plan: status.planId,
        owner_mix_balance: status.remainingMix,
        last_owner_refresh_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (status.childNumber) {
        updateData.individual_account_identifier = status.childNumber;
        updateData.individual_account_status = "connected";
        updateData.relationship_verified = true;
        updateData.relationship_status = "verified";
      } else {
        updateData.relationship_verified = false;
        updateData.relationship_status = "unverified";
      }

      if (childBalance !== null) {
        updateData.individual_mix_balance = childBalance;
        updateData.last_individual_refresh_at = new Date().toISOString();
      }

      await supabase.from("vip_sessions").update(updateData).eq("id", session_id);

      return new Response(JSON.stringify({
        success: true,
        data: {
          owner_dial: engine.ownerDial,
          current_plan: status.planId,
          remaining_mix: status.remainingMix,
          child_number: status.childNumber,
          has_child: hasChild,
          child_mix_balance: childBalance,
        },
        logs: engine.logs,
      }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── Action: add_child ─────────────────────────────────────
    if (action === "add_child") {
      const childNumber = body.child_number;
      if (!childNumber) {
        return new Response(JSON.stringify({ success: false, error: "يرجى تحديد رقم هاتف الفرد المراد إضافته." }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      if (!await engine.login(ownerEmail, ownerPass, true)) {
        return new Response(JSON.stringify({ success: false, error: "فشل دخول الأونر.", logs: engine.logs }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const status = await engine.getStatusAndChild();
      const planName = status.planId.includes("Parent_7") || status.planId.includes("Parent_6")
        ? status.planId
        : "Hekaya_XRP_MIX_Parent_7";

      const inviteOk = await engine.addChild(childNumber, planName);
      if (!inviteOk) {
        return new Response(JSON.stringify({ success: false, error: "فشل إرسال الدعوة من الأونر.", logs: engine.logs }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      // Auto Confirm by logging into child account
      if (childEmail && childPass) {
        engine.log("[*] جاري تسجيل الدخول لحساب الفرد لتأكيد الدعوة آلياً...", "info");
        await sleep(2000);
        const childEngine = new EtisalatEngine();
        if (await childEngine.login(childEmail, childPass, false)) {
          engine.log("[+] تم تسجيل دخول الفرد وتأكيد الدعوة بنجاح!", "success");
          await sleep(3000);
        } else {
          engine.log("[-] تعذر تسجيل دخول الفرد آلياً. يمكن قبول الدعوة يدوياً من تطبيق ماي اتصالات.", "warn");
        }
      }

      // Re-check owner to verify child
      const recheck = await engine.getStatusAndChild();
      const confirmedChild = recheck.childNumber || childNumber;

      await supabase.from("vip_sessions").update({
        individual_account_identifier: confirmedChild,
        individual_account_status: "connected",
        relationship_verified: true,
        relationship_status: "verified",
        updated_at: new Date().toISOString(),
      }).eq("id", session_id);

      return new Response(JSON.stringify({
        success: true,
        message: `تمت إضافة وتأكيد الفرد (${confirmedChild}) بنجاح!`,
        child_number: confirmedChild,
        logs: engine.logs,
      }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── Action: renew_bundle ──────────────────────────────────
    if (action === "renew_bundle") {
      if (!await engine.login(ownerEmail, ownerPass, true)) {
        return new Response(JSON.stringify({ success: false, error: "فشل دخول الأونر.", logs: engine.logs }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const status = await engine.getStatusAndChild();
      const isSeven = status.planId.includes("7");
      const planName = isSeven ? "Hekaya_XRP_MIX_Parent_7" : "Hekaya_XRP_MIX_Parent_6";
      const cost = isSeven ? "270" : "180";

      const renewOk = await engine.renewBundle(planName, cost);
      if (!renewOk) {
        return new Response(JSON.stringify({ success: false, error: "فشل تجديد الباقة.", logs: engine.logs }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      await sleep(3000);
      const postRenew = await engine.getStatusAndChild();
      await supabase.from("vip_sessions").update({
        owner_mix_balance: postRenew.remainingMix,
        updated_at: new Date().toISOString(),
      }).eq("id", session_id);

      return new Response(JSON.stringify({
        success: true,
        message: `تم تجديد باقة ${planName} بمبلغ ${cost} ج بنجاح!`,
        post_renew_balance: postRenew.remainingMix,
        logs: engine.logs,
      }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── Action: transfer_to_child ─────────────────────────────
    if (action === "transfer_to_child") {
      if (!await engine.login(ownerEmail, ownerPass, true)) {
        return new Response(JSON.stringify({ success: false, error: "فشل دخول الأونر.", logs: engine.logs }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const status = await engine.getStatusAndChild();
      if (!status.childNumber) {
        return new Response(JSON.stringify({ success: false, error: "لا يوجد فرد مربوط بالعائلة لتحويل الميكسات له.", logs: engine.logs }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const amountToTransfer = body.amount ? parseInt(body.amount, 10) : status.remainingMix;
      if (amountToTransfer <= 0) {
        return new Response(JSON.stringify({ success: false, error: "لا يوجد رصيد ميكسات كافٍ للتحويل.", logs: engine.logs }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const planName = status.planId.includes("7") ? "Hekaya_XRP_MIX_Parent_7" : "Hekaya_XRP_MIX_Parent_6";
      const transferOk = await engine.transferMix(status.childNumber, amountToTransfer, planName);

      if (!transferOk) {
        return new Response(JSON.stringify({ success: false, error: "فشل تحويل الميكسات.", logs: engine.logs }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      await sleep(2000);
      const postStatus = await engine.getStatusAndChild();
      await supabase.from("vip_sessions").update({
        owner_mix_balance: postStatus.remainingMix,
        updated_at: new Date().toISOString(),
      }).eq("id", session_id);

      return new Response(JSON.stringify({
        success: true,
        message: `تم تحويل ${amountToTransfer.toLocaleString('ar-EG')} ميكس إلى الفرد بنجاح.`,
        remaining_owner_mix: postStatus.remainingMix,
        logs: engine.logs,
      }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── Action: change_plan ───────────────────────────────────
    if (action === "change_plan") {
      if (!await engine.login(ownerEmail, ownerPass, true)) {
        return new Response(JSON.stringify({ success: false, error: "فشل دخول الأونر.", logs: engine.logs }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const status = await engine.getStatusAndChild();
      const targetPlan = body.target_plan === "6" || status.planId.includes("7")
        ? { name: "Hekaya_XRP_MIX_Parent_6", id: "951" }
        : { name: "Hekaya_XRP_MIX_Parent_7", id: "" };

      const changeOk = await engine.changePlan(targetPlan.name, targetPlan.id);
      if (!changeOk) {
        return new Response(JSON.stringify({ success: false, error: "فشل إرسال أمر ترحيل النظام.", logs: engine.logs }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      engine.log("[*] في انتظار نزول الميكسات على السيرفر (فحص كل ثانيتين)...", "info");
      let pollCount = 0;
      let finalPlan = status.planId;
      let finalMix = status.remainingMix;

      while (pollCount < 15) {
        await sleep(2000);
        pollCount++;
        const check = await engine.getStatusAndChild();
        if (check.planId && check.planId.includes(targetPlan.name) && check.remainingMix > 0) {
          engine.log(`[+] السيرفر استجاب بنجاح! (النظام: ${check.planId} | الميكسات: ${check.remainingMix.toLocaleString('ar-EG')})`, "success");
          finalPlan = check.planId;
          finalMix = check.remainingMix;
          break;
        }
      }

      await supabase.from("vip_sessions").update({
        owner_current_plan: finalPlan,
        owner_mix_balance: finalMix,
        updated_at: new Date().toISOString(),
      }).eq("id", session_id);

      return new Response(JSON.stringify({
        success: true,
        message: `تم ترحيل النظام إلى ${finalPlan} بنجاح!`,
        current_plan: finalPlan,
        remaining_mix: finalMix,
        logs: engine.logs,
      }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── Action: return_child_mixes ────────────────────────────
    if (action === "return_child_mixes") {
      if (!childEmail || !childPass) {
        return new Response(JSON.stringify({ success: false, error: "بيانات اعتماد حساب الفرد غير متوفرة." }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      if (!await engine.login(ownerEmail, ownerPass, true)) {
        return new Response(JSON.stringify({ success: false, error: "فشل دخول الأونر.", logs: engine.logs }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
      const ownerDial = engine.ownerDial;

      const childEngine = new EtisalatEngine();
      childEngine.logs = engine.logs;
      if (!await childEngine.login(childEmail, childPass, false)) {
        return new Response(JSON.stringify({ success: false, error: "فشل تسجيل الدخول لحساب الفرد.", logs: childEngine.logs }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const childStatus = await childEngine.getStatusAndChild();
      if (childStatus.remainingMix <= 0) {
        return new Response(JSON.stringify({
          success: true,
          message: "رصيد الفرد الحالي 0 ميكس، لا يوجد ما يمكن استرجاعه.",
          child_mix: 0,
          logs: childEngine.logs,
        }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const returnOk = await childEngine.transferMix(ownerDial!, childStatus.remainingMix, "Hekaya_XRP_MIX_Child_1");
      if (!returnOk) {
        return new Response(JSON.stringify({ success: false, error: "فشل تحويل ميكسات الفرد للأونر.", logs: childEngine.logs }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      await sleep(2000);
      const ownerFinalEngine = new EtisalatEngine();
      ownerFinalEngine.logs = childEngine.logs;
      await ownerFinalEngine.login(ownerEmail, ownerPass, true);
      const finalStatus = await ownerFinalEngine.getStatusAndChild();
      ownerFinalEngine.log(`[+] رجعنا للأونر | رصيده الآن: ${finalStatus.remainingMix.toLocaleString('ar-EG')} ميكس`, "success");

      await supabase.from("vip_sessions").update({
        owner_mix_balance: finalStatus.remainingMix,
        individual_mix_balance: 0,
        updated_at: new Date().toISOString(),
      }).eq("id", session_id);

      return new Response(JSON.stringify({
        success: true,
        message: `تم استرجاع ${childStatus.remainingMix.toLocaleString('ar-EG')} ميكس للأونر بنجاح!`,
        owner_final_mix: finalStatus.remainingMix,
        logs: ownerFinalEngine.logs,
      }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── Action: run_single_cycle (Exact Script 8-step Auto Cycle) ──
    if (action === "run_single_cycle") {
      const cycleNumber = (session.current_cycle || 0) + 1;
      const startedAt = new Date().toISOString();
      engine.log(`==================================================`, "info");
      engine.log(`--- [الدورة رقم ${cycleNumber} - الجلسة: ${session.session_name}] ---`, "info");

      // 1. Login owner
      if (!await engine.login(ownerEmail, ownerPass, true)) {
        return new Response(JSON.stringify({ success: false, error: "تعذر تسجيل دخول الأونر.", logs: engine.logs }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      // 2. Status & child check
      const initialStatus = await engine.getStatusAndChild();
      engine.log(`[+] حالة الأونر: ${initialStatus.planId} | الميكسات: ${initialStatus.remainingMix.toLocaleString('ar-EG')}`, "info");

      if (!initialStatus.childNumber) {
        engine.log(`[-] لا يوجد فرد مضاف بالعائلة! يجب إضافة فرد أولاً.`, "error");
        return new Response(JSON.stringify({
          success: false,
          error: "لا يوجد فرد مضاف بالعائلة. يرجى استخدام بطاقة إضافة الفرد أولاً.",
          logs: engine.logs,
        }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const targetMix = session.target_mix_balance || 50000;
      if (initialStatus.remainingMix >= targetMix) {
        engine.log(`[🎉] تم الوصول للهدف: ${initialStatus.remainingMix.toLocaleString('ar-EG')} ميكس!`, "success");
        return new Response(JSON.stringify({
          success: true,
          target_reached: true,
          final_mix: initialStatus.remainingMix,
          logs: engine.logs,
        }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      let ownerPlanPre = initialStatus.planId;
      const isSeven = ownerPlanPre.includes("7") || ownerPlanPre.includes("270");
      const isSix = ownerPlanPre.includes("6") || ownerPlanPre.includes("180") || ownerPlanPre.includes("951");

      // Auto-migrate non-matching plans (e.g., 240 or other plans) to Parent 7 (270)
      if (!isSeven && !isSix) {
        engine.log(`[!] النظام الحالي (${ownerPlanPre}) غير متوافق (المطلوب Parent 7 بـ 270ج أو Parent 6 بـ 180ج).`, "warn");
        engine.log(`[*] جاري الترحيل التلقائي إلى Parent 7 (270ج)...`, "info");
        const migOk = await engine.changePlan("Hekaya_XRP_MIX_Parent_7", "");
        if (!migOk) {
          return new Response(JSON.stringify({
            success: false,
            error: `فشل التحويل التلقائي للنظام إلى 270 (النظام الحالي: ${ownerPlanPre}).`,
            logs: engine.logs,
          }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
        }
        await sleep(3000);
        const recheck = await engine.getStatusAndChild();
        ownerPlanPre = recheck.planId;
        engine.log(`[+] تم الترحيل التلقائي بنجاح إلى: ${ownerPlanPre}`, "success");
      }

      const ownerPlanName = ownerPlanPre.includes("6") ? "Hekaya_XRP_MIX_Parent_6" : "Hekaya_XRP_MIX_Parent_7";
      const renewCost = ownerPlanPre.includes("6") ? "180" : "270";

      // 3. Renew bundle
      if (!await engine.renewBundle(ownerPlanName, renewCost)) {
        engine.log(`[-] فشل التجديد. سيتم المحاولة لاحقاً.`, "error");
        return new Response(JSON.stringify({ success: false, error: "فشل تجديد الباقة.", logs: engine.logs }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      await sleep(3000);
      const postRenew = await engine.getStatusAndChild();
      const ownerPostRenewal = postRenew.remainingMix;

      // 4. Transfer mixes to child
      let transferredToChild = 0;
      if (ownerPostRenewal > 0) {
        if (await engine.transferMix(initialStatus.childNumber, ownerPostRenewal, ownerPlanName)) {
          transferredToChild = ownerPostRenewal;
        }
      }

      // 5. Change Plan
      const targetPlan = ownerPlanPre.includes("7")
        ? { name: "Hekaya_XRP_MIX_Parent_6", id: "951" }
        : { name: "Hekaya_XRP_MIX_Parent_7", id: "" };
      await engine.changePlan(targetPlan.name, targetPlan.id);

      // 6. Polling: strict 2s delay
      engine.log(`[*] في انتظار نزول الميكسات على السيرفر (فحص كل ثانيتين)...`, "info");
      let pollCount = 0;
      let postMigratePlan = targetPlan.name;
      while (pollCount < 20) {
        await sleep(2000);
        pollCount++;
        const currentCheck = await engine.getStatusAndChild();
        if (currentCheck.planId && currentCheck.planId.includes(targetPlan.name) && currentCheck.remainingMix > 0) {
          engine.log(`[+] السيرفر استجاب! (النظام: ${currentCheck.planId} | الميكسات: ${currentCheck.remainingMix.toLocaleString('ar-EG')})`, "success");
          postMigratePlan = currentCheck.planId;
          break;
        }
      }

      // 7. Transfer child to owner
      let transferredToOwner = 0;
      if (childEmail && childPass) {
        const childEngine = new EtisalatEngine();
        childEngine.logs = engine.logs;
        if (await childEngine.login(childEmail, childPass, false)) {
          const childStatus = await childEngine.getStatusAndChild();
          if (childStatus.remainingMix > 0) {
            if (await childEngine.transferMix(engine.ownerDial!, childStatus.remainingMix, "Hekaya_XRP_MIX_Child_1")) {
              transferredToOwner = childStatus.remainingMix;
            }
          }
        }
      }

      // 8. Return to owner and verify final balance
      await sleep(2000);
      const ownerFinal = new EtisalatEngine();
      ownerFinal.logs = engine.logs;
      await ownerFinal.login(ownerEmail, ownerPass, true);
      const finalStatus = await ownerFinal.getStatusAndChild();
      ownerFinal.log(`[+] رجعنا للأونر | رصيده الآن: ${finalStatus.remainingMix.toLocaleString('ar-EG')} ميكس`, "success");

      const endedAt = new Date().toISOString();
      const isTargetReached = finalStatus.remainingMix >= targetMix;

      // Persist cycle to history
      await supabase.from("vip_cycle_history").insert({
        session_id: session_id,
        cycle_number: cycleNumber,
        started_at: startedAt,
        ended_at: endedAt,
        owner_balance_start: initialStatus.remainingMix,
        owner_balance_post_renewal: ownerPostRenewal,
        amount_transferred_owner_to_indiv: transferredToChild,
        system_pre_migration: ownerPlanPre,
        system_post_migration: postMigratePlan,
        amount_transferred_indiv_to_owner: transferredToOwner,
        final_balance: finalStatus.remainingMix,
        target_balance: targetMix,
        cycle_status: isTargetReached ? "stopped_at_target" : "completed",
      });

      // Update session state
      await supabase.from("vip_sessions").update({
        current_cycle: cycleNumber,
        owner_mix_balance: finalStatus.remainingMix,
        owner_current_plan: postMigratePlan,
        last_successful_op_at: endedAt,
        updated_at: endedAt,
      }).eq("id", session_id);

      return new Response(JSON.stringify({
        success: true,
        cycle_number: cycleNumber,
        final_mix: finalStatus.remainingMix,
        target_reached: isTargetReached,
        logs: ownerFinal.logs,
      }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: false, error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
