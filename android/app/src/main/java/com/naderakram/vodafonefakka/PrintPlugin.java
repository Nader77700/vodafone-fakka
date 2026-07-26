package com.naderakram.vodafonefakka;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintJob;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.content.Context;

import androidx.annotation.RequiresApi;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.IOException;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

/**
 * PrintPlugin — Capacitor Plugin للطباعة الاحترافية
 *
 * الطرق المتاحة:
 *  printHtml()         — طباعة HTML عبر Android PrintManager (بدون فتح متصفح)
 *  printEscPos()       — طباعة ESC/POS عبر Bluetooth SPP
 *  checkBluetooth()    — فحص حالة Bluetooth والصلاحيات
 *  scanPairedPrinters()— عرض الأجهزة المقترنة
 *  requestEnableBt()   — طلب تشغيل Bluetooth
 *  checkBuiltinPrinter()— كشف الطابعة المدمجة (Sunmi/PAX/Newland)
 *  requestBtPermissions()— طلب صلاحيات BT (Android 12+)
 */
@CapacitorPlugin(
    name = "Print",
    permissions = {
        @Permission(alias = "bluetooth",     strings = {"android.permission.BLUETOOTH",      "android.permission.BLUETOOTH_ADMIN"}),
        @Permission(alias = "bluetooth_scan",strings = {"android.permission.BLUETOOTH_SCAN", "android.permission.BLUETOOTH_CONNECT"}),
        @Permission(alias = "location",      strings = {"android.permission.ACCESS_FINE_LOCATION"})
    }
)
public class PrintPlugin extends Plugin {

    // ── SPP UUID القياسي لجميع طابعات Bluetooth الحرارية ──────────────────
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    // ── أسماء SDK الطابعات المدمجة للكشف التلقائي ─────────────────────────
    private static final String[] BUILTIN_PACKAGES = {
        "woyou.aidlservice.jiuiv5",          // Sunmi V1/V2/T2
        "woyou.aidlservice.jiuv5",           // Sunmi V2 Pro
        "com.sunmi.extprinterservice",       // Sunmi External
        "com.pax.posprinter",                // PAX POS
        "com.newland.payment",               // Newland
        "com.eft.poslink",                   // Verifone/EFT
        "com.rt.printservice",               // Rongta
        "com.iposprinter.iposprinterservice",// IPOS
    };

