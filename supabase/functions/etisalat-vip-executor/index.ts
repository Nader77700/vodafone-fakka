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
    // Not base64
  }
  return pw;
}

class EtisalatEngine {
  private authToken: string | null = null;
  public currentDial: string | null = null;
  public ownerDial: string | null = null;
  public childDial: string | null = null;
  public logs: Array<{ time: string; level: 'info' | 'success' | 'warn' | 'error'; message: string }> = [];

  public log(message: string, level: 'info' | 'success' | 'warn' | 'error' = 'info') {
    const time = new Date().toLocaleTimeString('ar-EG', { hour12: false });
    this.logs.push({ time, level, message });
    console.log(`[${time}] ${message}`);
  }

  // Plan translation function matching new etisalat_bot.py
  public getPlanName(planId: string): string {
    if (!planId) return "غير معروف";
    if (planId.includes("Parent_7")) return "حكاية ميكسات 270";
    if (planId.includes("Parent_6")) return "حكاية ميكسات 180";
    if (planId.includes("Parent_5")) return "حكاية ميكسات 240";
    if (planId.includes("Parent_8")) return "حكاية ميكسات 52";
    return planId;
  }

  async login(email: string, rawPassword: string, isOwner = false, silent = false): Promise<boolean> {
    const cleanPw = decodeStoredPassword(rawPassword);
    const masked = email.includes("@") ? `${email.substring(0, 3)}***@${email.split("@")[1]}` : email;
    if (!silent) {
      this.log(`[*] جاري تسجيل الدخول للحساب: ${masked} ...`, "info");
    }

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

    for (let attempt = 1; attempt <= 3; attempt++) {
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
            } else {
              this.childDial = this.currentDial;
            }
            if (!silent) {
              this.log(`[+] تم الدخول بنجاح! (الرقم: ${this.currentDial})`, "success");
            }
            return true;
          }
        }
      } catch {
        await sleep(2000);
      }
    }

    if (!silent) {
      this.log(`[-] فشل تسجيل الدخول للحساب (${masked}) بعد 3 محاولات.`, "error");
    }
    return false;
  }

  async getStatusAndChild(silent = false): Promise<{
    planId: string;
    remainingMix: number;
    childNumber: string | null;
  }> {
    if (!this.currentDial || !this.authToken) {
      return { planId: "غير معروف", remainingMix: 0, childNumber: null };
    }

    const xmlBody = `<dialAndLanguageRequest><segmentId>XRP</segmentId><subscriberNumber>${this.currentDial}</subscriberNumber><language>1</language><shortCode>ALFTL</shortCode></dialAndLanguageRequest>`;
    // CRITICAL: Python urllib.parse.quote defaults to safe='/' so '/' is NOT encoded to '%2F'
    const encodedReq = encodeURIComponent(xmlBody).replace(/%2F/g, "/");
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

        // 1. Plan productId (ratePlanConsumption/productId)
        const planMatch = text.match(/<ratePlanConsumption>[\s\S]*?<productId>([^<]+)<\/productId>/i) ||
                          text.match(/<productId>([^<]+)<\/productId>/i);
        const planId = planMatch ? planMatch[1].trim() : "غير معروف";

        // 2. Mixes (newMeterConsumption/consumptionList/consumption/remainingValue)
        const mixMatch = text.match(/<newMeterConsumption>[\s\S]*?<remainingValue>([0-9]+)<\/remainingValue>/i) ||
                         text.match(/<consumptionList>[\s\S]*?<remainingValue>([0-9]+)<\/remainingValue>/i) ||
                         text.match(/<remainingValue>([0-9]+)<\/remainingValue>/i);
        const remainingMix = mixMatch ? parseInt(mixMatch[1], 10) : 0;

        // 3. Child in family (fafNumberList/fafNumber/value)
        let childNumber: string | null = null;
        const fafListMatch = text.match(/<fafNumberList>([\s\S]*?)<\/fafNumberList>/i);
        if (fafListMatch) {
          const valMatches = [...fafListMatch[1].matchAll(/<value>([^<]+)<\/value>/gi)];
          for (const m of valMatches) {
            const val = m[1].trim();
            const cleanVal = val.replace(/^20/, "0");
            const cleanDial = (this.currentDial || "").replace(/^20/, "0");
            if (cleanVal && cleanVal !== cleanDial && !cleanDial.endsWith(cleanVal) && !cleanVal.endsWith(cleanDial)) {
              childNumber = cleanVal;
              break;
            }
          }
        }

        return { planId, remainingMix, childNumber };
      } else {
        console.warn(`[getStatusAndChild] Non-200 status: ${res.status}`);
      }
    } catch (err: any) {
      console.error(`[getStatusAndChild] Error:`, err);
    }

    return { planId: "غير معروف", remainingMix: 0, childNumber: null };
  }

  // Renewal activation motion matching etisalat_bot.py renew_bundle_action
  async renewBundleAction(planName: string, amount: string): Promise<boolean> {
    const displayName = this.getPlanName(planName);
    this.log(`[*] جاري إرسال حركة تنشيطية لنظام ${displayName}...`, "info");

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
      const ok = res.status === 200 && (text.includes("<status>true</status>") || text.includes("<orderId>"));
      if (ok) {
        this.log(`[+] تم إرسال الحركة التنشيطية.`, "success");
      } else {
        this.log(`[-] فشل إرسال الحركة التنشيطية.`, "warn");
      }
      return ok;
    } catch {
      this.log(`[-] فشل إرسال الحركة التنشيطية.`, "warn");
      return false;
    }
  }

  // Change plan matching etisalat_bot.py change_plan
  async changePlan(planName: string, planId = ""): Promise<boolean> {
    const displayName = this.getPlanName(planName);
    this.log(`[*] جاري تغيير النظام إلى: ${displayName} ...`, "info");

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
      return res.status === 200 && text.includes("<status>true</status>");
    } catch {
      return false;
    }
  }

  // Transfer mix quota matching etisalat_bot.py transfer_mix
  async transferMix(receiverNumber: string, quotaAmount: number, productName: string): Promise<boolean> {
    const quota = Math.floor(quotaAmount);
    this.log(`[*] جاري تحويل ${quota.toLocaleString('ar-EG')} ميكس ...`, "info");

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

  // Send add child request matching etisalat_bot.py add_child_temp
  async sendAddChildRequest(childNumber: string, productName: string): Promise<boolean> {
    let childIntl = childNumber;
    if (childNumber.startsWith("0")) {
      childIntl = "20" + childNumber.slice(1);
    }
    this.log(`[*] جاري إرسال دعوة لإضافة الرقم ${childIntl}...`, "info");

    const xmlBody = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><addChildRequest><childNumber>${childIntl}</childNumber><childPercentage>0.10</childPercentage><productId>${productName}</productId><subscriberNumber>${this.currentDial}</subscriberNumber></addChildRequest>`;
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
      return res.status === 200 && text.includes("<status>true</status>");
    } catch {
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
        error: "بيانات اعتماد حساب الأونر (البريد وكلمة المرور) غير متوفرة في هذه الجلسة. يرجى تعديل الجلسة وإدخال البريد وكلمة المرور.",
      }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const engine = new EtisalatEngine();

    // ══════════════════════════════════════════════════════════════════
    // ACTION 1: check_status
    // ══════════════════════════════════════════════════════════════════
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

      let status = await engine.getStatusAndChild();
      let ownerPlanId = status.planId;
      const displayPlan = engine.getPlanName(ownerPlanId);

      engine.log(`[+] فحص الأونر: النظام (${displayPlan}) | الميكسات: ${status.remainingMix.toLocaleString('en-US')}`, "success");

      // Auto-migrate if plan is not 270 or 180 (e.g. 240 or other plans)
      const isSeven = ownerPlanId.includes("Parent_7");
      const isSix = ownerPlanId.includes("Parent_6");
      if (!isSeven && !isSix && ownerPlanId !== "غير معروف") {
        engine.log(`[!] النظام الحالي هو (${displayPlan}). جاري تحويله لـ 270 لدعم العيلة...`, "warn");
        const migOk = await engine.changePlan("Hekaya_XRP_MIX_Parent_7", "");
        if (migOk) {
          engine.log(`[*] في انتظار السيرفر لتأكيد تغيير النظام...`, "info");
          for (let attempt = 0; attempt < 3; attempt++) {
            await sleep(2000);
            const recheck = await engine.getStatusAndChild(true);
            if (recheck.planId && recheck.planId.includes("Parent_7")) {
              status = recheck;
              ownerPlanId = recheck.planId;
              engine.log(`[+] تم تأكيد تغيير النظام بنجاح إلى: ${engine.getPlanName(ownerPlanId)}`, "success");
              break;
            }
          }
        }
      }

      const hasChild = !!status.childNumber;
      if (hasChild) {
        engine.log(`[+] تم تأكيد وجود فرد مضاف في العيلة: ${status.childNumber}`, "success");
      } else {
        engine.log(`[!] تنبيه: لا يوجد فرد مضاف في العيلة (يلزم إضافة الفرد بالعائلة أولاً).`, "warn");
      }

      // Check Child account balance & dial if credentials exist
      let childBalance: number | null = null;
      let childDial: string | null = null;
      let childPlan: string | null = null;

      if (childEmail && childPass) {
        const childEngine = new EtisalatEngine();
        if (await childEngine.login(childEmail, childPass, false, true)) {
          childDial = childEngine.childDial;
          const childStatus = await childEngine.getStatusAndChild(true);
          childBalance = childStatus.remainingMix;
          childPlan = engine.getPlanName(childStatus.planId);
          engine.log(`[+] حساب الفرد جاهز (الرقم: ${childDial} | الميكسات: ${(childBalance ?? 0).toLocaleString('en-US')})`, "info");
        }
      }

      // Update Supabase Database session
      await supabase
        .from("vip_sessions")
        .update({
          owner_account_identifier: engine.ownerDial || session.owner_account_identifier,
          owner_account_status: "verified",
          owner_current_plan: engine.getPlanName(ownerPlanId),
          owner_mix_balance: status.remainingMix,
          last_owner_refresh_at: new Date().toISOString(),
          individual_account_identifier: status.childNumber || childDial || session.individual_account_identifier,
          individual_account_status: childDial ? "verified" : session.individual_account_status,
          individual_current_plan: childPlan || session.individual_current_plan,
          individual_mix_balance: childBalance !== null ? childBalance : session.individual_mix_balance,
          last_individual_refresh_at: childBalance !== null ? new Date().toISOString() : session.last_individual_refresh_at,
          relationship_verified: hasChild,
          relationship_status: hasChild ? "linked_and_verified" : "no_child_linked",
          updated_at: new Date().toISOString(),
        })
        .eq("id", session_id);

      return new Response(JSON.stringify({
        success: true,
        owner: {
          dial: engine.ownerDial,
          plan: engine.getPlanName(ownerPlanId),
          mix: status.remainingMix,
        },
        child: {
          dial: status.childNumber || childDial,
          plan: childPlan,
          mix: childBalance,
          linked: hasChild,
        },
        logs: engine.logs,
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // ACTION 2: add_child (Exact sequence from etisalat_bot.py lines 270-340)
    // ══════════════════════════════════════════════════════════════════
    if (action === "add_child") {
      const childNumber = body.child_number || session.individual_account_identifier;
      if (!childNumber) {
        return new Response(JSON.stringify({
          success: false,
          error: "رقم الفرد المطلوب إضافته غير محدد.",
          logs: engine.logs,
        }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      // Step 1: Login to Owner and Renew bundle (270)
      engine.log(`[*] الخطوة 1/4: تسجيل دخول الأونر وتفعيل باقة Parent 7...`, "info");
      if (!await engine.login(ownerEmail, ownerPass, true)) {
        return new Response(JSON.stringify({
          success: false,
          error: "فشل تسجيل الدخول لحساب الأونر.",
          logs: engine.logs,
        }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      await engine.renewBundleAction("Hekaya_XRP_MIX_Parent_7", "270");
      await sleep(3000);

      // Step 2: Login to Child and activate account
      if (childEmail && childPass) {
        engine.log(`[*] الخطوة 2/4: تسجيل الدخول للفرد لتفعيل حسابه قبل الدعوة...`, "info");
        const childEngine = new EtisalatEngine();
        if (await childEngine.login(childEmail, childPass, false)) {
          const childStatus = await childEngine.getStatusAndChild(true);
          if (childStatus.planId && childStatus.planId.includes("Parent_7")) {
            await childEngine.renewBundleAction("Hekaya_XRP_MIX_Parent_7", "270");
          } else {
            await childEngine.renewBundleAction("Hekaya_XRP_MIX_Parent_6", "180");
          }
          await sleep(3000);
        }
      }

      // Step 3: Switch back to Owner to send addChild invitation
      engine.log(`[*] الخطوة 3/4: الرجوع للأونر لإرسال دعوة الإضافة بنسبة 10%...`, "info");
      const ownerEngine = new EtisalatEngine();
      if (!await ownerEngine.login(ownerEmail, ownerPass, true, true)) {
        return new Response(JSON.stringify({
          success: false,
          error: "فشل العودة لحساب الأونر.",
          logs: [...engine.logs, ...ownerEngine.logs],
        }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      let childConfirmed = false;
      let finalChildNumber: string | null = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        ownerEngine.log(`[*] جاري إرسال دعوة للرقم ${childNumber} (محاولة ${attempt}/3)...`, "info");
        const invited = await ownerEngine.sendAddChildRequest(childNumber, "Hekaya_XRP_MIX_Parent_7");
        if (invited) {
          ownerEngine.log(`[+] تم إرسال الدعوة بنجاح!`, "success");
          ownerEngine.log(`[*] جاري الدخول للفرد وتحديث البيانات لقبول الدعوة...`, "info");

          if (childEmail && childPass) {
            const childAcceptEngine = new EtisalatEngine();
            if (await childAcceptEngine.login(childEmail, childPass, false, true)) {
              await childAcceptEngine.renewBundleAction("Hekaya_XRP_MIX_Parent_7", "270");
              await sleep(3000);
            }
          }

          // Check if child appears in owner's fafNumberList
          const verifyOwner = new EtisalatEngine();
          await verifyOwner.login(ownerEmail, ownerPass, true, true);
          const st = await verifyOwner.getStatusAndChild(true);
          if (st.childNumber) {
            ownerEngine.log(`[+] مبروك! تم تأكيد إضافة الفرد بنجاح: ${st.childNumber}`, "success");
            childConfirmed = true;
            finalChildNumber = st.childNumber;
            break;
          } else {
            ownerEngine.log(`[-] الدعوة لم يتم تأكيدها بعد (السيرفر ما زال يحدّث).`, "warn");
          }
        } else {
          ownerEngine.log(`[-] فشل إرسال الدعوة. المحاولة التالية بعد 5 ثواني...`, "warn");
          await sleep(5000);
        }
      }

      const allLogs = [...engine.logs, ...ownerEngine.logs];

      if (childConfirmed && finalChildNumber) {
        await supabase
          .from("vip_sessions")
          .update({
            individual_account_identifier: finalChildNumber,
            relationship_verified: true,
            relationship_status: "linked_and_verified",
            updated_at: new Date().toISOString(),
          })
          .eq("id", session_id);

        return new Response(JSON.stringify({
          success: true,
          message: `مبروك! تم تأكيد إضافة الفرد: ${finalChildNumber}`,
          child_number: finalChildNumber,
          logs: allLogs,
        }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({
        success: false,
        error: "فشلت محاولات إضافة الفرد تلقائياً. يرجى قبول الدعوة يدوياً من تطبيق My Etisalat على هاتف الفرد ثم إعادة الفحص.",
        logs: allLogs,
      }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    // ══════════════════════════════════════════════════════════════════
    // ACTION 3: single_cycle / run_single_cycle (Exact loop steps from etisalat_bot.py lines 350-440)
    // ══════════════════════════════════════════════════════════════════
    if (action === "single_cycle" || action === "run_single_cycle") {
      // 1. Login to Owner
      if (!await engine.login(ownerEmail, ownerPass, true)) {
        return new Response(JSON.stringify({
          success: false,
          error: "فشل تسجيل الدخول لحساب الأونر.",
          logs: engine.logs,
        }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      // 2. Check Plan & Child existence
      let status = await engine.getStatusAndChild(true);
      let ownerPlanPre = status.planId;

      // Auto-migrate if not 270 or 180
      if (!ownerPlanPre.includes("Parent_7") && !ownerPlanPre.includes("Parent_6") && ownerPlanPre !== "غير معروف") {
        engine.log(`[!] النظام الحالي (${engine.getPlanName(ownerPlanPre)}) غير متوافق. جاري تحويله لـ 270...`, "warn");
        await engine.changePlan("Hekaya_XRP_MIX_Parent_7", "");
        engine.log(`[*] في انتظار السيرفر لتأكيد تغيير النظام...`, "info");
        for (let attempt = 0; attempt < 4; attempt++) {
          await sleep(2000);
          const recheck = await engine.getStatusAndChild(true);
          if (recheck.planId && recheck.planId.includes("Parent_7")) {
            status = recheck;
            ownerPlanPre = recheck.planId;
            engine.log(`[+] تم تأكيد تغيير النظام بنجاح إلى: ${engine.getPlanName(ownerPlanPre)}`, "success");
            break;
          }
        }
      }

      const childNum = status.childNumber;
      if (!childNum) {
        engine.log(`[-] تنبيه حاسم: لا يوجد فرد مضاف في عائلة الأونر على السيرفر.`, "error");
        return new Response(JSON.stringify({
          success: false,
          error: "لا يوجد فرد مضاف داخل عائلة الأونر حالياً. يرجى الضغط على زر «إضافة وتأكيد الفرد الآن» لإضافة خط الفرد إلى العائلة وتأكيده أولاً قبل بدء الدورة.",
          logs: engine.logs,
        }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      const isSeven = ownerPlanPre.includes("Parent_7") || ownerPlanPre.includes("7");
      const ownerPlanName = isSeven ? "Hekaya_XRP_MIX_Parent_7" : "Hekaya_XRP_MIX_Parent_6";
      const renewCost = isSeven ? "270" : "180";

      // 3. Send activation motion to owner
      await engine.renewBundleAction(ownerPlanName, renewCost);
      await sleep(2000);

      // 4. Check mix balance & transfer to child
      const statusAfterRenew = await engine.getStatusAndChild(true);
      const newMix = statusAfterRenew.remainingMix;

      if (newMix > 0) {
        const transferred = await engine.transferMix(childNum, newMix, ownerPlanName);
        if (!transferred) {
          engine.log(`[!] تنبيه: لم يتمكن من تحويل ميكسات الأونر للفرد. متابعة الترحيل...`, "warn");
        }
      } else {
        engine.log(`[*] الأونر ليس لديه ميكسات حالياً. جاري فحص الفرد...`, "info");
        if (childEmail && childPass) {
          const childEngine = new EtisalatEngine();
          if (await childEngine.login(childEmail, childPass, false, true)) {
            const childStatus = await childEngine.getStatusAndChild(true);
            if (childStatus.remainingMix > 0) {
              engine.log(`[+] الفرد لديه (${childStatus.remainingMix.toLocaleString('ar-EG')}) ميكس. سيكمل السكريبت خطواته.`, "success");
            }
          }
        }
      }

      await sleep(1500);

      // 5. Switch Plan: if 7 -> switch to 6 (951), if 6 -> switch to 7 ("")
      let targetPlanId = "Hekaya_XRP_MIX_Parent_6";
      let targetPlanDisplay = "حكاية ميكسات 180";
      let ratePlanId = "951";

      if (!isSeven) {
        targetPlanId = "Hekaya_XRP_MIX_Parent_7";
        targetPlanDisplay = "حكاية ميكسات 270";
        ratePlanId = "";
      }

      await engine.changePlan(targetPlanId, ratePlanId);
      engine.log(`[*] في انتظار تحديث السيرفر...`, "info");

      for (let attempt = 0; attempt < 5; attempt++) {
        await sleep(2000);
        const currentCheck = await engine.getStatusAndChild(true);
        if (currentCheck.planId && currentCheck.planId.includes(targetPlanId) && currentCheck.remainingMix > 0) {
          engine.log(`[+] السيرفر استجاب! (النظام: ${targetPlanDisplay} | الميكسات: ${currentCheck.remainingMix.toLocaleString('en-US')})`, "success");
          break;
        }
      }

      // 6. Login to Child and retrieve mix back to Owner
      if (childEmail && childPass) {
        engine.log(`[*] تسجيل الدخول للفرد واسترجاع الميكسات للأونر...`, "info");
        const childTransferEngine = new EtisalatEngine();
        if (await childTransferEngine.login(childEmail, childPass, false, true)) {
          const childSt = await childTransferEngine.getStatusAndChild(true);
          engine.log(`[+] حالة الفرد | الميكسات: ${childSt.remainingMix.toLocaleString('en-US')}`, "info");

          if (childSt.remainingMix > 0 && engine.ownerDial) {
            await childTransferEngine.transferMix(engine.ownerDial, childSt.remainingMix, "Hekaya_XRP_MIX_Child_1");
          }
          engine.logs.push(...childTransferEngine.logs);
        }
      }

      // 7. Login back to Owner and read final mix
      const finalOwnerEngine = new EtisalatEngine();
      if (await finalOwnerEngine.login(ownerEmail, ownerPass, true, true)) {
        const finalStatus = await finalOwnerEngine.getStatusAndChild(true);
        engine.log(`[+] رجعنا للأونر | رصيده الآن: ${finalStatus.remainingMix.toLocaleString('en-US')} ميكس`, "success");
        engine.logs.push(...finalOwnerEngine.logs);

        const newCycleCount = (session.current_cycle || 0) + 1;
        const targetMix = session.target_mix_balance || 50000;
        const targetReached = finalStatus.remainingMix >= targetMix;

        // Update database
        await supabase
          .from("vip_sessions")
          .update({
            owner_mix_balance: finalStatus.remainingMix,
            owner_current_plan: engine.getPlanName(finalStatus.planId),
            current_cycle: newCycleCount,
            last_successful_op_at: new Date().toISOString(),
            last_actual_operation: "single_cycle_completed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", session_id);

        return new Response(JSON.stringify({
          success: true,
          cycle_number: newCycleCount,
          final_mix: finalStatus.remainingMix,
          target_reached: targetReached,
          logs: engine.logs,
        }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({
        success: true,
        message: "اكتملت خطوات الدورة",
        logs: engine.logs,
      }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    // ══════════════════════════════════════════════════════════════════
    // ACTION 4: change_plan
    // ══════════════════════════════════════════════════════════════════
    if (action === "change_plan") {
      if (!await engine.login(ownerEmail, ownerPass, true)) {
        return new Response(JSON.stringify({
          success: false,
          error: "فشل تسجيل الدخول لحساب الأونر.",
          logs: engine.logs,
        }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      const targetPlan = body.target_plan === "6" ? "Hekaya_XRP_MIX_Parent_6" : "Hekaya_XRP_MIX_Parent_7";
      const ratePlanId = body.target_plan === "6" ? "951" : "";
      const ok = await engine.changePlan(targetPlan, ratePlanId);

      if (ok) {
        engine.log(`[+] تم إرسال أمر الترحيل إلى: ${engine.getPlanName(targetPlan)} بنجاح!`, "success");
        await sleep(3000);
        const st = await engine.getStatusAndChild(true);
        await supabase
          .from("vip_sessions")
          .update({
            owner_current_plan: engine.getPlanName(st.planId),
            owner_mix_balance: st.remainingMix,
            updated_at: new Date().toISOString(),
          })
          .eq("id", session_id);
      }

      return new Response(JSON.stringify({
        success: ok,
        message: ok ? `تم ترحيل النظام بنجاح إلى: ${engine.getPlanName(targetPlan)}` : "فشل ترحيل النظام",
        logs: engine.logs,
      }), { status: ok ? 200 : 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: false, error: `Invalid action: ${action}` }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[etisalat-vip-executor] Unhandled error:", err);
    return new Response(JSON.stringify({
      success: false,
      error: err?.message || "خطأ غير متوقع في محرك اتصالات",
    }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
