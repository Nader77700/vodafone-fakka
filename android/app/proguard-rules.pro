# Capacitor dependencies
-keep class com.getcapacitor.** { *; }
-keep class org.apache.cordova.** { *; }

# Keep standard Android/Java classes needed
-keep public class * extends android.app.Activity
-keep public class * extends android.app.Application
-keep public class * extends android.app.Service
-keep public class * extends android.content.BroadcastReceiver
-keep public class * extends android.content.ContentProvider
-keep public class * extends android.app.backup.BackupAgentHelper
-keep public class * extends android.preference.Preference
-keep public class * extends android.view.View

# ── Obfuscation Aggressiveness ────────────────────────────────────────────────
-repackageclasses 'vfp'
-allowaccessmodification
-optimizationpasses 7
-optimizations !code/simplification/arithmetic,!field/*,!class/merging/*,!code/allocation/variable

# ── Hide all source info from stack traces (anti-reverse-engineering) ─────────
-renamesourcefileattribute SourceFile
-keepattributes SourceFile,LineNumberTable

# ── Remove all logging in release build (prevents info leak) ─────────────────
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int i(...);
    public static int w(...);
    public static int d(...);
    public static int e(...);
    public static int wtf(...);
}
-assumenosideeffects class java.io.PrintStream {
    public void println(...);
    public void print(...);
}

# ── Capacitor Plugins — must NOT be obfuscated (reflection + JNI) ────────────
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin { *; }

# ── App Custom Plugins — keep public API surface, obfuscate internals ─────────
-keep class com.naderakram.vodafonefakka.VodafoneDetectorPlugin {
    public *;
}
-keepclassmembers class com.naderakram.vodafonefakka.VodafoneDetectorPlugin {
    @com.getcapacitor.annotation.PluginMethod public *;
}
-keep class com.naderakram.vodafonefakka.ApkInstallerPlugin {
    public *;
}
-keepclassmembers class com.naderakram.vodafonefakka.ApkInstallerPlugin {
    @com.getcapacitor.annotation.PluginMethod public *;
}
-keep class com.naderakram.vodafonefakka.PrintPlugin {
    public *;
}
-keepclassmembers class com.naderakram.vodafonefakka.PrintPlugin {
    @com.getcapacitor.annotation.PluginMethod public *;
}

# ── WebView JavaScript Bridge ─────────────────────────────────────────────────
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ── Serialization & Reflection ───────────────────────────────────────────────
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ── Kotlin Metadata (required for coroutines + reflection) ───────────────────
-keep class kotlin.Metadata { *; }
-dontwarn kotlin.**
-dontwarn kotlinx.**

# ── AndroidX / Jetpack ───────────────────────────────────────────────────────
-keep class androidx.** { *; }
-dontwarn androidx.**

# ── OkHttp / Retrofit ────────────────────────────────────────────────────────
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# ── Prevent exposing sensitive method names in MainActivity ───────────────────
# MainActivity و runNativeTamperSensor لا يُحتفظ بها → تُعاد تسميتها تلقائياً
