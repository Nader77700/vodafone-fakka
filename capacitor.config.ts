import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.naderakram.vodafonefakka",
  appName: "Vodafone Fakka",
  webDir: "dist",
  // ── Bundled Mode ─────────────────────────────────────────────────────────
  // الملفات محفوظة داخل APK مباشرة — يضمن فتح التطبيق دايماً حتى بدون إنترنت
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
