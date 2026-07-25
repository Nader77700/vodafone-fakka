/**
 * invite — Edge Function عامة لصفحة دعوة التجار (بدون JWT)
 */

const SUPABASE_REST = "https://vchmsnavyhripakyvzom.supabase.co/rest/v1";
const ANON_KEY      = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjaG1zbmF2eWhyaXBha3l2em9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyODc4NTUsImV4cCI6MjA5Nzg2Mzg1NX0.pnqdmg5BApYx3HAPWR2UFhuV5ewyayvKR_dZk8of4s8";
const APK_FALLBACK  = "https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.240.apk";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url        = new URL(req.url);
  const inviteCode = url.searchParams.get("merchant") ?? url.searchParams.get("code") ?? "";

  let merchantName  = "";
  let merchantColor = "#e60000";
  let apkUrl        = APK_FALLBACK;
  let inviteValid   = false;
  let inviteStatus  = "active";
  let inviteToken   = inviteCode;

  try {
    // البحث عن merchant_invites.token
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
        const mRes   = await fetch(
          `${SUPABASE_REST}/merchants?id=eq.${mid}&select=name,brand_color`,
          { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
        );
        if (mRes.ok) {
          const mData = await mRes.json();
          if (mData?.length > 0) {
            merchantName  = mData[0].name ?? "";
            merchantColor = mData[0].brand_color ?? "#e60000";
          }
        }
      } else {
        // جرب merchants.invite_code
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
    // APK URL
    const cfgRes = await fetch(
      `${SUPABASE_REST}/app_config?key=eq.version_apk_url&select=value`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
    );
    if (cfgRes.ok) {
      const cfgData = await cfgRes.json();
      if (cfgData?.length > 0) apkUrl = cfgData[0].value;
    }
  } catch (_) { /* القيم الافتراضية */ }

  const isDisabled = !inviteValid || inviteStatus !== "active";
  const accent     = merchantColor || "#e60000";

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no"/>
<title>${merchantName ? `دعوة من ${merchantName}` : "دعوة — Vodafone Fakka Premium"}</title>
<meta name="theme-color" content="#000000"/>
<style>
:root{--accent:${accent};--bg:#0a0a0a;--card:#141414;--border:#2a2a2a;--text:#f0f0f0;--muted:#888;--green:#22c55e}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;-webkit-font-smoothing:antialiased}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px 16px}
body::before{content:'';position:fixed;inset:0;z-index:0;background:radial-gradient(ellipse 80% 50% at 50% -5%,color-mix(in srgb,var(--accent) 12%,transparent) 0%,transparent 65%);pointer-events:none}
.wrap{position:relative;z-index:1;width:100%;max-width:400px;display:flex;flex-direction:column;gap:16px}
.logo-wrap{display:flex;justify-content:center;margin-bottom:8px}
.logo{width:64px;height:64px;border-radius:18px;overflow:hidden;border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);box-shadow:0 0 28px color-mix(in srgb,var(--accent) 25%,transparent);background:#0d0000;padding:10px}
.logo img{width:100%;height:100%;object-fit:contain}
.card{background:var(--card);border:1px solid var(--border);border-radius:20px;padding:24px;text-align:center}
.card.merchant{border-color:color-mix(in srgb,var(--accent) 30%,var(--border))}
.badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;margin-bottom:12px}
.badge.ok{background:color-mix(in srgb,var(--green) 12%,transparent);color:var(--green);border:1px solid color-mix(in srgb,var(--green) 25%,transparent)}
.badge.off{background:color-mix(in srgb,#f59e0b 10%,transparent);color:#f59e0b;border:1px solid color-mix(in srgb,#f59e0b 25%,transparent)}
.merchant-name{font-size:20px;font-weight:900;color:var(--text);margin-bottom:6px}
.sub{font-size:13px;color:var(--muted);line-height:1.5}
.code-box{background:#0d0d0d;border:1px solid color-mix(in srgb,var(--accent) 35%,var(--border));border-radius:14px;padding:16px;margin-top:16px}
.code-label{font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px}
.code-val{font-size:18px;font-weight:900;font-family:monospace;color:var(--accent);letter-spacing:.08em;word-break:break-all}
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
#copy-btn.copied{background:color-mix(in srgb,var(--green) 15%,transparent);color:var(--green);border-color:color-mix(in srgb,var(--green) 30%,transparent)}
.dot{width:6px;height:6px;border-radius:50%;background:currentColor;display:inline-block}
</style>
</head>
<body>
<div class="wrap">
  <div class="logo-wrap">
    <div class="logo">
      <img src="https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/web-live/icons/icon-192x192.png" alt="VFP" onerror="this.style.display='none'"/>
    </div>
  </div>
  ${isDisabled ? `
  <div class="card">
    <div class="badge off"><span class="dot"></span>رابط معطّل</div>
    <p class="merchant-name">رابط الدعوة غير نشط</p>
    <p class="sub">هذا الرابط غير نشط حالياً.<br/>تواصل مع التاجر للحصول على رابط جديد.</p>
  </div>
  ` : `
  <div class="card merchant">
    <div class="badge ok"><span class="dot"></span>دعوة صالحة</div>
    <p class="merchant-name">${merchantName || "دعوة خاصة"}</p>
    <p class="sub">تمت دعوتك للانضمام إلى<br/><strong style="color:var(--text)">Vodafone Fakka Premium</strong></p>
    <div class="code-box">
      <p class="code-label">كود الدعوة</p>
      <p class="code-val" id="invite-code">${inviteToken}</p>
    </div>
  </div>
  <div class="steps">
    <p class="steps-title">كيف تنضم؟</p>
    <div class="step"><div class="step-num">١</div><p class="step-text">اضغط <strong>تحميل التطبيق</strong> وثبّته</p></div>
    <div class="step"><div class="step-num">٢</div><p class="step-text">أنشئ حساباً جديداً في التطبيق</p></div>
    <div class="step"><div class="step-num">٣</div><p class="step-text">أدخل <strong>كود الدعوة</strong> لتنضم لـ ${merchantName || "التاجر"}</p></div>
  </div>
  <a class="btn btn-primary" href="${apkUrl}">
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
try {
  const p={token:"${inviteToken}",merchant_name:"${merchantName}",stored_at:Date.now()};
  localStorage.setItem("pending_invite_token",JSON.stringify(p));
}catch(_){}
function copyCode(){
  const code="${inviteToken}";
  const btn=document.getElementById("copy-btn");
  const txt=document.getElementById("copy-txt");
  navigator.clipboard?.writeText(code).then(()=>{
    btn.classList.add("copied");txt.textContent="تم النسخ ✓";
    setTimeout(()=>{btn.classList.remove("copied");txt.textContent="نسخ كود الدعوة";},2500);
  }).catch(()=>{
    const el=document.createElement("textarea");
    el.value=code;document.body.appendChild(el);el.select();document.execCommand("copy");
    document.body.removeChild(el);
    btn.classList.add("copied");txt.textContent="تم النسخ ✓";
    setTimeout(()=>{btn.classList.remove("copied");txt.textContent="نسخ كود الدعوة";},2500);
  });
}
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
});
