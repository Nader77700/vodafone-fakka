import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.naderakram.vodafonefakka",
  appName: "Vodafone Fakka",
  webDir: "dist",
  // ── Live URL Mode ──────────────────────────────────────────────────────────
  // تم التفعيل بناءً على طلبك: التطبيق الآن سيسحب الأكواد من السيرفر مباشرة
  // أي تحديث للويب (عبر deploy-web.sh) سيصل للمستخدمين فوراً بدون تحميل APK جديد
  server: {
    url: "https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/web-live/index.html",
    cleartext: true,
  },
  android: {
    backgroundColor: "#000000",
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    CapacitorCookies: {
      enabled: true,
    },
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#000000",
      androidSplashResourceName: "splash",
      showSpinner: false,
      launchFadeOutDuration: 200,
    },
  },
};

export default config;
