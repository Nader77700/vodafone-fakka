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
              controlFlowFlatteningThreshold: 1,
              deadCodeInjection: true,
              deadCodeInjectionThreshold: 0.4,
              debugProtection: false, // تعطيل حتى لا يسبب مشاكل في المتصفح أو التطبيق
              disableConsoleOutput: true,
              identifierNamesGenerator: 'hexadecimal',
              log: false,
              renameGlobals: false,
              selfDefending: true,
              reservedStrings: [
                // ── Capacitor & Native Plugins (لا تُشفَّر) ──
                'VodafoneDetector', 'networkStateChanged', 'VodafoneDetectorPlugin', 
                'getNetworkInfo', 'requestPhonePermission', 'addListener',
                'Capacitor', 'registerPlugin', 'CapacitorHttp', 'web',
                'isNativeAndroid', 'activeNetwork', 'isVodafoneSim', 'activeDataSimOperatorName',
                'canExecuteNative', 'activeDataSimOperator', 'simOperator', 'simOperatorName',
                'networkOperator', 'networkOperatorName', 'isMobileDataActive', 'isWifiActive',
                'isVodafoneMobile', 'hasPhonePermission', 'deviceModel', 'androidVersion',
                'trigger', 'timestamp', 'web_fallback', 'timeout_fallback',
                'error_fallback', 'PluginListenerHandle', 'NetworkInfo', 'NetworkStateChangedEvent',
                'VodafoneDetectorWeb', 'getPlatform', 'ApkInstallerPlugin', 'PrintPlugin',
                'com.naderakram.vodafonefakka', 'MainActivity',
                'loadScheduled', 'loadNotifs', 'isExpired', 'isSuspendedSub',
                'BUILD_INFO', 'versionCode', 'isCrackedVersion',
                // ── React Hooks Internal Names (مهم جداً — منع كسر ترتيب الـ hooks) ──
                // controlFlowFlattening يُعيد ترتيب الكود — هذه الأسماء يجب أن تبقى كما هي
                'useState', 'useEffect', 'useRef', 'useCallback', 'useMemo',
                'useContext', 'useReducer', 'useLayoutEffect', 'useImperativeHandle',
                'useDebugValue', 'useDeferredValue', 'useTransition', 'useId',
                'useInsertionEffect', 'useSyncExternalStore',
                'createContext', 'forwardRef', 'memo', 'createRef',
                // ── React Fiber Internal ──
                '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED',
                'ReactCurrentDispatcher', 'ReactCurrentBatchConfig', 'ReactCurrentOwner',
                // ── DOM refs (منع undefined.current) ──
                'current', 'contains', 'blur', 'focus', 'addEventListener', 'removeEventListener'
              ],
              splitStrings: true,
              stringArray: true,
              stringArrayCallsTransform: true,
              stringArrayEncoding: ['base64', 'rc4'], // تنويع التشفير لزيادة الصعوبة مع تجنب مشاكل الأداء
              stringArrayThreshold: 0.5, 
              transformObjectKeys: false, 
              unicodeEscapeSequence: true, // تفعيل لتحويل الحروف إلى Unicode
              renameVariables: true, 
              identifierNamesCache: null
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
    customObfuscatorPlugin(), // تم إعادة تفعيل التشفير بناءً على طلبك
    {
      name: 'html-obfuscator',
      enforce: 'post',
      apply: 'build',
      transformIndexHtml(html) {
        // حماية إضافية: إزالة معلومات الإصدار والتعليقات من ملف HTML
        let secureHtml = html.replace(/<!--[\s\S]*?-->/g, ''); 
        secureHtml = secureHtml.replace(/<meta name="generator" content="[^"]*">/gi, '');
        return secureHtml;
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
        passes: 1,
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
