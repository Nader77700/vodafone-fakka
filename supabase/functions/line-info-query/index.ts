/**
 * line-info-query — Edge Function v3 (WebSocket)
 *
 * السبب الجذري لفشل v2: كانت تستخدم HTTP Polling
 * الـ DirectLine Bot يُرسل البيانات حصرياً عبر WebSocket (streamUrl)
 *
 * يحاكي Python script بدقة:
 *   1. getProductionKey  → Vodafone Web Content API
 *   2. createConversation → DirectLine POST → { conversationId, token, streamUrl }
 *   3. WebSocket على streamUrl
 *      on_open → send({"subscribe":"*"}) → 100ms → "App_Mass_ar" → 200ms → "Usage"
 *      on_message → process_activity
 *   4. resolve عند gotConsumption أو isUnavailable أو timeout 20s
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { zeroTrustCheck, CORS_HEADERS } from "../_shared/zero_trust.ts";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

const BASE_HEADERS: Record<string, string> = {
  "User-Agent": "vodafoneandroid",
  "Accept": "application/json, text/plain, */*",
  "Content-Type": "application/json",
  "origin": "https://web.vodafone.com.eg",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── أنواع البيانات ─────────────────────────────────────────────
interface CardItem {
  name: string;
  availableAllowance: number;
  usedAllowance: number;
  unitCode: string;
  resetDate: string;
}

interface LineInfoData {
  phone: string;
  system: string | null;
  balance: string | null;
  loanDetails: string | null;
  miBundles: CardItem[];
  fakkaCards: CardItem[];
  maredCards: CardItem[];
}

interface ParseState {
  system: string | null;
  balance: string | null;
  loanDetails: string | null;
  miBundles: CardItem[];
  fakkaCards: CardItem[];
  maredCards: CardItem[];
  isUnavailable: boolean;
  gotConsumption: boolean;
}