    // ═══════════════════════════════════════════════════════════════════
    //  [1] printHtml — Android PrintManager (لا يفتح متصفح)
    // ═══════════════════════════════════════════════════════════════════
    @PluginMethod
    public void printHtml(PluginCall call) {
        String html     = call.getString("html", "");
        String jobName  = call.getString("jobName", "فاتورة Vodafone Fakka");

        if (html == null || html.isEmpty()) {
            call.reject("html مطلوب");
            return;
        }

        getActivity().runOnUiThread(() -> {
            // WebView مؤقت لرسم HTML وتمريره لـ PrintManager
            WebView printWebView = new WebView(getContext());
            printWebView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    // الصفحة جاهزة — أرسل لـ PrintManager
                    PrintManager printManager = (PrintManager)
                        getContext().getSystemService(Context.PRINT_SERVICE);

                    if (printManager == null) {
                        call.reject("PrintManager غير متاح على هذا الجهاز");
                        return;
                    }

                    PrintDocumentAdapter printAdapter = view.createPrintDocumentAdapter(jobName);
                    PrintAttributes.Builder attrBuilder = new PrintAttributes.Builder();

                    // ضبط حجم الورق تلقائياً حسب ما يحدده JS
                    String paper = call.getString("paper", "A4");
                    if ("THERMAL_58".equals(paper)) {
                        // 58mm × 297mm
                        attrBuilder.setMediaSize(new PrintAttributes.MediaSize(
                            "THERMAL_58", "58mm Thermal", 2283, 11692));
                        attrBuilder.setMinMargins(PrintAttributes.Margins.NO_MARGINS);
                    } else if ("THERMAL_80".equals(paper)) {
                        // 80mm × 297mm
                        attrBuilder.setMediaSize(new PrintAttributes.MediaSize(
                            "THERMAL_80", "80mm Thermal", 3150, 11692));
                        attrBuilder.setMinMargins(PrintAttributes.Margins.NO_MARGINS);
                    } else {
                        attrBuilder.setMediaSize(PrintAttributes.MediaSize.ISO_A4);
                    }

                    PrintJob printJob = printManager.print(jobName, printAdapter, attrBuilder.build());

                    // مراقبة حالة الـ Job وإرجاع النتيجة
                    new Thread(() -> {
                        while (!printJob.isCompleted() && !printJob.isFailed() && !printJob.isCancelled()) {
                            try { Thread.sleep(500); } catch (InterruptedException ignored) {}
                        }
                        JSObject result = new JSObject();
                        result.put("success",   printJob.isCompleted());
                        result.put("cancelled", printJob.isCancelled());
                        result.put("failed",    printJob.isFailed());
                        result.put("jobId",     printJob.getId().toString());
                        if (printJob.isCompleted()) {
                            call.resolve(result);
                        } else if (printJob.isCancelled()) {
                            result.put("error", "تم إلغاء الطباعة");
                            call.resolve(result);
                        } else {
                            call.reject("فشلت الطباعة");
                        }
                    }).start();
                }
            });
            printWebView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    //  [2] printEscPos — Bluetooth SPP (طابعات حرارية ESC/POS)
    // ═══════════════════════════════════════════════════════════════════
    @PluginMethod
    public void printEscPos(PluginCall call) {
        String address  = call.getString("address");   // MAC Address مثل: AA:BB:CC:DD:EE:FF
        String dataB64  = call.getString("data");      // ESC/POS bytes مشفرة Base64

        if (address == null || address.isEmpty()) {
            call.reject("address (MAC) مطلوب");
            return;
        }
        if (dataB64 == null || dataB64.isEmpty()) {
            call.reject("data (Base64) مطلوب");
            return;
        }

        // فحص صلاحيات BT أولاً
        if (!hasBluetoothPermission()) {
            call.reject("NO_BT_PERMISSION");
            return;
        }

        byte[] escData;
        try {
            escData = android.util.Base64.decode(dataB64, android.util.Base64.DEFAULT);
        } catch (Exception e) {
            call.reject("بيانات Base64 غير صحيحة: " + e.getMessage());
            return;
        }

        final byte[] finalData = escData;

        new Thread(() -> {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null || !adapter.isEnabled()) {
                call.reject("BT_DISABLED");
                return;
            }

            BluetoothDevice device;
            try {
                device = adapter.getRemoteDevice(address);
            } catch (Exception e) {
                call.reject("عنوان MAC غير صحيح: " + address);
                return;
            }

            BluetoothSocket socket = null;
            try {
                // إنشاء SPP socket
                socket = device.createRfcommSocketToServiceRecord(SPP_UUID);

                // إلغاء Discovery لتسريع الاتصال
                if (checkBtConnectPermission()) {
                    adapter.cancelDiscovery();
                }

                socket.connect();
                OutputStream out = socket.getOutputStream();

                // إرسال البيانات على chunks لمنع الـ overflow
                int CHUNK = 512;
                for (int i = 0; i < finalData.length; i += CHUNK) {
                    int end = Math.min(i + CHUNK, finalData.length);
                    out.write(finalData, i, end - i);
                    out.flush();
                    Thread.sleep(30);
                }

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("bytesSent", finalData.length);
                call.resolve(result);

            } catch (IOException e) {
                // محاولة ثانية بـ reflection (لبعض الأجهزة الصينية)
                if (socket != null) {
                    try { socket.close(); } catch (IOException ignored) {}
                }
                try {
                    BluetoothSocket fallback = (BluetoothSocket)
                        device.getClass().getMethod("createRfcommSocket", int.class).invoke(device, 1);
                    if (fallback != null) {
                        fallback.connect();
                        OutputStream out2 = fallback.getOutputStream();
                        out2.write(finalData);
                        out2.flush();
                        fallback.close();
                        JSObject result = new JSObject();
                        result.put("success", true);
                        result.put("fallback", true);
                        call.resolve(result);
                        return;
                    }
                } catch (Exception ignored) {}
                call.reject("BT_CONNECT_FAILED: " + e.getMessage());
            } catch (InterruptedException e) {
                call.reject("BT_INTERRUPTED");
            } finally {
                if (socket != null) {
                    try { socket.close(); } catch (IOException ignored) {}
                }
            }
        }).start();
    }

    // ═══════════════════════════════════════════════════════════════════
    //  [3] checkBluetooth — فحص حالة BT والصلاحيات
    // ═══════════════════════════════════════════════════════════════════
    @PluginMethod
    public void checkBluetooth(PluginCall call) {
        JSObject result = new JSObject();

        // هل يدعم الجهاز BT أصلاً؟
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            result.put("supported", false);
            result.put("enabled",   false);
            result.put("hasPermission", false);
            result.put("reason", "NO_BT_HARDWARE");
            call.resolve(result);
            return;
        }

        result.put("supported", true);
        result.put("enabled",   adapter.isEnabled());

        boolean hasPerm = hasBluetoothPermission();
        result.put("hasPermission", hasPerm);

        if (!adapter.isEnabled()) {
            result.put("reason", "BT_DISABLED");
        } else if (!hasPerm) {
            result.put("reason", "NO_PERMISSION");
        } else {
            result.put("reason", "OK");
        }

        call.resolve(result);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  [4] scanPairedPrinters — جلب الأجهزة المقترنة
    // ═══════════════════════════════════════════════════════════════════
    @PluginMethod
    public void scanPairedPrinters(PluginCall call) {
        if (!hasBluetoothPermission()) {
            call.reject("NO_BT_PERMISSION");
            return;
        }

        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            call.reject("BT_DISABLED");
            return;
        }

        JSObject result = new JSObject();
        JSArray devices = new JSArray();

        try {
            Set<BluetoothDevice> pairedDevices = adapter.getBondedDevices();
            for (BluetoothDevice dev : pairedDevices) {
                if (!checkBtConnectPermission()) continue;
                JSObject d = new JSObject();
                d.put("address", dev.getAddress());
                d.put("name",    dev.getName() != null ? dev.getName() : "Unknown");
                d.put("type",    dev.getType()); // 1=Classic, 2=LE, 3=Dual
                devices.put(d);
            }
        } catch (SecurityException e) {
            call.reject("NO_BT_PERMISSION: " + e.getMessage());
            return;
        }

        result.put("devices", devices);
        result.put("count",   devices.length());
        call.resolve(result);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  [5] requestEnableBt — طلب تشغيل Bluetooth
    // ═══════════════════════════════════════════════════════════════════
    @PluginMethod
    public void requestEnableBt(PluginCall call) {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            call.reject("NO_BT_HARDWARE");
            return;
        }
        if (adapter.isEnabled()) {
            JSObject result = new JSObject();
            result.put("enabled", true);
            call.resolve(result);
            return;
        }
        // Android 12+ يحتاج ACTION_REQUEST_ENABLE
        Intent enableIntent = new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE);
        startActivityForResult(call, enableIntent, "handleBtEnableResult");
    }

    @ActivityCallback
    private void handleBtEnableResult(PluginCall call, androidx.activity.result.ActivityResult result) {
        if (call == null) return;
        JSObject res = new JSObject();
        res.put("enabled", result.getResultCode() == android.app.Activity.RESULT_OK);
        call.resolve(res);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  [6] checkBuiltinPrinter — كشف الطابعة المدمجة (Sunmi/PAX/Newland)
    // ═══════════════════════════════════════════════════════════════════
    @PluginMethod
    public void checkBuiltinPrinter(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        JSObject result   = new JSObject();

        String foundPkg  = null;
        String printerName = null;

        for (String pkg : BUILTIN_PACKAGES) {
            try {
                pm.getPackageInfo(pkg, 0);
                foundPkg = pkg;
                printerName = getPrinterBrandName(pkg);
                break;
            } catch (PackageManager.NameNotFoundException ignored) {}
        }

        // كشف بـ manufacturer أيضاً
        String mfr = Build.MANUFACTURER.toLowerCase();
        boolean isSunmi   = mfr.contains("sunmi");
        boolean isPax     = mfr.contains("pax");
        boolean isNewland = mfr.contains("newland");
        boolean isUrovo   = mfr.contains("urovo");

        result.put("available",    foundPkg != null || isSunmi || isPax || isNewland || isUrovo);
        result.put("packageFound", foundPkg != null ? foundPkg : "");
        result.put("name",         printerName != null ? printerName : detectByManufacturer());
        result.put("manufacturer", Build.MANUFACTURER);
        result.put("model",        Build.MODEL);
        call.resolve(result);
    }

    private String getPrinterBrandName(String pkg) {
        if (pkg.contains("sunmi"))         return "Sunmi Printer";
        if (pkg.contains("pax"))           return "PAX POS Printer";
        if (pkg.contains("newland"))       return "Newland Printer";
        if (pkg.contains("rongta"))        return "Rongta Printer";
        if (pkg.contains("iposprinter"))   return "IPOS Printer";
        if (pkg.contains("eft"))           return "EFT/Verifone Printer";
        return "Built-in Thermal Printer";
    }

    private String detectByManufacturer() {
        String mfr = Build.MANUFACTURER.toLowerCase();
        if (mfr.contains("sunmi"))   return "Sunmi " + Build.MODEL;
        if (mfr.contains("pax"))     return "PAX "   + Build.MODEL;
        if (mfr.contains("newland")) return "Newland "+ Build.MODEL;
        if (mfr.contains("urovo"))   return "Urovo "  + Build.MODEL;
        return "";
    }

    // ═══════════════════════════════════════════════════════════════════
    //  [7] requestBtPermissions — طلب صلاحيات BT الحديثة
    // ═══════════════════════════════════════════════════════════════════
    @PluginMethod
    public void requestBtPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            requestPermissionForAlias("bluetooth_scan", call, "handleBtPermResult");
        } else {
            requestPermissionForAlias("bluetooth", call, "handleBtPermResult");
        }
    }

    @PermissionCallback
    private void handleBtPermResult(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasBluetoothPermission());
        call.resolve(result);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Helper — فحص صلاحيات BT
    // ═══════════════════════════════════════════════════════════════════
    private boolean hasBluetoothPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ContextCompat.checkSelfPermission(getContext(),
                android.Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
        } else {
            return ContextCompat.checkSelfPermission(getContext(),
                android.Manifest.permission.BLUETOOTH) == PackageManager.PERMISSION_GRANTED;
        }
    }

    private boolean checkBtConnectPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ContextCompat.checkSelfPermission(getContext(),
                android.Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
        }
        return true; // Android < 12 لا يحتاج BLUETOOTH_CONNECT
    }
}
