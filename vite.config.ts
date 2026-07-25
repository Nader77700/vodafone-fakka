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
    generateBundle(options, bundle) {
      for (const fileName in bundle) {
        const chunk = bundle[fileName];
        if (chunk.type === 'chunk' && fileName.endsWith('.js')) {
          try {
        const obfuscated = JavaScriptObfuscator.obfuscate(chunk.code, {
              compact: true,
              controlFlowFlattening: true,
              controlFlowFlatteningThreshold: 0.1, // تقليل لزيادة الأداء
              deadCodeInjection: false, // تعطيل dead code لتحسين الأداء وسرعة الاستجابة
              debugProtection: false, // تعطيل لتقليل التعليق
              disableConsoleOutput: true,
              identifierNamesGenerator: 'hexadecimal',
              log: false,
              renameGlobals: false,
              selfDefending: false, // تعطيل لتحسين الأداء
              splitStrings: true,
              splitStringsChunkLength: 5,
              stringArray: true,
              stringArrayCallsTransform: true,
              stringArrayEncoding: ['rc4'],
              stringArrayThreshold: 0.8,
              transformObjectKeys: true,
              unicodeEscapeSequence: false
            });
            chunk.code = obfuscated.getObfuscatedCode();
          } catch (e) {
            console.error('Obfuscation failed for', fileName, e);
          }
        }
      }
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
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react';
            }
            if (id.includes('@supabase')) {
              return 'vendor-supabase';
            }
            if (id.includes('lucide-react') || id.includes('@radix-ui')) {
              return 'vendor-ui';
            }
            return 'vendor'; // باقي المكتبات في ملف منفصل
          }
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
