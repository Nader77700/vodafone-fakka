import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import path from "path";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    assetsInlineLimit: 4096,
    // ── تشفير وضغط الكود في بيئة الإنتاج ────────────────────────────────
    minify: mode === "production" ? "esbuild" : false,
    // esbuild: حذف console.* و debugger تماماً في البروداكشن
    ...(mode === "production" && {
      esbuildOptions: {
        drop: ["console", "debugger"],  // يحذف console.log وdebugger من كل الملفات
        pure: ["console.log", "console.info", "console.debug", "console.warn"],
        minifyIdentifiers: true,        // تشويه أسماء المتغيرات
        minifySyntax: true,             // ضغط الصياغة
        minifyWhitespace: true,         // حذف المسافات
      },
    }),
    rollupOptions: {
      output: {
        // إخفاء أسماء الملفات بعد البناء (هاش عشوائي فقط)
        entryFileNames: "assets/[hash].js",
        chunkFileNames: "assets/[hash].js",
        assetFileNames: "assets/[hash].[ext]",
        manualChunks: (id: string) => {
          if (id.includes("node_modules")) {
            if (id.includes("react-dom") || id.includes("react-router")) return "vendor-react";
            if (id.includes("@radix-ui")) return "vendor-ui";
            if (id.includes("@supabase")) return "vendor-supabase";
            if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
            if (id.includes("lucide-react")) return "vendor-icons";
            if (id.includes("framer-motion")) return "vendor-motion";
            if (id.includes("@capacitor")) return "vendor-capacitor";
            return "vendor-misc";
          }
          if (id.includes("/pages/admin/") || id.includes("/pages/AdminDashboard")) return "page-admin";
          if (id.includes("/pages/merchant/") || id.includes("Merchant")) return "page-merchant";
          if (id.includes("/pages/networks/")) return "page-networks";
          if (id.includes("/pages/Splash") || id.includes("/pages/Login") || id.includes("/pages/Activation")) return "page-auth";
          if (id.includes("/pages/")) return "page-main";
          if (id.includes("/components/admin/")) return "comp-admin";
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
  // base: '/' — مسارات مطلقة للعمل مع bundled APK (Live URL Mode أُزيل)
  base: '/',
}));