// ── 1. جلب productionKey ──────────────────────────────────────
async function getProductionKey(): Promise<string | null> {
  const url = "https://web.vodafone.com.eg/o/webContentApiV2/chatContent/10113116/mass/ar/app?erc=true";
  try {
    const res = await fetch(url, {
      headers: BASE_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (res.status !== 200) {
      console.warn("[line-info] getProductionKey HTTP:", res.status);
      return null;
    }
    const data = await res.json() as Array<Record<string, unknown>>;
    for (const item of data) {
      if (item["source"] === "massBot" || item["reportingKey"] === "mass") {
        const key = item["productionKey"];
        if (typeof key === "string" && key.length > 0) return key;
      }
    }
    console.warn("[line-info] getProductionKey: no matching item");
  } catch (e) {
    console.error("[line-info] getProductionKey error:", e);
  }
  return null;
}

// ── 2. إنشاء Conversation ──────────────────────────────────────
interface ConvResult {
  conversationId: string;
  token: string;
  streamUrl: string;
}

async function createConversation(productionKey: string, phone: string): Promise<ConvResult | null> {
  try {
    const payload = {
      user: {
        id: phone,
        channel: "app",
        language: "ar",
        os: "Unknown",
        profileRatePlan: "my",
        isNativeEshopSupported: true,
        jwtToken: "",
        digitalAddress: "",
        isEshopDemo: false,
        user_journey: "network_readiness",
      },
    };
    // productionKey يأتي من فودافون بصيغة "bearer xxx" — نرسله كما هو بدون إضافة prefix
    const authValue = productionKey.toLowerCase().startsWith("bearer ")
      ? productionKey
      : `Bearer ${productionKey}`;
    const res = await fetch(
      "https://directline.botframework.com/v3/directline/conversations",
      {
        method: "POST",
        headers: { ...BASE_HEADERS, "Authorization": authValue },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (res.status !== 200 && res.status !== 201) {
      console.warn("[line-info] createConversation HTTP:", res.status);
      return null;
    }
    const data = await res.json() as Record<string, unknown>;
    const conversationId = data["conversationId"] as string | undefined;
    const token          = data["token"]          as string | undefined;
    const streamUrl      = data["streamUrl"]       as string | undefined;
    if (!conversationId || !token || !streamUrl) {
      console.warn("[line-info] createConversation missing fields:", { conversationId: !!conversationId, token: !!token, streamUrl: !!streamUrl });
      return null;
    }
    console.log("[line-info] conversation OK id:", conversationId, "streamUrl:", streamUrl.substring(0, 60) + "...");
    return { conversationId, token, streamUrl };
  } catch (e) {
    console.error("[line-info] createConversation error:", e);
    return null;
  }
}

// ── 3. إرسال activity (HTTP POST — نفس Python) ────────────────
async function sendActivity(conversationId: string, token: string, phone: string, text: string): Promise<void> {
  try {
    const res = await fetch(
      `https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`,
      {
        method: "POST",
        headers: { ...BASE_HEADERS, "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          type: "message",
          from: { id: phone, channel: "app", language: "ar", os: "Unknown", jwtToken: "" },
          text,
        }),
        signal: AbortSignal.timeout(6000),
      },
    );
    console.log(`[line-info] sendActivity "${text}" HTTP ${res.status}`);
  } catch (e) {
    console.warn(`[line-info] sendActivity "${text}" error:`, e);
  }
}

// ── 4. تحليل activity (مطابق Python process_activity) ────────
function processActivity(activity: Record<string, unknown>, state: ParseState): void {
  const textRaw = (activity["text"] as string | undefined) ?? "";

  if (
    textRaw.toLowerCase().includes("service is not available") ||
    textRaw.includes("عفوا الخدمة غير متاحة")
  ) {
    state.isUnavailable = true;
    return;
  }

  if (textRaw) {
    try {
      const textData = JSON.parse(textRaw) as Record<string, unknown>;
      const val = (textData["Value"] as string | undefined) ?? "";
      const key = (textData["Key"]   as string | undefined) ?? "";

      if (val.includes("أنت دلوقتي على نظام") || key.includes("BalanceDetails")) {
        const lines = val.split("\n").map((l) => l.trim()).filter(Boolean);
        for (const line of lines) {
          if (line.includes("أنت دلوقتي على نظام")) {
            state.system = line.replace("أنت دلوقتي على نظام", "").trim();
          } else if (line.includes("رصيدك الحالي")) {
            state.balance = line.replace("رصيدك الحالي", "").trim();
          } else if (["عليك", "سلفنى", "تستلف"].some((k) => line.includes(k))) {
            state.loanDetails = line;
          }
        }
        console.log("[line-info] parsed balance → system:", state.system, "balance:", state.balance);
      }
    } catch { /* ليس JSON */ }
  }

  const inputHintRaw = (activity["inputHint"] as string | undefined) ?? "";
  if (inputHintRaw) {
    try {
      const hintData = JSON.parse(inputHintRaw) as Record<string, unknown>;
      if ("consumptionData" in hintData) {
        const cd = hintData["consumptionData"] as Record<string, unknown>;
        const toCard = (raw: Record<string, unknown>): CardItem => ({
          name:               String(raw["Name"]               ?? "غير محدد"),
          availableAllowance: Number(raw["AvailableAllowance"] ?? 0),
          usedAllowance:      Number(raw["UsedAllowance"]      ?? 0),
          unitCode:           String(raw["unitCode"]           ?? ""),
          resetDate:          String(raw["ResetDate"]          ?? ""),
        });
        state.miBundles  = ((cd["MIBundles"]  as Record<string, unknown>[] | undefined) ?? []).map(toCard);
        state.fakkaCards = ((cd["FakkaCards"] as Record<string, unknown>[] | undefined) ?? []).map(toCard);
        state.maredCards = ((cd["MaredCards"] as Record<string, unknown>[] | undefined) ?? []).map(toCard);
        state.gotConsumption = true;
        console.log("[line-info] consumptionData → mi:", state.miBundles.length, "fakka:", state.fakkaCards.length, "mared:", state.maredCards.length);
      }
    } catch { /* ليس JSON */ }
  }
}

// ── 5. WebSocket flow — نفس Python بالضبط ────────────────────
async function runWebSocket(conv: ConvResult, phone: string, timeoutMs: number): Promise<ParseState> {
  const state: ParseState = {
    system: null, balance: null, loanDetails: null,
    miBundles: [], fakkaCards: [], maredCards: [],
    isUnavailable: false, gotConsumption: false,
  };

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn("[line-info] WebSocket timeout after", timeoutMs, "ms");
      try { ws.close(); } catch { /* ignore */ }
      resolve(state);
    }, timeoutMs);

    const ws = new WebSocket(conv.streamUrl);

    ws.onopen = async () => {
      console.log("[line-info] WebSocket opened");
      // مطابق Python: on_open → send subscribe ثم send_fast_requests في thread منفصل
      try { ws.send(JSON.stringify({ subscribe: "*" })); } catch { /* ignore */ }

      // send_fast_requests: sleep(0.1) → App_Mass_ar, sleep(0.2) → Usage
      await sleep(100);
      await sendActivity(conv.conversationId, conv.token, phone, "App_Mass_ar");
      await sleep(200);
      await sendActivity(conv.conversationId, conv.token, phone, "Usage");
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as { activities?: Record<string, unknown>[] };
        const activities = parsed.activities ?? [];
        console.log("[line-info] WS message → activities:", activities.length);
        for (const activity of activities) {
          processActivity(activity, state);
          if (state.isUnavailable || state.gotConsumption) {
            clearTimeout(timer);
            try { ws.close(); } catch { /* ignore */ }
            resolve(state);
            return;
          }
        }
      } catch (e) {
        console.warn("[line-info] WS onmessage parse error:", e);
      }
    };

    ws.onerror = (e) => {
      console.error("[line-info] WebSocket error:", e);
    };

    ws.onclose = (e) => {
      console.log("[line-info] WebSocket closed — code:", e.code, "reason:", e.reason);
      clearTimeout(timer);
      resolve(state);
    };
  });
}

