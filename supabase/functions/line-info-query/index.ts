/**
 * line-info-query — Edge Function
 * تنفيذ Flow كامل: productionKey → DirectLine → WebSocket → Parsing → JSON
 *
 * الـ Flow:
 * 1. جلب productionKey من Vodafone Web Content API
 * 2. إنشاء DirectLine conversation
 * 3. فتح WebSocket stream
 * 4. إرسال "App_Mass_ar" ثم "Usage"
 * 5. استقبال activities وتحليلها
 * 6. إغلاق WebSocket عند اكتمال البيانات أو Timeout
 * 7. إرجاع JSON منظّم
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
    if (res.status !== 200) return null;
    const data = await res.json() as Array<Record<string, unknown>>;
    for (const item of data) {
      if (item["source"] === "massBot" || item["reportingKey"] === "mass") {
        const key = item["productionKey"];
        if (typeof key === "string" && key.length > 0) return key;
      }
    }
  } catch {
    // timeout أو network error
  }
  return null;
}

// ── 2. إنشاء DirectLine Conversation ─────────────────────────────
interface ConversationResult {
  conversationId: string;
  token: string;
  streamUrl: string;
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

    if (res.status !== 200 && res.status !== 201) return null;

    const data = await res.json() as Record<string, unknown>;
    const conversationId = data["conversationId"] as string | undefined;
    const token = data["token"] as string | undefined;
    const streamUrl = data["streamUrl"] as string | undefined;

    if (!conversationId || !token || !streamUrl) return null;
    return { conversationId, token, streamUrl };
  } catch {
    return null;
  }
}

// ── 3. إرسال نشاط (activity) ─────────────────────────────────────
async function sendActivity(
  conversationId: string,
  token: string,
  phone: string,
  textPayload: string,
): Promise<void> {
  try {
    await fetch(
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
        signal: AbortSignal.timeout(5000),
      },
    );
  } catch {
    // تجاهل أخطاء الإرسال — WebSocket سيستقبل الردود
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

  // فحص عدم توفر الخدمة
  if (
    textRaw.toLowerCase().includes("service is not available") ||
    textRaw.includes("عفوا الخدمة غير متاحة")
  ) {
    state.isUnavailable = true;
    return;
  }

  // تحليل text (نظام + رصيد + سلفني)
  if (textRaw) {
    try {
      const textData = JSON.parse(textRaw) as Record<string, unknown>;
      const val = (textData["Value"] as string | undefined) ?? "";
      const key = (textData["Key"] as string | undefined) ?? "";

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
      }
    } catch {
      // ليس JSON — نتجاهل
    }
  }

  // تحليل inputHint (consumptionData)
  const inputHintRaw = (activity["inputHint"] as string | undefined) ?? "";
  if (inputHintRaw) {
    try {
      const hintData = JSON.parse(inputHintRaw) as Record<string, unknown>;
      if ("consumptionData" in hintData) {
        const cd = hintData["consumptionData"] as Record<string, unknown>;

        const toCardItem = (raw: Record<string, unknown>): CardItem => ({
          name:               (raw["Name"]               as string) ?? "غير محدد",
          availableAllowance: (raw["AvailableAllowance"] as number) ?? 0,
          usedAllowance:      (raw["UsedAllowance"]      as number) ?? 0,
          unitCode:           (raw["unitCode"]           as string) ?? "",
          resetDate:          (raw["ResetDate"]          as string) ?? "",
        });

        const miBundles = (cd["MIBundles"] as Record<string, unknown>[] | undefined) ?? [];
        const fakka     = (cd["FakkaCards"] as Record<string, unknown>[] | undefined) ?? [];
        const mared     = (cd["MaredCards"] as Record<string, unknown>[] | undefined) ?? [];

        state.miBundles  = miBundles.map(toCardItem);
        state.fakkaCards = fakka.map(toCardItem);
        state.maredCards = mared.map(toCardItem);

        if (miBundles.length > 0 || fakka.length > 0 || mared.length > 0) {
          state.gotConsumption = true;
        }
      }
    } catch {
      // ليس JSON — نتجاهل
    }
  }
}

// ── 5. WebSocket flow عبر Long-Poll (Deno لا يدعم WebSocket client مستقر) ─
// نستخدم DirectLine polling بدلاً من WebSocket لأن Deno edge environment
// لا يدعم WebSocket client + SSL بشكل كامل
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

  // إرسال الأنشطة
  await sendActivity(conversationId, token, phone, "App_Mass_ar");
  await new Promise((r) => setTimeout(r, 300));
  await sendActivity(conversationId, token, phone, "Usage");

  let watermark: string | null = null;

  // Poll loop حتى الحصول على consumptionData أو Timeout
  while (Date.now() < deadline) {
    if (state.isUnavailable || state.gotConsumption) break;

    try {
      const url = watermark
        ? `https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities?watermark=${watermark}`
        : `https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`;

      const res = await fetch(url, {
        headers: {
          ...BASE_HEADERS,
          "Authorization": `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(4000),
      });

      if (res.status === 200) {
        const body = await res.json() as { activities?: Record<string, unknown>[]; watermark?: string };
        watermark = body.watermark ?? watermark;
        for (const activity of body.activities ?? []) {
          parseActivity(activity, state);
          if (state.isUnavailable || state.gotConsumption) break;
        }
      }
    } catch {
      // timeout أو خطأ مؤقت — نكمل
    }

    // انتظار قصير قبل poll تالٍ
    await new Promise((r) => setTimeout(r, 600));
  }

  return state;
}

// ── Main Handler ──────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  // Zero-trust check — نفس نمط باقي الـ functions
  const zt = await zeroTrustCheck(req);
  if (zt.error) {
    return json({ error: "unauthorized", message: zt.error }, zt.status ?? 401);
  }

  let phone: string;
  try {
    const body = await req.json() as { phone?: string };
    phone = (body.phone ?? "").trim();
  } catch {
    return json({ error: "invalid_request", message: "طلب غير صحيح" }, 400);
  }

  // التحقق من صحة الرقم
  const LOCAL_RE = /^01[0-9]{9}$/;
  const INTL_RE  = /^(\+2|002)01[0-9]{9}$/;
  let normalized = phone;
  if (normalized.startsWith("+2"))  normalized = normalized.slice(2);
  if (normalized.startsWith("002")) normalized = normalized.slice(3);

  if (!LOCAL_RE.test(normalized) && !INTL_RE.test(phone)) {
    return json({ error: "invalid_number", message: "رقم الهاتف غير صحيح" }, 400);
  }

  // ── 1. جلب productionKey ──────────────────────────────────────
  const productionKey = await getProductionKey();
  if (!productionKey) {
    return json({ error: "service_unavailable", message: "الخدمة غير متاحة حالياً — تعذّر جلب مفتاح الاتصال" }, 503);
  }

  // ── 2. إنشاء Conversation ──────────────────────────────────────
  const conv = await createConversation(productionKey, normalized);
  if (!conv) {
    return json({ error: "connection_error", message: "تعذّر الاتصال بخدمة المحادثة" }, 503);
  }

  // ── 3. Poll for activities (15 ثانية timeout) ──────────────────
  const state = await pollForActivities(
    conv.conversationId,
    conv.token,
    normalized,
    15_000,
  );

  // ── 4. تحليل النتيجة ───────────────────────────────────────────
  if (state.isUnavailable) {
    return json({ error: "number_unavailable", message: "الرقم غير متوفر أو غير صحيح، أو الخدمة غير متاحة حالياً" }, 404);
  }

  const hasData = state.system || state.balance || state.miBundles.length > 0 ||
    state.fakkaCards.length > 0 || state.maredCards.length > 0;

  if (!hasData) {
    return json({ error: "no_data", message: "لا توجد بيانات لهذا الرقم" }, 404);
  }

  const result: LineInfoData = {
    phone: normalized,
    system:      state.system,
    balance:     state.balance,
    loanDetails: state.loanDetails,
    miBundles:   state.miBundles,
    fakkaCards:  state.fakkaCards,
    maredCards:  state.maredCards,
  };

  return json({ success: true, data: result });
});
