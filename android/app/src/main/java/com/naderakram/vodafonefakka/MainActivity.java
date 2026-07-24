package com.naderakram.vodafonefakka;

import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import android.os.Debug;
import android.util.Base64;
import android.util.Log;
import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String OFFICIAL_SIGNATURE_HASH = "zN9jrQQcPvUl/PfF4tv8TM5S5y4oRasZb3o4VMCvpDc=";

    private static final String EXPECTED_PACKAGE_NAME = "com.naderakram.vodafonefakka";

    private void runNativeSecurityChecks() {
        try {
            // 0. Strict Package Name Check (Anti-Cloning / Anti-Renaming)
            String currentPackageName = getPackageName();
            if (!EXPECTED_PACKAGE_NAME.equals(currentPackageName)) {
                Log.e("Security", "Tamper: Package Name Modified. Found: " + currentPackageName);
                showSafeSecurityDialog("Unauthorized App Modification Detected (Package Name).\nSecurity Policy Violation.");
                return;
            }

            // 1. Signature Verification
            PackageInfo packageInfo = getPackageManager().getPackageInfo(
                    getPackageName(), PackageManager.GET_SIGNATURES);
            for (Signature signature : packageInfo.signatures) {
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                md.update(signature.toByteArray());
                String currentSignatureHash = Base64.encodeToString(md.digest(), Base64.DEFAULT).trim();
                
                if (!OFFICIAL_SIGNATURE_HASH.equals(currentSignatureHash)) {
                    Log.e("Security", "Tamper: Signature Mismatch. " + currentSignatureHash);
                    showSafeSecurityDialog("App Signature Mismatch.\nSecurity Policy Violation.");
                    return;
                }
            }

            // 2. Debugger / Debuggable Check
            boolean isDebuggable = (0 != (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE));
            if (isDebuggable || Debug.isDebuggerConnected() || Debug.waitingForDebugger()) {
                showSafeSecurityDialog("Debugger attached or Debug mode enabled.\nSecurity Policy Violation.");
                return;
            }

            // 3. Emulator Detection
            if (isEmulator()) {
                showSafeSecurityDialog("Running on Emulator is not allowed for security reasons.");
                return;
            }

            // 4. Basic Root / su Check
            if (isRooted()) {
                showSafeSecurityDialog("Root access detected. Application cannot run in an insecure environment.");
                return;
            }

            // 5. Basic Hooking / Frida Detection
            if (isFridaDetected()) {
                showSafeSecurityDialog("Memory hooking framework (Frida/Xposed) detected. Environment unsafe.");
                return;
            }

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private boolean isEmulator() {
        return (Build.FINGERPRINT.startsWith("generic")
                || Build.FINGERPRINT.toLowerCase().contains("vbox")
                || Build.FINGERPRINT.toLowerCase().contains("test-keys")
                || Build.MODEL.contains("google_sdk")
                || Build.MODEL.contains("Emulator")
                || Build.MODEL.contains("Android SDK built for x86")
                || Build.MANUFACTURER.contains("Genymotion")
                || (Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic"))
                || "google_sdk".equals(Build.PRODUCT));
    }

    private boolean isRooted() {
        String[] paths = {
            "/system/app/Superuser.apk",
            "/sbin/su",
            "/system/bin/su",
            "/system/xbin/su",
            "/data/local/xbin/su",
            "/data/local/bin/su",
            "/system/sd/xbin/su",
            "/system/bin/failsafe/su",
            "/data/local/su",
            "/su/bin/su"
        };
        for (String path : paths) {
            if (new File(path).exists()) return true;
        }
        return false;
    }

    private boolean isFridaDetected() {
        try {
            Process process = Runtime.getRuntime().exec("netstat");
            BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
            String line;
            while ((line = reader.readLine()) != null) {
                // Frida default port
                if (line.contains("27042")) {
                    return true;
                }
            }
        } catch (Exception e) {
            // ignore
        }
        return false;
    }

    private void showSafeSecurityDialog(final String message) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("Security Alert")
                        .setMessage(message + "\n\nApplication functionality has been locked to protect your data.")
                        .setCancelable(false)
                        .setPositiveButton("Acknowledge", new DialogInterface.OnClickListener() {
                            public void onClick(DialogInterface dialog, int id) {
                                // Rule: Never terminate immediately. Never call System.exit().
                                // Just safely close the activity without crashing.
                                finishAndRemoveTask();
                            }
                        })
                        .show();
            }
        });
    }

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        runNativeSecurityChecks();
        
        registerPlugin(VodafoneDetectorPlugin.class);
        registerPlugin(ApkInstallerPlugin.class);
        registerPlugin(PrintPlugin.class);
    }
}
