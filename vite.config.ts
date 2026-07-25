import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import path from "path";
import JavaScriptObfuscator from 'javascript-obfuscator';

const customObfuscatorPlugin = () => {
  return {
    name: 'custom-obfuscator',
    enforce: 'post',
    apply: 'build',
    renderChunk(code, chunk) {
      if (chunk.fileName.endsWith('.js')) {
        const obfuscated = JavaScriptObfuscator.obfuscate(code, {
          compact: true,
          // controlFlowFlattening: true, // قد تكسر Async/Await في React
          controlFlowFlattening: false,
          // deadCodeInjection: true,     // قد تسبب مشاكل أداء أو StrictMode
          deadCodeInjection: false,
          debugProtection: false,         // نوقفها مؤقتاً للتأكد من أنها ليست سبب انهيار Startup
          disableConsoleOutput: false,    // مهم لنرى الأخطاء
          identifierNamesGenerator: 'hexadecimal',
          log: false,
          renameGlobals: false,
          selfDefending: false,           // قد تكسر React إذا حاول قراءة مكوناته
          splitStrings: false,            // تم الإيقاف لتجنب مشكلة split strings في main bundle
          stringArray: true,
          stringArrayCallsTransform: true,
          stringArrayEncoding: ['rc4'],
          stringArrayThreshold: 1,
          transformObjectKeys: false,     // تم الإيقاف لأنه يكسر object keys التي تعتمد عليها React
          unicodeEscapeSequence: false
        });
        return { code: obfuscated.getObfuscatedCode() };
      }
      return null;
    }
  };
};

export default defineConfig(({ mode }) => {
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
    customObfuscatorPlugin(),
    {
      name: 'html-obfuscator',
      enforce: 'post',
      apply: 'build',
      transformIndexHtml(html) {
        return html.replace(/<!--[\s\S]*?-->/g, ''); // إزالة جميع التعليقات من HTML
      }
    }
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
        entryFileNames: "assets/[hash].js",
        chunkFileNames: "assets/[hash].js",
        assetFileNames: "assets/[hash].[ext]",
        manualChunks: undefined,
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
