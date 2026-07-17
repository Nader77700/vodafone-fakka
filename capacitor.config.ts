import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.naderakram.vodafonefakka",
  appName: "Vodafone Fakka",
  webDir: "dist",
  // ── Live URL Mode ─────────────────────────────────────────────────────────
  // يسمح بتحديث الواجهة فورياً من السيرفر بدون بناء APK جديد.
  // ملاحظة: قد يظهر شاشة بيضاء إذا لم يكن هناك إنترنت عند تشغيل التطبيق.
  server: {
    url: "https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/web-live/index.html",
    cleartext: true,
    allowNavigation: ["*"]
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
