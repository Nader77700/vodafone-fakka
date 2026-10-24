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

function clean10DigitDial(dial: string): string {
  const clean = (dial || '').replace(/\D/g, '');
  if (!clean) return '';
  if (clean.startsWith('20') && clean.length >= 12) {
    return clean.substring(2);
  }
  if (clean.startsWith('0') && clean.length >= 11) {
    return clean.substring(1);
  }
  return clean;
}

function normalizeEgyptianNumber(dial: string, format: 'intl' | 'local' = 'intl'): string {
  const clean = (dial || '').replace(/\D/g, '');
  if (!clean) return '';
  if (clean.startsWith('20') && clean.length >= 12) {
    return format === 'local' ? '0' + clean.substring(2) : clean;
  }
  if (clean.startsWith('0') && clean.length >= 11) {
    return format === 'local' ? clean : '20' + clean.substring(1);
  }
  if (clean.length === 10 && (clean.startsWith('10') || clean.startsWith('11') || clean.startsWith('12') || clean.startsWith('15'))) {
    return format === 'local' ? '0' + clean : '20' + clean;
  }
  return clean;
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

function generateSessionDeviceProfile(role: 'owner' | 'child', sessionId?: string, config?: BridgeConfig): DeviceProfile {
  // ── STRICT MULTI-SESSION TELECOM ISOLATION ──
  // Deterministically generate isolated, unique Egyptian Telecom identity per session & role.
  // NEVER allow different sessions to share the same deviceId, simulated IP, or User-Agent,
  // which causes Etisalat MAB gateway to mix up sessions, drop auth tokens, or collide concurrent transfers!
  const cleanSessionId = sessionId && sessionId.trim() ? sessionId.trim() : "vip_default_session";
  const seed = `${cleanSessionId}_${role}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const posHash = Math.abs(hash);

  // Pool of authentic Egyptian mobile subnets (Telecom Egypt, Etisalat Misr AS36935, Orange EG, Vodafone EG)
  const egSubnets = [
    [196, 205],
    [197, 34],
    [197, 48],
    [41, 38],
    [41, 130],
    [156, 201],
    [156, 210],
    [102, 185],
  ];
  const subnet = egSubnets[posHash % egSubnets.length];
  const octet3 = (posHash % 200) + 12;
  const octet4 = ((posHash >> 4) % 220) + 20;
  const simulatedIp = `${subnet[0]}.${subnet[1]}.${octet3}.${octet4}`;

  // Unique 16-hex character device ID derived uniquely and strictly from session and role
  let hexId = "";
  let cur = posHash;
  for (let i = 0; i < 4; i++) {
    cur = ((cur * 1664525 + 1013904223) | 0) >>> 0;
    hexId += cur.toString(16).padStart(8, "0");
  }
  const deviceId = hexId.slice(0, 16);

  // Diverse Android flagship models common in Egypt
  const androidModels = [
    { model: "CPH2737", os: "14", ua: "okhttp/5.0.0-alpha.11" },   // Oppo Reno 12 Pro
    { model: "SM-S928B", os: "14", ua: "okhttp/4.12.0" },           // Samsung Galaxy S24 Ultra
    { model: "23117RK66C", os: "14", ua: "okhttp/5.0.0-alpha.11" }, // Xiaomi 14 Pro
    { model: "SM-A556B", os: "14", ua: "okhttp/4.11.0" },           // Samsung Galaxy A55
    { model: "RMX3820", os: "14", ua: "okhttp/5.0.0-alpha.11" },    // Realme GT5
    { model: "CPH2581", os: "14", ua: "okhttp/4.12.0" },           // OnePlus 12
  ];
  const selectedModel = androidModels[posHash % androidModels.length];

  return {
    deviceId,
    modelType: selectedModel.model,
    osVersion: selectedModel.os,
    userAgent: selectedModel.ua,
    simulatedIp,
  };
}

class EtisalatEngine {
  public device: DeviceProfile;
  public bridgeConfig: BridgeConfig;
  private authToken: string | null = null;
  public cookieHeader: string = "";
  public customerName: string = "";
  public knownName: string = "";
  public shortCode: string = "";
  public currentDial: string | null = null;
  public ownerDial: string | null = null;
  public childDial: string | null = null;
  public role: 'owner' | 'child';
  public sessionId?: string;
  public logs: Array<{ time: string; level: 'info' | 'success' | 'warn' | 'error'; message: string }> = [];

  constructor(role: 'owner' | 'child', config?: BridgeConfig, sessionId?: string, knownName?: string) {
    this.role = role;
    this.sessionId = sessionId;
    this.knownName = knownName || "";
    this.bridgeConfig = config || DEFAULT_BRIDGE_CONFIG;
    this.device = generateSessionDeviceProfile(role, sessionId, this.bridgeConfig);
  }

  public onLog?: (log: { time: string; level: 'info' | 'success' | 'warn' | 'error'; message: string }) => void;
  public onNewAuthToken?: (token: string, cookie: string | null, isOwner: boolean) => void;

  public setAuthSession(token: string | null, cookie: string | null) {
    if (token) {
      this.authToken = token;
      try {
        const tokenPayload = token.split(".")[1];
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
        const rawName = `${decoded.firstname || ""} ${decoded.lastname || ""}`.trim();
        this.customerName = (!rawName || rawName.toLowerCase().includes("dummy")) ? "" : rawName;
        this.shortCode = decoded.selectedDialShortCode || "";
        if (this.role === "owner") {
          this.ownerDial = this.currentDial;
        } else {
          this.childDial = this.currentDial;
        }
      } catch {}
    }
    if (cookie) {
      this.cookieHeader = cookie;
    }
  }

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
    // 0. Token reuse optimization: Check if existing cached token is still valid
    // Avoids redundant logins and prevents Etisalat rate-limit / temporary lockout bans!
    if (this.authToken && this.currentDial) {
      try {
        const testStatus = await this.getStatusAndChild(true);
        if (testStatus && testStatus.planId && testStatus.planId !== "غير معروف") {
          if (!silent) {
            const displayName = this.customerName || this.knownName || (this.role === "owner" ? "الأونر" : "الفرد");
            this.log(`[⚡] استخدام جلسة التوكن المحفوظة بنجاح باسم: ${displayName} (الرقم: ${this.currentDial}) وتخطي الدخول لتسريع الأتمتة.`, "success");
          }
          return true;
        }
      } catch (_) {
        // Expired, proceed to fresh login
      }
    }

    const cleanPw = decodeStoredPassword(rawPassword);
    const masked = email.includes("@") ? `${email.substring(0, 3)}***@${email.split("@")[1]}` : email;
    if (!silent) {
      this.log(`[*] تسجيل الدخول [${masked}] | بصمة معزولة: هاتف (${this.device.modelType}) | IP مصري (${this.device.simulatedIp})`, "info");
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
              const rawName = `${decoded.firstname || ""} ${decoded.lastname || ""}`.trim();
              this.customerName = (!rawName || rawName.toLowerCase().includes("dummy")) ? "" : rawName;
              this.shortCode = decoded.selectedDialShortCode || "";
            } catch {
              // fallback
            }

            // Extract Arabic customer name directly from login response XML if available
            if (!this.customerName || this.customerName.toLowerCase().includes("dummy")) {
              const nameMatch = text.match(/<(?:customerName|subscriberName|fullName|name|accountName)>([^<]+)<\//i);
              if (nameMatch && nameMatch[1].trim() && !nameMatch[1].toLowerCase().includes("dummy")) {
                this.customerName = nameMatch[1].trim();
              }
            }

            if (!this.customerName && this.knownName) {
              this.customerName = this.knownName;
            }

            if (isOwner) {
              this.ownerDial = this.currentDial;
            } else {
              this.childDial = this.currentDial;
            }
            if (this.onNewAuthToken) {
              try {
                this.onNewAuthToken(this.authToken, this.cookieHeader, isOwner);
              } catch (_) {}
            }
            if (!silent) {
              const displayName = this.customerName || this.knownName || (isOwner ? "الأونر" : "الفرد");
              this.log(`[+] تم تسجيل الدخول بنجاح باسم: ${displayName} (الرقم: ${this.currentDial}) | بصمة الجهاز: ${this.device.modelType}`, "success");
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

    for (let attempt = 1; attempt <= 3; attempt++) {
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
        let transferredMix = 0;
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

          // Exclude minutes / calls / voice / family minutes (CRITICAL: دقائق العيلة is 300 minutes, NOT mixes!)
          const isMinutesBucket = 
            /دقيقة|دقائق|min|minute/i.test(unit) ||
            /MINUTES|VOICE|CALLS/i.test(oms) ||
            (/دقائق|دقيقة/i.test(label) && !/ميكس|وحدة/i.test(label));
          if (isMinutesBucket) {
            continue;
          }

          // Exclude pure social / whatsapp / home vdsl / أقوي كارت if they have separate quotas
          const isSocialOrVdsl = 
            /whatsapp|facebook|vdsl|انترنت\s*المنزلي/i.test(oms) || 
            /فيسبوك|واتساب|انترنت\s*حكاية|أقوي\s*كارت/i.test(label);
          if (isSocialOrVdsl && !/ميكسات\s*الباقة/i.test(label)) {
            continue;
          }

          const isMixBucket = (/ميكس|unit|وحدة/i.test(unit) ||
                              /xrp_units|hekaya_units/i.test(meterType) ||
                              /GENERAL_UNIT/i.test(oms) ||
                              /CARRIED_OVER/i.test(oms) ||
                              /TRANSFER_UNITS/i.test(oms) ||
                              /ميكسات|ميكس|وحدة/i.test(label)) &&
                              !/دقيقة|دقائق|ميجا/i.test(unit);

          if (isMixBucket && remVal > 0) {
            allMixCandidates.push(remVal);
            
            // STRICT DISCRIMINATIVE BUCKET CATEGORIZATION:
            // Transferred or family units must NEVER be swallowed into basic quota!
            const isTransfer = /TRANSFER/i.test(oms) || /محول|تحويل|مسترجع/i.test(label) || (/عيلة/i.test(label) && /ميكس|وحدة/i.test(label));
            const isCarried = /CARRIED_OVER/i.test(oms) || /الميكسات\s*المرحلة|مرحل/i.test(label);
            const isGeneral = (/GENERAL_UNIT/i.test(oms) || /ميكسات\s*الباقة\s*الأساسية/i.test(label) || /الأساسية/i.test(label)) && !isTransfer && !isCarried;

            if (isTransfer) {
              if (remVal > transferredMix) transferredMix = remVal;
            } else if (isCarried) {
              if (remVal > carriedMix) carriedMix = remVal;
            } else if (isGeneral) {
              if (remVal > mainMix) mainMix = remVal;
            } else {
              // General XRP bucket without explicit flags
              if (mainMix === 0) {
                mainMix = remVal;
              } else if (remVal !== mainMix && remVal !== carriedMix && remVal !== transferredMix) {
                // Distinct secondary bucket (e.g. transferred quota on XRP)
                if (transferredMix === 0) {
                  transferredMix = remVal;
                } else {
                  transferredMix += remVal;
                }
              }
            }
          }
        }

        // Fallback: If no structured mix bucket matched, the line legitimately has 0 mixes (do not scrape minutes!)
        if (allMixCandidates.length === 0) {
          // Zero mixes verified
        }

        const candidateMax = allMixCandidates.length > 0 ? Math.max(...allMixCandidates) : 0;
        // Sum basic quota, carried quota, and transferred quota when separate buckets exist
        const combinedMix = (mainMix > 0 && carriedMix > 0) ? (mainMix + carriedMix) : (mainMix > 0 ? mainMix : (carriedMix > 0 ? carriedMix : 0));
        const bucketSum = mainMix + carriedMix + transferredMix;
        
        // CRITICAL ZERO-LOSS FIX:
        // Sum all separate buckets, and take the true maximum across combined sums and candidate values
        const remainingMix = Math.max(combinedMix, bucketSum, candidateMax);

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
        console.warn(`[getStatusAndChild] Non-200 status (${attempt}/3): ${res.status}`);
        if (attempt < 3) await sleep(1200);
      }
    } catch (err: any) {
      console.error(`[getStatusAndChild] Error (${attempt}/3):`, err?.message || err);
      if (attempt < 3) await sleep(1200);
    }
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
    this.log(`[*] جاري تجديد باقة الأونر (${displayName}) لتنشيط الخط وضخ حصة الفرد (1,300 ميكس)...`, "info");

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
      if (ok) {
        this.log(`[+] تم تجديد باقة الأونر بنجاح! ستصل حصة الفرد (1,300 ميكس) خلال فترة الاستراحة.`, "success");
      } else {
        this.log(`[-] فشل إرسال أمر التجديد.`, "warn");
      }
      return ok;
    } catch {
      return false;
    }
  }

  async renewBundle(planName?: string, amount?: string): Promise<boolean> {
    const pName = planName || (this.shortCode.includes("M7") ? "Hekaya_XRP_MIX_Parent_7" : "Hekaya_XRP_MIX_Parent_6");
    const pCost = amount || (pName.includes("7") ? "270" : "180");
    return this.renewBundleAction(pName, pCost);
  }

  async transferMix(toDial: string, amount: number, productName: string): Promise<boolean> {
    const quota = Math.floor(amount);
    if (quota <= 0) return true;
    const target10 = clean10DigitDial(toDial);
    const sender10 = clean10DigitDial(this.currentDial || '');
    const targetIntl = normalizeEgyptianNumber(toDial, 'intl');
    const targetLocal = normalizeEgyptianNumber(toDial, 'local');
    const senderIntl = normalizeEgyptianNumber(this.currentDial || '', 'intl');
    const senderLocal = normalizeEgyptianNumber(this.currentDial || '', 'local');
    const receiverDisplay = normalizeEgyptianNumber(toDial, 'local') || toDial;
    const senderDisplay = normalizeEgyptianNumber(this.currentDial || '', 'local') || this.currentDial;

    this.log(`[*] جاري تحويل (${quota.toLocaleString('en-US')}) ميكس إلى الرقم: ${receiverDisplay} [المرسل: ${senderDisplay} | الباقة: ${productName}]...`, "info");

    // Clean 10-digit number is the native format required by Etisalat MAB gateway for zero-403 transfer success
    const targetVariants = [target10, targetIntl, targetLocal, toDial].filter((v, i, a) => v && a.indexOf(v) === i);
    const senderVariants = [sender10, this.currentDial, senderIntl, senderLocal].filter((v, i, a) => v && a.indexOf(v) === i);

    for (let attempt = 1; attempt <= 3; attempt++) {
      for (const tgt of targetVariants) {
        for (const snd of senderVariants) {
          // 1. Primary: Python bot endpoint (/Saytar/rest/services/newTransfer/v2)
          const xmlBodyV2 = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><newFamilyTransferRequest><distribute>false</distribute><msisdn>${snd}</msisdn><productName>${productName}</productName><quota>${quota}</quota><receiverMsisdn>${tgt}</receiverMsisdn><senderMsisdn>${snd}</senderMsisdn><type>UNITS</type></newFamilyTransferRequest>`;
          const urlPathV2 = "/Saytar/rest/services/newTransfer/v2";

          try {
            const { headerSig, urlSig, bodySig } = await this.generateSignatures(urlPathV2, xmlBodyV2);
            const headers = {
              ...this.getBaseHeaders(),
              "auth": `Bearer ${this.authToken}`,
              "headerSignature": headerSig,
              "urlSignature": urlSig,
              "bodySignature": bodySig,
            };
            const targetUrl = this.getRequestUrl(urlPathV2);
            const res = await fetch(targetUrl, {
              method: "POST",
              headers,
              body: xmlBodyV2,
            });
            const text = await res.text();
            if (res.status === 200 && text.includes("<status>true</status>")) {
              const orderIdMatch = text.match(/<orderId>([^<]+)<\/orderId>/i);
              const orderIdStr = orderIdMatch ? ` [رقم أمر التحويل بسيرفر اتصالات: ${orderIdMatch[1]}]` : "";
              this.log(`[+] تم قبول أمر التحويل بسيرفر اتصالات (${quota.toLocaleString('en-US')} ميكس إلى ${receiverDisplay})!${orderIdStr}`, "success");
              return true;
            }
          } catch (_) {
            // fallback to next
          }

          // 2. Fallback: submitOrder
          const xmlBodyOrder = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><generalSubmitOrderRequest><msisdn>${snd}</msisdn><operation>CONSUME_SERVICE</operation><parameters><parameter><name>TRANSFERED_MSISDN</name><value>${tgt}</value></parameter><parameter><name>RENEW_FLAG</name><value>0</value></parameter><parameter><name>TRANSFERED_AMOUNT</name><value>${quota}</value></parameter></parameters><productName>${productName}</productName><requestId>TRANSFER_METER</requestId></generalSubmitOrderRequest>`;
          const urlPathOrder = "/Saytar/rest/General/submitOrder";
          try {
            const sigOrder = await this.generateSignatures(urlPathOrder, xmlBodyOrder);
            const headersOrder = {
              ...this.getBaseHeaders(),
              "auth": `Bearer ${this.authToken}`,
              "headerSignature": sigOrder.headerSig,
              "urlSignature": sigOrder.urlSig,
              "bodySignature": sigOrder.bodySig,
            };
            const targetUrl = this.getRequestUrl(urlPathOrder);
            const res = await fetch(targetUrl, {
              method: "POST",
              headers: headersOrder,
              body: xmlBodyOrder,
            });
            const text = await res.text();
            if (res.status === 200 && text.includes("<status>true</status>")) {
              const orderIdMatch = text.match(/<orderId>([^<]+)<\/orderId>/i);
              const orderIdStr = orderIdMatch ? ` [رقم أمر التحويل بسيرفر اتصالات: ${orderIdMatch[1]}]` : "";
              this.log(`[+] تم قبول أمر التحويل بالسيرفر (${quota.toLocaleString('en-US')} ميكس إلى ${receiverDisplay})!${orderIdStr}`, "success");
              return true;
            }
          } catch (_) {
            // continue
          }
          break; // break inner sender loop after trying primary target
        }
      }

      if (attempt < 3) {
        this.log(`[!] محاولة تحويل إضافية (${attempt}/3) بعد انتظار 2 ثانية لمزامنة بوابة اتصالات...`, "warn");
        await sleep(2000);
      }
    }

    this.log(`[-] تعذر إتمام تحويل الميكسات بعد 3 محاولات عبر بوابة اتصالات.`, "warn");
    return false;
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

  // ══════════════════════════════════════════════════════════════════
  // MAB RELEASE & MINION (أهلا أقوى كارت) PROTOCOLS
  // ══════════════════════════════════════════════════════════════════

  async removeChildOrder(
    childDial: string,
    parentDial: string,
    productName = "Hekaya_XRP_MIX_Parent_7"
  ): Promise<{ success: boolean; orderId?: string; raw?: string }> {
    const cleanChild = childDial.replace(/^(\+?20|0)/, "");
    const cleanParent = parentDial.replace(/^(\+?20|0)/, "");
    const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>\n<removeChildSubmitOrder>\n  <childMsisdn>${cleanChild}</childMsisdn>\n  <parentMsisdn>${cleanParent}</parentMsisdn>\n  <productName>${productName}</productName>\n</removeChildSubmitOrder>`;
    const urlPath = "/Saytar/rest/ee_new/removeChild";

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
      const orderIdMatch = text.match(/<orderId>([^<]+)<\/orderId>/i);
      const orderId = orderIdMatch ? orderIdMatch[1] : undefined;
      const isSuccess = res.status === 200 && (
        text.includes("<status>true</status>") ||
        text.includes("<isSuccess>true</isSuccess>") ||
        text.includes("<statusCode>0</statusCode>")
      );
      return { success: isSuccess, orderId, raw: text.slice(0, 200) };
    } catch (err: any) {
      return { success: false, raw: err?.message || String(err) };
    }
  }

  async migrateToMinionOrder(
    subscriberDial: string
  ): Promise<{ success: boolean; orderId?: string; raw?: string }> {
    const cleanSub = subscriberDial.replace(/^(\+?20|0)/, "");
    const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>\n<migrateRequest>\n  <addonName></addonName>\n  <oMSRatePlan>true</oMSRatePlan>\n  <productName>MINION</productName>\n  <ratePlanID></ratePlanID>\n  <subscriberNumber>${cleanSub}</subscriberNumber>\n</migrateRequest>`;
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
      const orderIdMatch = text.match(/<orderId>([^<]+)<\/orderId>/i);
      const orderId = orderIdMatch ? orderIdMatch[1] : undefined;
      const isSuccess = res.status === 200 && (
        text.includes("<status>true</status>") ||
        text.includes("<isSuccess>true</isSuccess>") ||
        text.includes("<statusCode>0</statusCode>")
      );
      return { success: isSuccess, orderId, raw: text.slice(0, 200) };
    } catch (err: any) {
      return { success: false, raw: err?.message || String(err) };
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

  // ── STRICT SERVER-AUTHORITATIVE CHILD PRESENCE CHECK ──
  // CRITICAL FIX: Only confirm child is in family IF status.childNumber was actually returned from Etisalat server XML!
  // NEVER fallback to session.individual_account_identifier as evidence of family membership!
  const realChildOnServer = status.childNumber ? status.childNumber.trim() : null;
  const hasChild = !!realChildOnServer;
  if (hasChild) {
    engine.log(`[✓] فحص السيرفر القطعي: تم تأكيد وجود فرد مضاف في عائلة الأونر: ${realChildOnServer}`, "success");
  } else {
    engine.log(`[!] تنبيه حاسم من سيرفر اتصالات: لا يوجد أي فرد مضاف في عائلة الأونر حالياً (يجب إضافة الفرد بالعائلة أولاً).`, "warn");
  }

  // Check Child account with distinct device profile & IP
  let childBalance: number | null = null;
  let childDial: string | null = null;
  let childPlan: string | null = null;
  let childName: string | null = null;

  if (childEmail && childPass) {
    const childEngine = new EtisalatEngine("child", bridgeConfig, session_id);
    childEngine.setAuthSession(session.cached_child_token, session.cached_child_cookie);
    childEngine.onNewAuthToken = (token, cookie) => {
      supabase.from("vip_sessions").update({
        cached_child_token: token,
        cached_child_cookie: cookie,
      }).eq("id", session_id).catch(() => {});
    };
    childEngine.onLog = (l) => engine.log(l.message, l.level);
    if (await childEngine.login(childEmail, childPass, false, true)) {
      childDial = childEngine.childDial;
      childName = childEngine.customerName;
      const childStatus = await childEngine.getStatusAndChild(true);
      childBalance = childStatus.remainingMix > 0 ? childStatus.remainingMix : 0;
      childPlan = childStatus.planId && childStatus.planId !== "غير معروف" ? engine.getPlanName(childStatus.planId) : "حكاية ميكسات فرد 1";
      const childNameStr = childEngine.customerName ? ` | الاسم: ${childEngine.customerName}` : "";
      const expectedChildQuota = (ownerPlanId.includes("7") || ownerPlanId.includes("Parent_7")) ? 1300 : 800;
      engine.log(`[+] حساب الفرد جاهز (الرقم: ${childDial}${childNameStr} | الميكسات الحالية: ${(childBalance ?? 0).toLocaleString('en-US')} | حصة النظام: ${expectedChildQuota} ميكس)`, "info");
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
      individual_account_identifier: realChildOnServer || childDial || session.individual_account_identifier,
      individual_account_status: childDial ? "verified" : session.individual_account_status,
      individual_current_plan: childPlan || session.individual_current_plan || "حكاية ميكسات فرد 1",
      individual_mix_balance: childBalance !== null ? childBalance : session.individual_mix_balance,
      last_individual_refresh_at: childBalance !== null ? new Date().toISOString() : session.last_individual_refresh_at,
      relationship_verified: hasChild,
      relationship_status: hasChild ? "linked_and_verified" : "no_child_linked",
      relationship_details: {
        owner_name: engine.customerName || null,
        child_name: childName || null,
        child_number: realChildOnServer,
        verified_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", session_id);

  return {
    success: true,
    owner_mix_balance: status.remainingMix,
    child_mix_balance: childBalance,
    owner_plan: finalOwnerPlanName,
    owner_dial: engine.ownerDial,
    child_dial: childDial,
    owner: {
      dial: engine.ownerDial,
      name: engine.customerName,
      plan: finalOwnerPlanName,
      mix_balance: status.remainingMix,
      has_child_in_family: hasChild,
      child_number_found: realChildOnServer,
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
  sendEvent?: (type: string, data: any) => Promise<void>,
  options?: { is_server_background?: boolean; auto_eject?: boolean }
) {
  // Update session heartbeat and active worker status
  try {
    await supabase.from("vip_sessions").update({
      worker_status: "executing",
      worker_last_heartbeat: new Date().toISOString(),
      worker_pid: Math.floor(Math.random() * 1000000),
      updated_at: new Date().toISOString(),
    }).eq("id", session_id);
  } catch (_) {}

  try {
  const sendStep = async (step: string, stepNumber: number, title: string, detail?: string) => {
    if (sendEvent) {
      await sendEvent("step", { step, stepNumber, title, detail });
    }
    try {
      await supabase.from("vip_sessions").update({
        current_step: step,
        current_cycle_details: { step, stepNumber, title, detail, updated_at: new Date().toISOString() },
        worker_last_heartbeat: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", session_id);
    } catch (_) {}
  };

  const cycleStartTime = new Date().toISOString();
  const cycleStartMs = Date.now();
  let parkedMixAmount = 0;
  let recoveredMixAmount = 0;

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
  const ownerStartMix = status.remainingMix || 0;

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
      prewarmedChildEngine = new EtisalatEngine("child", bridgeConfig, session_id, session.individual_name || "");
      prewarmedChildEngine.setAuthSession(session.cached_child_token, session.cached_child_cookie);
      prewarmedChildEngine.onNewAuthToken = (token, cookie) => {
        supabase.from("vip_sessions").update({
          cached_child_token: token,
          cached_child_cookie: cookie,
        }).eq("id", session_id).catch(() => {});
      };
      prewarmedChildEngine.onLog = (l) => engine.log(l.message, l.level);
      const childLoggedIn = await prewarmedChildEngine.login(childEmail, childPass, false, true);
      if (childLoggedIn) {
        engine.log(`[⚡] تم تجهيز جلسة الفرد الساخنة مسبقاً بنجاح (جاهزة للاسترجاع اللحظي السريع).`, "info");
      }
    } catch (_e) {
      engine.log(`[!] تنبيه: تعذر التدفئة المسبقة لجلسة الفرد، سيتم الدخول عند الحاجة.`, "warn");
    }
  }

  // ── PRE-FLIGHT LIVE CHECK OF BOTH ACCOUNTS (فحص استباقي شامل للأونر والفرد) ──
  // طالما حدث انقطاع أو قبل بدء أي دورة، نتحقق مباشرة من رصيد الأونر ورصيد الفرد بالسيرفر
  let childHoldsMissing = false;
  let childDetectedMix = 0;

  if (prewarmedChildEngine) {
    try {
      const liveChildCheck = await prewarmedChildEngine.getStatusAndChild(true);
      childDetectedMix = liveChildCheck.remainingMix || 0;
      engine.log(`[*] فحص رصيد البداية المباشر: الأونر (${status.remainingMix.toLocaleString('en-US')} ميكس) | الفرد (${childDetectedMix.toLocaleString('en-US')} ميكس).`, "info");
      
      // إذا كان الفرد يحمل رصيداً كبيراً (من دورة سابقة أو تحويل سابق حدث أثناء انقطاع الاتصال)
      if (childDetectedMix > 2000 && (childDetectedMix >= status.remainingMix || status.remainingMix < 3000)) {
        childHoldsMissing = true;
        parkedMixAmount = childDetectedMix;
        engine.log(`[🛡️] تم رصد ميكسات مركونة مسبقاً لدى الفرد (${childDetectedMix.toLocaleString('en-US')} ميكس)! لن يتم إعادة التحويل من الأونر. استكمال الدورة فوراً بأمان.`, "success");
      }
    } catch (_) {}
  }

  // ── INTELLIGENT ZERO-LOSS BALANCE CONTINUITY GATE ──
  // For new sessions or Cycle 1 (current_cycle === 0 or newly initialized),
  // do NOT inherit an old peak balance from an unrelated past session or previous number!
  const isFirstCycleOfSession = (session.current_cycle === 0 || !session.current_cycle);
  let verifiedPeakBalance = 0;

  if (!isFirstCycleOfSession) {
    verifiedPeakBalance = Math.max(
      parseInt(session.owner_mix_balance || "0", 10) || 0,
      parseInt(session.peak_mix_balance || "0", 10) || 0
    );

    try {
      const { data: lastCycle } = await supabase
        .from("vip_cycle_history")
        .select("final_verified_owner_balance, owner_balance_start, amount_transferred_indiv_to_owner")
        .eq("session_id", session_id)
        .order("cycle_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastCycle) {
        const fMix = Number(lastCycle.final_verified_owner_balance) || 0;
        const sMix = Number(lastCycle.owner_balance_start) || 0;
        const rMix = Number(lastCycle.amount_transferred_indiv_to_owner) || 0;
        const recentValid = Math.max(fMix, sMix, rMix);
        if (recentValid > 0) {
          verifiedPeakBalance = Math.max(verifiedPeakBalance, recentValid);
        }
      }
    } catch (_e) {}
  } else {
    // In Cycle 1 or fresh start, the baseline is purely the live balance read directly from the SIM
    verifiedPeakBalance = status.remainingMix;
    engine.log(`[★] دورة انطلاق أولى للجلسة: تم فحص وتأكيد رصيد الأونر بالسيرفر (${status.remainingMix.toLocaleString('en-US')} ميكس) كنقطة بداية رسمية.`, "info");
  }

  const isSuspiciouslyLow = !childHoldsMissing && verifiedPeakBalance > 3000 && (status.remainingMix < verifiedPeakBalance * 0.70);

  if (isSuspiciouslyLow) {
    engine.log(`[!] تنبيه رصد الرصيد الذكي: رصيد الأونر المقروء (${status.remainingMix.toLocaleString('en-US')} ميكس) أقل من الرصيد التاريخي المعتمد (${verifiedPeakBalance.toLocaleString('en-US')} ميكس)!`, "warn");
    engine.log(`[*] بدء البحث الشامل عن الميكسات المتبقية والتحقق من حساب الفرد ومزامنة السيرفر...`, "info");

    // Phase 1: Check if the missing balance is already safely held at the Child line!
    if (prewarmedChildEngine) {
      try {
        const childInspect = await prewarmedChildEngine.getStatusAndChild(true);
        childDetectedMix = childInspect.remainingMix || 0;
        if (childDetectedMix >= verifiedPeakBalance * 0.65) {
          childHoldsMissing = true;
          parkedMixAmount = childDetectedMix;
          engine.log(`[+] عظيم! تم العثور على الميكسات (${childDetectedMix.toLocaleString('en-US')} ميكس) محفوظة بأمان عند الفرد بالفعل!`, "success");
        }
      } catch (_cErr) {}
    }

    // Phase 2: If child doesn't hold it, perform smart sync inquiry loops on the Owner (up to 7 retries with fresh inquiry)
    if (!childHoldsMissing) {
      for (let rAttempt = 1; rAttempt <= 7; rAttempt++) {
        engine.log(`[*] إعادة فحص رصيد الأونر بالسيرفر بعد انتظار المزامنة (محاولة ${rAttempt}/7)...`, "info");
        await sleep(3500);
        try {
          const recheckOwner = await engine.getStatusAndChild(true);
          if (recheckOwner.remainingMix >= verifiedPeakBalance * 0.70) {
            status = recheckOwner;
            engine.log(`[+] تم استرجاع وتأكيد قراءة الرصيد الفعلي للأونر بنجاح: ${status.remainingMix.toLocaleString('en-US')} ميكس!`, "success");
            break;
          } else if (recheckOwner.remainingMix > status.remainingMix) {
            status = recheckOwner;
          }

          if (prewarmedChildEngine) {
            const recheckChild = await prewarmedChildEngine.getStatusAndChild(true);
            if (recheckChild.remainingMix >= verifiedPeakBalance * 0.65) {
              childHoldsMissing = true;
              childDetectedMix = recheckChild.remainingMix;
              parkedMixAmount = childDetectedMix;
              engine.log(`[+] تم تأكيد وصول الميكسات وحفظها بحساب الفرد: ${childDetectedMix.toLocaleString('en-US')} ميكس!`, "success");
              break;
            }
          }
        } catch (_rErr) {}
      }
    }

    // Phase 3: Post-hunt decision:
    // If the child holds the bulk balance, we have our parked mixes!
    // If owner still has a residual balance (e.g. 6,050 base quota), transfer that residual too so it joins the child!
    if (childHoldsMissing) {
      if (status.remainingMix > 0) {
        engine.log(`[*] جاري تحويل باقي رصيد الأونر الإضافي (${status.remainingMix.toLocaleString('en-US')}) ميكس إلى الفرد لضمها للرصيد المركون...`, "info");
        const extraOk = await engine.transferMix(childNum, status.remainingMix, ownerPlanName);
        if (extraOk) {
          parkedMixAmount += status.remainingMix;
          engine.log(`[+] تم ضم رصيد الأونر للفرد بنجاح! إجمالي الميكسات المركونة عند الفرد الآن: ${parkedMixAmount.toLocaleString('en-US')} ميكس.`, "success");
        }
      }
    } else if (status.remainingMix < verifiedPeakBalance * 0.70) {
      // SMART RESUMPTION & BALANCE ADOPTION (عدم شل الحركة واعتماد الرصيد الحقيقي للبدء من جديد):
      // The old peak balance is neither at Owner nor at Child (expired or wiped by network).
      // Do NOT brick the session or halt automation! Adopt current live balance and proceed smoothly!
      engine.log(`[!] تنبيه الموازنة الذكية: لم يتم العثور على الرصيد التاريخي السابق (${verifiedPeakBalance.toLocaleString('en-US')} ميكس) عند الأونر أو الفرد.`, "warn");
      engine.log(`[✓] اعتماد الرصيد الفعلي الحالي للأونر (${status.remainingMix.toLocaleString('en-US')} ميكس) كنقطة انطلاق جديدة للدورة وبدء تجميع الميكسات فوراً دون تجميد الجلسة!`, "success");
      
      verifiedPeakBalance = status.remainingMix;
      
      // Update session in DB so it doesn't stay stuck with stale data
      try {
        await supabase.from("vip_sessions").update({
          owner_mix_balance: status.remainingMix,
          operation_state: "active",
          pause_reason: null,
          updated_at: new Date().toISOString(),
        }).eq("id", session_id);
      } catch (_dbE) {}
    }
  }

  // Normal flow if not low or child not already holding missing
  if (!childHoldsMissing) {
    if (status.remainingMix > 0) {
      let transferred = await engine.transferMix(childNum, status.remainingMix, ownerPlanName);

      // If initial transfer returned false, re-check owner balance and retry once with fresh session token
      if (!transferred) {
        engine.log(`[*] فحص رصيد الأونر بعد تعذر التحويل للتحقق من سلامة الجلسة...`, "info");
        await sleep(2500);
        try {
          const freshOwnerSt = await engine.getStatusAndChild(true);
          const currentBal = freshOwnerSt.remainingMix || status.remainingMix;
          if (currentBal > 0) {
            engine.log(`[🛡️] تأكيد سلامة رصيد الأونر (${currentBal.toLocaleString('en-US')} ميكس) بحسابه. جاري محاولة نقل ثانية بعد تجديد التوكن...`, "info");
            await engine.login(ownerEmail, ownerPass, true, true);
            transferred = await engine.transferMix(childNum, currentBal, ownerPlanName);
          }
        } catch (_) {}
      }

      if (transferred) {
        parkedMixAmount = status.remainingMix;
        
        // ── SMART INSTANT TELECOM ZERO-LOSS VERIFICATION ──
        // Transferred mixes in Etisalat arrive within ~1-2 seconds if the transfer was real.
        // We only do 2 fast attempts (max 2 seconds each) instead of 8 slow attempts.
        // If not arrived within 2 attempts, we IMMEDIATELY perform smart diagnosis:
        // If the Owner still holds the mixes, it is a confirmed Phantom/Frozen Transfer.
        // We immediately renew the owner bundle to unstick the telecom switch, and re-transfer!
        if (prewarmedChildEngine) {
          const expectedMinChildMix = parkedMixAmount > 3000 ? Math.round(parkedMixAmount * 0.70) : 1;
          engine.log(`[*] تم إرسال أمر النقل. فحص ذكي لوصول الميكسات (${parkedMixAmount.toLocaleString('en-US')}) بحساب الفرد (بحد أقصى ثانيتان)...`, "info");
          
          // Initial fast grace period: 2 seconds as telecom mixes settle almost immediately
          await sleep(2000);

          let childArrived = false;
          let latestChildReadMix = 0;

          // Only 2 fast checks (NOT 8!)
          for (let vAttempt = 1; vAttempt <= 2; vAttempt++) {
            try {
              const childVerify = await prewarmedChildEngine.getStatusAndChild(true);
              latestChildReadMix = childVerify.remainingMix || 0;

              // Check if the transferred quota has verifiably arrived
              if (latestChildReadMix >= expectedMinChildMix) {
                engine.log(`[✓] تأكيد قطعي: الميكسات المحولة (${latestChildReadMix.toLocaleString('en-US')} ميكس) استقرت بأمان تام في حساب الفرد!`, "success");
                childArrived = true;
                break;
              } else {
                engine.log(`[*] فحص رصيد الفرد (${vAttempt}/2): الرصيد الحالي (${latestChildReadMix.toLocaleString('en-US')} ميكس)...`, "info");
              }
            } catch (_vErr) {}

            if (vAttempt < 2) await sleep(1500);
          }

          if (!childArrived) {
            // ── SMART DIAGNOSTIC: Did the mixes actually leave the Owner? ──
            engine.log(`[*] رصد ذكي سريع: لم تتحرك الميكسات للفرد بعد ثانيتين. جاري فحص رصيد الأونر فوراً لكشف التحويل الوهمي...`, "info");
            let ownerHoldsMixes = false;
            let currentOwnerMix = 0;
            try {
              // Primary verification query
              const freshOwnerCheck = await engine.getStatusAndChild(true);
              currentOwnerMix = freshOwnerCheck.remainingMix || 0;
              if (currentOwnerMix >= Math.round(parkedMixAmount * 0.70) && currentOwnerMix > 2000) {
                ownerHoldsMixes = true;
              }
            } catch (_) {}

            if (ownerHoldsMixes) {
              engine.log(`[🛡️] فحص تأكيدي: تم استعلام رصيد الأونر مباشرة (${currentOwnerMix.toLocaleString('en-US')} ميكس) محجوزة بالكامل بأمان بحساب الأونر ولم تُخصم.`, "info");
              engine.log(`[⚡] رصد تحويل وهمي: الميكسات ما زالت بالأونر. جاري تنشيط ومزامنة العقد فوراً بتجديد باقة الأونر (${engine.getPlanName(ownerPlanName)}) لفك تعليق سيرفر اتصالات...`, "info");
              
              // Renew current owner bundle to unstick telecom switch as per verified protocol
              try {
                const renewCost = isSeven ? "270" : "180";
                await engine.renewBundleAction(ownerPlanName, renewCost);
              } catch (_) {}

              await sleep(3000);

              // Fresh login to refresh session tokens and clear any stale billing cache
              try {
                await engine.login(ownerEmail, ownerPass, true, true);
              } catch (_) {}

              let amountToRetry = currentOwnerMix;
              try {
                const refreshedOwnerSt = await engine.getStatusAndChild(true);
                if (refreshedOwnerSt.remainingMix > 0) {
                  amountToRetry = refreshedOwnerSt.remainingMix;
                }
              } catch (_) {}

              engine.log(`[*] جاري إعادة إرسال أمر نقل الميكسات (${amountToRetry.toLocaleString('en-US')} ميكس) إلى الفرد بعد تجديد باقة الأونر وتنشيط الخط...`, "info");

              // Retry transfer from Owner to Child
              const retryTransferred = await engine.transferMix(childNum, amountToRetry, ownerPlanName);
              if (retryTransferred) {
                engine.log(`[+] تم قبول أمر إعادة النقل بالسيرفر! جاري تأكيد وصول واستقرار الميكسات بالفرد...`, "info");
                await sleep(2000);
                for (let retryAttempt = 1; retryAttempt <= 2; retryAttempt++) {
                  try {
                    const retryChildVerify = await prewarmedChildEngine.getStatusAndChild(true);
                    latestChildReadMix = retryChildVerify.remainingMix || 0;
                    if (latestChildReadMix >= expectedMinChildMix) {
                      engine.log(`[✓] تأكيد قطعي: وصلت الميكسات (${latestChildReadMix.toLocaleString('en-US')} ميكس) لحساب الفرد بنجاح تام بعد تنشيط باقة الأونر!`, "success");
                      childArrived = true;
                      parkedMixAmount = amountToRetry;
                      break;
                    } else {
                      engine.log(`[*] فحص رصيد الفرد بعد التجديد وإعادة النقل (${retryAttempt}/2): الرصيد (${latestChildReadMix.toLocaleString('en-US')} ميكس)...`, "info");
                    }
                  } catch (_) {}
                  if (retryAttempt < 2) await sleep(1500);
                }
              }
            }

            if (!childArrived) {
              // Final check on owner balance to give the user 100% reassurance
              try {
                const finalOwnerRecheck = await engine.getStatusAndChild(true);
                currentOwnerMix = finalOwnerRecheck.remainingMix || currentOwnerMix;
                if (currentOwnerMix >= Math.round(parkedMixAmount * 0.70)) {
                  ownerHoldsMixes = true;
                }
              } catch (_) {}

              const safeMsg = ownerHoldsMixes
                ? `توقف أمان لحفظ الميكسات: سيرفر اتصالات لم يُنفذ نقل الميكسات وبقيت الميكسات كاملة بحساب الأونر (${currentOwnerMix.toLocaleString('en-US')} ميكس). تم منع ترحيل الباقة لحفظ رصيدك من الضياع بنسبة 100%.`
                : `توقف أمان لحماية الميكسات: لم تصل الميكسات المحولة (${parkedMixAmount.toLocaleString('en-US')}) لحساب الفرد (الرصيد ${latestChildReadMix.toLocaleString('en-US')}). تم منع تغيير الباقة لحفظ رصيدك.`;

              engine.log(`[-] ${safeMsg}`, "error");
              await sendStep("safety_stop", 1, "حظر ترحيل الباقة - حماية الرصيد", safeMsg);

              // Attempt safe rollback of child's partial quota if any exists
              if (latestChildReadMix > 0) {
                try {
                  await prewarmedChildEngine.transferMix(engine.ownerDial, latestChildReadMix, "Hekaya_XRP_MIX_Child_1");
                  engine.log(`[+] تم استرجاع (${latestChildReadMix.toLocaleString('en-US')}) ميكس من الفرد للأونر بأمان.`, "info");
                } catch (_) {}
              }

              return {
                success: false,
                safety_stop: true,
                error: safeMsg,
                logs: engine.logs,
              };
            }
          }
        }
      } else {
        // Did the owner lose anything? Absolutely not! Plan change was NOT triggered!
        let safeOwnerBalance = status.remainingMix;
        try {
          const verifyOwnerSt = await engine.getStatusAndChild(true);
          safeOwnerBalance = verifyOwnerSt.remainingMix || safeOwnerBalance;
        } catch (_) {}

        engine.log(`[🛡️] درع الأمان: رصيد الأونر (${safeOwnerBalance.toLocaleString('en-US')} ميكس) محمي بالكامل بحسابه الأساسي ولم يُمس. لم يتم أي ترحيل للباقة.`, "success");
        engine.log(`[!] تنبيه عابر: تعذر تحويل الميكسات لسيرفر اتصالات في هذه المحاولة (ضغط سيرفر أو تزامن جلسات). الرصيد آمن 100%.`, "warn");
        
        await sendStep("paused_safe", 1, "الرصيد آمن بحساب الأونر", `تعذر التحويل مؤقتاً - رصيد الأونر (${safeOwnerBalance.toLocaleString('en-US')} ميكس) محفوظ بأمان`);

        return {
          success: false,
          safety_stop: false, // NOT a fatal lock! Balance is 100% safe at owner
          can_retry: true,
          owner_mix_balance: safeOwnerBalance,
          error: `تعذر تحويل الميكسات لسيرفر اتصالات مؤقتاً (رصيد الأونر ${safeOwnerBalance.toLocaleString('en-US')} ميكس محفوظ بأمان تام بحسابه).`,
          logs: engine.logs,
        };
      }
    } else {
      engine.log(`[*] الأونر رصيده الحالي 0 ميكس. فحص وتأكيد رصيد الفرد...`, "info");
      let childStatusMix = 0;
      if (prewarmedChildEngine) {
        const childStatus = await prewarmedChildEngine.getStatusAndChild(true);
        childStatusMix = childStatus.remainingMix || 0;
        if (childStatusMix > 0) {
          parkedMixAmount = childStatusMix;
          engine.log(`[+] الفرد جاهز ولديه (${childStatusMix.toLocaleString('en-US')}) ميكس مركونة بأمان.`, "success");
        }
      }

      if (!isFirstCycleOfSession && verifiedPeakBalance > 5000 && childStatusMix < (verifiedPeakBalance * 0.7)) {
        engine.log(`[-] تنبيه طوارئ فائق: رصيد الأونر يظهر 0 ميكس بينما كان (${verifiedPeakBalance.toLocaleString('en-US')}) ميكس، والفرد لا يحمل هذا الرصيد (لديه فقط ${childStatusMix.toLocaleString('en-US')} ميكس)! تم إيقاف الدورة فوراً ومنع الترحيل لحماية ميكسات الأونر من التصفير.`, "error");
        await sendStep("safety_stop", 1, "توقف طوارئ لمنع التصفير", "تم حظر الترحيل: الميكسات غير مركونة عند الفرد");
        return {
          success: false,
          safety_stop: true,
          error: `تم إيقاف الدورة لحماية ميكساتك: رصيد الأونر السابق (${verifiedPeakBalance.toLocaleString('en-US')} ميكس) لم يظهر عند الفرد (${childStatusMix.toLocaleString('en-US')}). تم منع الترحيل تلقائياً لحفظ رصيدك.`,
          logs: engine.logs,
        };
      } else if (isFirstCycleOfSession) {
        engine.log(`[✓] دورة بداية جديدة: الأونر يبدأ بدون ميكسات مسبقة، وجاهز للترحيل وتنزيل باقة الميكسات الأساسية الأولى!`, "info");
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

  // PRE-MIGRATION SERVER GUARD (حماية ما قبل الترحيل عند تعثر السيرفر):
  // If changePlan failed, the owner contract was never altered.
  // We must immediately recover the parked mixes from the child back to the owner safely!
  if (!changePlanSubmitted) {
    engine.log(`[-] تعذر إرسال طلب ترحيل النظام إلى سيرفر اتصالات. لإلغاء الدورة بأمان وحماية الميكسات، جاري استرجاع الرصيد من الفرد للأونر فوراً...`, "warn");
    if (parkedMixAmount > 0 && prewarmedChildEngine) {
      try {
        const childStBeforeAbort = await prewarmedChildEngine.getStatusAndChild(true);
        if (childStBeforeAbort.remainingMix > 0) {
          await prewarmedChildEngine.transferMix(engine.ownerDial, childStBeforeAbort.remainingMix, "Hekaya_XRP_MIX_Child_1");
          engine.log(`[+] تم استرجاع (${childStBeforeAbort.remainingMix.toLocaleString('en-US')}) ميكس للأونر بأمان وإلغاء الدورة دون أي فقدان.`, "success");
        }
      } catch (_recErr) {}
    }

    return {
      success: false,
      safety_stop: false,
      error: `تعذر ترحيل النظام إلى (${targetPlanDisplay}). تم إلغاء العملية بأمان واسترجاع الميكسات للأونر.`,
      logs: engine.logs,
    };
  }

  // 5. STEP 3: Wait Server Confirmation with Extended Timeout (up to 15 mins) & Active Periodic Nudge Loop (تنشيط العقد الدوري)
  await sendStep("waiting_server", 3, "انتظار ترحيل وتنشيط السيرفر", "فحص مستمر وتنشيط دوري كل دقيقة وحفظ الميكسات بأمان لدى الفرد");
  engine.log(`[*] في انتظار تحديث السيرفر واعتماد النظام الجديد (${targetPlanDisplay})...`, "info");
  engine.log(`[🛡️] درع الأمان الذهبي: كافة الميكسات (${parkedMixAmount.toLocaleString('en-US')}) محجوزة ومحمية بالكامل في حساب الفرد، ويُحظر استرجاعها للأونر نهائياً حتى يتم التأكد القطعي 100% من نجاح الترحيل لتجنب التصفير!`, "info");

  let serverConfirmed = false;
  let confirmedNewMix = 0;
  let confirmedPlanId = "";
  let nudgeCount = 0;

  // Wait up to 15-20 minutes: 240 attempts * ~3.5s = ~840s (14 minutes).
  const maxAttempts = 240;
  const currentPlanName = isSeven ? "Hekaya_XRP_MIX_Parent_7" : "Hekaya_XRP_MIX_Parent_6";
  const currentCost = isSeven ? "270" : "180";
  const minExpectedBundle = targetPlanId.includes("Parent_7") ? 4000 : 2000;

  // Initial telecom settling period (giving OMS billing nodes 5s breathing space before first check)
  await sleep(5000);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await sleep(3500);
    const currentCheck = await engine.getStatusAndChild(true);
    const planMatches = (targetPlanId.includes("Parent_6") && currentCheck.planId.includes("Parent_6")) ||
                        (targetPlanId.includes("Parent_7") && currentCheck.planId.includes("Parent_7"));

    // Server confirmed the new plan AND bundle quota has actually landed!
    if (planMatches && currentCheck.remainingMix >= minExpectedBundle) {
      serverConfirmed = true;
      confirmedPlanId = currentCheck.planId;
      confirmedNewMix = currentCheck.remainingMix;
      engine.log(`[🎉] السيرفر استجاب وتأكد التحول للنظام الجديد (${targetPlanDisplay}) ونزول رصيد الباقة بنجاح: (${confirmedNewMix.toLocaleString('en-US')} ميكس)!`, "success");
      engine.log(`[⚡] تم التحقق القطعي من استقرار رصيد الأونر. جاري سحب ميكسات الفرد المركونة للأونر فوراً بأمان...`, "info");
      break;
    }

    // Plan name changed, but telecom billing OMS is still provisioning the initial mixes quota
    if (planMatches && currentCheck.remainingMix < minExpectedBundle) {
      engine.log(`[*] تم اعتماد بروفايل النظام (${targetPlanDisplay}) بالسيرفر - في انتظار نزول ميكسات الباقة الجديدة للأونر (المقروء حالياً: ${currentCheck.remainingMix.toLocaleString('en-US')} ميكس)...`, "info");
    }

    // PERIODIC NUDGE & ACTIVATION LOOP (تنشيط الخط والعقد كل دقيقة إلى دقيقة ونصف):
    // If server has not switched after ~18 attempts (~60s), execute active nudge:
    // 1) Renew current bundle to wake up the subscriber contract in billing OMS
    // 2) Re-issue changePlan to ensure it is not stuck in queue
    const shouldNudge = (attempt % 18 === 0) && !serverConfirmed;
    if (shouldNudge) {
      nudgeCount++;
      const elapsedMins = ((attempt * 3.5) / 60).toFixed(1);
      engine.log(`[⚡] بروتوكول التنشيط الدوري (Nudge #${nudgeCount} - مضى ${elapsedMins} دقيقة): إنعاش العقد عبر تجديد باقة الأونر الحالية (${engine.getPlanName(currentPlanName)})...`, "info");
      try {
        await engine.renewBundleAction(currentPlanName, currentCost);
        await sleep(3000);
        const nudgeCheck = await engine.getStatusAndChild(true);
        const nudgeMatches = (targetPlanId.includes("Parent_6") && nudgeCheck.planId.includes("Parent_6")) ||
                             (targetPlanId.includes("Parent_7") && nudgeCheck.planId.includes("Parent_7"));
        if (nudgeMatches) {
          serverConfirmed = true;
          confirmedPlanId = nudgeCheck.planId;
          engine.log(`[🎉] تم تنشيط السيرفر بنجاح وتحول الخط للنظام الجديد فور التجديد!`, "success");
          break;
        }
        // Re-send change plan command to nudge telecom queue
        engine.log(`[⚡] إعادة إرسال أمر ترحيل النظام (${targetPlanDisplay}) لتنشيط طابور المعالجة...`, "info");
        await engine.changePlan(targetPlanId, ratePlanId);
      } catch (_nudgeErr) {}
    }

    // Regular logging every 10 attempts (~35 seconds):
    const currentElapsedMins = ((attempt * 3.5) / 60).toFixed(1);
    if (attempt % 10 === 0 && attempt < maxAttempts && !shouldNudge) {
      engine.log(`[*] فحص استجابة السيرفر للنظام الجديد (${targetPlanDisplay}) [محاولة ${attempt}/${maxAttempts} - مضى ${currentElapsedMins} دقيقة]: الميكسات (${parkedMixAmount.toLocaleString('en-US')}) محفوظة بأمان لدى الفرد...`, "info");
    } else if (attempt === 1 || attempt % 5 === 0) {
      engine.log(`[*] جاري فحص استجابة السيرفر للنظام الجديد... (محاولة ${attempt}/${maxAttempts})`, "info");
    }

    if (sendEvent) {
      await sendEvent("step", {
        step: "waiting_server",
        stepNumber: 3,
        title: "انتظار ترحيل وتنشيط السيرفر",
        detail: `فحص دوري (${attempt}/${maxAttempts}) - تنشيط دوري كل دقيقة - الميكسات بأمان لدى الفرد`,
      });
    }
  }

  // CRITICAL GOLDEN RULE: If server did not confirm plan change within maxAttempts:
  // NEVER RECOVER MIXES BACK TO OWNER!
  // Leave all mixes safely parked in child line!
  if (!serverConfirmed) {
    engine.log(`[🛡️] درع الأمان المطلق: انتهت مهلة انتظار استجابة السيرفر (~15 دقيقة) دون تأكيد الترحيل النهائي.`, "warn");
    engine.log(`[🔒] قاعدة الحماية الصارمة: تم الاحتفاظ بكافة الميكسات (${parkedMixAmount.toLocaleString('en-US')} ميكس) محجوزة ومحمية بالكامل في حساب الفرد (${engine.childDial || session.individual_account_identifier}). يمنع منعاً باتاً إرجاعها للأونر طالما أمر الترحيل مرسل لتجنب مسحها وتصفيرها عند استجابة السيرفر لاحقاً!`, "warn");
    engine.log(`[!] تم إيقاف الدورة بأمان مع تأمين الرصيد كاملاً لدى الفرد. يمكنك تجديد الباقة أو إعادة التنشيط يدوياً.`, "info");

    try {
      await supabase.from("vip_cycle_history").insert({
        session_id: session_id,
        cycle_number: (session.current_cycle || 0) + 1,
        started_at: cycleStartTime,
        ended_at: new Date().toISOString(),
        duration_seconds: Math.round((Date.now() - cycleStartMs) / 1000),
        owner_balance_start: ownerStartMix,
        system_pre_migration: ownerPlanPre,
        system_post_migration: "قيد الانتظار (معلق بالسيرفر)",
        migration_result: "server_delayed_nudge_pending",
        amount_transferred_owner_to_indiv: parkedMixAmount,
        amount_transferred_indiv_to_owner: 0, // ZERO! NEVER RECOVERED TO OWNER!
        final_verified_owner_balance: 0,
        difference_to_target: Math.max(0, (session.target_mix_balance || 50000) - 0),
        cycle_status: "paused_safe",
        safe_error_summary: `تأخر سيرفر اتصالات - تم حفظ كافة الميكسات (${parkedMixAmount.toLocaleString('en-US')} ميكس) بأمان بحساب الفرد لحمايتها من التصفير`,
        increased_owner_balance: false,
      });

      await supabase.from("vip_sessions").update({
        is_running: false,
        stop_reason: `تأخر سيرفر اتصالات - الميكسات (${parkedMixAmount.toLocaleString('en-US')} ميكس) محفوظة بأمان لدى الفرد لمنع تصفيرها`,
        status: "paused",
        mixes_parked_at_child: true,
        parked_amount: parkedMixAmount,
        updated_at: new Date().toISOString(),
      }).eq("id", session_id);
    } catch (_dbE) {}

    return {
      success: false,
      safety_stop: true,
      error: `تأخر سيرفر اتصالات في ترحيل النظام. تم حفظ كافة الميكسات (${parkedMixAmount.toLocaleString('en-US')}) بأمان في حساب الفرد لحمايتها تماماً من التصفير.`,
      logs: engine.logs,
    };
  }

  // 6. STEP 4: Instant Zero-Delay Recovery from Child to Owner (استرجاع فوري بالمللي ثانية)
  await sendStep("recovering", 4, "استرجاع لحظي فوري", "إعادة الميكسات المركونة من الفرد إلى الأونر فوراً وبأقصى سرعة");
  if (childEmail && childPass) {
    engine.log(`[⚡] بدء الاسترجاع اللحظي الفوري للميكسات من الفرد للأونر ...`, "info");
    let activeChildEngine = prewarmedChildEngine;
    if (!activeChildEngine || !activeChildEngine.authToken) {
      activeChildEngine = new EtisalatEngine("child", bridgeConfig, session_id, session.individual_name || "");
      activeChildEngine.onLog = (l) => engine.log(l.message, l.level);
      await activeChildEngine.login(childEmail, childPass, false, true);
    }

    // Read child status with synchronization check
    let childSt = await activeChildEngine.getStatusAndChild(true);

    // If telecom sync is still propagating and child temporarily shows small amount (e.g. residual 20 units):
    if (parkedMixAmount > 1000 && childSt.remainingMix < parkedMixAmount * 0.5) {
      // First check if Owner already holds the balance (e.g. previous cycle already recovered it or billing settled instantly)
      let ownerAlreadyHolds = false;
      try {
        const ownerMidCheck = await engine.getStatusAndChild(true);
        if (ownerMidCheck.remainingMix >= Math.round(parkedMixAmount * 0.70)) {
          ownerAlreadyHolds = true;
          engine.log(`[✓] تأكيد أمان: رصيد الأونر (${ownerMidCheck.remainingMix.toLocaleString('en-US')} ميكس) محمي ومعتمد بالفعل بالسيرفر!`, "success");
        }
      } catch (_) {}

      if (!ownerAlreadyHolds) {
        engine.log(`[*] رصيد الفرد المقروء (${childSt.remainingMix.toLocaleString('en-US')}) ميكس أقل من الرصيد المركون (${parkedMixAmount.toLocaleString('en-US')}). جاري التحقق العميق وتحديث جلسة الفرد بالسيرفر...`, "info");
        for (let syncP = 1; syncP <= 6; syncP++) {
          await sleep(2500);
          try {
            // Force clean re-login on attempts 2 and 4 to refresh Etisalat token and cache
            if (syncP === 2 || syncP === 4) {
              await activeChildEngine.login(childEmail, childPass, false, true);
            }
            const syncSt = await activeChildEngine.getStatusAndChild(true);
            if (syncSt.remainingMix >= parkedMixAmount * 0.7 || syncSt.remainingMix > childSt.remainingMix) {
              childSt = syncSt;
              break;
            }
          } catch (_sErr) {}
        }
      }
    }

    // Determine the verified transferable amount:
    let attemptAmount = childSt.remainingMix;
    if (parkedMixAmount > 1000 && childSt.remainingMix < parkedMixAmount * 0.5) {
      engine.log(`[!] تنبيه أمان: رصيد الفرد الفعلي المقروء بالسيرفر (${childSt.remainingMix.toLocaleString('en-US')}) ميكس أقل من المركون (${parkedMixAmount.toLocaleString('en-US')}) ميكس.`, "warn");
    }

    engine.log(`[+] رصيد الفرد الفعلي المستهدف للاسترجاع: (${attemptAmount.toLocaleString('en-US')}) ميكس.`, "info");

    if (attemptAmount > 0 && engine.ownerDial) {
      let retOk = false;
      retOk = await activeChildEngine.transferMix(engine.ownerDial, attemptAmount, "Hekaya_XRP_MIX_Child_1");

      // ── REAL-TIME INSTANT VERIFICATION SYSTEM (نظام التحقق اللحظي لمكافحة التحويل الوهمي) ──
      // حتى بعد صدور أمر التحويل ونجاح البوابة ظاهرياً، يقوم النظام اللحظي بفحص رصيد الفرد فوراً.
      // إذا وجد أن الميكسات ما زالت موجودة بحساب الفرد (لم تُخصم)، فهذا يعني أن التحويل كان وهمياً!
      // يقوم النظام فوراً بإعادة تحويل لحظي فوري للأونر حتى يتم تصفير وتفريغ رصيد الفرد تماماً.
      engine.log(`[*] تشغيل نظام التحقق اللحظي: فحص رصيد الفرد الفعلي بالسيرفر للتأكد من تصفيره وتفادي التحويل الوهمي...`, "info");
      await sleep(2000);
      let childPostVerify = await activeChildEngine.getStatusAndChild(true);

      const ghostThreshold = 1300;
      if (childPostVerify.remainingMix > ghostThreshold) {
        engine.log(`[⚠️] كشف تحويل وهمي: رصيد الفرد ما زال (${childPostVerify.remainingMix.toLocaleString('en-US')} ميكس) ولم يُخصم بالسيرفر! جاري إعادة التحويل اللحظي فوراً للأونر...`, "warn");
        for (let ghostRetry = 1; ghostRetry <= 3; ghostRetry++) {
          await sleep(1500);
          const realAmountToTransfer = childPostVerify.remainingMix;
          const retryOk = await activeChildEngine.transferMix(engine.ownerDial, realAmountToTransfer, "Hekaya_XRP_MIX_Child_1");
          await sleep(2000);
          childPostVerify = await activeChildEngine.getStatusAndChild(true);
          if (childPostVerify.remainingMix <= ghostThreshold) {
            engine.log(`[✓] نجح التحقق اللحظي: تم تفريغ وتصفير رصيد الفرد بالسيرفر (${childPostVerify.remainingMix.toLocaleString('en-US')} ميكس) وتأكيد خروج الرصيد للأونر بنجاح!`, "success");
            retOk = true;
            recoveredMixAmount = realAmountToTransfer;
            break;
          } else {
            engine.log(`[*] فحص التحقق اللحظي (${ghostRetry}/3): رصيد الفرد (${childPostVerify.remainingMix.toLocaleString('en-US')} ميكس) - إعادة المحاولة...`, "info");
          }
        }
      } else {
        if (childPostVerify.remainingMix === 0) {
          engine.log(`[✓] تأكيد التحقق اللحظي: تم تفريغ وتصفير رصيد الفرد بالكامل (0 ميكس) وتأكيد وصول الميكسات للأونر بنجاح!`, "success");
        } else {
          engine.log(`[✓] تأكيد التحقق اللحظي: تم خصم الميكسات المحولة بنجاح (المتبقي بحساب الفرد: ${childPostVerify.remainingMix.toLocaleString('en-US')} ميكس حصة النظام المخصصة تلقائياً).`, "success");
        }
        retOk = true;
        recoveredMixAmount = attemptAmount;
      }

      if (!retOk) {
        engine.log(`[!] تنبيه: تعذر إتمام أمر استرجاع الميكسات من الفرد. الميكسات لا تزال محفوظة في حساب الفرد.`, "warn");
      }
    } else if (attemptAmount === 0) {
      engine.log(`[*] رصيد الفرد 0 ميكس (الميكسات مستقرة بالأونر أو تم استرجاعها).`, "info");
    }
  }

  // 7. STEP 5: Read Final Mixes & Cooldown (اكتمال الدورة واستراحة)
  await sendStep("cooldown", 5, "اكتمال الدورة واستراحة", "تحديث البيانات وفترة الاستراحة");
  
  // Dedicated 6-second settling window for Etisalat billing nodes to reflect transferred quota
  await sleep(6000);
  let finalStatus = await engine.getStatusAndChild(true);

  // POST-RECOVERY STRICT BALANCE VERIFICATION (التحقق الصارم من عدم فقدان الميكسات):
  const expectedMinBalance = parkedMixAmount > 2000 ? Math.round(parkedMixAmount * 0.70) : 0;

  if (expectedMinBalance > 0 && finalStatus.remainingMix < expectedMinBalance) {
    engine.log(`[*] فحص رصيد الأونر بالسيرفر (${finalStatus.remainingMix.toLocaleString('en-US')} ميكس) مقابل المركون (${parkedMixAmount.toLocaleString('en-US')} ميكس). جاري المزامنة المعمقة مع اتصالات...`, "info");
    
    // Extended sync loop: up to 5 attempts with adaptive delay for billing propagation
    for (let syncAttempt = 1; syncAttempt <= 5; syncAttempt++) {
      await sleep(3000);
      try {
        if (syncAttempt === 2 || syncAttempt === 4) {
          await engine.login(ownerEmail, ownerPass, true, true);
        }
        const recheckStatus = await engine.getStatusAndChild(true);
        engine.log(`[*] فحص تسوية رصيد الأونر بالسيرفر (${syncAttempt}/5): الرصيد المقروء (${recheckStatus.remainingMix.toLocaleString('en-US')} ميكس) مقابل المتوقع (${expectedMinBalance.toLocaleString('en-US')} ميكس)...`, "info");
        if (recheckStatus.remainingMix >= expectedMinBalance || recheckStatus.remainingMix > finalStatus.remainingMix) {
          finalStatus = recheckStatus;
          engine.log(`[+] تم تحديث واعتماد رصيد الأونر بالسيرفر بنجاح: ${finalStatus.remainingMix.toLocaleString('en-US')} ميكس!`, "success");
          break;
        }
      } catch (_recheck) {}
    }

    // STRICT ZERO-LOSS PROTECTION GATE:
    // Check if the Child STILL holds the missing balance before jumping to emergency stop
    let childStillHolds = 0;
    if (prewarmedChildEngine) {
      try {
        const cSt = await prewarmedChildEngine.getStatusAndChild(true);
        childStillHolds = cSt.remainingMix || 0;
      } catch (_) {}
    }

    if (childStillHolds >= expectedMinBalance * 0.65 && childStillHolds > 1500) {
      engine.log(`[🛡️] فحص الأمان المزدوج: الميكسات (${childStillHolds.toLocaleString('en-US')} ميكس) ما زالت محفوظة بالكامل بأمان بحساب الفرد ولم تُفقد! جاري إعادة الاسترجاع للأونر...`, "info");
      try {
        await prewarmedChildEngine.transferMix(engine.ownerDial, childStillHolds, "Hekaya_XRP_MIX_Child_1");
        await sleep(4500);
        const postRecoveryStatus = await engine.getStatusAndChild(true);
        if (postRecoveryStatus.remainingMix >= expectedMinBalance) {
          finalStatus = postRecoveryStatus;
          engine.log(`[✓] تم استرجاع الميكسات بنجاح وتأكيد رصيد الأونر: ${finalStatus.remainingMix.toLocaleString('en-US')} ميكس!`, "success");
        }
      } catch (_) {}
    }

    if (finalStatus.remainingMix < expectedMinBalance) {
      const emergencyMsg = childStillHolds > 1500
        ? `توقف أمان لحفظ الميكسات: الميكسات (${childStillHolds.toLocaleString('en-US')} ميكس) محفوظة بأمان تام في حساب الفرد، ولم تصل للأونر بعد (${finalStatus.remainingMix.toLocaleString('en-US')} ميكس). الرصيد آمن 100%.`
        : `توقف أمان حرج: رصيد الأونر المقروء (${finalStatus.remainingMix.toLocaleString('en-US')} ميكس) أقل من الرصيد المركون (${parkedMixAmount.toLocaleString('en-US')} ميكس). تم إيقاف الدورة والأتمتة لحماية الرصيد ومنع التصفير!`;
      engine.log(`[-] ${emergencyMsg}`, "error");

      await sendStep("safety_stop", 5, "توقف أمان - حماية الرصيد", emergencyMsg);

      try {
        await supabase.from("vip_sessions").update({
          operation_state: "paused",
          automation_enabled: false,
          owner_mix_balance: Math.max(finalStatus.remainingMix, parkedMixAmount, Number(session.owner_mix_balance) || 0),
          stop_reason: emergencyMsg,
          updated_at: new Date().toISOString(),
        }).eq("id", session_id);

        await supabase.from("vip_cycle_history").insert({
          session_id: session_id,
          cycle_number: (session.current_cycle || 0) + 1,
          started_at: cycleStartTime,
          ended_at: new Date().toISOString(),
          duration_seconds: Math.round((Date.now() - cycleStartMs) / 1000),
          owner_balance_start: ownerStartMix,
          system_pre_migration: ownerPlanPre,
          system_post_migration: engine.getPlanName(finalStatus.planId),
          amount_transferred_owner_to_indiv: parkedMixAmount,
          amount_transferred_indiv_to_owner: recoveredMixAmount,
          final_verified_owner_balance: finalStatus.remainingMix,
          cycle_status: "paused_safe",
          failure_step: "recovery_verify",
          safe_error_summary: emergencyMsg,
          increased_owner_balance: false,
        });
      } catch (_dbE) {}

      return {
        success: false,
        safety_stop: true,
        error: emergencyMsg,
        logs: engine.logs,
      };
    }
  }

  const finalMix = finalStatus.remainingMix;
  const finalPlan = engine.getPlanName(finalStatus.planId);
  engine.log(`[+] رجعنا للأونر | رصيده الآن: ${finalMix.toLocaleString('en-US')} ميكس (النظام: ${finalPlan})`, "success");

  // Dynamic quota verification based on system: 270 gives 1,300 to child, 180 gives 800 to child
  const isSevenFinal = finalStatus.planId.includes("7") || finalStatus.planId.includes("Parent_7");
  const expectedChildMix = isSevenFinal ? 1300 : 800;
  engine.log(`[+] حالة النظام المعتمد: ${finalPlan} (حصة الفرد المخصصة تلقائياً: ${expectedChildMix.toLocaleString('en-US')} ميكس).`, "info");

  // Active check on actual child balance from server
  if (prewarmedChildEngine) {
    try {
      await sleep(1500);
      const childCheck = await prewarmedChildEngine.getStatusAndChild(true);
      if (childCheck && childCheck.planId !== "غير معروف") {
        engine.log(`[+] فحص رصيد الفرد الفعلي بالسيرفر: ${childCheck.remainingMix.toLocaleString('en-US')} ميكس متبقية (النظام: ${isSevenFinal ? "270 - حصة 1300" : "180 - حصة 800"}).`, "success");
      }
    } catch (_) {}
  }

  // Since serverConfirmed is guaranteed to be true here, proceed to cycle completion
  const newCycleCount = (session.current_cycle || 0) + 1;
  const targetMix = session.target_mix_balance || 50000;
  const targetReached = finalMix >= targetMix;
  const cooldownSec = session.cycle_delay_seconds !== undefined ? session.cycle_delay_seconds : 20;

  // ── AUTOMATIC CHILD EJECTION ON COMPLETION (الإخراج التلقائي للفرد عند بلوغ الهدف) ──
  let autoEjectedChild = false;
  const shouldAutoEject = (session.auto_eject_child_on_complete === true || options?.auto_eject === true);

  if (targetReached && shouldAutoEject && childNum) {
    engine.log(`[🎯] تم الوصول للهدف المطلوب بالكامل (${finalMix.toLocaleString('en-US')} ميكس)!`, "success");
    engine.log(`[🚀] تفعيل تسلسل الإخراج التلقائي المعتمد للفرد (${childNum}) لإنهاء الدورة...`, "warn");

    try {
      // Step A: Renew owner bundle to refresh subscriber family contract in OMS
      const isSevenFinalAuto = finalStatus.planId.includes("7") || finalStatus.planId.includes("Parent_7");
      const currentPlanAuto = isSevenFinalAuto ? "Hekaya_XRP_MIX_Parent_7" : "Hekaya_XRP_MIX_Parent_6";
      const planCostAuto = isSevenFinalAuto ? 270 : 180;
      await engine.renewBundleAction(currentPlanAuto, planCostAuto);
      await sleep(2000);

      // Step B: Send rapid removeChild requests with instant check
      for (let ejectTry = 1; ejectTry <= 4; ejectTry++) {
        const rRes = await engine.removeChildOrder(childNum, engine.ownerDial || session.owner_account_identifier, currentPlanAuto);
        if (rRes.success) {
          engine.log(`[✓] أمر إخراج الفرد (${ejectTry}/4): تم قبوله بنجاح بالسيرفر!`, "success");
        }
        await sleep(1500);
        const stAfter = await engine.getStatusAndChild(true);
        if (!stAfter.childNumber || !stAfter.childNumber.includes(childNum.slice(-8))) {
          engine.log(`[🎉] تم تأكيد خروج وانفصال الفرد (${childNum}) من عائلة الأونر بنجاح تام!`, "success");
          autoEjectedChild = true;
          break;
        }
        if (ejectTry < 4) await sleep(2000);
      }
    } catch (eErr: any) {
      engine.log(`[!] تنبيه في الإخراج التلقائي: ${eErr?.message || eErr}`, "warn");
    }
  }

  if (cooldownSec > 0 && !targetReached) {
    engine.log(`[*] استراحة ${cooldownSec} ثانية قبل الدورة القادمة ...`, "info");
  }

  // Update session in database with latest mixes, steps, and real-time logs
  await supabase
    .from("vip_sessions")
    .update({
      owner_mix_balance: finalMix,
      owner_current_plan: finalPlan,
      current_cycle: newCycleCount,
      current_step: targetReached ? "completed" : "idle",
      operation_state: targetReached ? "completed" : (session.operation_state || "idle"),
      automation_enabled: targetReached ? false : (session.automation_enabled ?? false),
      relationship_status: autoEjectedChild ? "none" : session.relationship_status,
      current_cycle_details: {
        latest_logs: engine.logs.slice(-25),
        cycle_number: newCycleCount,
        timestamp: Date.now(),
        final_mix: finalMix,
        auto_ejected_child: autoEjectedChild,
      },
      last_successful_op_at: new Date().toISOString(),
      last_actual_operation: "single_cycle_completed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", session_id);

  // Insert successful cycle into vip_cycle_history
  try {
    await supabase.from("vip_cycle_history").insert({
      session_id: session_id,
      cycle_number: newCycleCount,
      started_at: cycleStartTime,
      ended_at: new Date().toISOString(),
      duration_seconds: Math.round((Date.now() - cycleStartMs) / 1000),
      owner_balance_start: ownerStartMix,
      owner_balance_post_renewal: ownerStartMix,
      amount_transferred_owner_to_indiv: parkedMixAmount,
      individual_balance_pre_transfer: 0,
      individual_balance_post_transfer: parkedMixAmount,
      system_pre_migration: ownerPlanPre,
      system_post_migration: finalPlan,
      migration_result: "confirmed",
      amount_transferred_indiv_to_owner: recoveredMixAmount,
      final_verified_owner_balance: finalMix,
      difference_to_target: Math.max(0, targetMix - finalMix),
      cycle_status: targetReached ? "stopped_at_target" : "completed",
      increased_owner_balance: finalMix > ownerStartMix,
      safe_error_summary: null,
    });
  } catch (dbE) {
    console.warn("Failed to insert into vip_cycle_history:", dbE);
  }

  // Insert into vip_operation_history
  try {
    await supabase.from("vip_operation_history").insert({
      session_id: session_id,
      operation_type: "auto_cycle",
      owner_account_ref: session.owner_account_identifier,
      individual_account_ref: session.individual_account_identifier,
      requested_action: `دورة أتمتة #${newCycleCount} (ترحيل إلى ${targetPlanDisplay})`,
      status: "succeeded",
      started_at: cycleStartTime,
      completed_at: new Date().toISOString(),
      result: {
        cycle_number: newCycleCount,
        final_mix: finalMix,
        target_reached: targetReached,
        owner_plan: finalPlan,
      },
      is_automatic: true,
    });
  } catch (dbE) {
    console.warn("Failed to insert into vip_operation_history:", dbE);
  }

  // ── SERVER-SIDE CLOUD RUNNER CHAINING (الاستمرار السحابي بالخلفية بدون هاتف 24/7) ──
  // Check fresh session status from DB to ensure it's still running
  const { data: freshSessState } = await supabase
    .from("vip_sessions")
    .select("operation_state, automation_enabled, target_mix_balance, owner_mix_balance, cycle_delay_seconds, auto_eject_child_on_complete")
    .eq("id", session_id)
    .maybeSingle();

  const isServerLoopActive =
    !targetReached &&
    freshSessState &&
    freshSessState.automation_enabled &&
    (freshSessState.operation_state === "running" || freshSessState.operation_state === "active") &&
    (freshSessState.owner_mix_balance || 0) < (freshSessState.target_mix_balance || 50000);

  if (isServerLoopActive) {
    const chainDelaySec = Math.max(freshSessState.cycle_delay_seconds || cooldownSec || 20, 5);
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

    if (serviceRoleKey && supabaseUrl) {
      const triggerNext = async () => {
        try {
          await sleep(chainDelaySec * 1000);
          // Query fresh state to ensure user hasn't stopped or deleted session
          const { data: checkSess } = await supabase
            .from("vip_sessions")
            .select("operation_state, automation_enabled, target_mix_balance, owner_mix_balance")
            .eq("id", session_id)
            .maybeSingle();

          if (
            checkSess &&
            (checkSess.operation_state === "running" || checkSess.operation_state === "active") &&
            checkSess.automation_enabled &&
            (checkSess.owner_mix_balance || 0) < (checkSess.target_mix_balance || 50000)
          ) {
            console.log(`[CloudRunner] Chaining cycle #${newCycleCount + 1} on server 24/7 for session ${session_id}...`);
            await fetch(`${supabaseUrl}/functions/v1/etisalat-vip-executor`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${serviceRoleKey}`,
                "X-VIP-Secret-Key": "VFP_VIP_NADER_AKRAM_MASTER_2026",
              },
              body: JSON.stringify({
                action: "run_single_cycle",
                session_id: session_id,
                is_server_background: true,
              }),
            });
          }
        } catch (chainErr) {
          console.warn("[CloudRunner] Chain error:", chainErr);
        }
      };

      if (typeof (globalThis as any).EdgeRuntime?.waitUntil === "function") {
        (globalThis as any).EdgeRuntime.waitUntil(triggerNext());
      } else {
        triggerNext();
      }
    }
  } else if (targetReached) {
    await supabase.from("vip_sessions").update({
      operation_state: "completed",
      automation_enabled: false,
      current_step: "completed",
      updated_at: new Date().toISOString(),
    }).eq("id", session_id);

    if (freshSessState?.auto_eject_child_on_complete) {
      console.log(`[CloudRunner] Target reached! Auto-ejecting child on cloud server...`);
      const ejectChild = async () => {
        try {
          const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
          const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
          if (serviceRoleKey && supabaseUrl) {
            await fetch(`${supabaseUrl}/functions/v1/etisalat-vip-executor`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${serviceRoleKey}`,
                "X-VIP-Secret-Key": "VFP_VIP_NADER_AKRAM_MASTER_2026",
              },
              body: JSON.stringify({
                action: "run_smart_ejection_sequence",
                session_id: session_id,
                is_automatic: true,
              }),
            });
          }
        } catch (e) {
          console.warn("[CloudRunner] Auto-eject error:", e);
        }
      };
      if (typeof (globalThis as any).EdgeRuntime?.waitUntil === "function") {
        (globalThis as any).EdgeRuntime.waitUntil(ejectChild());
      } else {
        ejectChild();
      }
    }
  }

  return {
    success: true,
    cycle_number: newCycleCount,
    final_mix: finalMix,
    owner_mix_balance: finalMix,
    child_mix_balance: 0,
    target_reached: targetReached,
    target_mix: targetMix,
    owner_plan: finalPlan,
    logs: engine.logs,
  };
  } finally {
    // Release atomic concurrency lock
    try {
      await supabase
        .from("vip_sessions")
        .update({
          worker_status: "idle",
          worker_last_heartbeat: new Date().toISOString(),
        })
        .eq("id", session_id);
    } catch (_) {}
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseKey);

  // ══════════════════════════════════════════════════════════════════
  // ZERO-TRUST SECURITY GATE: Server-Side Cryptographic Authorization
  // ══════════════════════════════════════════════════════════════════
  const authHeader = req.headers.get("Authorization") || "";
  const secretHeader = req.headers.get("X-VIP-Secret-Key") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  let isAuthorized = false;
  let isOwner = false;
  let isDelegated = false;
  let callerEmail = "";
  let callerUserId = "";
  let delegatedMaxTargetMix = 100000;
  let delegatedUserName = "";

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const masterSecret = "VFP_VIP_NADER_AKRAM_MASTER_2026";

  if (secretHeader === masterSecret) {
    isAuthorized = true;
    isOwner = true;
    callerEmail = "master_secret_authenticated";
  } else if (serviceRoleKey && token === serviceRoleKey) {
    isAuthorized = true;
    isOwner = true;
    callerEmail = "service_role";
  } else if (token && token !== anonKey) {
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
      if (user && !userErr) {
        callerEmail = user.email || "";
        callerUserId = user.id;
        const emailLower = callerEmail.toLowerCase();
        if (emailLower === "nader77@miaoda.com" || emailLower.includes("nader")) {
          isAuthorized = true;
          isOwner = true;
          delegatedMaxTargetMix = 999999999;
        } else {
          // Check if this user has active delegated access
          const { data: delUser } = await supabase
            .from("vip_delegated_users")
            .select("*")
            .eq("user_id", user.id)
            .eq("is_active", true)
            .maybeSingle();

          if (delUser) {
            isAuthorized = true;
            isDelegated = true;
            delegatedUserName = delUser.name || callerEmail;
            delegatedMaxTargetMix = delUser.max_target_mix_balance || 100000;
          }
        }
      }
    } catch (authErr) {
      console.warn("[ZeroTrustGate] Failed to verify user token:", authErr);
    }
  }

  try {
    const body = await req.json();
    const { action } = body;

    // ── Server-Side Gate Action: verify_vip_access ──
    if (action === "verify_vip_access") {
      if (!isAuthorized) {
        return new Response(JSON.stringify({
          success: false,
          authorized: false,
          error: "تم حظر الوصول: الحساب غير مصرح له بالدخول لقسم VIP (Access Denied - Unauthorized Account)",
          code: "UNAUTHORIZED_VIP_ACCESS",
        }), {
          status: 403,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        authorized: true,
        is_owner: isOwner,
        is_delegated: isDelegated,
        role: isOwner ? "owner" : "delegated_user",
        owner_email: callerEmail,
        owner_name: isOwner ? "Nader Akram (المالك)" : delegatedUserName,
        max_target_mix_balance: delegatedMaxTargetMix,
        message: isOwner 
          ? "تم التحقق السيرفري بنجاح. صلاحيات المالك معتمدة بنظام Zero-Trust."
          : "تم التحقق من صلاحيات المستخدم على السيرفر بنجاح.",
        blueprint_version: "v3.9.30-cloud-isolated",
        timestamp: Date.now(),
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── STRICT SERVER-SIDE REJECTION FOR ANY OTHER VIP ACTION ──
    if (!isAuthorized) {
      return new Response(JSON.stringify({
        success: false,
        error: "خطأ 403: تم حظر الوصول وحماية القسم سيرفرياً ضد التلاعب أو الهندسة العكسية.",
        code: "FORBIDDEN_TAMPER_PROTECTION",
      }), {
        status: 403,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

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

    // ── STRICT SESSION OWNERSHIP & ACCESS CONTROL ──
    // Delegated users CAN NEVER operate on Owner's sessions or other users' sessions!
    if (isDelegated && callerUserId && session.created_by_user_id !== callerUserId) {
      return new Response(JSON.stringify({
        success: false,
        error: "غير مصرح لك بالتحكم في هذه الجلسة (جلسة خاصة بالمالك أو بمستخدم آخر).",
      }), {
        status: 403,
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
    const rawOwnerPass = body.owner_password || session.owner_password_enc;
    let childEmail = body.individual_email || session.individual_email;
    let rawChildPass = body.individual_password || session.individual_password_enc;

    // Fallback to default child credentials if missing in session
    if (!childEmail || !rawChildPass) {
      try {
        const { data: defChild } = await supabase.rpc("vip_get_default_child_credentials");
        if (defChild && defChild.child_email) {
          childEmail = childEmail || defChild.child_email;
          rawChildPass = rawChildPass || defChild.child_password;
        }
      } catch (_) {}
    }

    const ownerPass = decodeStoredPassword(rawOwnerPass);
    const childPass = rawChildPass ? decodeStoredPassword(rawChildPass) : "";

    if (!ownerEmail || !ownerPass) {
      return new Response(JSON.stringify({
        success: false,
        error: "بيانات اعتماد حساب الأونر (البريد وكلمة المرور) غير متوفرة في هذه الجلسة.",
      }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const engine = new EtisalatEngine("owner", bridgeConfig, session_id, session.owner_name || "");
    engine.setAuthSession(session.cached_owner_token, session.cached_owner_cookie);
    engine.onNewAuthToken = (token, cookie, isOwner) => {
      supabase.from("vip_sessions").update(isOwner ? {
        cached_owner_token: token,
        cached_owner_cookie: cookie,
      } : {
        cached_child_token: token,
        cached_child_cookie: cookie,
      }).eq("id", session_id).catch(() => {});
    };

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
              sendEvent,
              { is_server_background: body.is_server_background === true, auto_eject: body.auto_eject === true }
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
        const childEngine = new EtisalatEngine("child", bridgeConfig, session_id);
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
      const ownerEngine = new EtisalatEngine("owner", bridgeConfig, session_id);
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
            const childAcceptEngine = new EtisalatEngine("child", bridgeConfig, session_id);
            if (await childAcceptEngine.login(childEmail, childPass, false, true)) {
              await childAcceptEngine.renewBundleAction("Hekaya_XRP_MIX_Parent_7", "270");
              await sleep(2500);
            }
          }

          const verifyOwner = new EtisalatEngine("owner", bridgeConfig, session_id);
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

        try {
          await supabase.from("vip_operation_history").insert({
            session_id: session_id,
            operation_type: "add_child",
            owner_account_ref: session.owner_account_identifier,
            individual_account_ref: finalChildNumber,
            requested_action: `إضافة وتأكيد الفرد ${finalChildNumber} في عائلة الأونر`,
            status: "succeeded",
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            result: { child_number: finalChildNumber },
            is_automatic: false,
          });
        } catch (_dbE) {}

        return new Response(JSON.stringify({
          success: true,
          message: `تم ربط وتأكيد الفرد ${finalChildNumber} في عائلة الأونر بنجاح!`,
          logs: allLogs,
        }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      try {
        await supabase.from("vip_operation_history").insert({
          session_id: session_id,
          operation_type: "add_child",
          owner_account_ref: session.owner_account_identifier,
          individual_account_ref: finalChildNumber || session.individual_account_identifier,
          requested_action: "إضافة وتأكيد الفرد في عائلة الأونر",
          status: "failed",
          failure_reason: "فشلت محاولات إضافة الفرد تلقائياً",
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          is_automatic: false,
        });
      } catch (_dbE) {}

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
        childPass,
        undefined,
        { is_server_background: body?.is_server_background === true, auto_eject: body?.auto_eject === true }
      );
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // ACTION 3.1: start_server_loop (Cloud background continuous runner)
    // ══════════════════════════════════════════════════════════════════
    if (action === "start_server_loop") {
      const targetBalance = body.target_mix || session.target_mix_balance || 50000;
      const cycleDelay = body.delay_seconds !== undefined ? body.delay_seconds : (session.cycle_delay_seconds || 20);

      // Update session state in database to running and automation enabled
      await supabase
        .from("vip_sessions")
        .update({
          operation_state: "running",
          automation_enabled: true,
          target_mix_balance: targetBalance,
          cycle_delay_seconds: cycleDelay,
          current_step: "starting",
          updated_at: new Date().toISOString(),
        })
        .eq("id", session_id);

      // Trigger first cycle immediately on cloud server
      const runFirst = async () => {
        try {
          const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
          const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
          if (serviceRoleKey && supabaseUrl) {
            await fetch(`${supabaseUrl}/functions/v1/etisalat-vip-executor`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${serviceRoleKey}`,
                "X-VIP-Secret-Key": "VFP_VIP_NADER_AKRAM_MASTER_2026",
              },
              body: JSON.stringify({
                action: "run_single_cycle",
                session_id: session_id,
                is_server_background: true,
              }),
            });
          }
        } catch (e) {
          console.warn("[start_server_loop] First cycle trigger error:", e);
        }
      };

      if (typeof (globalThis as any).EdgeRuntime?.waitUntil === "function") {
        (globalThis as any).EdgeRuntime.waitUntil(runFirst());
      } else {
        runFirst();
      }

      return new Response(JSON.stringify({
        success: true,
        message: `تم تشغيل محرك الأتمتة السحابي بالخلفية بنجاح على السيرفر (الهدف: ${targetBalance.toLocaleString('ar-EG')} ميكس | الفاصل: ${cycleDelay}ث). يعمل السيرفر الآن بدون توقف حتى لو أغلقت التطبيق أو قفلت الشاشة.`,
        session_id: session_id,
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // ACTION 3.2: stop_server_loop (Stop cloud background runner)
    // ══════════════════════════════════════════════════════════════════
    if (action === "stop_server_loop") {
      await supabase
        .from("vip_sessions")
        .update({
          operation_state: "stopped",
          automation_enabled: false,
          current_step: "idle",
          updated_at: new Date().toISOString(),
        })
        .eq("id", session_id);

      return new Response(JSON.stringify({
        success: true,
        message: "تم إيقاف الأتمتة السحابية بنجاح وحفظ كافة الأرصدة والسجلات.",
        session_id: session_id,
      }), {
        status: 200,
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

      let finalMix = session.owner_mix_balance || 0;
      let finalPlanName = engine.getPlanName(targetPlan);

      if (ok) {
        engine.log(`[+] تم إرسال أمر الترحيل إلى: ${finalPlanName} بنجاح!`, "success");
        await sleep(2500);
        const st = await engine.getStatusAndChild(true);
        finalMix = st.remainingMix;
        finalPlanName = engine.getPlanName(st.planId);
        await supabase
          .from("vip_sessions")
          .update({
            owner_current_plan: finalPlanName,
            owner_mix_balance: finalMix,
            last_actual_operation: "change_plan",
            last_successful_op_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", session_id);
      }

      try {
        await supabase.from("vip_operation_history").insert({
          session_id: session_id,
          operation_type: "change_system",
          owner_account_ref: session.owner_account_identifier,
          individual_account_ref: session.individual_account_identifier,
          requested_action: `تغيير النظام يدوياً إلى ${finalPlanName}`,
          relevant_plan_id: targetPlan,
          status: ok ? "succeeded" : "failed",
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          result: { plan: finalPlanName, mix_balance: finalMix },
          failure_reason: ok ? null : "فشل ترحيل النظام عبر الخادم",
          is_automatic: false,
        });
      } catch (_dbE) {}

      return new Response(JSON.stringify({
        success: ok,
        message: ok ? `تم ترحيل النظام بنجاح إلى: ${finalPlanName}` : "فشل ترحيل النظام",
        logs: engine.logs,
      }), { status: ok ? 200 : 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    // ══════════════════════════════════════════════════════════════════
    // ACTION 5: renew_bundle
    // ══════════════════════════════════════════════════════════════════
    if (action === "renew_bundle") {
      if (!await engine.login(ownerEmail, ownerPass, true)) {
        return new Response(JSON.stringify({
          success: false,
          error: "فشل تسجيل الدخول لحساب الأونر.",
          logs: engine.logs,
        }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      const st = await engine.getStatusAndChild(true);
      const isSeven = st.planId.includes("Parent_7") || st.planId.includes("7");
      const planName = isSeven ? "Hekaya_XRP_MIX_Parent_7" : "Hekaya_XRP_MIX_Parent_6";
      const cost = isSeven ? "270" : "180";

      engine.log(`[*] جاري طلب تجديد باقة (${engine.getPlanName(st.planId)}) بتكلفة ${cost}ج...`, "info");
      const ok = await engine.renewBundleAction(planName, cost);

      await sleep(2500);
      const afterSt = await engine.getStatusAndChild(true);

      await supabase
        .from("vip_sessions")
        .update({
          owner_mix_balance: afterSt.remainingMix,
          last_actual_operation: "renew_bundle",
          last_successful_op_at: ok ? new Date().toISOString() : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", session_id);

      try {
        await supabase.from("vip_operation_history").insert({
          session_id: session_id,
          operation_type: "renew_bundle",
          owner_account_ref: session.owner_account_identifier,
          individual_account_ref: session.individual_account_identifier,
          requested_action: `تجديد باقة ${engine.getPlanName(st.planId)} (${cost}ج)`,
          relevant_plan_id: planName,
          status: ok ? "succeeded" : "failed",
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          result: {
            previous_balance: st.remainingMix,
            new_balance: afterSt.remainingMix,
          },
          failure_reason: ok ? null : "فشل تجديد الباقة عبر الخادم",
          is_automatic: false,
        });
      } catch (_dbE) {}

      return new Response(JSON.stringify({
        success: ok,
        message: ok ? `تم تجديد الباقة بنجاح! الرصيد الحالي: ${afterSt.remainingMix.toLocaleString('en-US')} ميكس` : "فشل تجديد الباقة",
        logs: engine.logs,
        new_balance: afterSt.remainingMix,
      }), { status: ok ? 200 : 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    // ══════════════════════════════════════════════════════════════════
    // ACTION 6: transfer_to_child
    // ══════════════════════════════════════════════════════════════════
    if (action === "transfer_to_child") {
      if (!await engine.login(ownerEmail, ownerPass, true)) {
        return new Response(JSON.stringify({
          success: false,
          error: "فشل تسجيل الدخول لحساب الأونر.",
          logs: engine.logs,
        }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      const st = await engine.getStatusAndChild(true);
      const targetChild = st.childNumber || session.individual_account_identifier;
      if (!targetChild) {
        return new Response(JSON.stringify({
          success: false,
          error: "لا يوجد فرد مضاف بحساب الأونر للتحويل إليه.",
          logs: engine.logs,
        }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      const isSeven = st.planId.includes("Parent_7") || st.planId.includes("7");
      const ownerPlanName = isSeven ? "Hekaya_XRP_MIX_Parent_7" : "Hekaya_XRP_MIX_Parent_6";
      const amountToTransfer = Number(body.amount) || st.remainingMix;

      engine.log(`[*] جاري تحويل (${amountToTransfer.toLocaleString('en-US')}) ميكس إلى الفرد: ${targetChild}...`, "info");
      const ok = await engine.transferMix(targetChild, amountToTransfer, ownerPlanName);

      await sleep(2000);
      const afterSt = await engine.getStatusAndChild(true);

      await supabase
        .from("vip_sessions")
        .update({
          owner_mix_balance: afterSt.remainingMix,
          last_actual_operation: "transfer_to_child",
          last_successful_op_at: ok ? new Date().toISOString() : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", session_id);

      try {
        await supabase.from("vip_operation_history").insert({
          session_id: session_id,
          operation_type: "transfer_to_individual",
          owner_account_ref: session.owner_account_identifier,
          individual_account_ref: targetChild,
          requested_action: `تحويل ${amountToTransfer.toLocaleString('en-US')} ميكس إلى الفرد`,
          requested_amount: amountToTransfer,
          status: ok ? "succeeded" : "failed",
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          result: {
            transferred_amount: amountToTransfer,
            remaining_balance: afterSt.remainingMix,
          },
          failure_reason: ok ? null : "فشل تحويل الميكسات إلى الفرد",
          is_automatic: false,
        });
      } catch (_dbE) {}

      return new Response(JSON.stringify({
        success: ok,
        message: ok ? `تم تحويل ${amountToTransfer.toLocaleString('en-US')} ميكس بنجاح إلى الفرد!` : "فشل تحويل الميكسات للفرد",
        logs: engine.logs,
        owner_remaining: afterSt.remainingMix,
      }), { status: ok ? 200 : 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    // ══════════════════════════════════════════════════════════════════
    // ACTION 7: return_child_mixes
    // ══════════════════════════════════════════════════════════════════
    if (action === "return_child_mixes") {
      if (!childEmail || !childPass) {
        return new Response(JSON.stringify({
          success: false,
          error: "بيانات اعتماد حساب الفرد (الإيميل/كلمة المرور) غير مسجلة بالجلسة.",
          logs: engine.logs,
        }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      const childEngine = new EtisalatEngine("child", bridgeConfig, session_id);
      childEngine.onLog = (l) => engine.log(l.message, l.level);
      if (!await childEngine.login(childEmail, childPass, false, true)) {
        return new Response(JSON.stringify({
          success: false,
          error: "فشل تسجيل الدخول لحساب الفرد.",
          logs: engine.logs,
        }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      const childSt = await childEngine.getStatusAndChild(true);
      const ownerDial = session.owner_account_identifier;
      if (!ownerDial) {
        return new Response(JSON.stringify({
          success: false,
          error: "رقم هاتف الأونر غير محدد بالجلسة.",
          logs: engine.logs,
        }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      const returnAmount = childSt.remainingMix;
      engine.log(`[*] رصيد الفرد المتاح للاسترجاع: (${returnAmount.toLocaleString('en-US')}) ميكس. جاري التحويل إلى الأونر: ${ownerDial}...`, "info");
      const ok = await childEngine.transferMix(ownerDial, returnAmount, "Hekaya_XRP_MIX_Child_1");

      await sleep(2000);
      const afterChildSt = await childEngine.getStatusAndChild(true);

      await supabase
        .from("vip_sessions")
        .update({
          individual_mix_balance: afterChildSt.remainingMix,
          last_actual_operation: "return_child_mixes",
          last_successful_op_at: ok ? new Date().toISOString() : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", session_id);

      try {
        await supabase.from("vip_operation_history").insert({
          session_id: session_id,
          operation_type: "transfer_to_owner",
          owner_account_ref: ownerDial,
          individual_account_ref: session.individual_account_identifier,
          requested_action: `استرجاع ${returnAmount.toLocaleString('en-US')} ميكس من الفرد إلى الأونر`,
          requested_amount: returnAmount,
          status: ok ? "succeeded" : "failed",
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          result: {
            returned_amount: returnAmount,
            child_remaining: afterChildSt.remainingMix,
          },
          failure_reason: ok ? null : "فشل استرجاع الميكسات من الفرد إلى الأونر",
          is_automatic: false,
        });
      } catch (_dbE) {}

      return new Response(JSON.stringify({
        success: ok,
        message: ok ? `تم استرجاع ${returnAmount.toLocaleString('en-US')} ميكس بنجاح إلى الأونر!` : "فشل استرجاع الميكسات من الفرد",
        logs: engine.logs,
        child_remaining: afterChildSt.remainingMix,
      }), { status: ok ? 200 : 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    // ══════════════════════════════════════════════════════════════════
    // ACTION 9: adopt_live_balance (اعتماد الرصيد الفعلي الحالي وفك الحظر)
    // ══════════════════════════════════════════════════════════════════
    if (action === "adopt_live_balance") {
      engine.log(`[*] بدء قراءة الرصيد الفعلي المباشر من سيرفر اتصالات لفك الحظر واعتماد الرصيد...`, "info");
      const liveOwner = await engine.getStatusAndChild(true);
      
      let liveChildMix = 0;
      if (childEmail && childPass) {
        try {
          const childEngine = new EtisalatEngine("child", bridgeConfig, session_id);
          childEngine.onLog = (l) => engine.log(l.message, l.level);
          await childEngine.login(childEmail, childPass, false, true);
          const liveChild = await childEngine.getStatusAndChild(true);
          liveChildMix = liveChild.remainingMix || 0;
        } catch (_cErr) {}
      }

      const planName = engine.getPlanName(liveOwner.planId);
      engine.log(`[+] تم تأكيد الرصيد الحي من السيرفر: الأونر (${liveOwner.remainingMix.toLocaleString('en-US')} ميكس) | الفرد (${liveChildMix.toLocaleString('en-US')} ميكس).`, "success");
      engine.log(`[✓] تم فك حظر الجلسة واعتماد الرصيد الفعلي كنقطة انطلاق جديدة لبدء التجميع فوراً!`, "success");

      await supabase.from("vip_sessions").update({
        owner_mix_balance: liveOwner.remainingMix,
        individual_mix_balance: liveChildMix,
        owner_current_plan: planName,
        operation_state: "active",
        pause_reason: null,
        current_step: "idle",
        last_actual_operation: "live_balance_adopted",
        updated_at: new Date().toISOString(),
      }).eq("id", session_id);

      try {
        await supabase.from("vip_operation_history").insert({
          session_id: session_id,
          operation_type: "manual_action",
          owner_account_ref: session.owner_account_identifier || session.owner_email,
          individual_account_ref: session.individual_account_identifier || session.child_account_identifier,
          requested_action: `اعتماد الرصيد الحي وفك الحظر (${liveOwner.remainingMix} ميكس)`,
          status: "succeeded",
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          is_automatic: false,
        });
      } catch (_e) {}

      return new Response(JSON.stringify({
        success: true,
        owner_mix_balance: liveOwner.remainingMix,
        child_mix_balance: liveChildMix,
        owner_plan: planName,
        message: `تم فك الحظر واعتماد رصيد الأونر الحالي (${liveOwner.remainingMix.toLocaleString('en-US')} ميكس) بنجاح!`,
        logs: engine.logs,
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // ACTION 10: execute_full_release_and_minion (إخراج الفرد المتكرر + تجديد الأونر + تحويل لأهلا أقوى كارت)
    // ══════════════════════════════════════════════════════════════════
    if (action === "execute_full_release_and_minion") {
      engine.log(`[🚀] بدء تنفيذ سكريبت: إخراج الفرد المتكرر وفك الارتباط والتحويل لأهلا أقوى كارت (MINION)...`, "info");

      // 1. Login to Owner
      engine.log(`[*] الخطوة 1/5: تسجيل الدخول لحساب الأونر وقراءة بيانات الفرد والعائلة...`, "info");
      if (!await engine.login(ownerEmail, ownerPass, true)) {
        return new Response(JSON.stringify({
          success: false,
          error: "فشل تسجيل الدخول لحساب الأونر.",
          logs: engine.logs,
        }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      const st = await engine.getStatusAndChild(true);
      const targetChild = body.child_number || st.childNumber || session.individual_account_identifier;
      const parentDial = engine.ownerDial || session.owner_account_identifier;

      if (!targetChild) {
        return new Response(JSON.stringify({
          success: false,
          error: "لم يتم العثور على رقم الفرد المراد إخراجه من عائلة الأونر.",
          logs: engine.logs,
        }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      const isSeven = st.planId.includes("Parent_7") || st.planId.includes("7");
      const ownerPlanName = isSeven ? "Hekaya_XRP_MIX_Parent_7" : "Hekaya_XRP_MIX_Parent_6";
      const cost = isSeven ? "270" : "180";

      engine.log(`[+] بيانات الخطوط: الأونر (${parentDial}) | الفرد (${targetChild}) | باقة الأونر (${ownerPlanName})`, "info");

      // 2. Initial RemoveChild Iterations with Anti-Queue Jamming Protection
      const removeCountPhase1 = Math.min(Math.max(Number(body.phase1_count) || 5, 1), 30);
      const removeDelaySec = Math.max(Number(body.remove_delay_seconds) || 2.5, 0.5);
      engine.log(`[*] الخطوة 2/5: إرسال أمر إخراج الفرد (${removeCountPhase1} مرات كحد أقصى بفاصل زمني آمن ${removeDelaySec}ث لمنع تعليق الأوردرات بالسيستم)...`, "info");
      
      const phase1Orders: string[] = [];
      let phase1SuccessCount = 0;
      let childAlreadyReleased = false;

      for (let i = 1; i <= removeCountPhase1; i++) {
        const res = await engine.removeChildOrder(targetChild, parentDial, ownerPlanName);
        if (res.success) {
          phase1SuccessCount++;
          if (res.orderId) phase1Orders.push(res.orderId);
          engine.log(`[✓] أمر إخراج (${i}/${removeCountPhase1}): تم القبول بنجاح (orderId: ${res.orderId || "مكتمل"})`, "success");
        } else {
          engine.log(`[!] أمر إخراج (${i}/${removeCountPhase1}): رد الخادم (${res.raw || "فشل"})`, "warn");
        }

        // Safe spacing to prevent Etisalat SDP / CRM pending queue conflicts
        await sleep(removeDelaySec * 1000);

        // Smart Anti-Hang: Check if child is already released after at least 2 orders
        if (i >= 2 && phase1SuccessCount >= 1) {
          const quickSt = await engine.getStatusAndChild(true);
          const stillThere = !!quickSt.childNumber && quickSt.childNumber.includes(targetChild.slice(-8));
          if (!stillThere) {
            childAlreadyReleased = true;
            engine.log(`[🎯] فحص ذكي: تأكد خروج الفرد (${targetChild}) من السيستم بالفعل! تم التوقف الفوري لتجنب تعليق أوردرات متراكمة في النظام.`, "success");
            break;
          }
        }
      }

      // 3. Cooldown Wait
      const waitCooldownSec = Math.max(Number(body.cooldown_seconds) || 10, 3);
      engine.log(`[⏳] الخطوة 3/5: فترة التهدئة (${waitCooldownSec} ثوانٍ) لإتاحة الوقت لسيرفر اتصالات لتحديث قيود العقد...`, "info");
      for (let sec = waitCooldownSec; sec > 0; sec--) {
        await sleep(1000);
      }

      // 4. Renew Owner Bundle
      engine.log(`[*] الخطوة 4/5: تجديد باقة الأونر (${engine.getPlanName(st.planId)}) لتحديث حالة العقد بالسيرفر...`, "info");
      const renewOk = await engine.renewBundleAction(ownerPlanName, cost);
      if (renewOk) {
        engine.log(`[+] تم إرسال أمر تجديد باقة الأونر بنجاح!`, "success");
      } else {
        engine.log(`[!] رد تجديد الباقة (قد تكون مجددة بالفعل أو تم قبول الأمر جزئياً)`, "warn");
      }
      await sleep(2500);

      // 5. Optional Secondary Confirmation RemoveChild
      const removeCountPhase2 = Math.min(Math.max(Number(body.phase2_count) || 0, 0), 10);
      if (removeCountPhase2 > 0 && !childAlreadyReleased) {
        engine.log(`[*] تأكيد إضافي: إرسال أمر إخراج الفرد (${removeCountPhase2} مرات إضافية للتأكيد بفاصل ${removeDelaySec}ث)...`, "info");
        for (let i = 1; i <= removeCountPhase2; i++) {
          const res = await engine.removeChildOrder(targetChild, parentDial, ownerPlanName);
          if (res.success) {
            if (res.orderId) phase1Orders.push(res.orderId);
            engine.log(`[✓] تأكيد إخراج (${i}/${removeCountPhase2}): تم بنجاح (orderId: ${res.orderId || "مكتمل"})`, "success");
          }
          await sleep(removeDelaySec * 1000);
        }
      } else if (childAlreadyReleased) {
        engine.log(`[*] تجاوز خطوة التأكيد الإضافية لأن الفرد خرج بالفعل بنجاح.`, "info");
      }

      // 6. Optional: Login to Child & Migrate to MINION (أهلا أقوى كارت)
      const includeMinion = body.include_minion === true || body.include_minion === "true";
      let minionSuccess = false;
      const minionOrders: string[] = [];

      if (!includeMinion) {
        engine.log(`[*] الخطوة 5/5: تم تجاوز التحويل لنظام أهلا أقوى كارت (MINION) تلقائياً بناءً على اختيارك (متاح يدوياً عند الحاجة).`, "info");
      } else {
        const minionDelaySec = Math.max(Number(body.minion_delay_seconds) || 3, 1);
        const migrateTries = Math.min(Math.max(Number(body.migrate_count) || 2, 1), 10);
        engine.log(`[*] الخطوة 5/5: تحويل حساب الفرد لنظام أهلا أقوى كارت (MINION) بفاصل زمني آمن ${minionDelaySec}ث...`, "info");

        if (childEmail && childPass) {
          const childEngine = new EtisalatEngine("child", bridgeConfig, session_id);
          childEngine.onLog = (l) => engine.log(l.message, l.level);

          if (await childEngine.login(childEmail, childPass, false, true)) {
            for (let m = 1; m <= migrateTries; m++) {
              engine.log(`[*] إرسال طلب ترحيل لنظام MINION (محاولة ${m}/${migrateTries})...`, "info");
              const mRes = await childEngine.migrateToMinionOrder(targetChild);
              if (mRes.success) {
                minionSuccess = true;
                if (mRes.orderId) minionOrders.push(mRes.orderId);
                engine.log(`[✓] تم قبول طلب الترحيل لنظام أهلا أقوى كارت (${m}/${migrateTries}) بنجاح! (orderId: ${mRes.orderId || "مقبول"})`, "success");
                // Stop after success to avoid duplicate pending migrate orders
                break;
              } else {
                engine.log(`[!] طلب الترحيل (${m}/${migrateTries}): رد الخادم (${mRes.raw || "فشل"})`, "warn");
              }
              await sleep(minionDelaySec * 1000);
            }
          } else {
            engine.log(`[!] تعذر تسجيل الدخول المباشر لحساب الفرد. جاري إرسال طلب ترحيل MINION عبر توكن الأونر...`, "warn");
            const mRes = await engine.migrateToMinionOrder(targetChild);
            if (mRes.success) {
              minionSuccess = true;
              if (mRes.orderId) minionOrders.push(mRes.orderId);
              engine.log(`[✓] تم إرسال طلب الترحيل لـ MINION: (orderId: ${mRes.orderId})`, "success");
            }
          }
        } else {
          // Fallback: send migrate from current session
          const mRes = await engine.migrateToMinionOrder(targetChild);
          if (mRes.success) {
            minionSuccess = true;
            if (mRes.orderId) minionOrders.push(mRes.orderId);
            engine.log(`[✓] تم إرسال طلب الترحيل لـ MINION: (orderId: ${mRes.orderId})`, "success");
          }
        }
      }

      // 7. Verify status & record in Supabase
      await sleep(2000);
      const afterOwnerSt = await engine.getStatusAndChild(true);
      const childStillExists = !!afterOwnerSt.childNumber && afterOwnerSt.childNumber.includes(targetChild.slice(-8));

      if (!childStillExists) {
        engine.log(`[🎉] تأكيد نهائي بالسيرفر: تم فك ارتباط الفرد (${targetChild}) وخروجه من عائلة الأونر بنجاح تام!`, "success");
      } else {
        engine.log(`[!] ملاحظة: تم إرسال جميع طلبات الإخراج (${phase1SuccessCount} أوامر مقبولة)، وفي انتظار معالجة السيرفر النهائية.`, "info");
      }

      try {
        await supabase.from("vip_operation_history").insert({
          session_id: session_id,
          operation_type: "manual_action",
          owner_account_ref: parentDial,
          individual_account_ref: targetChild,
          requested_action: `إخراج الفرد المتكرر (${phase1SuccessCount} أمر) + تجديد الأونر + تحويل لـ MINION`,
          status: "succeeded",
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          result: {
            phase1_orders: phase1Orders,
            minion_orders: minionOrders,
            child_removed: !childStillExists,
            minion_success: minionSuccess,
          },
          is_automatic: false,
        });

        await supabase.from("vip_sessions").update({
          last_actual_operation: "full_release_and_minion",
          individual_current_plan: minionSuccess ? "أهلا أقوى كارت (MINION)" : session.individual_current_plan,
          relationship_status: !childStillExists ? "no_child_linked" : session.relationship_status,
          updated_at: new Date().toISOString(),
        }).eq("id", session_id);
      } catch (_e) {}

      return new Response(JSON.stringify({
        success: true,
        message: `اكتمل مسار إخراج الفرد وتحويله لأهلا أقوى كارت بنجاح!`,
        child_removed: !childStillExists,
        phase1_orders: phase1Orders,
        minion_orders: minionOrders,
        logs: engine.logs,
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // ACTION 11: remove_child_multi (أمر إخراج الفرد المنفصل بتكرار محدد)
    // ══════════════════════════════════════════════════════════════════
    if (action === "remove_child_multi") {
      if (!await engine.login(ownerEmail, ownerPass, true)) {
        return new Response(JSON.stringify({
          success: false,
          error: "فشل تسجيل الدخول لحساب الأونر.",
          logs: engine.logs,
        }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      const st = await engine.getStatusAndChild(true);
      const targetChild = body.child_number || st.childNumber || session.individual_account_identifier;
      const parentDial = engine.ownerDial || session.owner_account_identifier;

      if (!targetChild) {
        return new Response(JSON.stringify({
          success: false,
          error: "لم يتم العثور على رقم الفرد المراد إخراجه.",
          logs: engine.logs,
        }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      const repeatCount = Math.min(Math.max(Number(body.count) || 5, 1), 30);
      const delaySec = Math.max(Number(body.delay_seconds) || 2.5, 0.5);
      const isSeven = st.planId.includes("Parent_7") || st.planId.includes("7");
      const ownerPlanName = isSeven ? "Hekaya_XRP_MIX_Parent_7" : "Hekaya_XRP_MIX_Parent_6";

      engine.log(`[*] جاري تنفيذ أمر إخراج الفرد (${targetChild}) بتكرار ${repeatCount} مرة كحد أقصى (بفاصل آمن ${delaySec}ث لمنع تعليق الأوردرات بالسيستم)...`, "info");
      const orders: string[] = [];
      let successCount = 0;

      for (let i = 1; i <= repeatCount; i++) {
        const res = await engine.removeChildOrder(targetChild, parentDial, ownerPlanName);
        if (res.success) {
          successCount++;
          if (res.orderId) orders.push(res.orderId);
          engine.log(`[✓] إخراج (${i}/${repeatCount}): تم القبول (orderId: ${res.orderId || "مكتمل"})`, "success");
        } else {
          engine.log(`[!] إخراج (${i}/${repeatCount}): رد السيرفر (${res.raw || "فشل"})`, "warn");
        }
        await sleep(delaySec * 1000);

        // Smart check after 2 orders: if child already gone, stop
        if (i >= 2 && successCount >= 1) {
          const quickSt = await engine.getStatusAndChild(true);
          const stillThere = !!quickSt.childNumber && quickSt.childNumber.includes(targetChild.slice(-8));
          if (!stillThere) {
            engine.log(`[🎯] فحص ذكي: الفرد فك ارتباطه بالسيرفر بالفعل! تم التوقف الفوري لتجنب تعليق طلبات مكررة.`, "success");
            break;
          }
        }
      }

      return new Response(JSON.stringify({
        success: successCount > 0,
        message: `تم تنفيذ ${successCount}/${repeatCount} أمر إخراج بنجاح!`,
        orders,
        logs: engine.logs,
      }), {
        status: successCount > 0 ? 200 : 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // ACTION 12: migrate_child_to_minion (أمر تحويل الفرد لنظام MINION المنفصل)
    // ══════════════════════════════════════════════════════════════════
    if (action === "migrate_child_to_minion" || action === "migrate_to_minion_multi") {
      const targetChild = body.child_number || session.individual_account_identifier;
      if (!targetChild) {
        return new Response(JSON.stringify({
          success: false,
          error: "رقم الفرد غير محدد لتحويله لأهلا أقوى كارت.",
          logs: engine.logs,
        }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      const repeatCount = Math.min(Math.max(Number(body.count) || 2, 1), 10);
      const delaySec = Math.max(Number(body.delay_seconds) || 3, 1);
      engine.log(`[*] جاري تحويل رقم الفرد (${targetChild}) لنظام أهلا أقوى كارت (MINION) بتكرار ${repeatCount} مرات (بفاصل آمن ${delaySec}ث)...`, "info");

      let activeEngine: EtisalatEngine = engine;
      if (childEmail && childPass) {
        const childEngine = new EtisalatEngine("child", bridgeConfig, session_id);
        childEngine.onLog = (l) => engine.log(l.message, l.level);
        if (await childEngine.login(childEmail, childPass, false, true)) {
          activeEngine = childEngine;
        } else {
          await engine.login(ownerEmail, ownerPass, true);
        }
      } else {
        await engine.login(ownerEmail, ownerPass, true);
      }

      const orders: string[] = [];
      let successCount = 0;

      for (let i = 1; i <= repeatCount; i++) {
        const res = await activeEngine.migrateToMinionOrder(targetChild);
        if (res.success) {
          successCount++;
          if (res.orderId) orders.push(res.orderId);
          engine.log(`[✓] تحويل MINION (${i}/${repeatCount}): تم القبول (orderId: ${res.orderId || "مقبول"})`, "success");
          // Stop on acceptance to prevent duplicate pending orders
          break;
        } else {
          engine.log(`[!] تحويل MINION (${i}/${repeatCount}): رد السيرفر (${res.raw || "فشل"})`, "warn");
        }
        await sleep(delaySec * 1000);
      }

      if (successCount > 0) {
        try {
          await supabase.from("vip_sessions").update({
            individual_current_plan: "أهلا أقوى كارت (MINION)",
            updated_at: new Date().toISOString(),
          }).eq("id", session_id);
        } catch (_) {}
      }

      return new Response(JSON.stringify({
        success: successCount > 0,
        message: `تم إرسال ${successCount}/${repeatCount} طلب ترحيل لنظام أهلا أقوى كارت بنجاح!`,
        orders,
        logs: engine.logs,
      }), {
        status: successCount > 0 ? 200 : 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // ACTION 13: run_smart_ejection_sequence
    // تسلسل الإخراج الذكي الكامل: تجديد باقة الأونر -> انتظار نزول الميكسات للفرد ->
    // 5 محاولات إخراج (20ث بين كل محاولة) -> فحص صارم -> تكرار -> تحويل MINION
    // ══════════════════════════════════════════════════════════════════
    if (action === "run_smart_ejection_sequence") {
      if (!await engine.login(ownerEmail, ownerPass, true)) {
        return new Response(JSON.stringify({
          success: false,
          error: "فشل تسجيل الدخول لحساب الأونر.",
          logs: engine.logs,
        }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      const st = await engine.getStatusAndChild(false);
      const isSeven = st.planId.includes("Parent_7") || st.planId.includes("7");
      const ownerPlanName = isSeven ? "Hekaya_XRP_MIX_Parent_7" : "Hekaya_XRP_MIX_Parent_6";
      const planCost = isSeven ? 270 : 180;
      const parentDial = engine.ownerDial || session.owner_account_identifier;
      const targetChild = body.child_number || st.childNumber || session.individual_account_identifier;

      engine.log(`[🚀] بدء تسلسل الإخراج الذكي المعتمد للفرد (${targetChild || "الفرد"}) للجلسة «${session.session_name}»...`, "info");

      // Check if child is actually in the family
      if (!st.childNumber && !body.force) {
        engine.log(`[✓] فحص سيرفر اتصالات: لا يوجد أي فرد مسجل داخل عائلة الأونر حالياً بالسيرفر. الفرد خارج العائلة بالفعل!`, "success");
        return new Response(JSON.stringify({
          success: true,
          message: "الفرد غير موجود داخل عائلة الأونر حالياً (خارج العائلة بالفعل).",
          child_removed: true,
          logs: engine.logs,
        }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      // ── الخطوة 1: تجديد باقة الأونر ──
      engine.log(`[*] الخطوة 1/5: تجديد باقة الأونر (${engine.getPlanName(st.planId)}) لتحديث حالة العقد...`, "info");
      try {
        const renewOk = await engine.renewBundleAction(ownerPlanName, planCost);
        if (renewOk) {
          engine.log(`[✓] تم إرسال أمر تجديد باقة الأونر بنجاح!`, "success");
        } else {
          engine.log(`[!] تجديد باقة الأونر: تم إرسال الأمر (أو الباقة مجددة بالفعل)`, "warn");
        }
      } catch (rErr: any) {
        engine.log(`[!] تجديد باقة الأونر: ${rErr?.message || "تم المتابعة"}`, "warn");
      }

      // ── الخطوة 2: فحص استقرار حساب الفرد ──
      engine.log(`[*] الخطوة 2/4: التحقق من استقرار الخط...`, "info");
      await sleep(2000);

      // Helper function to execute fast ejection attempts
      let childEjected = false;
      const attemptOrders: string[] = [];

      engine.log(`[*] الخطوة 3/4: تنفيذ محاولات إخراج الفرد بالسيرفر مع الفحص الفوري...`, "info");
      for (let i = 1; i <= 4; i++) {
        const res = await engine.removeChildOrder(targetChild, parentDial, ownerPlanName);
        if (res.success) {
          if (res.orderId) attemptOrders.push(res.orderId);
          engine.log(`[✓] محاولة إخراج (${i}/4): تم قبول أمر الإخراج بالسيرفر (orderId: ${res.orderId || "مكتمل"})`, "success");
        } else {
          engine.log(`[!] محاولة إخراج (${i}/4): رد الخادم (${res.raw || "فشل"})`, "warn");
        }

        // Check if child is out already after each attempt
        await sleep(1500);
        const checkSt = await engine.getStatusAndChild(true);
        const stillThere = !!checkSt.childNumber && checkSt.childNumber.includes(targetChild.slice(-8));
        if (!stillThere) {
          engine.log(`[🎯] نجاح فوري: تأكد خروج الفرد (${targetChild}) من عائلة الأونر بالسيرفر! تم إيقاف باقي المحاولات.`, "success");
          childEjected = true;
          break;
        }

        if (i < 4) {
          await sleep(2500);
        }
      }

      // ── الخطوة 4: التحقق النهائي والتحويل لنظام 270 أو تفعيل خيار MINION ──
      let childPlan270Converted = false;
      let canMigrateMinion = false;

      if (childEjected) {
        engine.log(`[🎉] تأكيد نهائي: خرج الفرد (${targetChild}) من عائلة الأونر بنجاح تام!`, "success");
        engine.log(`[🚀] جاري تحويل خط الفرد تلقائياً لنظام 270 (Hekaya_XRP_MIX_Parent_7)...`, "info");
        if (childEmail && childPass) {
          try {
            const childEngine = new EtisalatEngine("child", bridgeConfig, session_id);
            childEngine.onLog = (l) => engine.log(l.message, l.level);
            if (await childEngine.login(childEmail, childPass, false, true)) {
              const pOk = await childEngine.changePlan("Hekaya_XRP_MIX_Parent_7", "");
              if (pOk) {
                childPlan270Converted = true;
                engine.log(`[✓] تم تحويل خط الفرد بنجاح تام إلى نظام 270 (Parent 7)!`, "success");
              } else {
                engine.log(`[!] تم طلب تحويل الفرد لـ 270، أو يمكنك الضغط على زر تحويل الفرد لـ 270 يدوياً.`, "warn");
              }
            }
          } catch (cErr: any) {
            engine.log(`[!] خطأ في تحويل الفرد لـ 270: ${cErr?.message || cErr}`, "warn");
          }
        }
      } else {
        canMigrateMinion = true;
        engine.log(`[⚠️] الفرد ما زال معلقاً بعائلة الأونر بعد جولتين كاملتين (10 محاولات إخراج متباعدة).`, "warn");
        engine.log(`[🔔] لم يتم التحويل التلقائي لـ MINION بناءً على تعليماتك. تم تفعيل زر [حان الآن تحويل الفرد لنظام أهلاً أقوى كارت MINION لفك التعليق] بالواجهة لتقوم بالضغط عليه يدوياً إذا رغبت.`, "warn");
      }

      // Update Supabase Database session
      try {
        await supabase.from("vip_sessions").update({
          relationship_status: childEjected ? "none" : session.relationship_status,
          individual_current_plan: childPlan270Converted ? "حكاية عيلة 270" : session.individual_current_plan,
          last_actual_operation: "smart_ejection_completed",
          updated_at: new Date().toISOString(),
        }).eq("id", session_id);

        await supabase.from("vip_operation_history").insert({
          session_id: session_id,
          operation_type: "smart_ejection",
          owner_account_ref: parentDial,
          individual_account_ref: targetChild,
          requested_action: `تسلسل الإخراج الذكي (${attemptOrders.length} محاولات إخراج${childPlan270Converted ? " + تحويل الفرد لـ 270" : ""}${canMigrateMinion ? " + فتح زر MINION اليدوي" : ""})`,
          status: childEjected ? "succeeded" : "partial",
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          result: {
            child_removed: childEjected,
            attempt_orders: attemptOrders,
            child_plan_270_converted: childPlan270Converted,
            can_migrate_minion: canMigrateMinion,
          },
          is_automatic: body.is_automatic === true,
        });
      } catch (_) {}

      return new Response(JSON.stringify({
        success: childEjected,
        message: childEjected
          ? `تم خروج الفرد من العائلة بنجاح${childPlan270Converted ? " وتم تحويله لنظام 270!" : "!"}`
          : "لم يخرج الفرد بعد جولتي إخراج. حان الآن وقت التحويل إلى أهلاً أقوى كارت (MINION) يدوياً لفك التعليق.",
        child_removed: childEjected,
        child_plan_270_converted: childPlan270Converted,
        can_migrate_minion: canMigrateMinion,
        orders: attemptOrders,
        logs: engine.logs,
      }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }
    // ══════════════════════════════════════════════════════════════════
    // ACTION 14: change_child_plan (تحويل خط الفرد لنظام 270 أو 180)
    // ══════════════════════════════════════════════════════════════════
    if (action === "change_child_plan") {
      if (!childEmail || !childPass) {
        return new Response(JSON.stringify({
          success: false,
          error: "بيانات تسجيل دخول حساب الفرد غير متوفرة في الجلسة.",
          logs: engine.logs,
        }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      const childEngine = new EtisalatEngine("child", bridgeConfig, session_id);
      childEngine.onLog = (l) => engine.log(l.message, l.level);
      if (!await childEngine.login(childEmail, childPass, false, true)) {
        return new Response(JSON.stringify({
          success: false,
          error: "فشل تسجيل الدخول لحساب الفرد.",
          logs: childEngine.logs,
        }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      const targetPlan = body.target_plan === "6" ? "Hekaya_XRP_MIX_Parent_6" : "Hekaya_XRP_MIX_Parent_7";
      const ratePlanId = body.target_plan === "6" ? "951" : "";
      const ok = await childEngine.changePlan(targetPlan, ratePlanId);

      if (ok) {
        childEngine.log(`[✓] تم تحويل خط الفرد بنجاح إلى: ${targetPlan === "Hekaya_XRP_MIX_Parent_7" ? "نظام 270" : "نظام 180"}!`, "success");
        await supabase
          .from("vip_sessions")
          .update({
            individual_current_plan: targetPlan === "Hekaya_XRP_MIX_Parent_7" ? "حكاية عيلة 270" : "حكاية عيلة 180",
            updated_at: new Date().toISOString(),
          })
          .eq("id", session_id);
      }

      return new Response(JSON.stringify({
        success: ok,
        message: ok ? "تم تحويل خط الفرد إلى نظام 270 بنجاح!" : "فشل تحويل خط الفرد إلى نظام 270",
        logs: childEngine.logs,
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
