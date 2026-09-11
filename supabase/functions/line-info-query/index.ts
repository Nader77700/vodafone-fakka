/**
 * line-info-query — Edge Function v2
 * تنفيذ Flow كامل: productionKey → DirectLine → Poll (يحاكي Python/WebSocket flow)
 *
 * Flow:
 * 1. جلب productionKey من Vodafone Web Content API
 * 2. إنشاء DirectLine conversation
 * 3. إرسال "App_Mass_ar" → انتظار 300ms → إرسال "Usage"
 * 4. Poll على activities بـ watermark حتى وصول consumptionData أو timeout 25s
 * 5. إرجاع JSON منظّم
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { zeroTrustCheck, CORS_HEADERS } from "../_shared/zero_trust.ts";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

// ── BASE HEADERS — تحاكي Vodafone Android App ─────────────────────
const BASE_HEADERS: Record<string, string> = {
  "User-Agent": "vodafoneandroid",
  "Accept": "application/json, text/plain, */*",
  "Content-Type": "application/json",
  "origin": "https://web.vodafone.com.eg",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── أنواع البيانات المنظّمة ────────────────────────────────────────
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

// ── 1. جلب productionKey ──────────────────────────────────────────
async function getProductionKey(): Promise<string | null> {
  const url = "https://web.vodafone.com.eg/o/webContentApiV2/chatContent/10113116/mass/ar/app";
  try {
    const res = await fetch(`${url}?erc=true`, {
      headers: BASE_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (res.status !== 200) {
      console.warn("[line-info-query] getProductionKey HTTP status:", res.status);
      return null;
    }
    const data = await res.json() as Array<Record<string, unknown>>;
    for (const item of data) {
      if (item["source"] === "massBot" || item["reportingKey"] === "mass") {
        const key = item["productionKey"];
        if (typeof key === "string" && key.length > 0) return key;
      }
    }
    console.warn("[line-info-query] getProductionKey: no matching item found");
  } catch (e) {
    console.error("[line-info-query] getProductionKey exception:", e);
  }
  return null;
}

// ── 2. إنشاء DirectLine Conversation ─────────────────────────────
interface ConversationResult {
  conversationId: string;
  token: string;
}

async function createConversation(
  productionKey: string,
  phone: string,
): Promise<ConversationResult | null> {
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

    const res = await fetch(
      "https://directline.botframework.com/v3/directline/conversations",
      {
        method: "POST",
        headers: {
          ...BASE_HEADERS,
          "Authorization": `Bearer ${productionKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      },
    );

    if (res.status !== 200 && res.status !== 201) {
      console.warn("[line-info-query] createConversation HTTP status:", res.status);
      return null;
    }

    const data = await res.json() as Record<string, unknown>;
    const conversationId = data["conversationId"] as string | undefined;
    const token          = data["token"]          as string | undefined;

    if (!conversationId || !token) {
      console.warn("[line-info-query] createConversation missing fields:", { conversationId: !!conversationId, token: !!token });
      return null;
    }
    return { conversationId, token };
  } catch (e) {
    console.error("[line-info-query] createConversation exception:", e);
    return null;
  }
}

// ── 3. إرسال activity ─────────────────────────────────────────────
async function sendActivity(
  conversationId: string,
  token: string,
  phone: string,
  textPayload: string,
): Promise<void> {
  try {
    const res = await fetch(
      `https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`,
      {
        method: "POST",
        headers: {
          ...BASE_HEADERS,
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: "message",
          from: {
            id: phone,
            channel: "app",
            language: "ar",
            os: "Unknown",
            jwtToken: "",
          },
          text: textPayload,
        }),
        signal: AbortSignal.timeout(6000),
      },
    );
    console.log(`[line-info-query] sendActivity "${textPayload}" → HTTP ${res.status}`);
  } catch (e) {
    console.warn(`[line-info-query] sendActivity "${textPayload}" exception:`, e);
  }
}

// ── 4. تحليل Activity ─────────────────────────────────────────────
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

function parseActivity(activity: Record<string, unknown>, state: ParseState): void {
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
          } else if (
            line.includes("عليك") ||
            line.includes("سلفنى") ||
            line.includes("تستلف")
          ) {
            state.loanDetails = line;
          }
        }
        console.log("[line-info-query] parsed balance activity → system:", state.system, "balance:", state.balance);
      }
    } catch {
      // ليس JSON
    }
  }

  const inputHintRaw = (activity["inputHint"] as string | undefined) ?? "";
  if (inputHintRaw) {
    try {
      const hintData = JSON.parse(inputHintRaw) as Record<string, unknown>;
      if ("consumptionData" in hintData) {
        const cd = hintData["consumptionData"] as Record<string, unknown>;

        const toCardItem = (raw: Record<string, unknown>): CardItem => ({
          name:               String(raw["Name"]               ?? "غير محدد"),
          availableAllowance: Number(raw["AvailableAllowance"] ?? 0),
          usedAllowance:      Number(raw["UsedAllowance"]      ?? 0),
          unitCode:           String(raw["unitCode"]           ?? ""),
          resetDate:          String(raw["ResetDate"]          ?? ""),
        });

        const miBundles = (cd["MIBundles"]  as Record<string, unknown>[] | undefined) ?? [];
        const fakka     = (cd["FakkaCards"] as Record<string, unknown>[] | undefined) ?? [];
        const mared     = (cd["MaredCards"] as Record<string, unknown>[] | undefined) ?? [];

        state.miBundles  = miBundles.map(toCardItem);
        state.fakkaCards = fakka.map(toCardItem);
        state.maredCards = mared.map(toCardItem);

        state.gotConsumption = true;
        console.log("[line-info-query] parsed consumptionData → miBundles:", miBundles.length,
          "fakka:", fakka.length, "mared:", mared.length);
      }
    } catch {
      // ليس JSON
    }
  }
}

// ── 5. Poll loop (يحاكي WebSocket receive من Python script) ──────
async function pollForActivities(
  conversationId: string,
  token: string,
  phone: string,
  timeoutMs: number,
): Promise<ParseState> {
  const state: ParseState = {
    system: null, balance: null, loanDetails: null,
    miBundles: [], fakkaCards: [], maredCards: [],
    isUnavailable: false, gotConsumption: false,
  };

  const deadline = Date.now() + timeoutMs;

  // ── إرسال الأنشطة بنفس التوقيت الذي يستخدمه Python script ──
  // Python: time.sleep(0.1) → send_activity("App_Mass_ar")
  //         time.sleep(0.2) → send_activity("Usage")
  await sleep(100);
  await sendActivity(conversationId, token, phone, "App_Mass_ar");
  await sleep(300);
  await sendActivity(conversationId, token, phone, "Usage");

  // ── انتظار أولي قبل أول poll (الـ bot يحتاج وقت للمعالجة) ──
  await sleep(1500);

  let watermark: string | null = null;
  let pollCount = 0;

  while (Date.now() < deadline) {
    if (state.isUnavailable || state.gotConsumption) break;

    pollCount++;
    try {
      const url = watermark
        ? `https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities?watermark=${encodeURIComponent(watermark)}`
        : `https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`;

      const res = await fetch(url, {
        headers: {
          ...BASE_HEADERS,
          "Authorization": `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (res.status === 200) {
        const body = await res.json() as {
          activities?: Record<string, unknown>[];
          watermark?: string;
        };
        const newWatermark = body.watermark ?? watermark;
        const activities   = body.activities ?? [];

        console.log(`[line-info-query] poll#${pollCount} → ${activities.length} activities, watermark: ${watermark} → ${newWatermark}`);

        watermark = newWatermark;

        for (const activity of activities) {
          parseActivity(activity, state);
          if (state.isUnavailable || state.gotConsumption) break;
        }
      } else {
        console.warn(`[line-info-query] poll#${pollCount} HTTP status: ${res.status}`);
      }
    } catch (e) {
      console.warn(`[line-info-query] poll#${pollCount} exception:`, e);
    }

    // ── انتظار بين polls (800ms — يعطي الـ bot وقت للرد) ──
    await sleep(800);
  }

  console.log(`[line-info-query] poll ended after ${pollCount} polls — isUnavailable: ${state.isUnavailable}, gotConsumption: ${state.gotConsumption}`);
  return state;
}

// ── Main Handler ──────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  const zt = await zeroTrustCheck(req);
  if (zt.error) {
    console.error("[line-info-query] zero-trust rejected:", zt.error, "status:", zt.status);
    return json({ error: "unauthorized", message: zt.error }, zt.status ?? 401);
  }

  let phone: string;
  try {
    const body = await req.json() as { phone?: string };
    phone = (body.phone ?? "").trim();
  } catch (e) {
    console.error("[line-info-query] body parse error:", e);
    return json({ error: "invalid_request", message: "طلب غير صحيح" }, 400);
  }

  const LOCAL_RE = /^01[0-9]{9}$/;
  let normalized = phone;
  if (normalized.startsWith("+2"))  normalized = normalized.slice(2);
  if (normalized.startsWith("002")) normalized = normalized.slice(3);

  if (!LOCAL_RE.test(normalized)) {
    console.warn("[line-info-query] invalid phone:", phone, "→ normalized:", normalized);
    return json({ error: "invalid_number", message: "رقم الهاتف غير صحيح" }, 400);
  }

  console.log("[line-info-query] ── START ── phone:", normalized);

  // 1. productionKey
  const productionKey = await getProductionKey();
  if (!productionKey) {
    console.error("[line-info-query] getProductionKey failed");
    return json({ error: "service_unavailable", message: "الخدمة غير متاحة حالياً — تعذّر جلب مفتاح الاتصال" }, 503);
  }
  console.log("[line-info-query] productionKey OK (len:", productionKey.length, ")");

  // 2. createConversation
  const conv = await createConversation(productionKey, normalized);
  if (!conv) {
    console.error("[line-info-query] createConversation failed");
    return json({ error: "connection_error", message: "تعذّر الاتصال بخدمة المحادثة" }, 503);
  }
  console.log("[line-info-query] conversation created:", conv.conversationId);

  // 3. pollForActivities (25 ثانية timeout)
  const state = await pollForActivities(conv.conversationId, conv.token, normalized, 25_000);

  console.log("[line-info-query] ── RESULT ── system:", state.system,
    "balance:", state.balance,
    "miBundles:", state.miBundles.length,
    "fakkaCards:", state.fakkaCards.length,
    "maredCards:", state.maredCards.length,
    "isUnavailable:", state.isUnavailable,
    "gotConsumption:", state.gotConsumption);

  if (state.isUnavailable) {
    return json({ error: "number_unavailable", message: "الرقم غير متوفر أو غير صحيح، أو الخدمة غير متاحة حالياً" }, 404);
  }

  const hasData = state.system || state.balance ||
    state.miBundles.length > 0 || state.fakkaCards.length > 0 || state.maredCards.length > 0;

  if (!hasData) {
    console.warn("[line-info-query] no data returned for phone:", normalized);
    return json({ error: "no_data", message: "لا توجد بيانات لهذا الرقم، قد يكون الرقم غير فودافون أو الخدمة مؤقتاً بطيئة" }, 404);
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
