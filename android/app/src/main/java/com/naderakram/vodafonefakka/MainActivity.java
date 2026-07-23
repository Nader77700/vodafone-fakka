package com.naderakram.vodafonefakka;

import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.util.Base64;
import android.util.Log;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

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
                    Log.e("TamperSensor", "تلاعب مكتشف: توقيع التطبيق غير متطابق. التوقيع الحالي: " + currentSignatureHash);
                    showTamperDialog("تلاعب مكتشف: توقيع التطبيق غير متطابق!\nالتوقيع الحالي:\n" + currentSignatureHash);
                    return;
                }

                // 2. التحقق من وضع الـ Debug
                boolean isDebuggable = (0 != (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE));
                if (isDebuggable) {
                    showTamperDialog("تلاعب مكتشف: تم تفعيل وضع التصحيح (Debug).");
                    return;
                }
            }
        } catch (PackageManager.NameNotFoundException | NoSuchAlgorithmException e) {
            e.printStackTrace();
        }
    }

    private void showTamperDialog(final String message) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("تنبيه أمان (Anti-Tamper)")
                        .setMessage(message + "\n\nالرجاء إرسال هذا التوقيع للمطور لتحديثه في إعدادات الحماية.")
                        .setCancelable(false)
                        .setPositiveButton("إغلاق التطبيق", new DialogInterface.OnClickListener() {
                            public void onClick(DialogInterface dialog, int id) {
                                finishAndRemoveTask();
                                System.exit(0);
                            }
                        })
                        .show();
            }
        });
    }

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        runNativeTamperSensor();
        
        registerPlugin(VodafoneDetectorPlugin.class);
        registerPlugin(ApkInstallerPlugin.class);
        registerPlugin(PrintPlugin.class);
    }
}

