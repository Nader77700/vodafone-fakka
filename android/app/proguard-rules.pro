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

# Obfuscate our custom classes heavily
-repackageclasses ''
-allowaccessmodification
-optimizations !code/simplification/arithmetic,!field/*,!class/merging/*
-optimizationpasses 5

# Keep Capacitor Plugins to prevent "Plugin is not implemented" errors
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keep class com.naderakram.vodafonefakka.VodafoneDetectorPlugin { *; }
-keep class com.naderakram.vodafonefakka.ApkInstallerPlugin { *; }
-keep class com.naderakram.vodafonefakka.PrintPlugin { *; }

# DO NOT KEEP MainActivity methods (Let them be obfuscated)
# We want runNativeTamperSensor to be renamed to something like 'a'
