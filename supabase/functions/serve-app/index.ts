/**
 * serve-app — Edge Function لخدمة SPA (Single Page Application)
 * ─────────────────────────────────────────────────────────────────
 * السبب: Supabase Storage يخزّن HTML كـ text/plain (حماية أمنية)
 *        مما يجعل الـ WebView يعرضه كنص خام بدل ما يرندره.
 *
 * الحل: هذه الدالة تقرأ index.html من storage وتسلّمه بـ
 *        Content-Type: text/html صحيح + تضيف <base href> لحل
 *        مسارات الـ assets المحفوظة في storage.
 *
 * يُستخدم كـ server.url في capacitor.config.ts
 */

const STORAGE_BASE = "https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/web-live/";
const INDEX_URL    = `${STORAGE_BASE}index.html`;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // OPTIONS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    // ── جلب index.html من Storage (محفوظ كـ text/plain هناك) ──────────
    const storageResp = await fetch(INDEX_URL, {
      headers: { "Cache-Control": "no-cache" },
    });

    if (!storageResp.ok) {
      return new Response(
        `<h1>خطأ في تحميل التطبيق</h1><p>تعذّر الوصول إلى الملفات (${storageResp.status})</p>`,
        {
          status: 503,
          headers: { "Content-Type": "text/html; charset=utf-8", ...CORS },
        }
      );
    }

    let html = await storageResp.text();

    // ── حقن <base href> لضمان تحميل الـ assets من Storage ────────────
    // بدون هذا، مسارات ./assets/abc.js لن تُحل بشكل صحيح
    if (!html.includes("<base ")) {
      html = html.replace(
        "<head>",
        `<head>\n  <base href="${STORAGE_BASE}">`
      );
    }

    // ── إرجاع HTML بـ Content-Type صحيح ─────────────────────────────
    return new Response(html, {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type":  "text/html; charset=utf-8",
        // لا cache على index.html حتى يحمّل دائماً أحدث كود
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma":        "no-cache",
        "Expires":       "0",
      },
    });

  } catch (err) {
    console.error("[serve-app] خطأ:", err);
    return new Response(
      `<h1>خطأ داخلي</h1><pre>${err}</pre>`,
      {
        status: 500,
        headers: { "Content-Type": "text/html; charset=utf-8", ...CORS },
      }
    );
  }
});
