import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.naderakram.vodafonefakka',
  appName: 'Vodafone Fakka',
  webDir: 'dist',
  // ── Live URL Mode ──────────────────────────────────────────────────────────
  // APK يحمّل الكود من Edge Function بدل الملفات المدمجة
  // يعني أي تحديث كود يصل للمستخدمين فوراً بدون APK جديد
  // verify_jwt=false في config.toml — لا تحتاج apikey
  // ── Bundled Mode ─────────────────────────────────────────────────────────
  // الملفات محفوظة داخل APK مباشرة — بدون أي اعتماد على serve-app أو شبكة
  // يضمن فتح التطبيق دايماً حتى بدون إنترنت
  android: {
    // منع الشاشة السوداء — خلفية WebView سوداء فوراً قبل تحميل React
    backgroundColor: '#000000',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    CapacitorCookies: {
      enabled: true,
    },
    SplashScreen: {
      // إبقاء splash حتى يكتمل تحميل التطبيق — يمنع الشاشة السوداء
      launchAutoHide: false,
      backgroundColor: '#000000',
      androidSplashResourceName: 'splash',
      showSpinner: false,
      // مهلة قصوى: إذا لم يُخفَ يدوياً بعد 3 ثواني يُخفى تلقائياً
      launchFadeOutDuration: 200,
    },
  },
};

export default config;
