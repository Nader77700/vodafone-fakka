/**
 * serve-app — Edge Function لخدمة SPA + صفحة تحديث التطبيق
 * ─────────────────────────────────────────────────────────────────
 * GET /functions/v1/serve-app         → SPA (index.html من Storage)
 * GET /functions/v1/serve-app?update  → صفحة تحديث التطبيق الاحترافية
 */

const STORAGE_BASE  = "https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/web-live/";
const INDEX_URL     = `${STORAGE_BASE}index.html`;
const SUPABASE_REST = "https://vchmsnavyhripakyvzom.supabase.co/rest/v1";
const ANON_KEY      = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjaG1zbmF2eWhyaXBha3l2em9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyODc4NTUsImV4cCI6MjA5Nzg2Mzg1NX0.sOGx5GRXZF42YoFHBH-JJ3gWlWxF0KCfWPTqGIRIFnU";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── صفحة تحديث التطبيق ────────────────────────────────────────────────────
async function buildUpdatePage(): Promise<string> {
  // جلب بيانات الإصدار
  let version = "3.0.234";
  let apkUrl  = "#";
  try {
    const res  = await fetch(
      `${SUPABASE_REST}/app_config?key=in.(version_latest_name,version_apk_url)&select=key,value`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
    );
    if (res.ok) {
      const data: { key: string; value: string }[] = await res.json();
      data.forEach(r => {
        if (r.key === "version_latest_name") version = r.value;
        if (r.key === "version_apk_url")     apkUrl  = r.value;
      });
    }
  } catch (_) { /* استخدم القيم الافتراضية */ }

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no"/>
<title>تحديث Vodafone Fakka Premium</title>
<meta name="theme-color" content="#000000"/>
<style>
:root{--red:#e00;--red-dark:#a00;--gold:#d4a017;--bg:#0a0a0a;--card:#141414;--border:#2a2a2a;--text:#f0f0f0;--muted:#888}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:'Segoe UI',Tahoma,Arial,sans-serif;-webkit-font-smoothing:antialiased}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px 16px}
body::before{content:'';position:fixed;inset:0;z-index:-1;background:radial-gradient(ellipse 80% 50% at 50% -10%,#e0000018 0%,transparent 70%),radial-gradient(ellipse 60% 40% at 80% 100%,#d4a01710 0%,transparent 60%);pointer-events:none}
.container{width:100%;max-width:400px;display:flex;flex-direction:column;align-items:center;gap:28px}
.logo-wrap{display:flex;flex-direction:column;align-items:center;gap:12px}
.logo-icon{width:90px;height:90px;border-radius:24px;background:linear-gradient(135deg,var(--red) 0%,var(--red-dark) 100%);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 32px #e0000040;overflow:hidden}
.logo-icon img{width:64px;height:64px;object-fit:contain}
.logo-icon .fb{font-size:36px;font-weight:900;color:#fff;letter-spacing:-1px;display:none}
.logo-title{font-size:20px;font-weight:800;background:linear-gradient(90deg,var(--red),var(--gold));-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-align:center}
.logo-sub{font-size:13px;color:var(--muted)}
.card{width:100%;background:var(--card);border:1px solid var(--border);border-radius:24px;padding:28px 24px;display:flex;flex-direction:column;gap:20px}
.icon-wrap{width:64px;height:64px;border-radius:20px;background:#e0000015;display:flex;align-items:center;justify-content:center;margin:0 auto}
.icon-wrap svg{width:32px;height:32px;stroke:var(--red);fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
h1{font-size:18px;font-weight:800;text-align:center;line-height:1.4}
.vbadge{display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 16px;background:#e0000015;border:1px solid #e0000030;border-radius:12px;font-size:14px;font-weight:700;color:var(--red)}
.vbadge span{font-size:12px;color:var(--muted);font-weight:400}
.desc{font-size:13px;color:var(--muted);text-align:center;line-height:1.7}
.divider{height:1px;background:var(--border);width:100%}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:18px;background:linear-gradient(135deg,var(--red) 0%,#c00 100%);color:#fff;font-size:16px;font-weight:800;border:none;border-radius:18px;cursor:pointer;text-decoration:none;box-shadow:0 4px 24px #e0000050;-webkit-tap-highlight-color:transparent;transition:transform .15s}
.btn:active{transform:scale(.97)}
.btn svg{width:22px;height:22px;flex-shrink:0}
.steps{display:flex;flex-direction:column;gap:10px;width:100%}
.step{display:flex;align-items:flex-start;gap:12px;padding:10px 14px;background:#ffffff08;border-radius:12px}
.step-num{width:22px;height:22px;border-radius:50%;background:var(--red);color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
.step-text{font-size:12px;color:var(--muted);line-height:1.5}
.hint{font-size:11px;color:var(--muted);text-align:center;line-height:1.6}
.footer{font-size:11px;color:#555;text-align:center}
</style>
</head>
<body>
<div class="container">
  <div class="logo-wrap">
    <div class="logo-icon">
      <img src="${STORAGE_BASE}vfp-logo.png" alt="VFP" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
      <span class="fb">VF</span>
    </div>
    <p class="logo-title">Vodafone Fakka Premium</p>
    <p class="logo-sub">بواسطة Nader Akram</p>
  </div>
  <div class="card">
    <div class="icon-wrap">
      <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    </div>
    <h1>تحديث جديد متاح!</h1>
    <div class="vbadge"><span>الإصدار الجديد:</span><strong>v${version}</strong></div>
    <p class="desc">يحتوي هذا التحديث على تحسينات في الأداء وميزات جديدة. يرجى التحديث للاستمرار في الاستخدام.</p>
    <div class="divider"></div>
    <a class="btn" href="${apkUrl}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      تحميل التحديث الآن
    </a>
    <div class="steps">
      <div class="step"><div class="step-num">1</div><p class="step-text">اضغط "تحميل التحديث الآن" وانتظر اكتمال التنزيل</p></div>
      <div class="step"><div class="step-num">2</div><p class="step-text">افتح ملف الـ APK من مجلد "التنزيلات"</p></div>
      <div class="step"><div class="step-num">3</div><p class="step-text">اضغط "تثبيت" وامنح الإذن عند الطلب</p></div>
      <div class="step"><div class="step-num">4</div><p class="step-text">افتح التطبيق واستمتع بالميزات الجديدة ✨</p></div>
    </div>
    <p class="hint">⚠️ قد تحتاج لتفعيل "السماح بمصادر غير معروفة" من إعدادات الجهاز</p>
  </div>
  <p class="footer">Vodafone Fakka Premium © 2026 — Nader Akram</p>
</div>
</body>
</html>`;
}

// ── Main Handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url    = new URL(req.url);
  const isUpdate = url.searchParams.has("update");

  // ── صفحة التحديث ─────────────────────────────────────────────────────────
  if (isUpdate) {
    const html = await buildUpdatePage();
    return new Response(html, {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type":  "text/html; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  }

  // ── SPA (index.html) ──────────────────────────────────────────────────────
  try {
    const storageResp = await fetch(INDEX_URL, {
      headers: { "Cache-Control": "no-cache" },
    });

    if (!storageResp.ok) {
      return new Response(
        `<h1>خطأ في تحميل التطبيق</h1><p>تعذّر الوصول إلى الملفات (${storageResp.status})</p>`,
        { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", ...CORS } }
      );
    }

    let html = await storageResp.text();
    if (!html.includes("<base ")) {
      html = html.replace("<head>", `<head>\n  <base href="${STORAGE_BASE}">`);
    }

    return new Response(html, {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type":  "text/html; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma":        "no-cache",
        "Expires":       "0",
      },
    });

  } catch (err) {
    console.error("[serve-app] خطأ:", err);
    return new Response(
      `<h1>خطأ داخلي</h1><pre>${err}</pre>`,
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8", ...CORS } }
    );
  }
});
