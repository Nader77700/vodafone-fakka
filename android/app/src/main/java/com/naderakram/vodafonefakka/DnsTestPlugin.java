package com.naderakram.vodafonefakka;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;

import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;
import java.util.regex.Pattern;

@CapacitorPlugin(name = "DnsTest")
public class DnsTestPlugin extends Plugin {

    private static final Pattern HIDDEN_CHAR_PATTERN = Pattern.compile("[^\\x20-\\x7E]");

    @PluginMethod
    public void testDns(PluginCall call) {
        // تشغيل العمليات الشبكية على thread منفصل لمنع NetworkOnMainThreadException
        new Thread(() -> {
            String originalUrl = call.getString("url", "");
            JSObject result = new JSObject();
            result.put("originalUrl", originalUrl);

            try {
                URL urlObj = new URL(originalUrl);
                String scheme = urlObj.getProtocol();
                String host = urlObj.getHost();

                result.put("scheme", scheme);
                result.put("host", host);
                result.put("hasHiddenCharacters", HIDDEN_CHAR_PATTERN.matcher(host).find());

                // 1. اختبار DNS Resolution
                String resolvedIp = null;
                try {
                    InetAddress inet = InetAddress.getByName(host);
                    resolvedIp = inet.getHostAddress();
                } catch (Exception e) {
                    resolvedIp = null;
                }
                result.put("inetAddressResolvedIp", resolvedIp != null ? resolvedIp : "FAILED");

                // 2. اختبار HTTP Connectivity باستخدام Java HttpURLConnection
                int httpCode = -1;
                try {
                    HttpURLConnection conn = (HttpURLConnection) urlObj.openConnection();
                    conn.setRequestMethod("GET");
                    conn.setConnectTimeout(12000);
                    conn.setReadTimeout(12000);
                    conn.setInstanceFollowRedirects(true);
                    conn.setRequestProperty("User-Agent", "okhttp/4.12.0");
                    httpCode = conn.getResponseCode();
                    conn.disconnect();
                } catch (Exception e) {
                    httpCode = -1;
                }
                result.put("javaHttpCode", httpCode);

                // 3. اختبار Google DNS كـ Control Test
                String googleIp = null;
                boolean googleDnsWorks = false;
                try {
                    InetAddress google = InetAddress.getByName("dns.google");
                    googleIp = google.getHostAddress();
                    googleDnsWorks = true;
                } catch (Exception e) {
                    googleDnsWorks = false;
                }
                result.put("googleDnsWorks", googleDnsWorks);
                result.put("googleIp", googleIp != null ? googleIp : "FAILED");

                call.resolve(result);
            } catch (Exception e) {
                result.put("error", e.getMessage());
                call.resolve(result);
            }
        }).start();
    }
}
