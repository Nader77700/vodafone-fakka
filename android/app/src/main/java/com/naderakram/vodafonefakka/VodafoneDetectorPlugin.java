package com.naderakram.vodafonefakka;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;
import android.telephony.TelephonyCallback;
import android.telephony.TelephonyManager;
import android.telephony.PhoneStateListener;
import android.util.Log;

import androidx.annotation.RequiresApi;
import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.concurrent.Executor;

// ════════════════════════════════════════════════════════════════
//  VodafoneDetectorPlugin v2 — Active Data SIM Detection
//  يقرأ Active Data SIM فقط (Dual SIM aware)
//  يستخدم SubscriptionManager.getActiveDataSubscriptionId()
//  مع TelephonyCallback لاكتشاف التغييرات فوراً
// ════════════════════════════════════════════════════════════════
@CapacitorPlugin(
    name = "VodafoneDetector",
    permissions = {
        @Permission(
            alias = "phone",
            strings = {
                Manifest.permission.READ_PHONE_STATE,
                Manifest.permission.ACCESS_NETWORK_STATE
            }
        )
    }
)
public class VodafoneDetectorPlugin extends Plugin {

    private static final String TAG = "VodafoneDetector";

    // Vodafone Egypt MCC+MNC
    private static final String VF_MCCMNC       = "60202";
    private static final String VF_NAME_PATTERN  = "vodafone";

    // TelephonyCallback (API 31+) — real-time data SIM changes
    private Object mTelephonyCallback = null;

    // Legacy PhoneStateListener (API < 31)
    private PhoneStateListener mPhoneStateListener = null;
    private TelephonyManager   mTelephonyManager   = null;

    // ─────────────────────────────────────────────────────────────
    //  load — يُشغَّل مرة واحدة عند تسجيل البلوجن
    // ─────────────────────────────────────────────────────────────
    @Override
    public void load() {
        super.load();
        registerNetworkChangeListener();
    }

    @Override
    protected void handleOnDestroy() {
        unregisterNetworkChangeListener();
        super.handleOnDestroy();
    }

    // ─────────────────────────────────────────────────────────────
    //  registerNetworkChangeListener — TelephonyCallback أو PhoneStateListener
    // ─────────────────────────────────────────────────────────────
    private void registerNetworkChangeListener() {
        Context ctx = getContext();
        mTelephonyManager = (TelephonyManager) ctx.getSystemService(Context.TELEPHONY_SERVICE);
        if (mTelephonyManager == null) return;

        boolean hasPerm = ActivityCompat.checkSelfPermission(
            ctx, Manifest.permission.READ_PHONE_STATE
        ) == PackageManager.PERMISSION_GRANTED;
        if (!hasPerm) {
            Log.w(TAG, "No READ_PHONE_STATE permission — skipping TelephonyCallback registration");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // API 31+ — TelephonyCallback
            registerTelephonyCallback31();
        } else {
            // API < 31 — PhoneStateListener
            registerPhoneStateListenerLegacy();
        }
    }

    @RequiresApi(api = Build.VERSION_CODES.S)
    private void registerTelephonyCallback31() {
        Executor executor = getContext().getMainExecutor();
        TelephonyCallback cb = new TelephonyCallback() {
            // onDataConnectionStateChanged — يُطلق عند تشغيل/إيقاف بيانات الجوال
            @Override
            @RequiresApi(api = Build.VERSION_CODES.S)
            public String toString() { return "VFDataCallback"; }
        };

        // استخدام callback شامل عبر PhoneStateListener-style منطق
        // نسجّل لـ LISTEN_DATA_CONNECTION_STATE + LISTEN_SERVICE_STATE
        // لأن TelephonyCallback.DataConnectionStateListener يحتاج API 31
        mTelephonyCallback = new android.telephony.TelephonyCallback.DataConnectionStateListener() {
            @Override
            public void onDataConnectionStateChanged(int state, int networkType) {
                Log.i(TAG, "[TelephonyCallback] Data state changed: state=" + state + " type=" + networkType);
                emitNetworkChangeEvent();
            }
        };

        try {
            mTelephonyManager.registerTelephonyCallback(
                executor,
                (android.telephony.TelephonyCallback) mTelephonyCallback
            );
            Log.i(TAG, "TelephonyCallback registered (API 31+)");
        } catch (Exception e) {
            Log.w(TAG, "TelephonyCallback registration failed: " + e.getMessage());
        }
    }

