package com.naderakram.vodafonefakka;

import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.getcapacitor.BridgeActivity;

// ══════════════════════════════════════════════════════════════════════
//  ROOT CAUSE FIX
//
//  FIX #1: super.onCreate(null) — يمنع استعادة حالة قديمة
//  FIX #2: تسجيل ApkInstallerPlugin
//  FIX #3: Native Fallback Overlay (timeout فقط — بدون WebViewClient)
//
//  ⚠️ لماذا لا نستخدم setWebViewClient؟
//    Capacitor يستخدم BridgeWebViewClient داخلياً لتحميل الملفات من
//    capacitor://localhost/ — استبداله يكسر هذا المسار تماماً ويعطي
//    net::ERR_CONNECTION_REFUSED لأن localhost لا يعمل فعلياً.
//
//  الحل الصحيح: addJavascriptInterface فقط (يعمل مع Capacitor)
//    → JS يستدعي window.Android.onAppReady() عند نجاح التحميل
//    → Timer يُلغى تلقائياً
//    → إذا لم يُستدعَ خلال 20 ثانية → overlay تحديث
// ══════════════════════════════════════════════════════════════════════
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.util.Base64;
import android.util.Log;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

public class MainActivity extends BridgeActivity {

    private static final String APK_DOWNLOAD_URL =
        "https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.348.apk";

    // ─── حساس التلاعب الداخلي ─────────────────────────────────────────────────
    // يتحقق من أن التوقيع الرقمي للتطبيق لم يتم العبث به (Anti-Tamper Sensor)
    // إذا قام الهاكر بتغيير أي ملف (حتى وإن فصل السيرفر)، سيتغير التوقيع
    // وسيتم إغلاق التطبيق فوراً من داخل الأندرويد نفسه.
    private static final String OFFICIAL_SIGNATURE_HASH = "zN9jrQQcPvUl/PfF4tv8TM5S5y4oRasZb3o4VMCvpDc=";

    private void runNativeTamperSensor() {
        try {
            PackageInfo packageInfo = getPackageManager().getPackageInfo(
                    getPackageName(), PackageManager.GET_SIGNATURES);
            for (Signature signature : packageInfo.signatures) {
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                md.update(signature.toByteArray());
                String currentSignatureHash = Base64.encodeToString(md.digest(), Base64.DEFAULT).trim();
                
                // 1. التحقق من التوقيع الرسمي للنسخة
                if (!OFFICIAL_SIGNATURE_HASH.equals(currentSignatureHash)) {
                    Log.e("TamperSensor", "تلاعب مكتشف: توقيع التطبيق غير متطابق. تم حرق التطبيق...");
                    finishAndRemoveTask();
                    System.exit(0);
                }

                // 2. التحقق من وضع الـ Debug
                boolean isDebuggable = (0 != (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE));
                if (isDebuggable) {
                    Log.e("TamperSensor", "تلاعب مكتشف: تم تفعيل وضع التصحيح. تم حرق التطبيق...");
                    finishAndRemoveTask();
                    System.exit(0);
                }
            }
        } catch (PackageManager.NameNotFoundException | NoSuchAlgorithmException e) {
            e.printStackTrace();
        }
    }

    private FrameLayout       mUpdateOverlay;
    private boolean           mAppReady       = false;
    private final Handler     mHandler        = new Handler(Looper.getMainLooper());
    // 20 ثانية — وقت كافٍ لتحميل التطبيق حتى على اتصال بطيء
    private static final long TIMEOUT_MS      = 30_000L;

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // ── تفعيل حساسات الأمان الداخلية ──
        runNativeTamperSensor();

        // ── FIX #2: تسجيل البلوجنات قبل super ──
        registerPlugin(VodafoneDetectorPlugin.class);
        registerPlugin(ApkInstallerPlugin.class);
        registerPlugin(PrintPlugin.class);

        // ── FIX #1: null يمنع Capacitor من استعادة حالة Activity قديمة ──
        super.onCreate(null);

        // ── FIX #3: ربط JS interface + مؤقت الـ fallback ──────────────
        // ⚠️ لا نستخدم setWebViewClient — يكسر capacitor://localhost/
        getBridge().getWebView().addJavascriptInterface(this, "Android");
        startReadinessTimer();
    }

    // ─── مؤقت: لو JS ما استدعى onAppReady خلال 20 ثانية → overlay ───
    private void startReadinessTimer() {
        mHandler.postDelayed(() -> {
            if (!mAppReady) {
                showUpdateOverlay("استغرق تحميل التطبيق وقتاً طويلاً\nتحقق من الاتصال أو حدّث التطبيق");
            }
        }, TIMEOUT_MS);
    }

    // ─── يُستدعى من JavaScript عند اكتمال تحميل التطبيق بنجاح ────────
    // src/main.tsx يستدعيه فوراً بعد createRoot().render()
    @JavascriptInterface
    public void onAppReady() {
        mAppReady = true;
        mHandler.removeCallbacksAndMessages(null); // إلغاء الـ timer
        runOnUiThread(() -> {
            if (mUpdateOverlay != null) {
                mUpdateOverlay.setVisibility(View.GONE);
            }
        });
    }

    // ─── Overlay أحمر native — يعمل حتى لو JavaScript معطّل ──────────
    private void showUpdateOverlay(String reason) {
        if (mAppReady) return;
        runOnUiThread(() -> {
            if (mUpdateOverlay != null) {
                mUpdateOverlay.setVisibility(View.VISIBLE);
                return;
            }

            mUpdateOverlay = new FrameLayout(this);
            mUpdateOverlay.setBackgroundColor(Color.parseColor("#EE0D0D0D"));
            mUpdateOverlay.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

            LinearLayout card = new LinearLayout(this);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setGravity(Gravity.CENTER);
            card.setBackgroundColor(Color.parseColor("#1C1C1E"));
            card.setPadding(64, 64, 64, 64);
            FrameLayout.LayoutParams cardParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
            cardParams.gravity     = Gravity.CENTER;
            cardParams.leftMargin  = 48;
            cardParams.rightMargin = 48;
            card.setLayoutParams(cardParams);

            TextView icon = new TextView(this);
            icon.setText("⚠️");
            icon.setTextSize(48);
            icon.setGravity(Gravity.CENTER);
            card.addView(icon);

            TextView title = new TextView(this);
            title.setText("يلزم تحديث التطبيق");
            title.setTextColor(Color.WHITE);
            title.setTextSize(20);
            title.setTypeface(null, Typeface.BOLD);
            title.setGravity(Gravity.CENTER);
            title.setPadding(0, 24, 0, 16);
            card.addView(title);

            TextView sub = new TextView(this);
            sub.setText(reason);
            sub.setTextColor(Color.parseColor("#AAAAAA"));
            sub.setTextSize(13);
            sub.setGravity(Gravity.CENTER);
            sub.setPadding(0, 0, 0, 40);
            card.addView(sub);

            Button btn = new Button(this);
            btn.setText("⬇  تحميل التحديث الآن");
            btn.setTextColor(Color.WHITE);
            btn.setTextSize(16);
            btn.setBackgroundColor(Color.parseColor("#E60000"));
            btn.setPadding(48, 32, 48, 32);
            btn.setOnClickListener(v -> {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(APK_DOWNLOAD_URL));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            });
            card.addView(btn);

            mUpdateOverlay.addView(card);
            ((ViewGroup) getWindow().getDecorView().getRootView()).addView(mUpdateOverlay);
        });
    }
}

