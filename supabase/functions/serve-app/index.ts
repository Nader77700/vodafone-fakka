/**
 * serve-app — Edge Function لخدمة SPA + صفحة تحديث التطبيق + صفحة دعوة التجار
 * ─────────────────────────────────────────────────────────────────
 * GET /functions/v1/serve-app              → SPA (index.html من Storage)
 * GET /functions/v1/serve-app?update       → صفحة تحديث التطبيق الاحترافية
 * GET /functions/v1/serve-app?merchant=ID  → صفحة دعوة التاجر الاحترافية
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

// ── صفحة دعوة التاجر ─────────────────────────────────────────────────────────
async function buildInvitePage(inviteCode: string): Promise<string> {
  // جلب بيانات التاجر والـ APK
  let merchantName  = "";
  let merchantColor = "#e60000";
  let apkUrl        = "https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.238.apk";
  let inviteToken   = inviteCode;
  let inviteValid   = false;
  let inviteStatus  = "active";

  try {
    // جلب بيانات الدعوة من merchant_invites
    const invRes = await fetch(
      `${SUPABASE_REST}/merchant_invites?token=eq.${encodeURIComponent(inviteCode)}&select=token,status,merchant_id`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
    );
    if (invRes.ok) {
      const invData = await invRes.json();
      if (invData?.length > 0) {
        inviteValid  = true;
        inviteToken  = invData[0].token;
        inviteStatus = invData[0].status ?? "active";
        const mid    = invData[0].merchant_id;
        // جلب اسم التاجر
        const mRes = await fetch(
          `${SUPABASE_REST}/merchants?id=eq.${mid}&select=name,brand_color`,
          { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
        );
        if (mRes.ok) {
          const mData = await mRes.json();
          if (mData?.length > 0) {
            merchantName  = mData[0].name  ?? "";
            merchantColor = mData[0].brand_color ?? "#e60000";
          }
        }
      } else {
        // ربما هو invite_code وليس token — جرّب merchants table
        const mcRes = await fetch(
          `${SUPABASE_REST}/merchants?invite_code=eq.${encodeURIComponent(inviteCode)}&select=name,brand_color,invite_enabled,invite_status`,
          { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
        );
        if (mcRes.ok) {
          const mcData = await mcRes.json();
          if (mcData?.length > 0) {
            inviteValid   = mcData[0].invite_enabled && mcData[0].invite_status === "active";
            merchantName  = mcData[0].name ?? "";
            merchantColor = mcData[0].brand_color ?? "#e60000";
            inviteStatus  = mcData[0].invite_status ?? "active";
          }
        }
      }
    }
    // جلب APK URL الأحدث
    const cfgRes = await fetch(
      `${SUPABASE_REST}/app_config?key=in.(version_apk_url,version_latest_name)&select=key,value`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
    );
    if (cfgRes.ok) {
      const cfgData: { key: string; value: string }[] = await cfgRes.json();
      cfgData.forEach(r => { if (r.key === "version_apk_url") apkUrl = r.value; });
    }
  } catch (_) { /* استخدم القيم الافتراضية */ }

  const isDisabled = !inviteValid || inviteStatus !== "active";
  const accent     = merchantColor || "#e60000";

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no"/>
<title>${merchantName ? `دعوة من ${merchantName}` : "دعوة — Vodafone Fakka Premium"}</title>
<meta name="theme-color" content="#000000"/>
<meta property="og:title" content="${merchantName ? `انضم إلى ${merchantName}` : "دعوة خاصة"}"/>
<meta property="og:description" content="تمت دعوتك للانضمام إلى Vodafone Fakka Premium"/>
<style>
:root{--accent:${accent};--bg:#0a0a0a;--card:#141414;--border:#2a2a2a;--text:#f0f0f0;--muted:#888;--green:#22c55e}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;-webkit-font-smoothing:antialiased}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px 16px}
body::before{content:'';position:fixed;inset:0;z-index:0;background:radial-gradient(ellipse 80% 50% at 50% -5%,color-mix(in srgb,var(--accent) 12%,transparent) 0%,transparent 65%);pointer-events:none}
.wrap{position:relative;z-index:1;width:100%;max-width:400px;display:flex;flex-direction:column;gap:16px}
/* Logo */
.logo-wrap{display:flex;justify-content:center;margin-bottom:8px}
.logo{width:64px;height:64px;border-radius:18px;overflow:hidden;border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);box-shadow:0 0 28px color-mix(in srgb,var(--accent) 25%,transparent);background:#0d0000;padding:10px}
.logo img{width:100%;height:100%;object-fit:contain}
/* Card */
.card{background:var(--card);border:1px solid var(--border);border-radius:20px;padding:24px;text-align:center}
.card.merchant{border-color:color-mix(in srgb,var(--accent) 30%,var(--border))}
/* Badge */
.badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;margin-bottom:12px}
.badge.ok{background:color-mix(in srgb,var(--green) 12%,transparent);color:var(--green);border:1px solid color-mix(in srgb,var(--green) 25%,transparent)}
.badge.off{background:color-mix(in srgb,#f59e0b 10%,transparent);color:#f59e0b;border:1px solid color-mix(in srgb,#f59e0b 25%,transparent)}
/* Merchant block */
.merchant-name{font-size:20px;font-weight:900;color:var(--text);margin-bottom:6px}
.sub{font-size:13px;color:var(--muted);line-height:1.5}
/* Invite code box */
.code-box{background:#0d0d0d;border:1px solid color-mix(in srgb,var(--accent) 35%,var(--border));border-radius:14px;padding:16px;margin-top:16px}
.code-label{font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px}
.code-val{font-size:18px;font-weight:900;font-family:monospace;color:var(--accent);letter-spacing:.08em;word-break:break-all}
/* Buttons */
.btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px 20px;border-radius:14px;font-size:15px;font-weight:700;cursor:pointer;text-decoration:none;border:none;transition:opacity .15s,transform .1s;-webkit-tap-highlight-color:transparent}
.btn:active{opacity:.85;transform:scale(.98)}
.btn-primary{background:var(--accent);color:#fff}
.btn-outline{background:transparent;color:var(--text);border:1px solid var(--border)}
.steps{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px;text-align:right}
.steps-title{font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.1em;margin-bottom:12px}
.step{display:flex;align-items:flex-start;gap:10px;margin-bottom:10px}
.step:last-child{margin-bottom:0}
.step-num{width:22px;height:22px;border-radius:50%;background:color-mix(in srgb,var(--accent) 15%,transparent);border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);color:var(--accent);font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
.step-text{font-size:13px;color:var(--muted);line-height:1.5}
.step-text strong{color:var(--text);font-weight:700}
.footer{font-size:11px;color:#444;text-align:center}
/* copy feedback */
#copy-btn.copied{background:color-mix(in srgb,var(--green) 15%,transparent);color:var(--green);border-color:color-mix(in srgb,var(--green) 30%,transparent)}
.dot{width:6px;height:6px;border-radius:50%;background:currentColor;display:inline-block}
</style>
</head>
<body>
<div class="wrap">
  <!-- شعار التطبيق -->
  <div class="logo-wrap">
    <div class="logo">
      <img src="https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/web-live/icons/icon-192x192.png" alt="Vodafone Fakka" onerror="this.style.display='none'"/>
    </div>
  </div>

  ${isDisabled ? `
  <!-- رابط غير نشط -->
  <div class="card">
    <div class="badge off"><span class="dot"></span>رابط معطّل</div>
    <p class="merchant-name">رابط الدعوة غير نشط</p>
    <p class="sub">هذا الرابط غير نشط حالياً أو انتهت صلاحيته.<br/>تواصل مع التاجر للحصول على رابط جديد.</p>
  </div>
  ` : `
  <!-- بطاقة الدعوة -->
  <div class="card merchant">
    <div class="badge ok"><span class="dot"></span>دعوة صالحة</div>
    ${merchantName ? `<p class="merchant-name">${merchantName}</p>` : `<p class="merchant-name">دعوة خاصة</p>`}
    <p class="sub">تمت دعوتك للانضمام إلى منصة<br/><strong style="color:var(--text)">Vodafone Fakka Premium</strong></p>
    <!-- كود الدعوة -->
    <div class="code-box">
      <p class="code-label">كود الدعوة</p>
      <p class="code-val" id="invite-code">${inviteToken}</p>
    </div>
  </div>

  <!-- خطوات الانضمام -->
  <div class="steps">
    <p class="steps-title">كيف تنضم؟</p>
    <div class="step"><div class="step-num">١</div><p class="step-text">اضغط <strong>تحميل التطبيق</strong> وثبّته على هاتفك</p></div>
    <div class="step"><div class="step-num">٢</div><p class="step-text">افتح التطبيق وأنشئ حساباً جديداً</p></div>
    <div class="step"><div class="step-num">٣</div><p class="step-text">في شاشة التسجيل أدخل <strong>كود الدعوة</strong> الموجود أعلاه وسيتم ربطك بـ ${merchantName || "التاجر"} تلقائياً</p></div>
  </div>

  <!-- أزرار -->
  <a class="btn btn-primary" href="${apkUrl}" download>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    تحميل التطبيق
  </a>
  <button id="copy-btn" class="btn btn-outline" onclick="copyCode()">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
    <span id="copy-txt">نسخ كود الدعوة</span>
  </button>
  `}

  <p class="footer">Vodafone Fakka Premium · نظام إدارة كروت الشحن</p>
</div>

<script>
// حفظ الكود في localStorage (يُستخدم لو التطبيق مفتوح في نفس المتصفح)
try {
  const pending = { token: "${inviteToken}", merchant_name: "${merchantName}", stored_at: Date.now() };
  localStorage.setItem("pending_invite_token", JSON.stringify(pending));
} catch(_) {}

function copyCode() {
  const code = "${inviteToken}";
  const btn  = document.getElementById("copy-btn");
  const txt  = document.getElementById("copy-txt");
  try {
    navigator.clipboard.writeText(code).then(() => {
      btn.classList.add("copied");
      txt.textContent = "تم النسخ ✓";
      setTimeout(() => { btn.classList.remove("copied"); txt.textContent = "نسخ كود الدعوة"; }, 2500);
    });
  } catch(_) {
    // fallback
    const el = document.createElement("textarea");
    el.value = code; document.body.appendChild(el);
    el.select(); document.execCommand("copy");
    document.body.removeChild(el);
    btn.classList.add("copied"); txt.textContent = "تم النسخ ✓";
    setTimeout(() => { btn.classList.remove("copied"); txt.textContent = "نسخ كود الدعوة"; }, 2500);
  }
}
</script>
</body>
</html>`;
}

// ── Main Handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url        = new URL(req.url);
  const isUpdate   = url.searchParams.has("update");
  const merchantId = url.searchParams.get("merchant");

  // ── صفحة التحديث ─────────────────────────────────────────────────────────
  if (isUpdate) {
    const html = await buildUpdatePage();
    return new Response(html, {
      status: 200,
      headers: { ...CORS, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate" },
    });
  }

  // ── صفحة دعوة التاجر ─────────────────────────────────────────────────────
  if (merchantId) {
    const html = await buildInvitePage(merchantId);
    return new Response(html, {
      status: 200,
      headers: { ...CORS, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate" },
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