    @SuppressWarnings("deprecation")
    private void registerPhoneStateListenerLegacy() {
        mPhoneStateListener = new PhoneStateListener() {
            @Override
            public void onDataConnectionStateChanged(int state, int networkType) {
                Log.i(TAG, "[PhoneStateListener] Data state changed: state=" + state);
                emitNetworkChangeEvent();
            }

            @Override
            public void onServiceStateChanged(android.telephony.ServiceState serviceState) {
                Log.i(TAG, "[PhoneStateListener] Service state changed");
                emitNetworkChangeEvent();
            }
        };

        try {
            mTelephonyManager.listen(
                mPhoneStateListener,
                PhoneStateListener.LISTEN_DATA_CONNECTION_STATE |
                PhoneStateListener.LISTEN_SERVICE_STATE
            );
            Log.i(TAG, "PhoneStateListener registered (legacy)");
        } catch (Exception e) {
            Log.w(TAG, "PhoneStateListener registration failed: " + e.getMessage());
        }
    }

    private void unregisterNetworkChangeListener() {
        if (mTelephonyManager == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && mTelephonyCallback != null) {
                mTelephonyManager.unregisterTelephonyCallback(
                    (android.telephony.TelephonyCallback) mTelephonyCallback
                );
                mTelephonyCallback = null;
            } else if (mPhoneStateListener != null) {
                //noinspection deprecation
                mTelephonyManager.listen(mPhoneStateListener, PhoneStateListener.LISTEN_NONE);
                mPhoneStateListener = null;
            }
        } catch (Exception e) {
            Log.w(TAG, "unregister error: " + e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────
    //  emitNetworkChangeEvent — يُرسل حدث JS فوراً عند أي تغيير
    // ─────────────────────────────────────────────────────────────
    private void emitNetworkChangeEvent() {
        getActivity().runOnUiThread(() -> {
            JSObject data = new JSObject();
            data.put("trigger", "networkStateChanged");
            data.put("timestamp", System.currentTimeMillis());
            notifyListeners("networkStateChanged", data);
            Log.i(TAG, "networkStateChanged event emitted to JS");
        });
    }

    // ─────────────────────────────────────────────────────────────
    //  getNetworkInfo — القراءة الرئيسية بـ Active Data SIM
    // ─────────────────────────────────────────────────────────────
    @PluginMethod
    public void getNetworkInfo(PluginCall call) {
        JSObject result = new JSObject();
        Context ctx = getContext();

        boolean hasPhonePermission = ActivityCompat.checkSelfPermission(
            ctx, Manifest.permission.READ_PHONE_STATE
        ) == PackageManager.PERMISSION_GRANTED;

        // ── 1. الحصول على Active Data SIM (Dual SIM aware) ──
        String activeDataSimNumeric = "";
        String activeDataSimName    = "غير متوفر";
        int    activeDataSubId      = SubscriptionManager.INVALID_SUBSCRIPTION_ID;

        SubscriptionManager sm = (SubscriptionManager) ctx.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE);
        TelephonyManager    tm = (TelephonyManager) ctx.getSystemService(Context.TELEPHONY_SERVICE);

        if (sm != null) {
            try {
                // getActiveDataSubscriptionId — الشريحة المستخدمة حالياً للبيانات
                activeDataSubId = SubscriptionManager.getActiveDataSubscriptionId();

                if (activeDataSubId != SubscriptionManager.INVALID_SUBSCRIPTION_ID && hasPhonePermission) {
                    // استخراج TelephonyManager للـ subscriptionId المحدد
                    TelephonyManager tmForSub = tm != null
                        ? tm.createForSubscriptionId(activeDataSubId)
                        : null;

                    if (tmForSub != null) {
                        activeDataSimNumeric = safeStr(tmForSub.getSimOperator());
                        activeDataSimName    = safeStr(tmForSub.getSimOperatorName());
                        if (activeDataSimName.isEmpty()) {
                            // fallback: اسم الشبكة المُسجَّلة للـ sub
                            activeDataSimName = safeStr(tmForSub.getNetworkOperatorName());
                        }
                    }

                    // إذا فشل tmForSub، حاول عبر SubscriptionInfo
                    if (activeDataSimNumeric.isEmpty() || activeDataSimName.isEmpty()) {
                        SubscriptionInfo info = sm.getActiveSubscriptionInfo(activeDataSubId);
                        if (info != null) {
                            if (activeDataSimNumeric.isEmpty()) {
                                String mcc = safeStr(String.valueOf(info.getMcc()));
                                String mnc = safeStr(String.valueOf(info.getMnc()));
                                if (!mcc.isEmpty() && !mnc.isEmpty()) {
                                    // format MNC to 2 digits
                                    activeDataSimNumeric = String.format("%s%02d",
                                        mcc, Integer.parseInt(mnc));
                                }
                            }
                            if (activeDataSimName.isEmpty()) {
                                activeDataSimName = safeStr(info.getCarrierName() != null
                                    ? info.getCarrierName().toString() : "");
                            }
                        }
                    }
                }
            } catch (SecurityException se) {
                activeDataSimName = "يحتاج صلاحية";
                Log.w(TAG, "SubscriptionManager blocked: " + se.getMessage());
            } catch (Exception e) {
                Log.w(TAG, "SubscriptionManager error: " + e.getMessage());
            }
        }

        // ── 2. Fallback SIM info (للعرض فقط — ليس مصدر القرار) ──
        String simOperatorNumeric = "";
        String simOperatorName    = "غير متوفر";

        if (tm != null && hasPhonePermission) {
            try {
                simOperatorNumeric = safeStr(tm.getSimOperator());
                simOperatorName    = safeStr(tm.getSimOperatorName());
                if (simOperatorName.isEmpty()) simOperatorName = "غير متوفر";
            } catch (Exception e) {
                Log.w(TAG, "SIM fallback error: " + e.getMessage());
            }
        }

        // ── 3. Network Operator (للعرض) ──
        String networkOperatorNumeric = "";
        String networkOperatorName    = "غير متوفر";

        if (tm != null) {
            try {
                networkOperatorNumeric = safeStr(tm.getNetworkOperator());
                networkOperatorName    = safeStr(tm.getNetworkOperatorName());
            } catch (Exception e) {
                Log.w(TAG, "NetworkOperator error: " + e.getMessage());
            }
        }

        // ── 4. ConnectivityManager — Active Network Type ──
        ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);

        String  activeNetworkType  = "غير متصل";
        boolean isMobileDataActive = false;
        boolean isWifiActive       = false;

        if (cm != null) {
            try {
                Network activeNet = cm.getActiveNetwork();
                if (activeNet != null) {
                    NetworkCapabilities caps = cm.getNetworkCapabilities(activeNet);
                    if (caps != null) {
                        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
                            activeNetworkType  = "بيانات الجوال";
                            isMobileDataActive = true;
                        } else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                            activeNetworkType = "WiFi";
                            isWifiActive      = true;
                        } else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) {
                            activeNetworkType = "Ethernet";
                        }
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "ConnectivityManager error: " + e.getMessage());
            }
        }

        // ── 5. القرار النهائي — Active Data SIM ONLY ──
        // مصدر القرار: activeDataSim (من SubscriptionManager)
        // fallback إذا لم يتوفر activeDataSim: networkOperator
        String decisionNumeric = !activeDataSimNumeric.isEmpty()
            ? activeDataSimNumeric : networkOperatorNumeric;
        String decisionName    = (!activeDataSimName.isEmpty() && !activeDataSimName.equals("غير متوفر"))
            ? activeDataSimName : networkOperatorName;

        boolean isVodafoneSim    = isVodafone(simOperatorNumeric, simOperatorName);
        boolean isVodafoneMobile = isVodafone(decisionNumeric, decisionName);

        // canExecuteNative: Active Data SIM هي فودافون + بيانات جوال نشطة
        boolean canExecuteNative = isVodafoneMobile && isMobileDataActive;

        // ── 6. معلومات الجهاز ──
        String deviceModel = Build.MANUFACTURER + " " + Build.MODEL;
        String androidVer  = "Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")";

        // ── 7. بناء النتيجة ──
        // Active Data SIM — مصدر القرار الحقيقي
        result.put("activeDataSimOperator",     activeDataSimNumeric.isEmpty() ? "غير متوفر" : activeDataSimNumeric);
        result.put("activeDataSimOperatorName", activeDataSimName.isEmpty()    ? "غير متوفر" : activeDataSimName);
        result.put("activeDataSubId",           activeDataSubId);

        // SIM 1 fallback (للعرض فقط)
        result.put("simOperator",     simOperatorNumeric.isEmpty() ? "غير متوفر" : simOperatorNumeric);
        result.put("simOperatorName", simOperatorName.isEmpty()    ? "غير متوفر" : simOperatorName);

        // Network Operator (للعرض)
        result.put("networkOperator",     networkOperatorNumeric.isEmpty() ? "غير متوفر" : networkOperatorNumeric);
        result.put("networkOperatorName", networkOperatorName.isEmpty()    ? "غير متوفر" : networkOperatorName);

        result.put("activeNetwork",      activeNetworkType);
        result.put("isMobileDataActive", isMobileDataActive);
        result.put("isWifiActive",       isWifiActive);
        result.put("isVodafoneSim",      isVodafoneSim);
        result.put("isVodafoneMobile",   isVodafoneMobile);
        result.put("canExecuteNative",   canExecuteNative);
        result.put("hasPhonePermission", hasPhonePermission);
        result.put("deviceModel",        deviceModel);
        result.put("androidVersion",     androidVer);

        Log.i(TAG, "NetworkInfo v2: "
            + "activeDataSim=" + activeDataSimName
            + " (" + activeDataSimNumeric + ")"
            + " | subId=" + activeDataSubId
            + " | Active=" + activeNetworkType
            + " | isVfMobile=" + isVodafoneMobile
            + " | canExec=" + canExecuteNative);

        call.resolve(result);
    }

    // ─────────────────────────────────────────────────────────────
    //  requestPhonePermission — ثم إعادة تسجيل listener
    // ─────────────────────────────────────────────────────────────
    @PluginMethod
    public void requestPhonePermission(PluginCall call) {
        if (ActivityCompat.checkSelfPermission(
                getContext(), Manifest.permission.READ_PHONE_STATE
            ) == PackageManager.PERMISSION_GRANTED) {
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }
        requestPermissionForAlias("phone", call, "phonePermissionCallback");
    }

    @PermissionCallback
    private void phonePermissionCallback(PluginCall call) {
        boolean granted = ActivityCompat.checkSelfPermission(
            getContext(), Manifest.permission.READ_PHONE_STATE
        ) == PackageManager.PERMISSION_GRANTED;

        // إذا مُنحت الصلاحية، نُعيد تسجيل الـ listener مع الـ subscription الكامل
        if (granted) {
            unregisterNetworkChangeListener();
            registerNetworkChangeListener();
        }

        JSObject r = new JSObject();
        r.put("granted", granted);
        call.resolve(r);
    }

    // ─────────────────────────────────────────────────────────────
    //  isVodafone — يفحص MCC+MNC والاسم
    // ─────────────────────────────────────────────────────────────
    private boolean isVodafone(String numeric, String name) {
        if (numeric != null && numeric.equals(VF_MCCMNC)) return true;
        if (name != null && name.toLowerCase().contains(VF_NAME_PATTERN)) return true;
        return false;
    }

    private String safeStr(String s) {
        return s == null ? "" : s.trim();
    }
}
