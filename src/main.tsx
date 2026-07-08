import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";
import "./index.css";

Sentry.init({
  dsn: import.meta.env['VITE_SENTRY_DSN'] as string | undefined,
  environment: import.meta.env.MODE,
});

// ── مسح تلقائي للحالة القديمة عند كل تحديث ─────────────────────────────────
import { BUILD_INFO } from './lib/buildInfo';
const VF_VERSION_KEY  = 'vfp_app_version';
const CURRENT_VERSION = BUILD_INFO.appVersion;
const AUTH_KEY        = 'sb-vchmsnavyhripakyvzom-auth-token';

// مفتاح عدّاد الكراشات — في sessionStorage لأنه يُبقى بعد localStorage.clear()
// ويُمسح تلقائياً عند إغلاق التطبيق كلياً (Android kill process)
const CRASH_COUNT_KEY = 'vfp_crash_count';
const MAX_CRASHES     = 2; // بعد 2 كراش متتالي → مسح كامل + خروج

(function clearStaleStateOnUpdate() {
  try {
    const stored = localStorage.getItem(VF_VERSION_KEY);
    if (stored !== CURRENT_VERSION) {
      // تحديث جديد — مسح كل شيء مع الحفاظ على auth
      const authData = localStorage.getItem(AUTH_KEY);
      sessionStorage.clear();
      localStorage.clear();
      if (authData) localStorage.setItem(AUTH_KEY, authData);
      localStorage.setItem(VF_VERSION_KEY, CURRENT_VERSION);
    }
  } catch { /* تجاهل */ }
})();

// ── Global Error Recovery — اصطياد كل الأخطاء قبل أن تُسقط التطبيق ──────────
(function installGlobalErrorRecovery() {
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[SafeMode] Unhandled rejection:', event.reason);
    event.preventDefault();
  });
  window.addEventListener('error', (event) => {
    console.error('[SafeMode] Global error:', event.message, event.filename, event.lineno);
  });
})();

