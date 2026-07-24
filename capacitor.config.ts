import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.naderakram.vodafonefakka",
  appName: "Vodafone Fakka",
  webDir: "dist",
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
      // ⚠️ لا نعرض Splash أصلي أبدًا؛ الشاشة البدائية كاملة في React
      // سبب المشكلة: Android SplashScreen API يعلق على بعض الأجهزة قبل تحميل WebView
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: "#000000",
    },
  },
};

export default config;
