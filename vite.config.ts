import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import path from "path";
import obfuscator from 'rollup-plugin-javascript-obfuscator';

export default defineConfig(({ mode }) => {
  const isProd = mode === "production";
  
  return {
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
    isProd && obfuscator({
      compact: true,
      controlFlowFlattening: false,
      deadCodeInjection: false,
      debugProtection: true,
      debugProtectionInterval: 4000,
      disableConsoleOutput: true,
      identifierNamesGenerator: 'hexadecimal',
      log: false,
      numbersToExpressions: true,
      renameGlobals: false,
      selfDefending: false, // selfDefending can crash webviews on Android sometimes
      simplify: true,
      splitStrings: true,
      splitStringsChunkLength: 5,
      stringArray: true,
      stringArrayCallsTransform: false,
      stringArrayEncoding: ['base64'],
      stringArrayIndexShift: true,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayWrappersCount: 1,
      stringArrayWrappersChainedCalls: true,
      stringArrayWrappersParametersMaxCount: 2,
      stringArrayWrappersType: 'variable',
      stringArrayThreshold: 0.75,
      unicodeEscapeSequence: false
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    assetsInlineLimit: 4096,
    target: ['es2015', 'chrome65'],
    minify: mode === "production" ? "terser" : false,
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 2,
        toplevel: true,
        reduce_funcs: true,
        reduce_vars: true,
        booleans: true,
        properties: true,
        dead_code: true
      },
      mangle: {
        toplevel: true,
        eval: true
      },
      format: {
        comments: false,
      }
    },
    rollupOptions: {
      output: {
        // إخفاء أسماء الملفات بعد البناء (هاش عشوائي فقط)
        entryFileNames: "assets/[hash].js",
        chunkFileNames: "assets/[hash].js",
        assetFileNames: "assets/[hash].[ext]",
        manualChunks: (id: string) => {
          if (id.includes("node_modules")) {
            // react-dom / react-router — حجم صغير + يُحتاج على الفور
            if (id.includes("react-dom") || id.includes("react-router") || id.includes("react/")) return "vendor-react";
            // Radix UI — يُحتاج فور تشغيل الـ UI
            if (id.includes("@radix-ui")) return "vendor-ui";
            // Supabase — يُحتاج لكل عمليات DB
            if (id.includes("@supabase")) return "vendor-supabase";
            // Charts — ثقيل — يُؤخَّر لصفحات الإحصائيات فقط
            if (id.includes("recharts") || id.includes("d3-") || id.includes("victory")) return "vendor-charts";
            // Icons — ثقيل جداً — يُقسَّم لتجزئة أفضل
            if (id.includes("lucide-react")) return "vendor-icons";
            // Framer Motion — ثقيل — يُؤخَّر
            if (id.includes("framer-motion") || id.includes("motion")) return "vendor-motion";
            // Capacitor — يُحتاج من البداية
            if (id.includes("@capacitor")) return "vendor-capacitor";
            // Sentry — مهم لكن لا يحتاج تحميل فوري
            if (id.includes("@sentry")) return "vendor-sentry";
            // Zod + react-hook-form — خفيف
            if (id.includes("zod") || id.includes("react-hook-form") || id.includes("@hookform")) return "vendor-forms";
            // date-fns — خفيف
            if (id.includes("date-fns")) return "vendor-date";
            return "vendor-misc";
          }
          // صفحات الـ Admin — كبيرة جداً — في chunk منفصل
          if (id.includes("/pages/admin/") || id.includes("/pages/AdminDashboard")) return "page-admin";
          // صفحات التاجر
          if (id.includes("/pages/merchant/") || id.includes("Merchant")) return "page-merchant";
          // صفحات الشبكات
          if (id.includes("/pages/networks/")) return "page-networks";
          // صفحات المصادقة — تُحمَّل أولاً على الأجهزة الضعيفة
          if (id.includes("/pages/Splash") || id.includes("/pages/Login") || id.includes("/pages/Activation") || id.includes("/pages/Join") || id.includes("/pages/Invite")) return "page-auth";
          // باقي الصفحات
          if (id.includes("/pages/")) return "page-main";
          // مكونات الأدمن
          if (id.includes("/components/admin/")) return "comp-admin";
          // مكونات التاجر
          if (id.includes("/components/merchant")) return "comp-merchant";
        },
      },
    },
  },
  experimental: {
    renderBuiltUrl(filename) {
      return { relative: true };
    },
  },
  // base: './' — مسارات مطلقة للعمل مع bundled APK (Live URL Mode أُزيل)
  base: './',
  };
});