// ── CrashFallback — مع حماية من حلقة الكراش (crash loop) ───────────────────
//
//  المشكلة السابقة: CrashFallback كان يمسح localStorage ويُعيد التشغيل —
//  لكن إذا كان السبب الجذري لا يزال موجوداً (مثل auth token فاسد)،
//  يتكرر الكراش في حلقة لا نهاية لها وتظهر شاشة "حدث خطأ غير متوقع" باستمرار.
//
//  الإصلاح: نستخدم sessionStorage لعدّ الكراشات المتتالية:
//  • كراش #1: مسح localStorage + حفظ auth + إعادة تشغيل عادية
//  • كراش #2: مسح كامل (بما فيه auth) + خروج من التطبيق تماماً
//  • بعد exitApp: المستخدم يفتح التطبيق من جديد بحالة نظيفة 100%
//
function CrashFallback() {
  const [countdown,  setCountdown]  = useState(4);
  const [cleared,    setCleared]    = useState(false);
  const [crashCount, setCrashCount] = useState(0);
  const [hasUpdate,  setHasUpdate]  = useState(false);

  useEffect(() => {
    // ── عدّ الكراش الحالي ─────────────────────────────────────────────────
    let count = 1;
    try {
      const prev = parseInt(sessionStorage.getItem(CRASH_COUNT_KEY) ?? '0', 10);
      count = (isNaN(prev) ? 0 : prev) + 1;
      sessionStorage.setItem(CRASH_COUNT_KEY, String(count));
    } catch { /* تجاهل */ }
    setCrashCount(count);

    // ── تحقق من وجود تحديث (لعرض رسالة للمستخدم) ─────────────────────────
    try {
      const stored = localStorage.getItem('vf_update_dismissed_v');
      if (stored) setHasUpdate(true);
    } catch { /* تجاهل */ }

    if (count >= MAX_CRASHES) {
      // ── كراش Loop: مسح كامل شامل auth + خروج ────────────────────────────
      try {
        sessionStorage.clear();
        localStorage.clear();
        // لا نحتفظ بشيء — مسح 100% لكسر الحلقة
      } catch { /* تجاهل */ }

      // أعطِ المستخدم ثانيتين ليقرأ الرسالة ثم أغلق التطبيق
      const t = setTimeout(() => {
        try {
          // Capacitor: أغلق التطبيق تماماً (Android)
          import('@capacitor/app').then(({ App: CapApp }) => {
            CapApp.exitApp().catch(() => window.location.replace('/'));
          }).catch(() => window.location.replace('/'));
        } catch { window.location.replace('/'); }
      }, 2500);
      return () => clearTimeout(t);
    }

    // ── كراش #1: مسح عادي مع حفظ auth ──────────────────────────────────────
    try {
      const authData = localStorage.getItem(AUTH_KEY);
      sessionStorage.clear();
      localStorage.clear();
      if (authData) localStorage.setItem(AUTH_KEY, authData);
      localStorage.setItem(VF_VERSION_KEY, CURRENT_VERSION);
      setCleared(true);
    } catch { setCleared(true); }

    // إعادة تشغيل تلقائية بعد 4 ثوانٍ
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(interval);
          // استخدم replace بدلاً من reload لتجنب مشاكل WebView
          window.location.replace('/');
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── رسالة Loop (كراش #2+) ────────────────────────────────────────────────
  if (crashCount >= MAX_CRASHES) {
    return (
      <div dir="rtl" style={styles.wrap}>
        <div style={{ fontSize: '48px' }}>🔄</div>
        <h2 style={{ ...styles.title, color: '#ff9900' }}>تعذّر بدء التشغيل</h2>
        <p style={styles.body}>
          جارٍ إعادة ضبط التطبيق بالكامل…
          <br />
          سيُغلق التطبيق تلقائياً — افتحه مرة أخرى للمتابعة.
        </p>
        {hasUpdate && (
          <p style={{ ...styles.body, color: '#44ff88', marginTop: 8 }}>
            💡 يُنصح بتثبيت التحديث المتاح لحل المشكلة نهائياً.
          </p>
        )}
      </div>
    );
  }

  // ── رسالة كراش عادي (كراش #1) ───────────────────────────────────────────
  return (
    <div dir="rtl" style={styles.wrap}>
      <div style={{ fontSize: '48px' }}>⚠️</div>
      <h2 style={styles.title}>حدث خطأ غير متوقع</h2>
      <p style={styles.body}>
        {cleared ? '✅ تم تنظيف البيانات.' : '🔄 جارٍ التنظيف…'}
        <br />
        إعادة التشغيل تلقائياً خلال <strong style={{ color: '#fff' }}>{countdown}</strong> ثوانٍ…
      </p>
      {hasUpdate && (
        <p style={{ ...styles.body, color: '#44ff88', marginTop: 4 }}>
          💡 يتوفر تحديث — ثبّته لحل المشكلة نهائياً.
        </p>
      )}
      <button onClick={() => window.location.replace('/')} style={styles.btn}>
        🔄 إعادة التشغيل الآن
      </button>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: '100dvh', background: '#0a0000',
    display: 'flex', flexDirection: 'column' as const,
    alignItems: 'center', justifyContent: 'center',
    padding: '24px', fontFamily: 'system-ui, sans-serif',
    color: '#fff', textAlign: 'center' as const, gap: '16px',
  },
  title: { fontSize: '18px', fontWeight: 700, margin: 0, color: '#ff4444' },
  body:  { fontSize: '14px', color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.6 },
  btn:   {
    marginTop: '8px', padding: '12px 32px', borderRadius: '12px',
    background: '#E60000', color: '#fff', border: 'none',
    fontSize: '15px', fontWeight: 700, cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(230,0,0,0.5)',
  },
} as const;

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={<CrashFallback />}>
    <AppWrapper>
      <App />
    </AppWrapper>
  </Sentry.ErrorBoundary>
);

// ── إخفاء boot-loader الفوري بعد أن يبدأ React في الرسم ──────────────────
// يُزيل الـ spinner الأبيض ويُظهر React DOM
requestAnimationFrame(() => {
  const bl = document.getElementById('boot-loader');
  if (bl) {
    bl.classList.add('hidden');
    // احذفه من DOM بعد انتهاء الـ transition (300ms)
    setTimeout(() => bl.remove(), 350);
  }
});

// ── إشعار Android Native بأن التطبيق حُمِّل بنجاح ────────────────────────
// MainActivity.java يستمع لهذه الإشارة ويُلغي fallback overlay الخاص به
// لو هذا الكود نفّذ → JavaScript يعمل → التطبيق شغّال
if (typeof window !== 'undefined') {
  try {
    // @ts-ignore
    if (window.Android && typeof window.Android.onAppReady === 'function') {
      // @ts-ignore
      window.Android.onAppReady();
    }
  } catch (_) {
    // silent — البيئة لا تدعم Android interface
  }
}

// ── تسجيل Service Worker — تخزين Static Assets محلياً ─────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(reg => {
        // تحقق من تحديثات SW عند كل تشغيل
        reg.update().catch(() => {});
        if (import.meta.env.DEV) {
          console.log('[SW] Registered:', reg.scope);
        }
      })
      .catch(err => {
        // SW اختياري — التطبيق يعمل بدونه
        if (import.meta.env.DEV) console.warn('[SW] Registration failed:', err);
      });
  });
}
