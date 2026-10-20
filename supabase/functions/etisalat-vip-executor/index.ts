import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const BASE_URL = "https://mab.etisalat.com.eg:11003";

export interface DeviceProfile {
  deviceId: string;
  modelType: string;
  osVersion: string;
  userAgent: string;
  simulatedIp: string;
}

export interface BridgeConfig {
  bridge_enabled: boolean;
  bridge_url: string;
  bridge_mode: string;
  bridge_auth?: string;
  owner_device_id: string;
  owner_model_type: string;
  owner_os_version: string;
  owner_user_agent: string;
  owner_simulated_ip: string;
  child_device_id: string;
  child_model_type: string;
  child_os_version: string;
  child_user_agent: string;
  child_simulated_ip: string;
}

const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  bridge_enabled: false,
  bridge_url: "",
  bridge_mode: "direct",
  owner_device_id: "b61c90c58c612671",
  owner_model_type: "CPH2737",
  owner_os_version: "16",
  owner_user_agent: "okhttp/5.0.0-alpha.11",
  owner_simulated_ip: "196.205.142.23", // Etisalat Misr ASN AS36935
  child_device_id: "b61c90c58c612671", // Same known device or configurable
  child_model_type: "CPH2737",
  child_os_version: "16",
  child_user_agent: "okhttp/5.0.0-alpha.11",
  child_simulated_ip: "196.205.142.23",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sha256Hex(str: string): Promise<string> {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
  public device: DeviceProfile;
  public bridgeConfig: BridgeConfig;
  private authToken: string | null = null;
  public cookieHeader: string = "";
  public customerName: string = "";
  public shortCode: string = "";
  public currentDial: string | null = null;
  public ownerDial: string | null = null;
  public childDial: string | null = null;
  public logs: Array<{ time: string; level: 'info' | 'success' | 'warn' | 'error'; message: string }> = [];

  constructor(role: 'owner' | 'child', config?: BridgeConfig) {
    this.bridgeConfig = config || DEFAULT_BRIDGE_CONFIG;
    if (role === 'owner') {
      this.device = {
        deviceId: this.bridgeConfig.owner_device_id || DEFAULT_BRIDGE_CONFIG.owner_device_id,
        modelType: this.bridgeConfig.owner_model_type || DEFAULT_BRIDGE_CONFIG.owner_model_type,
        osVersion: this.bridgeConfig.owner_os_version || DEFAULT_BRIDGE_CONFIG.owner_os_version,
        userAgent: this.bridgeConfig.owner_user_agent || DEFAULT_BRIDGE_CONFIG.owner_user_agent,
        simulatedIp: this.bridgeConfig.owner_simulated_ip || DEFAULT_BRIDGE_CONFIG.owner_simulated_ip,
      };
    } else {
      this.device = {
        deviceId: this.bridgeConfig.child_device_id || DEFAULT_BRIDGE_CONFIG.child_device_id,
        modelType: this.bridgeConfig.child_model_type || DEFAULT_BRIDGE_CONFIG.child_model_type,
        osVersion: this.bridgeConfig.child_os_version || DEFAULT_BRIDGE_CONFIG.child_os_version,
        userAgent: this.bridgeConfig.child_user_agent || DEFAULT_BRIDGE_CONFIG.child_user_agent,
        simulatedIp: this.bridgeConfig.child_simulated_ip || DEFAULT_BRIDGE_CONFIG.child_simulated_ip,
      };
    }
  }

  public onLog?: (log: { time: string; level: 'info' | 'success' | 'warn' | 'error'; message: string }) => void;

  public log(message: string, level: 'info' | 'success' | 'warn' | 'error' = 'info') {
    const time = new Date().toLocaleTimeString('ar-EG', { hour12: false });
    const logItem: { time: string; level: 'info' | 'success' | 'warn' | 'error'; message: string } = { time, level, message };
    this.logs.push(logItem);
    if (this.onLog) {
      try {
        this.onLog(logItem);
      } catch (_) {
        // stream closed
      }
    }
    console.log(`[${time}] ${message}`);
  }

  public getPlanName(planId: string): string {
    if (!planId || planId === "غير معروف") return "حكاية ميكسات 270";
    if (planId.includes("Parent_7") || planId.includes("XRPM7")) return "حكاية ميكسات 270";
    if (planId.includes("Parent_6") || planId.includes("XRPM6")) return "حكاية ميكسات 180";
    if (planId.includes("Parent_5") || planId.includes("XRPM5")) return "حكاية ميكسات 240";
    if (planId.includes("Parent_8") || planId.includes("XRPM8")) return "حكاية ميكسات 52";
    if (planId.includes("Child_1") || planId.includes("XRPC1")) return "حكاية ميكسات فرد 1";
    if (planId.includes("Child_2") || planId.includes("XRPC2")) return "حكاية ميكسات فرد 2";
    return planId;
  }

  private async generateSignatures(urlPath: string, bodyXml: string) {
    const headerSig = await sha256Hex(`${urlPath}${this.device.deviceId}`);
    const urlSig = await sha256Hex(urlPath);
    const bodySig = bodyXml ? await sha256Hex(bodyXml) : "";
    return { headerSig, urlSig, bodySig };
  }

  private getBaseHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "applicationVersion": "2",
      "applicationName": "MAB",
      "Accept": "text/xml",
      "Language": "ar",
      "APP-BuildNumber": "10744",
      "APP-Version": "36.1.0",
      "OS-Type": "Android",
      "OS-Version": this.device.osVersion,
      "APP-STORE": "GOOGLE",
      "C-Type": "WIFI",
      "Is-Corporate": "false",
      "User-Agent": this.device.userAgent,
      "Content-Type": "text/xml; charset=UTF-8",
      // Egyptian Telecom Geo-IP Simulation Headers (Passes local ISP routing)
      "X-Forwarded-For": this.device.simulatedIp,
      "X-Real-IP": this.device.simulatedIp,
      "Client-IP": this.device.simulatedIp,
      "CF-Connecting-IP": this.device.simulatedIp,
    };
    if (this.cookieHeader) {
      headers["Cookie"] = this.cookieHeader;
    }
    return headers;
  }

  private getRequestUrl(urlPath: string): string {
    if (this.bridgeConfig.bridge_enabled && this.bridgeConfig.bridge_url?.trim()) {
      const cleanBridge = this.bridgeConfig.bridge_url.trim().replace(/\/$/, "");
      // If bridge URL is proxy query style: https://bridge.eg/proxy?url=...
      if (cleanBridge.includes("?")) {
        return `${cleanBridge}&url=${encodeURIComponent(BASE_URL + urlPath)}`;
      }
      return `${cleanBridge}/proxy?url=${encodeURIComponent(BASE_URL + urlPath)}`;
    }
    return `${BASE_URL}${urlPath}`;
  }

  async login(email: string, rawPassword: string, isOwner = false, silent = false): Promise<boolean> {
    const cleanPw = decodeStoredPassword(rawPassword);
    const masked = email.includes("@") ? `${email.substring(0, 3)}***@${email.split("@")[1]}` : email;
    if (!silent) {
      this.log(`[*] جاري تسجيل الدخول للحساب: ${masked} [جهاز: ${this.device.modelType}] ...`, "info");
    }

    const authB64 = btoa(`${email}:${cleanPw}`);
    const loginXml = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><loginRequest><deviceId>${this.device.deviceId}</deviceId><firstLoginAttempt>true</firstLoginAttempt><modelType>${this.device.modelType}</modelType><osVersion>${this.device.osVersion}</osVersion><platform>Android</platform><udid>${this.device.deviceId}</udid></loginRequest>`;
    const urlPath = "/Saytar/rest/authentication/loginWithPlan";

    const { headerSig, urlSig, bodySig } = await this.generateSignatures(urlPath, loginXml);
    const headers = {
      ...this.getBaseHeaders(),
      "Authorization": `Basic ${authB64}`,
      "headerSignature": headerSig,
      "urlSignature": urlSig,
      "bodySignature": bodySig,
    };

    if (this.bridgeConfig.bridge_auth) {
      headers["X-Bridge-Auth"] = this.bridgeConfig.bridge_auth;
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const targetUrl = this.getRequestUrl(urlPath);
        const res = await fetch(targetUrl, {
          method: "POST",
          headers,
          body: loginXml,
        });

        const text = await res.text();
        if (res.status === 200 && text.includes("<status>true</status>")) {
          // 1. Capture session cookies (JSESSIONID)
          const setCookieHdr = res.headers.get("set-cookie");
          const getSetCookieFn = (res.headers as any).getSetCookie;
          const cookiesList: string[] = typeof getSetCookieFn === "function"
            ? getSetCookieFn.call(res.headers)
            : (setCookieHdr ? [setCookieHdr] : []);

          const cookiePairs: string[] = [];
          for (const item of cookiesList) {
            if (item) {
              const pair = item.split(";")[0].trim();
              if (pair && !cookiePairs.includes(pair)) {
                cookiePairs.push(pair);
              }
            }
          }
          if (cookiePairs.length > 0) {
            this.cookieHeader = cookiePairs.join("; ");
          }

          // 2. Auth token and customer details from JWT
          const auth = res.headers.get("auth");
          if (auth) {
            this.authToken = auth;
            try {
              const tokenPayload = auth.split(".")[1];
              const base64 = tokenPayload.replace(/-/g, "+").replace(/_/g, "/");
              const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
              const binary = atob(padded);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
              }
              const jsonStr = new TextDecoder().decode(bytes);
              const decoded = JSON.parse(jsonStr);
              this.currentDial = decoded.selectedDial || null;
              this.customerName = `${decoded.firstname || ""} ${decoded.lastname || ""}`.trim();
              this.shortCode = decoded.selectedDialShortCode || "";
            } catch {
              // fallback
            }

            if (isOwner) {
              this.ownerDial = this.currentDial;
            } else {
              this.childDial = this.currentDial;
            }
            if (!silent) {
              const nameInfo = this.customerName ? ` | الاسم: ${this.customerName}` : "";
              this.log(`[+] تم الدخول بنجاح! (الرقم: ${this.currentDial}${nameInfo} | بصمة الجهاز: ${this.device.modelType})`, "success");
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

    const { headerSig, urlSig } = await this.generateSignatures(urlPath, "");
    const headers = {
      ...this.getBaseHeaders(),
      "auth": `Bearer ${this.authToken}`,
      "headerSignature": headerSig,
      "urlSignature": urlSig,
    };

    if (this.bridgeConfig.bridge_auth) {
      headers["X-Bridge-Auth"] = this.bridgeConfig.bridge_auth;
    }

    try {
      const targetUrl = this.getRequestUrl(urlPath);
      const res = await fetch(targetUrl, {
        method: "GET",
        headers,
      });

      if (res.status === 200) {
        const text = await res.text();
        console.log(`[getStatusAndChild] Raw XML (${this.currentDial}):`, text);

        // 1. Plan productId (ratePlanConsumption/productId)
        const planMatch = text.match(/<ratePlanConsumption>[\s\S]*?<productId>([^<]+)<\/productId>/i) ||
                          text.match(/<productId>([^<]+)<\/productId>/i);
        let planId = planMatch ? planMatch[1].trim() : "غير معروف";
        if (planId === "غير معروف" && this.shortCode) {
          if (this.shortCode.includes("M7")) planId = "Hekaya_XRP_MIX_Parent_7";
          else if (this.shortCode.includes("M6")) planId = "Hekaya_XRP_MIX_Parent_6";
          else if (this.shortCode.includes("M5")) planId = "Hekaya_XRP_MIX_Parent_5";
          else if (this.shortCode.includes("C1")) planId = "Hekaya_XRP_MIX_Child_1";
        }

        // 2. Comprehensive Mixes Detection across all consumption meters & buckets
        // Never stop at the first bucket (e.g. Facebook/WhatsApp = 0 or expired meters)
        const consumptionBlocks = text.match(/<consumption[\s>][\s\S]*?<\/consumption>/gi) || [];
        let mainMix = 0;
        let carriedMix = 0;
        const allMixCandidates: number[] = [];

        for (const block of consumptionBlocks) {
          const remMatch = block.match(/<remainingValue>([0-9]+(?:\.[0-9]+)?)<\/remainingValue>/i);
          if (!remMatch) continue;
          const remVal = parseInt(remMatch[1], 10);

          const labelMatch = block.match(/<(?:consumedLabel|remainingLabel)>([^<]+)<\/(?:consumedLabel|remainingLabel)>/i);
          const label = labelMatch ? labelMatch[1].trim() : "";

          const omsMatch = block.match(/<(?:remainingOmsName|consumedOmsName)>([^<]+)<\/(?:remainingOmsName|consumedOmsName)>/i);
          const oms = omsMatch ? omsMatch[1].trim() : "";

          const unitMatch = block.match(/<(?:remainingUnit|totalUnit|consumedUnit)>([^<]+)<\/(?:remainingUnit|totalUnit|consumedUnit)>/i);
          const unit = unitMatch ? unitMatch[1].trim() : "";

          const meterTypeMatch = block.match(/<consumptionMeterType>([^<]+)<\/consumptionMeterType>/i);
          const meterType = meterTypeMatch ? meterTypeMatch[1].trim() : "";

          // Exclude pure social / whatsapp / home vdsl if they have separate quotas
          const isSocialOrVdsl = /whatsapp|facebook|vdsl|انترنت\s*المنزلي/i.test(oms) || /فيسبوك|واتساب|انترنت\s*حكاية/i.test(label);
          if (isSocialOrVdsl && !/ميكسات\s*الباقة/i.test(label)) {
            continue;
          }

          const isMixBucket = /ميكس|unit/i.test(unit) ||
                              /xrp_units/i.test(meterType) ||
                              /GENERAL_UNIT/i.test(oms) ||
                              /CARRIED_OVER/i.test(oms) ||
                              /ميكسات|ميكس/i.test(label);

          if (isMixBucket) {
            if (/GENERAL_UNIT/i.test(oms) || /ميكسات\s*الباقة\s*الأساسية/i.test(label) || meterType === "xrp_units") {
              if (remVal > mainMix) mainMix = remVal;
            } else if (/CARRIED_OVER/i.test(oms) || /الميكسات\s*المرحلة/i.test(label)) {
              if (remVal > carriedMix) carriedMix = remVal;
            }
            allMixCandidates.push(remVal);
          }
        }

        // Fallback: If no structured mix bucket matched, scan any remainingValue in the entire document
        if (allMixCandidates.length === 0) {
          const rawMatches = [...text.matchAll(/<remainingValue>([0-9]+)<\/remainingValue>/gi)];
          for (const rm of rawMatches) {
            const v = parseInt(rm[1], 10);
            if (v > 0) allMixCandidates.push(v);
          }
        }

        const remainingMix = mainMix > 0 ? mainMix : (carriedMix > 0 ? carriedMix : (allMixCandidates.length > 0 ? Math.max(...allMixCandidates) : 0));

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

    // Fallback if known from shortCode
    let fallbackPlan = "غير معروف";
    if (this.shortCode.includes("M7")) fallbackPlan = "Hekaya_XRP_MIX_Parent_7";
    else if (this.shortCode.includes("M6")) fallbackPlan = "Hekaya_XRP_MIX_Parent_6";
    else if (this.shortCode.includes("C1")) fallbackPlan = "Hekaya_XRP_MIX_Child_1";

    return { planId: fallbackPlan, remainingMix: 0, childNumber: null };
  }

  async renewBundleAction(planName: string, amount: string): Promise<boolean> {
    const displayName = this.getPlanName(planName);
    this.log(`[*] جاري إرسال حركة تنشيطية لنظام ${displayName}...`, "info");

    const xmlBody = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><generalSubmitOrderRequest><msisdn>${this.currentDial}</msisdn><operation>FULL_RENEW</operation><parameters /><paymentOptions><paymentOption><amount>${amount}</amount><optionID>BALANCE</optionID></paymentOption></paymentOptions><productName>${planName}</productName><requestId>ALFA_PAYMENT_OPTIONS</requestId></generalSubmitOrderRequest>`;
    const urlPath = "/Saytar/rest/General/submitOrder";

    const { headerSig, urlSig, bodySig } = await this.generateSignatures(urlPath, xmlBody);
    const headers = {
      ...this.getBaseHeaders(),
      "auth": `Bearer ${this.authToken}`,
      "headerSignature": headerSig,
      "urlSignature": urlSig,
      "bodySignature": bodySig,
    };

    try {
      const targetUrl = this.getRequestUrl(urlPath);
      const res = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: xmlBody,
      });
      const text = await res.text();
      const ok = res.status === 200 && text.includes("<status>true</status>");
      if (!ok) {
        this.log(`[-] فشل إرسال الحركة التنشيطية.`, "warn");
      }
      return ok;
    } catch {
      return false;
    }
  }

  async transferMix(toDial: string, amount: number, productName: string): Promise<boolean> {
    const quota = Math.floor(amount);
    const target = toDial.startsWith("0") ? "20" + toDial.substring(1) : toDial;
    this.log(`[*] جاري تحويل (${quota.toLocaleString('en-US')}) ميكس إلى الرقم: ${toDial} ...`, "info");

    // Primary: Python bot endpoint (/Saytar/rest/services/newTransfer/v2)
    const xmlBodyV2 = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><newFamilyTransferRequest><distribute>false</distribute><msisdn>${this.currentDial}</msisdn><productName>${productName}</productName><quota>${quota}</quota><receiverMsisdn>${target}</receiverMsisdn><senderMsisdn>${this.currentDial}</senderMsisdn><type>UNITS</type></newFamilyTransferRequest>`;
    const urlPathV2 = "/Saytar/rest/services/newTransfer/v2";

    const { headerSig, urlSig, bodySig } = await this.generateSignatures(urlPathV2, xmlBodyV2);
    const headers = {
      ...this.getBaseHeaders(),
      "auth": `Bearer ${this.authToken}`,
      "headerSignature": headerSig,
      "urlSignature": urlSig,
      "bodySignature": bodySig,
    };

    try {
      const targetUrl = this.getRequestUrl(urlPathV2);
      const res = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: xmlBodyV2,
      });
      const text = await res.text();
      const ok = res.status === 200 && text.includes("<status>true</status>");
      if (ok) {
        this.log(`[+] تم تحويل الميكسات بنجاح!`, "success");
        return true;
      }
    } catch {
      // fallback
    }

    // Fallback: submitOrder
    const xmlBodyOrder = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><generalSubmitOrderRequest><msisdn>${this.currentDial}</msisdn><operation>CONSUME_SERVICE</operation><parameters><parameter><name>TRANSFERED_MSISDN</name><value>${target}</value></parameter><parameter><name>RENEW_FLAG</name><value>0</value></parameter><parameter><name>TRANSFERED_AMOUNT</name><value>${quota}</value></parameter></parameters><productName>${productName}</productName><requestId>TRANSFER_METER</requestId></generalSubmitOrderRequest>`;
    const urlPathOrder = "/Saytar/rest/General/submitOrder";
    const sigOrder = await this.generateSignatures(urlPathOrder, xmlBodyOrder);
    const headersOrder = {
      ...this.getBaseHeaders(),
      "auth": `Bearer ${this.authToken}`,
      "headerSignature": sigOrder.headerSig,
      "urlSignature": sigOrder.urlSig,
      "bodySignature": sigOrder.bodySig,
    };
    try {
      const targetUrl = this.getRequestUrl(urlPathOrder);
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: headersOrder,
        body: xmlBodyOrder,
      });
      const text = await res.text();
      const ok = res.status === 200 && text.includes("<status>true</status>");
      if (ok) {
        this.log(`[+] تم تحويل الميكسات بنجاح (عبر منفذ الطلبات)!`, "success");
      } else {
        this.log(`[-] فشل تحويل الميكسات.`, "warn");
      }
      return ok;
    } catch {
      return false;
    }
  }

  async changePlan(planName: string, planId = ""): Promise<boolean> {
    const displayName = this.getPlanName(planName);
    this.log(`[*] جاري تغيير النظام إلى: ${displayName} ...`, "info");

    const xmlBody = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><migrateRequest><addonName></addonName><oMSRatePlan>true</oMSRatePlan><operation>FULL_MIGRATE</operation><productName>${planName}</productName><ratePlanID>${planId}</ratePlanID><subscriberNumber>${this.currentDial}</subscriberNumber></migrateRequest>`;
    const urlPath = "/Saytar/rest/HekayaPartial/migrate";

    const { headerSig, urlSig, bodySig } = await this.generateSignatures(urlPath, xmlBody);
    const headers = {
      ...this.getBaseHeaders(),
      "auth": `Bearer ${this.authToken}`,
      "headerSignature": headerSig,
      "urlSignature": urlSig,
      "bodySignature": bodySig,
    };

    try {
      const targetUrl = this.getRequestUrl(urlPath);
      const res = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: xmlBody,
      });
      const text = await res.text();
      const isSuccess = res.status === 200 && (
        text.includes("<status>true</status>") ||
        text.includes("<isSuccess>true</isSuccess>") ||
        text.includes("SUCCESS") ||
        text.includes("<statusCode>0</statusCode>")
      );
      if (!isSuccess) {
        this.log(`[!] رد السيرفر على طلب الترحيل: ${text.slice(0, 160)}`, "warn");
      }
      return isSuccess;
    } catch (err: any) {
      this.log(`[-] خطأ في الاتصال أثناء طلب الترحيل: ${err?.message || err}`, "error");
      return false;
    }
  }

  async sendAddChildRequest(childDial: string, productName = "Hekaya_XRP_MIX_Parent_7"): Promise<boolean> {
    const childIntl = childDial.startsWith("0") ? "20" + childDial.substring(1) : childDial;
    this.log(`[*] جاري إرسال دعوة إضافة خط الفرد (${childIntl}) للعائلة بنسبة 10%...`, "info");

    const xmlBody = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><addChildRequest><childNumber>${childIntl}</childNumber><childPercentage>0.10</childPercentage><productId>${productName}</productId><subscriberNumber>${this.currentDial}</subscriberNumber></addChildRequest>`;
    const urlPath = "/Saytar/rest/services/addChild";

    const { headerSig, urlSig, bodySig } = await this.generateSignatures(urlPath, xmlBody);
    const headers = {
      ...this.getBaseHeaders(),
      "auth": `Bearer ${this.authToken}`,
      "headerSignature": headerSig,
      "urlSignature": urlSig,
      "bodySignature": bodySig,
    };

    try {
      const targetUrl = this.getRequestUrl(urlPath);
      const res = await fetch(targetUrl, {
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

// ══════════════════════════════════════════════════════════════════
// CORE VIP AUTOMATION HANDLERS
// ══════════════════════════════════════════════════════════════════

async function handleCheckStatusInternal(
  engine: EtisalatEngine,
  supabase: any,
  session_id: string,
  session: any,
  bridgeConfig: BridgeConfig,
  ownerEmail: string,
  ownerPass: string,
  childEmail: string,
  childPass: string,
  sendEvent?: (type: string, data: any) => Promise<void>
) {
  const loginOk = await engine.login(ownerEmail, ownerPass, true);
  if (!loginOk) {
    return {
      success: false,
      error: "فشل تسجيل الدخول لحساب الأونر. تأكد من صحة البريد وكلمة المرور.",
      logs: engine.logs,
    };
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

  const detectedChild = status.childNumber || (session.individual_account_identifier || null);
  const hasChild = !!status.childNumber || !!detectedChild;
  if (hasChild) {
    engine.log(`[+] تم تأكيد وجود فرد مضاف في العيلة: ${status.childNumber || detectedChild}`, "success");
  } else {
    engine.log(`[!] تنبيه: لا يوجد فرد مضاف في العيلة (يلزم إضافة الفرد بالعائلة أولاً).`, "warn");
  }

  // Check Child account with distinct device profile & IP
  let childBalance: number | null = null;
  let childDial: string | null = null;
  let childPlan: string | null = null;
  let childName: string | null = null;

  if (childEmail && childPass) {
    const childEngine = new EtisalatEngine("child", bridgeConfig);
    childEngine.onLog = (l) => engine.log(l.message, l.level);
    if (await childEngine.login(childEmail, childPass, false, true)) {
      childDial = childEngine.childDial;
      childName = childEngine.customerName;
      const childStatus = await childEngine.getStatusAndChild(true);
      childBalance = childStatus.remainingMix > 0 ? childStatus.remainingMix : 0;
      childPlan = childStatus.planId && childStatus.planId !== "غير معروف" ? engine.getPlanName(childStatus.planId) : "حكاية ميكسات فرد 1";
      const childNameStr = childEngine.customerName ? ` | الاسم: ${childEngine.customerName}` : "";
      engine.log(`[+] حساب الفرد جاهز (الرقم: ${childDial}${childNameStr} | الميكسات: ${(childBalance ?? 0).toLocaleString('en-US')})`, "info");
    }
  }

  const finalOwnerPlanName = engine.getPlanName(ownerPlanId);

  // Update Supabase Database session
  await supabase
    .from("vip_sessions")
    .update({
      owner_account_identifier: engine.ownerDial || session.owner_account_identifier,
      owner_account_status: "verified",
      owner_current_plan: finalOwnerPlanName,
      owner_mix_balance: status.remainingMix,
      last_owner_refresh_at: new Date().toISOString(),
      individual_account_identifier: status.childNumber || childDial || session.individual_account_identifier,
      individual_account_status: childDial ? "verified" : session.individual_account_status,
      individual_current_plan: childPlan || session.individual_current_plan || "حكاية ميكسات فرد 1",
      individual_mix_balance: childBalance !== null ? childBalance : session.individual_mix_balance,
      last_individual_refresh_at: childBalance !== null ? new Date().toISOString() : session.last_individual_refresh_at,
      relationship_verified: hasChild,
      relationship_status: hasChild ? "linked_and_verified" : "no_child_linked",
      relationship_details: {
        owner_name: engine.customerName || null,
        child_name: childName || null,
        child_number: status.childNumber || detectedChild,
        verified_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", session_id);

  return {
    success: true,
    owner: {
      dial: engine.ownerDial,
      name: engine.customerName,
      plan: finalOwnerPlanName,
      mix_balance: status.remainingMix,
      has_child_in_family: hasChild,
      child_number_found: status.childNumber || detectedChild,
      device: engine.device,
    },
    child: {
      dial: childDial,
      name: childName,
      plan: childPlan,
      mix_balance: childBalance,
    },
    logs: engine.logs,
  };
}

async function handleSingleCycleInternal(
  engine: EtisalatEngine,
  supabase: any,
  session_id: string,
  session: any,
  bridgeConfig: BridgeConfig,
  ownerEmail: string,
  ownerPass: string,
  childEmail: string,
  childPass: string,
  sendEvent?: (type: string, data: any) => Promise<void>
) {
  const sendStep = async (step: string, stepNumber: number, title: string, detail?: string) => {
    if (sendEvent) {
      await sendEvent("step", { step, stepNumber, title, detail });
    }
    try {
      await supabase.from("vip_sessions").update({
        current_step: step,
        current_cycle_details: { step, stepNumber, title, detail, updated_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      }).eq("id", session_id);
    } catch (_) {}
  };

  // 1. Login to Owner
  await sendStep("auth", 0, "تسجيل الدخول", "جاري الدخول لحساب الأونر...");
  if (!await engine.login(ownerEmail, ownerPass, true)) {
    return {
      success: false,
      error: "فشل تسجيل الدخول لحساب الأونر.",
      logs: engine.logs,
    };
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

  const childNum = status.childNumber || session.individual_account_identifier;
  if (!childNum) {
    engine.log(`[-] تنبيه حاسم: لا يوجد فرد مضاف في عائلة الأونر على السيرفر.`, "error");
    return {
      success: false,
      error: "لا يوجد فرد مضاف داخل عائلة الأونر حالياً. يرجى الضغط على زر «إضافة وتأكيد الفرد الآن» أولاً.",
      logs: engine.logs,
    };
  }

  const isSeven = ownerPlanPre.includes("Parent_7") || ownerPlanPre.includes("7");
  const ownerPlanName = isSeven ? "Hekaya_XRP_MIX_Parent_7" : "Hekaya_XRP_MIX_Parent_6";

  // 3. STEP 1: Parking Mixes to Child (ركن الميكسات عند الفرد وتدفئة جلسة الفرد مسبقاً)
  await sendStep("parking", 1, "ركن الميكسات وتدفئة الفرد", "نقل ميكسات الأونر للفرد فوراً وتجهيز جلسة الفرد الساخنة");

  // Pre-warm child session in memory so recovery happens in <200ms without login lag
  let prewarmedChildEngine: EtisalatEngine | null = null;
  if (childEmail && childPass) {
    try {
      prewarmedChildEngine = new EtisalatEngine("child", bridgeConfig);
      prewarmedChildEngine.onLog = (l) => engine.log(l.message, l.level);
      const childLoggedIn = await prewarmedChildEngine.login(childEmail, childPass, false, true);
      if (childLoggedIn) {
        engine.log(`[⚡] تم تجهيز جلسة الفرد الساخنة مسبقاً بنجاح (جاهزة للاسترجاع اللحظي السريع).`, "info");
      }
    } catch (_e) {
      engine.log(`[!] تنبيه: تعذر التدفئة المسبقة لجلسة الفرد، سيتم الدخول عند الحاجة.`, "warn");
    }
  }

  if (status.remainingMix > 0) {
    engine.log(`[*] جاري تحويل (${status.remainingMix.toLocaleString('en-US')}) ميكس إلى الرقم: ${childNum} ...`, "info");
    const transferred = await engine.transferMix(childNum, status.remainingMix, ownerPlanName);
    if (transferred) {
      engine.log(`[+] تم تحويل الميكسات بنجاح!`, "success");
    } else {
      engine.log(`[-] تنبيه أمان صارم: فشل تحويل ميكسات الأونر للفرد! تم إيقاف الدورة فوراً لمنع تصفير الرصيد.`, "error");
      await sendStep("safety_stop", 1, "توقف أمان لحماية الميكسات", "فشل نقل الميكسات للفرد - تم إلغاء الترحيل لحماية ميكسات الأونر");
      return {
        success: false,
        safety_stop: true,
        error: "فشل تحويل ميكسات الأونر للفرد. تم إيقاف الدورة لحماية الرصيد ومنع تصفيره.",
        logs: engine.logs,
      };
    }
  } else {
    engine.log(`[*] الأونر رصيده الحالي 0 ميكس. فحص وتأكيد رصيد الفرد...`, "info");
    if (prewarmedChildEngine) {
      const childStatus = await prewarmedChildEngine.getStatusAndChild(true);
      if (childStatus.remainingMix > 0) {
        engine.log(`[+] الفرد جاهز ولديه (${childStatus.remainingMix.toLocaleString('en-US')}) ميكس مركونة بأمان.`, "success");
      }
    }
  }

  await sleep(1000);

  // 4. STEP 2: Switch Plan (ترحيل النظام مع إعادة المحاولة والتنشيط)
  let targetPlanId = "Hekaya_XRP_MIX_Parent_6";
  let targetPlanDisplay = "حكاية ميكسات 180";
  let ratePlanId = "951";

  if (!isSeven) {
    targetPlanId = "Hekaya_XRP_MIX_Parent_7";
    targetPlanDisplay = "حكاية ميكسات 270";
    ratePlanId = "";
  }

  await sendStep("migrating", 2, "ترحيل النظام", `جاري تغيير النظام إلى: ${targetPlanDisplay}`);
  let changePlanSubmitted = await engine.changePlan(targetPlanId, ratePlanId);
  if (!changePlanSubmitted) {
    engine.log(`[*] إعادة محاولة طلب الترحيل إلى (${targetPlanDisplay})...`, "info");
    await sleep(2000);
    changePlanSubmitted = await engine.changePlan(targetPlanId, ratePlanId);
  }

  // 5. STEP 3: Wait Server Confirmation with Active Periodic Reactivation & Warm Child Token
  await sendStep("waiting_server", 3, "انتظار تحديث السيرفر", "فحص دوري كل ثانيتين لتأكيد ترحيل النظام مع تنشيط ذكي تلقائي");
  engine.log(`[*] في انتظار تحديث السيرفر واعتماد النظام الجديد ...`, "info");

  let serverConfirmed = false;
  let confirmedNewMix = 0;
  let confirmedPlanId = "";

  // Poll up to 60 attempts (~150 seconds) with periodic reactivation every 10 attempts
  for (let attempt = 1; attempt <= 60; attempt++) {
    await sleep(2500);
    const currentCheck = await engine.getStatusAndChild(true);
    const planMatches = (targetPlanId.includes("Parent_6") && currentCheck.planId.includes("Parent_6")) ||
                        (targetPlanId.includes("Parent_7") && currentCheck.planId.includes("Parent_7"));

    // Server confirmed the new plan!
    if (planMatches) {
      serverConfirmed = true;
      confirmedNewMix = currentCheck.remainingMix;
      confirmedPlanId = currentCheck.planId;
      engine.log(`[+] السيرفر استجاب وتأكد التحول للنظام (${targetPlanDisplay})! (الميكسات الحالية بالسيرفر: ${confirmedNewMix.toLocaleString('en-US')}) - جاري الانتقال اللحظي الفوري للاسترجاع...`, "success");
      break;
    }

    // Active Smart Reactivation every 10 attempts if server hasn't switched yet
    if (attempt % 10 === 0 && attempt < 60) {
      engine.log(`[*] تنشيط ذكي للسيرفر (محاولة ${attempt}/60): تجديد الجلسة وإعادة دفع طلب الترحيل لنظام (${targetPlanDisplay})...`, "info");

      // 1. Nudge renewal on current plan
      try {
        const renewCost = ownerPlanName.includes("7") ? "270" : "180";
        await engine.renewBundleAction(ownerPlanName, renewCost);
      } catch (_e) {}

      // 2. Refresh owner login session
      try {
        await engine.login(ownerEmail, ownerPass, true, true);
      } catch (_e) {}

      // 3. Keep child session warm too
      if (prewarmedChildEngine && childEmail && childPass) {
        try {
          await prewarmedChildEngine.login(childEmail, childPass, false, true);
        } catch (_e) {}
      }

      // 4. Re-send migration request to nudge operator queue
      try {
        await engine.changePlan(targetPlanId, ratePlanId);
        engine.log(`[+] تم إعادة إرسال طلب الترحيل إلى (${targetPlanDisplay}) بنجاح لتسريع استجابة السيرفر!`, "info");
      } catch (_e) {}
    } else {
      if (attempt % 5 === 0 || attempt === 1) {
        engine.log(`[*] جاري فحص استجابة السيرفر للنظام الجديد... (محاولة ${attempt}/60)`, "info");
      }
    }

    if (sendEvent) {
      await sendEvent("step", {
        step: "waiting_server",
        stepNumber: 3,
        title: "انتظار تحديث السيرفر",
        detail: `جاري الاستعلام وتنشيط السيرفر (محاولة ${attempt}/60)...`,
      });
    }
  }

  // If server took too long and did not switch plan:
  // CRITICAL ZERO-LOSS RULE: NEVER abandon mixes at the child!
  if (!serverConfirmed) {
    engine.log(`[!] تنبيه أمان ذكي: تأخر السيرفر في تأكيد الترحيل. لمنع أي تصفير لاحق للميكسات المركونة، جاري استرجاع الميكسات من الفرد إلى الأونر فوراً على النظام الحالي!`, "warn");
  }

  // 6. STEP 4: Instant Recovery from Child to Owner (استرجاع لحظي فوري بالجلسة الساخنة بدون أي تأخير)
  await sendStep("recovering", 4, "استرجاع لحظي فوري", "إعادة الميكسات المركونة من الفرد إلى الأونر فوراً عبر الجلسة الساخنة");
  if (childEmail && childPass) {
    engine.log(`[⚡] بدء الاسترجاع اللحظي الفوري للميكسات من الفرد للأونر ...`, "info");
    let activeChildEngine = prewarmedChildEngine;
    if (!activeChildEngine || !activeChildEngine.authToken) {
      activeChildEngine = new EtisalatEngine("child", bridgeConfig);
      activeChildEngine.onLog = (l) => engine.log(l.message, l.level);
      await activeChildEngine.login(childEmail, childPass, false, true);
    }

    const childSt = await activeChildEngine.getStatusAndChild(true);
    engine.log(`[+] حالة الفرد | الميكسات المتاحة للاسترجاع: ${childSt.remainingMix.toLocaleString('en-US')}`, "info");

    if (childSt.remainingMix > 0 && engine.ownerDial) {
      engine.log(`[⚡] تحويل فوري (${childSt.remainingMix.toLocaleString('en-US')}) ميكس إلى الرقم: ${engine.ownerDial} ...`, "info");
      let retOk = false;
      for (let t = 1; t <= 3; t++) {
        retOk = await activeChildEngine.transferMix(engine.ownerDial, childSt.remainingMix, "Hekaya_XRP_MIX_Child_1");
        if (retOk) {
          engine.log(`[+] تم استرجاع الميكسات بنجاح إلى الأونر في زمن قياسي!`, "success");
          break;
        }
        if (t < 3) {
          engine.log(`[!] محاولة استرجاع أخرى (${t}/3)...`, "warn");
          // Re-login on failure before retry
          await activeChildEngine.login(childEmail, childPass, false, true);
          await sleep(1000);
        }
      }
      if (!retOk) {
        engine.log(`[!] تنبيه: فشل أمر استرجاع الميكسات من الفرد. الميكسات لا تزال محفوظة عند الفرد (${childSt.remainingMix.toLocaleString('en-US')}).`, "warn");
      }
    } else if (childSt.remainingMix === 0) {
      engine.log(`[*] رصيد الفرد 0 ميكس (تم الاسترجاع أو لا توجد ميكسات مركونة).`, "info");
    }
  }

  // 7. STEP 5: Read Final Mixes & Cooldown (اكتمال الدورة واستراحة)
  await sendStep("cooldown", 5, "اكتمال الدورة واستراحة", "تحديث البيانات وفترة الاستراحة");
  const finalOwnerEngine = new EtisalatEngine("owner", bridgeConfig);
  finalOwnerEngine.onLog = (l) => engine.log(l.message, l.level);
  let finalMix = confirmedNewMix;
  let finalPlan = targetPlanDisplay;
  if (await finalOwnerEngine.login(ownerEmail, ownerPass, true, true)) {
    const finalStatus = await finalOwnerEngine.getStatusAndChild(true);
    finalMix = finalStatus.remainingMix;
    finalPlan = engine.getPlanName(finalStatus.planId);
    engine.log(`[+] رجعنا للأونر | رصيده الآن: ${finalMix.toLocaleString('en-US')} ميكس (النظام: ${finalPlan})`, "success");
  }

  if (!serverConfirmed) {
    return {
      success: false,
      safety_stop: false,
      server_timeout: true,
      error: "تأخر سيرفر اتصالات في ترحيل النظام، ولكن تم استرجاع وحفظ كافة ميكساتك بأمان بحساب الأونر لمنع أي تصفير.",
      logs: engine.logs,
    };
  }

  const newCycleCount = (session.current_cycle || 0) + 1;
  const targetMix = session.target_mix_balance || 50000;
  const targetReached = finalMix >= targetMix;
  const cooldownSec = session.cycle_delay_seconds !== undefined ? session.cycle_delay_seconds : 20;

  if (cooldownSec > 0 && !targetReached) {
    engine.log(`[*] استراحة ${cooldownSec} ثانية قبل الدورة القادمة ...`, "info");
  }

  // Update database
  await supabase
    .from("vip_sessions")
    .update({
      owner_mix_balance: finalMix,
      owner_current_plan: finalPlan,
      current_cycle: newCycleCount,
      current_step: targetReached ? "completed" : "idle",
      last_successful_op_at: new Date().toISOString(),
      last_actual_operation: "single_cycle_completed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", session_id);

  return {
    success: true,
    cycle_number: newCycleCount,
    final_mix: finalMix,
    target_reached: targetReached,
    target_mix: targetMix,
    owner_plan: finalPlan,
    logs: engine.logs,
  };
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
    const { action } = body;

    // ══════════════════════════════════════════════════════════════════
    // GLOBAL ACTION 1: test_bridge (Probe Etisalat & measure ping)
    // ══════════════════════════════════════════════════════════════════
    if (action === "test_bridge") {
      const { data: bridgeRow } = await supabase
        .from("vip_bridge_config")
        .select("*")
        .eq("id", "primary_bridge_config")
        .single();

      const bridgeConfig = (bridgeRow as BridgeConfig) || DEFAULT_BRIDGE_CONFIG;
      const startTime = Date.now();
      let statusText = "ok";
      let statusCode = 200;
      let latencyMs = 0;

      try {
        const probeUrl = bridgeConfig.bridge_enabled && bridgeConfig.bridge_url?.trim()
          ? (bridgeConfig.bridge_url.includes("?") 
              ? `${bridgeConfig.bridge_url}&url=${encodeURIComponent(BASE_URL + "/Saytar/rest/authentication/loginWithPlan")}`
              : `${bridgeConfig.bridge_url.replace(/\/$/, "")}/proxy?url=${encodeURIComponent(BASE_URL + "/Saytar/rest/authentication/loginWithPlan")}`)
          : `${BASE_URL}/Saytar/rest/authentication/loginWithPlan`;

        const res = await fetch(probeUrl, {
          method: "OPTIONS",
          headers: {
            "User-Agent": "okhttp/5.0.0-alpha.11",
            "X-Forwarded-For": bridgeConfig.owner_simulated_ip || "196.205.142.23",
          },
        });
        latencyMs = Date.now() - startTime;
        statusCode = res.status;
        statusText = res.ok || res.status === 405 || res.status === 200 ? "connected" : `HTTP ${res.status}`;
      } catch (err: any) {
        latencyMs = Date.now() - startTime;
        statusCode = 502;
        statusText = err?.message || "connection_failed";
      }

      await supabase
        .from("vip_bridge_config")
        .update({
          last_ping_status: statusText,
          last_ping_ms: latencyMs,
          last_ping_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", "primary_bridge_config");

      return new Response(JSON.stringify({
        success: true,
        status: statusText,
        status_code: statusCode,
        latency_ms: latencyMs,
        bridge_enabled: bridgeConfig.bridge_enabled,
        bridge_url: bridgeConfig.bridge_url,
        owner_ip: bridgeConfig.owner_simulated_ip,
        child_ip: bridgeConfig.child_simulated_ip,
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // GLOBAL ACTION 2: get_bridge_config
    // ══════════════════════════════════════════════════════════════════
    if (action === "get_bridge_config") {
      const { data, error } = await supabase
        .from("vip_bridge_config")
        .select("*")
        .eq("id", "primary_bridge_config")
        .single();

      return new Response(JSON.stringify({
        success: !error,
        config: data || DEFAULT_BRIDGE_CONFIG,
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // GLOBAL ACTION 3: update_bridge_config
    // ══════════════════════════════════════════════════════════════════
    if (action === "update_bridge_config") {
      const updateData = {
        bridge_enabled: body.bridge_enabled ?? false,
        bridge_url: body.bridge_url ?? "",
        bridge_mode: body.bridge_mode ?? "direct",
        bridge_auth: body.bridge_auth ?? "",
        owner_device_id: body.owner_device_id ?? DEFAULT_BRIDGE_CONFIG.owner_device_id,
        owner_model_type: body.owner_model_type ?? DEFAULT_BRIDGE_CONFIG.owner_model_type,
        owner_os_version: body.owner_os_version ?? DEFAULT_BRIDGE_CONFIG.owner_os_version,
        owner_user_agent: body.owner_user_agent ?? DEFAULT_BRIDGE_CONFIG.owner_user_agent,
        owner_simulated_ip: body.owner_simulated_ip ?? DEFAULT_BRIDGE_CONFIG.owner_simulated_ip,
        child_device_id: body.child_device_id ?? DEFAULT_BRIDGE_CONFIG.child_device_id,
        child_model_type: body.child_model_type ?? DEFAULT_BRIDGE_CONFIG.child_model_type,
        child_os_version: body.child_os_version ?? DEFAULT_BRIDGE_CONFIG.child_os_version,
        child_user_agent: body.child_user_agent ?? DEFAULT_BRIDGE_CONFIG.child_user_agent,
        child_simulated_ip: body.child_simulated_ip ?? DEFAULT_BRIDGE_CONFIG.child_simulated_ip,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("vip_bridge_config")
        .upsert({ id: "primary_bridge_config", ...updateData })
        .select()
        .single();

      return new Response(JSON.stringify({
        success: !error,
        config: data,
        error: error?.message,
      }), {
        status: error ? 400 : 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // GLOBAL ACTION 4: get_bot_scripts
    // ══════════════════════════════════════════════════════════════════
    if (action === "get_bot_scripts") {
      const { data, error } = await supabase
        .from("vip_bot_scripts")
        .select("*")
        .order("created_at", { ascending: false });

      return new Response(JSON.stringify({
        success: !error,
        scripts: data || [],
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // GLOBAL ACTION 5: save_bot_script
    // ══════════════════════════════════════════════════════════════════
    if (action === "save_bot_script") {
      const { script_id, name, version, script_code, is_active, notes } = body;
      if (!script_code) {
        return new Response(JSON.stringify({ success: false, error: "كود الاسكريبت فارغ" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      if (is_active) {
        await supabase
          .from("vip_bot_scripts")
          .update({ is_active: false })
          .neq("id", "none");
      }

      const upsertPayload = {
        id: script_id || `script_${Date.now()}`,
        name: name || "اسكريبت مخصص جديد",
        version: version || "v1.1.0",
        script_code,
        is_active: is_active ?? true,
        notes: notes || "",
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("vip_bot_scripts")
        .upsert(upsertPayload)
        .select()
        .single();

      return new Response(JSON.stringify({
        success: !error,
        script: data,
        error: error?.message,
      }), {
        status: error ? 400 : 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // SESSION SPECIFIC ACTIONS
    // ══════════════════════════════════════════════════════════════════
    const { session_id } = body;
    if (!session_id) {
      return new Response(JSON.stringify({ success: false, error: "Missing session_id" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Fetch Session from Supabase
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

    // Fetch Bridge & Device Config
    const { data: bridgeRow } = await supabase
      .from("vip_bridge_config")
      .select("*")
      .eq("id", "primary_bridge_config")
      .single();

    const bridgeConfig = (bridgeRow as BridgeConfig) || DEFAULT_BRIDGE_CONFIG;

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

    const engine = new EtisalatEngine("owner", bridgeConfig);

    // ══════════════════════════════════════════════════════════════════
    // REALTIME SSE STREAMING DISPATCHER (Live Console & Stepper)
    // ══════════════════════════════════════════════════════════════════
    if (body.stream === true && (action === "single_cycle" || action === "run_single_cycle" || action === "check_status")) {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      const sendEvent = async (type: string, data: any) => {
        try {
          await writer.write(encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`));
        } catch (_) {
          // Client disconnected
        }
      };

      engine.onLog = (logObj) => {
        sendEvent("log", { log: logObj });
      };

      (async () => {
        try {
          if (action === "check_status") {
            const result = await handleCheckStatusInternal(
              engine,
              supabase,
              session_id,
              session,
              bridgeConfig,
              ownerEmail,
              ownerPass,
              childEmail,
              childPass,
              sendEvent
            );
            await sendEvent("complete", result);
          } else {
            const result = await handleSingleCycleInternal(
              engine,
              supabase,
              session_id,
              session,
              bridgeConfig,
              ownerEmail,
              ownerPass,
              childEmail,
              childPass,
              sendEvent
            );
            await sendEvent("complete", result);
          }
        } catch (err: any) {
          await sendEvent("error", { error: err?.message || String(err) });
        } finally {
          try {
            await writer.close();
          } catch (_) {}
        }
      })();

      return new Response(readable, {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // ACTION 1: check_status (Standard JSON mode)
    // ══════════════════════════════════════════════════════════════════
    if (action === "check_status") {
      const result = await handleCheckStatusInternal(
        engine,
        supabase,
        session_id,
        session,
        bridgeConfig,
        ownerEmail,
        ownerPass,
        childEmail,
        childPass
      );
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // ACTION 2: add_child
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
      await sleep(2500);

      // Step 2: Login to Child and activate account
      if (childEmail && childPass) {
        engine.log(`[*] الخطوة 2/4: تسجيل الدخول للفرد لتفعيل حسابه قبل الدعوة...`, "info");
        const childEngine = new EtisalatEngine("child", bridgeConfig);
        if (await childEngine.login(childEmail, childPass, false)) {
          const childStatus = await childEngine.getStatusAndChild(true);
          if (childStatus.planId && childStatus.planId.includes("Parent_7")) {
            await childEngine.renewBundleAction("Hekaya_XRP_MIX_Parent_7", "270");
          } else {
            await childEngine.renewBundleAction("Hekaya_XRP_MIX_Parent_6", "180");
          }
          await sleep(2500);
        }
      }

      // Step 3: Switch back to Owner to send addChild invitation
      engine.log(`[*] الخطوة 3/4: الرجوع للأونر لإرسال دعوة الإضافة بنسبة 10%...`, "info");
      const ownerEngine = new EtisalatEngine("owner", bridgeConfig);
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
            const childAcceptEngine = new EtisalatEngine("child", bridgeConfig);
            if (await childAcceptEngine.login(childEmail, childPass, false, true)) {
              await childAcceptEngine.renewBundleAction("Hekaya_XRP_MIX_Parent_7", "270");
              await sleep(2500);
            }
          }

          const verifyOwner = new EtisalatEngine("owner", bridgeConfig);
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
          ownerEngine.log(`[-] فشل إرسال الدعوة. المحاولة التالية بعد 4 ثواني...`, "warn");
          await sleep(4000);
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
          message: `تم ربط وتأكيد الفرد ${finalChildNumber} في عائلة الأونر بنجاح!`,
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
    // ACTION 3: single_cycle / run_single_cycle (Standard JSON mode)
    // ══════════════════════════════════════════════════════════════════
    if (action === "single_cycle" || action === "run_single_cycle") {
      const result = await handleSingleCycleInternal(
        engine,
        supabase,
        session_id,
        session,
        bridgeConfig,
        ownerEmail,
        ownerPass,
        childEmail,
        childPass
      );
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
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
        await sleep(2500);
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