// ── Main Handler ──────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  const zt = await zeroTrustCheck(req);
  if ("error" in zt && zt.error) {
    console.error("[line-info] zero-trust rejected:", zt.error);
    return json({ error: "unauthorized", message: zt.error }, (zt as { status?: number }).status ?? 401);
  }

  let phone: string;
  try {
    const body = await req.json() as { phone?: string };
    phone = (body.phone ?? "").trim();
  } catch {
    return json({ error: "invalid_request", message: "طلب غير صحيح" }, 400);
  }

  let normalized = phone;
  if (normalized.startsWith("+2"))  normalized = normalized.slice(2);
  if (normalized.startsWith("002")) normalized = normalized.slice(3);
  if (!/^01[0-9]{9}$/.test(normalized)) {
    return json({ error: "invalid_number", message: "رقم الهاتف غير صحيح" }, 400);
  }

  console.log("[line-info] ── START ── phone:", normalized);

  // 1. productionKey
  const productionKey = await getProductionKey();
  if (!productionKey) {
    return json({ error: "service_unavailable", message: "تعذّر جلب مفتاح الاتصال من فودافون" }, 503);
  }

  // 2. createConversation
  const conv = await createConversation(productionKey, normalized);
  if (!conv) {
    return json({ error: "connection_error", message: "تعذّر الاتصال بخدمة المحادثة" }, 503);
  }

  // 3. WebSocket flow — 20 ثانية timeout
  const state = await runWebSocket(conv, normalized, 20_000);

  console.log("[line-info] ── DONE ── system:", state.system, "balance:", state.balance,
    "mi:", state.miBundles.length, "fakka:", state.fakkaCards.length, "mared:", state.maredCards.length,
    "unavail:", state.isUnavailable, "gotConsumption:", state.gotConsumption);

  if (state.isUnavailable) {
    return json({ error: "number_unavailable", message: "الرقم غير متوفر أو غير صحيح" }, 404);
  }

  const hasData = state.system || state.balance ||
    state.miBundles.length > 0 || state.fakkaCards.length > 0 || state.maredCards.length > 0;

  if (!hasData) {
    return json({ error: "no_data", message: "لا توجد بيانات لهذا الرقم — قد يكون غير فودافون أو الخدمة بطيئة" }, 404);
  }

  const result: LineInfoData = {
    phone:       normalized,
    system:      state.system,
    balance:     state.balance,
    loanDetails: state.loanDetails,
    miBundles:   state.miBundles,
    fakkaCards:  state.fakkaCards,
    maredCards:  state.maredCards,
  };

  return json({ success: true, data: result });
});
