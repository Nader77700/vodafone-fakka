package com.naderakram.vodafonefakka;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;

// ── APK Installer Plugin ───────────────────────────────────────────────────
// يستقبل base64 APK من JS → يكتبه في Cache → يطلق intent للتثبيت
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    // ── تثبيت APK من مسار محلي ──────────────────────────────────────────────
    @PluginMethod
    public void install(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.isEmpty()) {
            call.reject("filePath مطلوب");
            return;
        }
        try {
            File apkFile = new File(filePath);
            if (!apkFile.exists()) {
                call.reject("الملف غير موجود: " + filePath);
                return;
            }
            launchInstaller(apkFile, call);
        } catch (Exception e) {
            call.reject("خطأ في التثبيت: " + e.getMessage());
        }
    }

    // ── حفظ base64 APK ثم تثبيته ─────────────────────────────────────────────
    @PluginMethod
    public void saveAndInstall(PluginCall call) {
        String base64   = call.getString("base64");
        String fileName = call.getString("fileName", "update.apk");
        if (base64 == null || base64.isEmpty()) {
            call.reject("base64 مطلوب");
            return;
        }
        try {
            // كتابة الملف في مجلد Cache/apk_downloads
            File cacheDir = new File(getContext().getCacheDir(), "apk_downloads");
            if (!cacheDir.exists()) cacheDir.mkdirs();
            File apkFile = new File(cacheDir, fileName);

            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            try (FileOutputStream fos = new FileOutputStream(apkFile)) {
                fos.write(bytes);
            }

            // تشغيل installer — call.resolve() يُستدعى داخل launchInstaller فقط
            launchInstaller(apkFile, call);
        } catch (Exception e) {
            call.reject("خطأ في الحفظ والتثبيت: " + e.getMessage());
        }
    }

    // ── دالة مشتركة: إطلاق intent التثبيت ─────────────────────────────────────
    private void launchInstaller(File apkFile, PluginCall call) {
        try {
            // Android 8+: يجب التحقق من صلاحية تثبيت التطبيقات غير المعروفة
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!getContext().getPackageManager().canRequestPackageInstalls()) {
                    // فتح إعدادات النظام لمنح الصلاحية
                    Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
                        .setData(Uri.parse("package:" + getContext().getPackageName()));
                    settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(settingsIntent);
                    call.reject("يرجى السماح بتثبيت التطبيقات من مصادر غير معروفة في الإعدادات ثم اضغط تثبيت مجدداً");
                    return;
                }
            }

            Uri apkUri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                apkUri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    apkFile
                );
            } else {
                apkUri = Uri.fromFile(apkFile);
            }

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("خطأ في intent التثبيت: " + e.getMessage());
        }
    }
}
