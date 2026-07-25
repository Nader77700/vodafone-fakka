# دليل إضافة الحماية ضد الهندسة العكسية (Code Obfuscation)

بما أن تطبيقك يستخدم Vite و React.js لإنشاء الواجهات الخاصة بـ Capacitor، فإن خوارزميات الضغط الحالية (esbuild) المتوفرة في `vite.config.ts` تقوم بتصغير الكود (Minification) وحذف المسافات وأسماء المتغيرات فقط، لكنها **لا تحمي الكود من الهندسة العكسية**. يمكن لأي شخص استخراج الـ APK وعرض الكود المنطقي والروابط وقراءة المنطق بسهولة.

لتحقيق تشفير معقد (Obfuscation) حقيقي يمنع قراءة الكود، سنستخدم مكتبة `javascript-obfuscator` عبر إضافة مخصصة لـ Vite.

## 1. تثبيت الحزم المطلوبة
افتح الـ Terminal في مسار المشروع الرئيسي ونفذ الأمر التالي:

```bash
npm install -D vite-plugin-javascript-obfuscator javascript-obfuscator
```
*(أو استخدم `pnpm add -D vite-plugin-javascript-obfuscator javascript-obfuscator` إذا كنت تستخدم pnpm).*

## 2. تحديث ملف `vite.config.ts`
سنقوم بإضافة طبقة تشفير أمنية (Military-Grade) لكن بإعدادات متوازنة **لكي لا تسبب بطئاً أو تعليقاً على هواتف الأندرويد الضعيفة** (تجنبنا الـ Control Flow Flattening لأنه يدمر الأداء).

افتح ملف `vite.config.ts` وقم بتعديله ليصبح كالتالي:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import path from "path";

// إضافة مكتبة التشفير
import obfuscator from 'vite-plugin-javascript-obfuscator';

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
    // ── تفعيل التشفير المعقد فقط في وضع الإنتاج (Release) ──
    mode === "production" && obfuscator({
      include: ['src/**/*.js', 'src/**/*.jsx', 'src/**/*.ts', 'src/**/*.tsx'],
      exclude: [/node_modules/],
      apply: 'build', // يُطبق فقط عند البناء
      debugger: false,
      options: {
        compact: true,                        // ضغط الكود لسطر واحد
        controlFlowFlattening: false,         // ⚠️ تم إيقافه: لأنه يسبب بطء شديد جداً على هواتف الأندرويد
        deadCodeInjection: false,             // ⚠️ تم إيقافه: للحفاظ على حجم الـ APK خفيفاً
        debugProtection: true,                // 🛡️ الحماية من الـ Debugging (إيقاف أدوات المطورين)
        debugProtectionInterval: 4000,        // فحص الـ Debugger كل 4 ثواني
        disableConsoleOutput: true,           // إيقاف مخرجات الكونسول كلياً
        identifierNamesGenerator: 'hexadecimal', // تحويل أسماء المتغيرات إلى نصوص غير مقروءة (_0x1a2b)
        log: false,
        renameGlobals: false,
        rotateStringArray: true,
        selfDefending: true,                  // 🛡️ يمنع التطبيق من العمل إذا حاول المخترق تنسيق الكود (Beautify)
        stringArray: true,                    // 🛡️ إخفاء النصوص والروابط (Supabase URLs, Keys)
        stringArrayEncoding: ['base64'],      // تشفير النصوص بـ Base64
        stringArrayThreshold: 0.8,            // تطبيق التشفير على 80% من النصوص
        unicodeEscapeSequence: false
      }
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
    target: ['es2015', 'chrome65'],
    minify: mode === "production" ? "esbuild" : false,
    ...(mode === "production" && {
      esbuildOptions: {
        drop: ["console", "debugger"],
        pure: ["console.log", "console.info", "console.debug", "console.warn"],
        minifyIdentifiers: true,
        minifySyntax: true,
        minifyWhitespace: true,
        target: 'es2015',
      },
    }),
    rollupOptions: {
      output: {
        entryFileNames: "assets/[hash].js",
        chunkFileNames: "assets/[hash].js",
        assetFileNames: "assets/[hash].[ext]",
        // (نفس إعدادات manualChunks السابقة بقيت كما هي)
      },
    },
  },
  experimental: {
    renderBuiltUrl(filename) {
      return { relative: true };
    },
  },
  base: '/',
}));
```

## 3. لماذا هذه الإعدادات بالذات؟ (هام جداً)
1. **`stringArray` و `stringArrayEncoding`**:
   تقوم هذه الإعدادات بجمع كل النصوص الموجودة في الكود (مثل الروابط `https://...` ومفاتيح API وكلمات السر والـ Endpoints) ووضعها في مصفوفة مشفرة بتقنية `base64`. سيجد المخترق صعوبة بالغة في قراءة العناوين.
2. **`selfDefending` (الحماية الذاتية)**:
   إذا حاول المخترق أخذ الكود المشفر وفك ضغطه باستخدام (Beautifier / Prettier) لترتيبه، سيكتشف الكود ذلك ويقوم بتعطيل نفسه وإيقاف التطبيق.
3. **`debugProtection`**:
   تمنع أي شخص من محاولة توصيل التطبيق بـ Chrome DevTools واستخدام أدوات التتبع. بمجرد فتح أدوات التطور، سيتجمد التطبيق.
4. **تجاهلنا الـ `controlFlowFlattening`**:
   تم إيقافه قصداً؛ لأنه مع تطبيقات Capacitor على أجهزة الأندرويد الاقتصادية (الفئة المتوسطة والضعيفة)، يؤدي هذا الخيار إلى بطء وتهنيج الواجهة واستهلاك هائل للبطارية. الحماية الحالية كافية جداً.

## 4. البناء والاختبار
عند بناء التطبيق للإنتاج (Release) لإنشاء הـ APK، نفذ:
```bash
npm run build
npx cap sync
```
ستلاحظ أن الكود المستخرج داخل المجلد `dist/assets` أو `www/assets` أصبح عبارة عن رموز ومصفوفات مبهمة بالكامل لا يمكن قراءتها، وهو ما يحمي الـ Frontend الخاص بك قبل تغليفه داخل الـ APK.