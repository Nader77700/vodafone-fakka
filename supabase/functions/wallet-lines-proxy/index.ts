/**
 * wallet-lines-proxy — Edge Function
 * وسيط آمن بين Frontend وخدمات my.tra.gov.eg
 *
 * Endpoints:
 *   POST /wallet-lines-proxy   body: { action, ...payload }
 *
 * Actions:
 *   login       → POST /usermanagement/api/v1/auth/user/login
 *   register    → POST /usermanagement/api/v1/user/registration
 *   verify_otp  → POST /usermanagement/api/v1/user/registration/verification
 *   wallets     → POST /mywallets/api/v1/inquiry/          (يتطلب token)
 *   lines       → POST /querynumber/api/v1/LineNumbers     (يتطلب token)
 *
 * قواعد الأمان:
 *   - SHA-256 يُطبَّق هنا على كلمة المرور، لا في Frontend
 *   - loginToken لا يُرسَل للـ Frontend إطلاقًا
 *   - الرقم القومي لا يُسجَّل في Logs
 *   - token مشفر من client ← يُفك تشفيره بـ session key داخلي
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS } from "../_shared/zero_trust.ts";

const BASE_URL = "https://my.tra.gov.eg";
const APP_VERSION = "197";
const CONNECT_TIMEOUT_MS = 15_000;
const READ_TIMEOUT_MS = 30_000;

// ── Supabase Admin Client (لتسجيل الأخطاء فقط) ───────────────────
const _supabaseAdmin = (() => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
})();

async function logError(opts: {
  action: string;
  errorCode: string;
  httpStatus?: number;
  message?: string;
  phoneHint?: string;  // آخر 4 أرقام فقط
  deviceId?: string;
  extra?: Record<string, unknown>;
}) {
  if (!_supabaseAdmin) return;
  try {
    await _supabaseAdmin.from("wl_error_logs").insert({
      action:      opts.action,
      error_code:  opts.errorCode,
      http_status: opts.httpStatus ?? null,
      message:     opts.message ?? null,
      phone_hint:  opts.phoneHint ?? null,
      device_id:   opts.deviceId ?? null,
      extra:       opts.extra ?? null,
    });
  } catch {
    // لا نوقف التطبيق بسبب فشل التسجيل
  }
}

// ── SHA-256 (Deno native) ──────────────────────────────────────────
async function sha256hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Headers مطابقة للسكريبت المرجعي ──────────────────────────────
function buildHeaders(deviceId: string, language = "ar"): Record<string, string> {
  return {
    "User-Agent": "okhttp/5.3.2",
    "Accept-Encoding": "gzip",
    "clientType": "android",
    "deviceId": deviceId,
    "appVersion": APP_VERSION,
    "Accept-language": language,
    "Content-Type": "application/json; charset=UTF-8",
  };
}

function authenticatedHeaders(
  deviceId: string,
  token: string,
): Record<string, string> {
  return { ...buildHeaders(deviceId, "ar"), Authorization: `Bearer ${token}` };
}

// ── طلب HTTP مع timeout ───────────────────────────────────────────
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const controller = new AbortController();
  const connectTimer = setTimeout(
    () => controller.abort(),
    CONNECT_TIMEOUT_MS + READ_TIMEOUT_MS,
  );
  try {
    const resp = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(connectTimer);
    let data: unknown = null;
    try {
      data = await resp.json();
    } catch {
      data = null;
    }
    return { ok: resp.ok, status: resp.status, data };
  } catch (err: unknown) {
    clearTimeout(connectTimer);
    const isAbort =
      err instanceof DOMException && err.name === "AbortError";
    throw new Error(isAbort ? "TIMEOUT" : "CONNECTION_ERROR");
  }
}

// ── تحديد الشركة من نص provider ──────────────────────────────────
function providerKey(
  p: string,
): "vodafone" | "orange" | "etisalat" | "we" | "unknown" {
  const t = String(p).trim().toLowerCase();
  if (t.includes("vodafone")) return "vodafone";
  if (t.includes("orange")) return "orange";
  if (t.includes("etisalat")) return "etisalat";
  if (t === "we" || t.includes("telecom")) return "we";
  return "unknown";
}

// ── بناء استجابة JSON موحدة ───────────────────────────────────────
function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function errorResp(message: string, code: string, status = 400) {
  return jsonResp({ ok: false, error: code, message }, status);
}

// ── Retry helper للأخطاء المؤقتة فقط (شبكة + 502/503/504) ────────
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  // فقط أخطاء البنية التحتية تستحق retry — 500 من API حكومي لا يُكرَّر
  const retryStatuses = new Set([502, 503, 504]);
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fetchWithTimeout(url, options);
      // إذا كان خطأ لا يستحق retry (4xx أو 500 من الـ API) → أعد فوراً
      if (!retryStatuses.has(result.status) || attempt === maxRetries) {
        return result;
      }
      // Backoff: 1s, 2s فقط
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
    } catch (err: unknown) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt === maxRetries) throw lastErr;
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
  throw lastErr ?? new Error("CONNECTION_ERROR");
}

// ══════════════════════════════════════════════════════════════════
// Actions
// ══════════════════════════════════════════════════════════════════

async function actionLogin(payload: {
  phone: string;
  passwordPlain: string;
  deviceId: string;
}) {
  const { phone, passwordPlain, deviceId } = payload;
  const hashedPassword = await sha256hex(passwordPlain);

  const headers = buildHeaders(deviceId, "en");
  headers["token_provider_type"] = "FIREBASE";
  headers["future_firebase_token"] = "0";

  let result;
  try {
    result = await fetchWithRetry(
      `${BASE_URL}/usermanagement/api/v1/auth/user/login`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ password: hashedPassword, username: phone }),
      },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "CONNECTION_ERROR";
    if (msg === "TIMEOUT") {
      void logError({ action: "login", errorCode: "TIMEOUT", message: "انتهت مهلة الاتصال", deviceId });
      return errorResp("انتهت مهلة الاتصال بالخادم.", "TIMEOUT", 504);
    }
    void logError({ action: "login", errorCode: "CONNECTION_ERROR", message: msg, deviceId });
    return errorResp("تعذر الاتصال بالخادم.", "CONNECTION_ERROR", 503);
  }

  if (!result.ok) {
    const d = result.data as Record<string, unknown> | null;
    const statusObj = d?.status as Record<string, unknown> | undefined;
    const errMsg = statusObj?.errorMsg ?? statusObj?.error;

    // HTTP 500 = my.tra.gov.eg يحجب الـ IP الأجنبي (الخادم خارج مصر)
    if (result.status === 500) {
      console.error("[wallet-lines/login] HTTP 500 from my.tra.gov.eg — IP may be geo-blocked outside Egypt");
      void logError({
        action: "login", errorCode: "SERVICE_UNAVAILABLE", httpStatus: 500,
        message: "HTTP 500 من my.tra.gov.eg — محتمل حجب جغرافي",
        phoneHint: phone.slice(-4), deviceId,
      });
      return errorResp(
        "الخدمة غير متاحة حاليًا. إذا كنت خارج مصر قد تكون الخدمة محجوبة.",
        "SERVICE_UNAVAILABLE", 503,
      );
    }

    void logError({
      action: "login", errorCode: "INVALID_CREDENTIALS", httpStatus: result.status,
      message: String(errMsg ?? "بيانات خاطئة"),
      phoneHint: phone.slice(-4), deviceId,
    });
    return errorResp(String(errMsg ?? "بيانات الدخول غير صحيحة."), "INVALID_CREDENTIALS", 401);
  }

  const d = result.data as Record<string, unknown>;
  if (typeof d !== "object" || d === null) {
    return errorResp("استجابة غير صالحة من الخادم.", "INVALID_RESPONSE", 502);
  }

  const statusCode = (d.status as Record<string, unknown>)?.code;
  if (statusCode !== 200 && statusCode !== null && statusCode !== undefined) {
    const errMsg =
      (d.status as Record<string, unknown>)?.errorMsg ??
      "بيانات الدخول غير صحيحة.";
    return errorResp(String(errMsg), "INVALID_CREDENTIALS", 401);
  }

  let token: string;
  try {
    token = (
      (d.result as Record<string, unknown>)?.token as Record<string, unknown>
    )?.loginToken as string;
    if (!token) throw new Error("no token");
  } catch {
    return errorResp(
      "لم يتم استلام رمز الجلسة.",
      "TOKEN_MISSING",
      502,
    );
  }

  const resultData = d.result as Record<string, unknown> | undefined;

  // ⚠️ Token يُخزن في Deno KV مؤقتاً ويُرجع session key للـ Frontend
  const sessionKey = crypto.randomUUID();
  const kv = await Deno.openKv();
  // يُحفظ لمدة ساعة
  await kv.set(["wl_sessions", sessionKey], token, {
    expireIn: 3600 * 1000,
  });

  return jsonResp({
    ok: true,
    sessionKey,
    name: (resultData?.name as string) ?? null,
    email: (resultData?.email as string) ?? null,
  });
}

async function actionRegister(payload: {
  phone: string;
  name: string;
  email: string;
  passwordPlain: string;
  deviceId: string;
}) {
  const { phone, name, email, passwordPlain, deviceId } = payload;
  const hashedPassword = await sha256hex(passwordPlain);

  let result;
  try {
    result = await fetchWithRetry(
      `${BASE_URL}/usermanagement/api/v1/user/registration`,
      {
        method: "POST",
        headers: buildHeaders(deviceId, "ar"),
        body: JSON.stringify({
          email,
          name,
          password: hashedPassword,
          username: phone,
        }),
      },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "CONNECTION_ERROR";
    if (msg === "TIMEOUT") {
      void logError({ action: "register", errorCode: "TIMEOUT", message: "انتهت مهلة الاتصال", deviceId, phoneHint: phone.slice(-4) });
      return errorResp("انتهت مهلة الاتصال بالخادم.", "TIMEOUT", 504);
    }
    void logError({ action: "register", errorCode: "CONNECTION_ERROR", message: msg, deviceId, phoneHint: phone.slice(-4) });
    return errorResp("تعذر الاتصال بالخادم.", "CONNECTION_ERROR", 503);
  }

  if (!result.ok) {
    const d = result.data as Record<string, unknown> | null;
    const errMsg = (d?.status as Record<string, unknown>)?.errorMsg ?? "فشل إنشاء الحساب.";
    if (result.status === 500) {
      void logError({ action: "register", errorCode: "SERVICE_UNAVAILABLE", httpStatus: 500, message: "HTTP 500 — محتمل حجب جغرافي", deviceId, phoneHint: phone.slice(-4) });
      return errorResp("الخدمة غير متاحة حاليًا. إذا كنت خارج مصر قد تكون الخدمة محجوبة.", "SERVICE_UNAVAILABLE", 503);
    }
    void logError({ action: "register", errorCode: "REGISTER_FAILED", httpStatus: result.status, message: String(errMsg), deviceId, phoneHint: phone.slice(-4) });
    return errorResp(String(errMsg), "REGISTER_FAILED", 400);
  }

  const d = result.data as Record<string, unknown>;
  const statusCode = (d?.status as Record<string, unknown>)?.code;
  if (statusCode !== 200 && statusCode !== null && statusCode !== undefined) {
    const errMsg = (d?.status as Record<string, unknown>)?.errorMsg ?? "فشل إنشاء الحساب.";
    void logError({ action: "register", errorCode: "REGISTER_FAILED", httpStatus: 400, message: String(errMsg), deviceId, phoneHint: phone.slice(-4) });
    return errorResp(String(errMsg), "REGISTER_FAILED", 400);
  }

  return jsonResp({ ok: true });
}

async function actionVerifyOtp(payload: {
  phone: string;
  otp: string;
  deviceId: string;
}) {
  const { phone, otp, deviceId } = payload;

  let result;
  try {
    result = await fetchWithRetry(
      `${BASE_URL}/usermanagement/api/v1/user/registration/verification`,
      {
        method: "POST",
        headers: buildHeaders(deviceId, "ar"),
        body: JSON.stringify({ otp, username: phone }),
      },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "CONNECTION_ERROR";
    if (msg === "TIMEOUT") {
      void logError({ action: "verify_otp", errorCode: "TIMEOUT", message: "انتهت مهلة الاتصال", deviceId, phoneHint: phone.slice(-4) });
      return errorResp("انتهت مهلة الاتصال بالخادم.", "TIMEOUT", 504);
    }
    void logError({ action: "verify_otp", errorCode: "CONNECTION_ERROR", message: msg, deviceId, phoneHint: phone.slice(-4) });
    return errorResp("تعذر الاتصال بالخادم.", "CONNECTION_ERROR", 503);
  }

  if (!result.ok) {
    if (result.status === 500) {
      void logError({ action: "verify_otp", errorCode: "SERVICE_UNAVAILABLE", httpStatus: 500, message: "HTTP 500 — محتمل حجب جغرافي", deviceId, phoneHint: phone.slice(-4) });
      return errorResp("الخدمة غير متاحة حاليًا. إذا كنت خارج مصر قد تكون الخدمة محجوبة.", "SERVICE_UNAVAILABLE", 503);
    }
    void logError({ action: "verify_otp", errorCode: "OTP_VERIFY_FAILED", httpStatus: result.status, deviceId, phoneHint: phone.slice(-4) });
    return errorResp("فشل تأكيد الحساب.", "OTP_VERIFY_FAILED", 400);
  }

  const d = result.data as Record<string, unknown>;
  const statusCode = (d?.status as Record<string, unknown>)?.code;
  if (statusCode !== 200 && statusCode !== null && statusCode !== undefined) {
    void logError({ action: "verify_otp", errorCode: "OTP_INVALID", httpStatus: 400, deviceId, phoneHint: phone.slice(-4) });
    return errorResp("رمز OTP غير صحيح.", "OTP_INVALID", 400);
  }

  // بعد التأكيد، المستخدم يحتاج Login منفصل — يُعاد توجيهه
  return jsonResp({ ok: true });
}

async function actionWalletsAndLines(payload: {
  nationalId: string;
  sessionKey: string;
  deviceId: string;
}) {
  const { nationalId, sessionKey, deviceId } = payload;

  // استرجاع token من KV
  const kv = await Deno.openKv();
  const entry = await kv.get<string>(["wl_sessions", sessionKey]);
  if (!entry.value) {
    return errorResp(
      "انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.",
      "SESSION_EXPIRED",
      401,
    );
  }
  const token = entry.value;

  // ── تنفيذ متوازي للمحافظ والخطوط ────────────────────────────
  const [walletsResult, linesResult] = await Promise.allSettled([
    fetchWithRetry(
      `${BASE_URL}/mywallets/api/v1/inquiry/`,
      {
        method: "POST",
        headers: authenticatedHeaders(deviceId, token),
        body: JSON.stringify({ nationalId }),
      },
    ),
    fetchWithRetry(
      `${BASE_URL}/querynumber/api/v1/LineNumbers`,
      {
        method: "POST",
        headers: authenticatedHeaders(deviceId, token),
        body: JSON.stringify({ nationalId }),
      },
    ),
  ]);

  // ── معالجة المحافظ ────────────────────────────────────────────
  type CarrierKey = "vodafone" | "orange" | "etisalat" | "we";
  const carriers: CarrierKey[] = ["vodafone", "orange", "etisalat", "we"];

  const walletsMap: Record<
    CarrierKey,
    {
      availability:
        | "loaded"
        | "empty"
        | "unavailable"
        | "no_response"
        | "conn_error"
        | "invalid";
      walletNumbers: string[];
      registrationDate?: string;
      walletStatus?: string;
      registeredName?: string;
    }
  > = {
    vodafone: { availability: "no_response", walletNumbers: [] },
    orange: { availability: "no_response", walletNumbers: [] },
    etisalat: { availability: "no_response", walletNumbers: [] },
    we: { availability: "no_response", walletNumbers: [] },
  };

  if (walletsResult.status === "fulfilled") {
    const wr = walletsResult.value;
    if (!wr.ok) {
      for (const c of carriers) walletsMap[c].availability = "unavailable";
    } else {
      const d = wr.data as Record<string, unknown> | null;
      if (!d || typeof d !== "object") {
        for (const c of carriers) walletsMap[c].availability = "invalid";
      } else {
        const values = (d.result as Record<string, unknown>)?.values;
        const list = Array.isArray(values) ? values : [];
        if (list.length === 0) {
          for (const c of carriers) walletsMap[c].availability = "empty";
        } else {
          // وضع loaded افتراضياً للشركات التي ردّ عليها
          for (const c of carriers) walletsMap[c].availability = "empty";
          for (const item of list) {
            const w = item as Record<string, unknown>;
            const k = providerKey(String(w.provider ?? w.operatorName ?? ""));
            if (k === "unknown") continue;
            const ck = k as CarrierKey;
            walletsMap[ck].availability = "loaded";
            walletsMap[ck].walletNumbers.push(
              String(w.walletNumber ?? w.msisdn ?? ""),
            );
            if (!walletsMap[ck].registeredName) {
              walletsMap[ck].registeredName = String(w.name ?? "");
            }
            if (!walletsMap[ck].registrationDate) {
              walletsMap[ck].registrationDate = String(
                w.registrationDate ?? w.creationDate ?? "",
              );
            }
            if (!walletsMap[ck].walletStatus) {
              walletsMap[ck].walletStatus = String(w.status ?? w.walletStatus ?? "");
            }
          }
        }
      }
    }
  } else {
    for (const c of carriers) walletsMap[c].availability = "conn_error";
  }

  // ── معالجة الخطوط ─────────────────────────────────────────────
  const linesMap: Record<
    CarrierKey,
    {
      availability:
        | "loaded"
        | "empty"
        | "unavailable"
        | "no_response"
        | "conn_error"
        | "invalid";
      lineNumbers: string[];
      serviceStatus?: string;
    }
  > = {
    vodafone: { availability: "no_response", lineNumbers: [] },
    orange: { availability: "no_response", lineNumbers: [] },
    etisalat: { availability: "no_response", lineNumbers: [] },
    we: { availability: "no_response", lineNumbers: [] },
  };

  if (linesResult.status === "fulfilled") {
    const lr = linesResult.value;
    if (!lr.ok) {
      for (const c of carriers) linesMap[c].availability = "unavailable";
    } else {
      const d = lr.data as Record<string, unknown> | null;
      if (!d || typeof d !== "object") {
        for (const c of carriers) linesMap[c].availability = "invalid";
      } else {
        // بناءً على السكريبت: result هو object مباشراً { vodafone: {...}, orange: {...} }
        const result = d.result as Record<string, unknown> | null;
        if (!result || typeof result !== "object") {
          for (const c of carriers) linesMap[c].availability = "invalid";
        } else {
          // الشركات الغائبة = no_response (مهم: لا نفترض عدم وجود خطوط)
          for (const c of carriers) {
            const pKey = providerKey(c) as CarrierKey;
            // البحث عن مفتاح مطابق في النتيجة
            const matchKey = Object.keys(result).find(
              (k) => providerKey(k) === pKey,
            );
            if (!matchKey) {
              linesMap[pKey].availability = "no_response";
              continue;
            }
            const providerData = result[matchKey] as Record<string, unknown>;
            const count = Number(providerData?.count ?? providerData?.totalLines ?? -1);
            const numbers = providerData?.lineNumbers ?? providerData?.lines ?? providerData?.numbers;
            const lineList = Array.isArray(numbers) ? numbers.map(String) : [];

            if (count === 0) {
              linesMap[pKey].availability = "empty";
            } else {
              linesMap[pKey].availability = lineList.length > 0 ? "loaded" : "empty";
              linesMap[pKey].lineNumbers = lineList;
              linesMap[pKey].serviceStatus = String(
                providerData?.status ?? providerData?.serviceStatus ?? "",
              );
            }
          }
        }
      }
    }
  } else {
    for (const c of carriers) linesMap[c].availability = "conn_error";
  }

  const carrierNames: Record<CarrierKey, string> = {
    vodafone: "Vodafone",
    orange: "Orange",
    etisalat: "Etisalat",
    we: "WE",
  };

  const wallets = carriers.map((c) => ({
    carrier: c,
    carrierName: carrierNames[c],
    availability: walletsMap[c].availability,
    walletNumbers: walletsMap[c].walletNumbers,
    registeredName: walletsMap[c].registeredName,
    registrationDate: walletsMap[c].registrationDate,
    walletStatus: walletsMap[c].walletStatus,
    walletCount: walletsMap[c].walletNumbers.length,
  }));

  const lines = carriers.map((c) => ({
    carrier: c,
    carrierName: carrierNames[c],
    availability: linesMap[c].availability,
    lineNumbers: linesMap[c].lineNumbers,
    lineCount: linesMap[c].lineNumbers.length,
    serviceStatus: linesMap[c].serviceStatus,
  }));

  return jsonResp({
    ok: true,
    wallets,
    lines,
    fetchedAt: new Date().toISOString(),
  });
}

// ══════════════════════════════════════════════════════════════════
// Action: Send OTP for Full Numbers
// ══════════════════════════════════════════════════════════════════

const APP_VERSION_OTP = "86";

async function actionSendOtp(payload: {
  nationalId: string;
  sessionKey: string;
  deviceId: string;
}) {
  const { nationalId, sessionKey, deviceId } = payload;

  const kv = await Deno.openKv();
  const entry = await kv.get<string>(["wl_sessions", sessionKey]);
  if (!entry.value) {
    return errorResp("انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.", "SESSION_EXPIRED", 401);
  }
  const token = entry.value;

  const headers = { ...authenticatedHeaders(deviceId, token), appVersion: APP_VERSION_OTP };

  let result;
  try {
    result = await fetchWithRetry(
      `${BASE_URL}/querynumber/api/v1/FullLineNumbers/sendOTP`,
      { method: "POST", headers, body: JSON.stringify({ nationalId }) },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "CONNECTION_ERROR";
    void logError({ action: "send_otp", errorCode: msg === "TIMEOUT" ? "TIMEOUT" : "CONNECTION_ERROR", message: msg, deviceId });
    return errorResp(
      msg === "TIMEOUT" ? "انتهت مهلة الاتصال." : "تعذر الاتصال بالخادم.",
      msg === "TIMEOUT" ? "TIMEOUT" : "CONNECTION_ERROR",
      msg === "TIMEOUT" ? 504 : 503,
    );
  }

  if (!result.ok) {
    const d = result.data as Record<string, unknown> | null;
    const errMsg = (d?.status as Record<string, unknown>)?.errorMsg ?? "فشل إرسال رمز التحقق.";
    void logError({ action: "send_otp", errorCode: "SEND_OTP_FAILED", httpStatus: result.status, message: String(errMsg), deviceId });
    return errorResp(String(errMsg), "SEND_OTP_FAILED", 400);
  }

  const d = result.data as Record<string, unknown> | null;
  const statusCode = (d?.status as Record<string, unknown>)?.code;
  if (statusCode !== 200 && statusCode !== null && statusCode !== undefined) {
    const errMsg = (d?.status as Record<string, unknown>)?.errorMsg ?? "فشل إرسال رمز التحقق.";
    return errorResp(String(errMsg), "SEND_OTP_FAILED", 400);
  }

  return jsonResp({ ok: true, message: "تم إرسال رمز التحقق بنجاح." });
}

// ══════════════════════════════════════════════════════════════════
// Action: Get Full Numbers (after OTP verification)
// ══════════════════════════════════════════════════════════════════

async function actionGetFullNumbers(payload: {
  nationalId: string;
  otp: string;
  sessionKey: string;
  deviceId: string;
}) {
  const { nationalId, otp, sessionKey, deviceId } = payload;

  const kv = await Deno.openKv();
  const entry = await kv.get<string>(["wl_sessions", sessionKey]);
  if (!entry.value) {
    return errorResp("انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.", "SESSION_EXPIRED", 401);
  }
  const token = entry.value;

  const headers = { ...authenticatedHeaders(deviceId, token), appVersion: APP_VERSION_OTP };

  let result;
  try {
    result = await fetchWithRetry(
      `${BASE_URL}/querynumber/api/v1/FullLineNumbers`,
      { method: "POST", headers, body: JSON.stringify({ nationalId, otp }) },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "CONNECTION_ERROR";
    void logError({ action: "full_numbers", errorCode: msg === "TIMEOUT" ? "TIMEOUT" : "CONNECTION_ERROR", message: msg, deviceId });
    return errorResp(
      msg === "TIMEOUT" ? "انتهت مهلة الاتصال." : "تعذر الاتصال بالخادم.",
      msg === "TIMEOUT" ? "TIMEOUT" : "CONNECTION_ERROR",
      msg === "TIMEOUT" ? 504 : 503,
    );
  }

  if (!result.ok) {
    const d = result.data as Record<string, unknown> | null;
    const errMsg = (d?.status as Record<string, unknown>)?.errorMsg ?? "رمز التحقق غير صحيح أو منتهي الصلاحية.";
    void logError({ action: "full_numbers", errorCode: "OTP_INVALID", httpStatus: result.status, message: String(errMsg), deviceId });
    return errorResp(String(errMsg), "OTP_INVALID", 400);
  }

  const d = result.data as Record<string, unknown> | null;
  const statusCode = (d?.status as Record<string, unknown>)?.code;
  if (statusCode !== 200 && statusCode !== null && statusCode !== undefined) {
    const errMsg = (d?.status as Record<string, unknown>)?.errorMsg ?? "رمز التحقق غير صحيح.";
    return errorResp(String(errMsg), "OTP_INVALID", 400);
  }

  // result البنية: { Vodafone: { count, mobileLines:[...] }, Orange: {...}, ... }
  const rawResult = d?.result as Record<string, unknown> | null;
  const providerNames = ["vodafone", "orange", "etisalat", "we"] as const;

  const data: Record<string, { count: number; mobileLines: string[] }> = {};
  for (const p of providerNames) {
    const matchKey = rawResult
      ? Object.keys(rawResult).find((k) => providerKey(k) === p)
      : undefined;
    if (!matchKey || !rawResult) {
      data[p] = { count: 0, mobileLines: [] };
      continue;
    }
    const pd = rawResult[matchKey] as Record<string, unknown>;
    const rawLines = pd?.mobileLines ?? pd?.lineNumbers ?? pd?.lines ?? pd?.numbers ?? [];
    const lines = Array.isArray(rawLines) ? rawLines.filter(Boolean).map(String) : [];
    data[p] = {
      count: Number(pd?.count ?? lines.length),
      mobileLines: lines,
    };
  }

  return jsonResp({ ok: true, data });
}

// ══════════════════════════════════════════════════════════════════
// Main Handler
// ══════════════════════════════════════════════════════════════════

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return errorResp("Method not allowed", "METHOD_NOT_ALLOWED", 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResp("Request body غير صالح.", "INVALID_BODY", 400);
  }

  const action = body.action as string;
  if (!action) {
    return errorResp("action مطلوب.", "MISSING_ACTION", 400);
  }

  try {
    switch (action) {
      case "login":
        return await actionLogin({
          phone: String(body.phone ?? ""),
          passwordPlain: String(body.password ?? ""),
          deviceId: String(body.deviceId ?? crypto.randomUUID().slice(0, 16)),
        });

      case "register":
        return await actionRegister({
          phone: String(body.phone ?? ""),
          name: String(body.name ?? ""),
          email: String(body.email ?? ""),
          passwordPlain: String(body.password ?? ""),
          deviceId: String(body.deviceId ?? crypto.randomUUID().slice(0, 16)),
        });

      case "verify_otp":
        return await actionVerifyOtp({
          phone: String(body.phone ?? ""),
          otp: String(body.otp ?? ""),
          deviceId: String(body.deviceId ?? crypto.randomUUID().slice(0, 16)),
        });

      case "lookup":
        return await actionWalletsAndLines({
          nationalId: String(body.nationalId ?? ""),
          sessionKey: String(body.sessionKey ?? ""),
          deviceId: String(body.deviceId ?? crypto.randomUUID().slice(0, 16)),
        });

      case "send_otp":
        return await actionSendOtp({
          nationalId: String(body.nationalId ?? ""),
          sessionKey: String(body.sessionKey ?? ""),
          deviceId: String(body.deviceId ?? crypto.randomUUID().slice(0, 16)),
        });

      case "full_numbers":
        return await actionGetFullNumbers({
          nationalId: String(body.nationalId ?? ""),
          otp: String(body.otp ?? ""),
          sessionKey: String(body.sessionKey ?? ""),
          deviceId: String(body.deviceId ?? crypto.randomUUID().slice(0, 16)),
        });

      default:
        return errorResp(`action غير معروف: ${action}`, "UNKNOWN_ACTION", 400);
    }
  } catch (err: unknown) {
    // سجّل HTTP status والـ endpoint فقط — لا بيانات حساسة
    console.error(`[wallet-lines-proxy] action=${action} error=${String(err)}`);
    return errorResp("حدث خطأ غير متوقع.", "UNEXPECTED_ERROR", 500);
  }
});
