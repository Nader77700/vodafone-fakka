package com.naderakram.vodafonefakka;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;

import android.content.Context;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.provider.Settings;
import android.telephony.TelephonyManager;
import android.util.Log;

import org.json.JSONArray;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.security.cert.Certificate;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import javax.net.ssl.SNIHostName;
import javax.net.ssl.SNIServerName;
import javax.net.ssl.SSLHandshakeException;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSession;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

@CapacitorPlugin(name = "DnsTest")
public class DnsTestPlugin extends Plugin {

    private static final String TAG = "DnsTestPlugin";
    private static final Pattern HIDDEN_CHAR_PATTERN = Pattern.compile("[^\\x20-\\x7E]");
    private static final int CONNECT_TIMEOUT_MS = 12000;
    private static final int READ_TIMEOUT_MS = 12000;

    @PluginMethod
    public void testDns(PluginCall call) {
        new Thread(() -> {
            long startTime = System.currentTimeMillis();
            String originalUrl = call.getString("url", "");
            JSObject result = new JSObject();
            result.put("originalUrl", originalUrl);
            JSONArray pipeline = new JSONArray();
            pipeline.put(pipelineStep("start", "Button Click / Diagnostic Start", startTime));

            try {
                URL url = new URL(originalUrl);
                String scheme = url.getProtocol();
                String host = url.getHost();
                int port = url.getPort() == -1 ? url.getDefaultPort() : url.getPort();
                String path = url.getPath();
                String query = url.getQuery();

                JSObject preConnection = new JSObject();
                preConnection.put("url", originalUrl);
                preConnection.put("scheme", scheme);
                preConnection.put("host", host);
                preConnection.put("port", port);
                preConnection.put("path", path);
                preConnection.put("query", query);
                preConnection.put("hasHiddenCharacters", HIDDEN_CHAR_PATTERN.matcher(host).find());
                result.put("preConnection", preConnection);

                result.put("androidNetworkReport", collectAndroidNetworkReport());

                // DNS Stage
                long dnsStart = System.currentTimeMillis();
                pipeline.put(pipelineStep("dnsStart", "DNS Start", dnsStart));
                String resolvedIp = "FAILED";
                try {
                    InetAddress[] addresses = InetAddress.getAllByName(host);
                    if (addresses.length > 0) resolvedIp = addresses[0].getHostAddress();
                } catch (Exception e) {
                    resolvedIp = "FAILED: " + e.getMessage();
                }
                long dnsEnd = System.currentTimeMillis();
                pipeline.put(pipelineStep("dnsEnd", "DNS End", dnsEnd));
                pipeline.put(pipelineStep("dnsDuration", "DNS Duration", dnsEnd - dnsStart));
                preConnection.put("resolvedIp", resolvedIp);
                result.put("inetAddressResolvedIp", resolvedIp);

                // Google DNS control
                boolean googleDnsWorks = false;
                String googleIp = "FAILED";
                try {
                    googleIp = InetAddress.getByName("dns.google").getHostAddress();
                    googleDnsWorks = true;
                } catch (Exception e) {
                    googleDnsWorks = false;
                }
                result.put("googleDnsWorks", googleDnsWorks);
                result.put("googleIp", googleIp);

                // Transport inspection
                TransportResult transport = runTransportInspection(scheme, host, port, path, query, resolvedIp, pipeline);
                result.put("transport", transport.toJson());
                result.put("pipeline", pipeline);

                call.resolve(result);
            } catch (Exception e) {
                result.put("exceptionReport", buildExceptionReport(e));
                result.put("pipeline", pipeline);
                call.resolve(result);
            }
        }).start();
    }

    private JSObject pipelineStep(String stage, String label, long timestampOrDuration) {
        JSObject step = new JSObject();
        step.put("stage", stage);
        step.put("label", label);
        step.put("timestampMs", timestampOrDuration);
        return step;
    }

    private JSObject collectAndroidNetworkReport() {
        JSObject report = new JSObject();
        Context ctx = getContext();
        PackageManager pm = ctx.getPackageManager();
        String pkg = ctx.getPackageName();
        report.put("internetPermission", pm.checkPermission(android.Manifest.permission.INTERNET, pkg) == PackageManager.PERMISSION_GRANTED);
        report.put("accessNetworkStatePermission", pm.checkPermission(android.Manifest.permission.ACCESS_NETWORK_STATE, pkg) == PackageManager.PERMISSION_GRANTED);

        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null) {
                Network active = cm.getActiveNetwork();
                NetworkCapabilities nc = cm.getNetworkCapabilities(active);
                if (nc != null) {
                    report.put("cellularConnected", nc.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR));
                    report.put("wifiConnected", nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI));
                    report.put("vpnConnected", nc.hasTransport(NetworkCapabilities.TRANSPORT_VPN));
                    report.put("networkCapabilities", nc.toString());
                    report.put("captivePortal", nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_CAPTIVE_PORTAL));
                    report.put("validatedNetwork", nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED));
                }
                report.put("meteredNetwork", cm.isActiveNetworkMetered());
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    LinkProperties lp = cm.getLinkProperties(active);
                    if (lp != null) {
                        List<String> dnsList = new ArrayList<>();
                        for (InetAddress dns : lp.getDnsServers()) dnsList.add(dns.getHostAddress());
                        report.put("dnsServers", dnsList.toString());
                    }
                }
            }

            TelephonyManager tm = (TelephonyManager) ctx.getSystemService(Context.TELEPHONY_SERVICE);
            if (tm != null) {
                report.put("simOperator", tm.getSimOperatorName());
                report.put("networkOperator", tm.getNetworkOperatorName());
            }

            report.put("mobileDataEnabled", Settings.Global.getInt(ctx.getContentResolver(), "mobile_data", 0) == 1);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                report.put("privateDnsMode", Settings.Global.getString(ctx.getContentResolver(), "private_dns_mode"));
            } else {
                report.put("privateDnsMode", "N/A");
            }

            String proxyHost = System.getProperty("http.proxyHost");
            String proxyPort = System.getProperty("http.proxyPort");
            report.put("proxyEnabled", proxyHost != null && !proxyHost.isEmpty());
            report.put("proxyHost", proxyHost != null ? proxyHost : "");
            report.put("proxyPort", proxyPort != null ? proxyPort : "");

            report.put("ipv4", hasAddressType(Inet4Address.class));
            report.put("ipv6", hasAddressType(Inet6Address.class));
        } catch (Exception e) {
            report.put("collectionError", e.getMessage());
        }
        return report;
    }

    private boolean hasAddressType(Class<? extends InetAddress> type) {
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                NetworkInterface ni = interfaces.nextElement();
                if (ni.isLoopback()) continue;
                Enumeration<InetAddress> addrs = ni.getInetAddresses();
                while (addrs.hasMoreElements()) {
                    InetAddress addr = addrs.nextElement();
                    if (!addr.isLoopbackAddress() && type.isInstance(addr)) return true;
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Address enumeration failed", e);
        }
        return false;
    }

    private TransportResult runTransportInspection(String scheme, String host, int port, String path, String query, String resolvedIp, JSONArray pipeline) {
        TransportResult tr = new TransportResult();
        tr.resolvedIp = resolvedIp;
        long socketOpen = System.currentTimeMillis();
        pipeline.put(pipelineStep("socketOpen", "Socket Open", socketOpen));

        String resource = path + (query != null ? "?" + query : "");

        Map<String, String> requestHeaders = new HashMap<>();
        requestHeaders.put("Host", host);
        requestHeaders.put("User-Agent", "okhttp/4.12.0");
        requestHeaders.put("Accept-Language", "ar");
        requestHeaders.put("Accept", "*/*");
        requestHeaders.put("Connection", "close");

        tr.httpRequestReport.put("method", "GET");
        tr.httpRequestReport.put("headers", maskHeaders(requestHeaders));
        tr.httpRequestReport.put("contentLength", 0);
        tr.httpRequestReport.put("redirects", "manual");
        tr.httpRequestReport.put("compression", "none");
        tr.httpRequestReport.put("acceptEncoding", "none");
        tr.httpRequestReport.put("userAgent", "okhttp/4.12.0");

        tr.socketReport.put("connectTimeout", CONNECT_TIMEOUT_MS);
        tr.socketReport.put("readTimeout", READ_TIMEOUT_MS);
        tr.socketReport.put("writeTimeout", READ_TIMEOUT_MS);
        tr.socketReport.put("keepAlive", false);
        tr.socketReport.put("reuseConnection", false);

        Socket socket = null;
        try {
            if (!resolvedIp.startsWith("FAILED")) {
                socket = new Socket();
                socket.setSoTimeout(READ_TIMEOUT_MS);
                long tcpStart = System.currentTimeMillis();
                socket.connect(new InetSocketAddress(resolvedIp, port), CONNECT_TIMEOUT_MS);
                long tcpEnd = System.currentTimeMillis();
                tr.tcpConnected = socket.isConnected();
                pipeline.put(pipelineStep("tcpConnected", "TCP Connected", tcpEnd));
                pipeline.put(pipelineStep("tcpDuration", "TCP Duration", tcpEnd - tcpStart));

                if ("https".equalsIgnoreCase(scheme)) {
                    long tlsStart = System.currentTimeMillis();
                    pipeline.put(pipelineStep("tlsStart", "TLS Start", tlsStart));
                    SSLSocketFactory factory = (SSLSocketFactory) SSLSocketFactory.getDefault();
                    SSLSocket ssl = (SSLSocket) factory.createSocket(socket, host, port, true);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        SSLParameters params = ssl.getSSLParameters();
                        List<SNIServerName> serverNames = new ArrayList<>();
                        serverNames.add(new SNIHostName(host));
                        params.setServerNames(serverNames);
                        ssl.setSSLParameters(params);
                    }
                    ssl.setSoTimeout(READ_TIMEOUT_MS);
                    ssl.startHandshake();
                    long tlsEnd = System.currentTimeMillis();
                    tr.tlsSuccess = true;
                    pipeline.put(pipelineStep("tlsFinished", "TLS Finished", tlsEnd));
                    pipeline.put(pipelineStep("tlsDuration", "TLS Duration", tlsEnd - tlsStart));

                    SSLSession session = ssl.getSession();
                    tr.tlsReport.put("tlsVersion", session.getProtocol());
                    tr.tlsReport.put("cipherSuite", session.getCipherSuite());
                    tr.tlsReport.put("alpn", "N/A");
                    tr.tlsReport.put("httpVersion", "HTTP/1.1");
                    tr.tlsReport.put("peerHost", session.getPeerHost());
                    tr.tlsReport.put("peerIp", resolvedIp);
                    Certificate[] certs = session.getPeerCertificates();
                    tr.tlsReport.put("peerCertificatesCount", certs != null ? certs.length : 0);
                    tr.tlsReport.put("handshakeSuccess", true);
                    tr.tlsReport.put("handshakeDurationMs", tlsEnd - tlsStart);
                    tr.tlsReport.put("hostnameVerification", "Success (default)");
                    tr.tlsReport.put("sslSessionId", maskSessionId(session.getId()));
                    socket = ssl;
                } else {
                    tr.tlsReport.put("handshakeSuccess", "N/A (plain HTTP)");
                }

                // Send HTTP request
                long reqSent = System.currentTimeMillis();
                pipeline.put(pipelineStep("httpRequestSent", "HTTP Request Sent", reqSent));
                StringBuilder reqBuilder = new StringBuilder();
                reqBuilder.append("GET ").append(resource).append(" HTTP/1.1\r\n");
                for (Map.Entry<String, String> entry : requestHeaders.entrySet()) {
                    reqBuilder.append(entry.getKey()).append(": ").append(entry.getValue()).append("\r\n");
                }
                reqBuilder.append("\r\n");
                byte[] reqBytes = reqBuilder.toString().getBytes(StandardCharsets.UTF_8);
                tr.bytesSent = reqBytes.length;
                tr.httpSent = true;
                OutputStream out = socket.getOutputStream();
                out.write(reqBytes);
                out.flush();

                // Read response
                InputStream in = socket.getInputStream();
                BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
                String statusLine = reader.readLine();
                long firstByte = System.currentTimeMillis();
                pipeline.put(pipelineStep("firstByteReceived", "First Byte Received", firstByte));
                if (statusLine == null) throw new IOException("Empty response status line");
                tr.responseStarted = true;

                String[] parts = statusLine.split(" ", 3);
                if (parts.length >= 2) {
                    tr.responseStatus = Integer.parseInt(parts[1]);
                    tr.responseReason = parts.length >= 3 ? parts[2] : "";
                }

                Map<String, String> responseHeaders = new HashMap<>();
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.isEmpty()) break;
                    int colon = line.indexOf(':');
                    if (colon > 0) {
                        responseHeaders.put(line.substring(0, colon).trim(), line.substring(colon + 1).trim());
                    }
                }
                long headersReceived = System.currentTimeMillis();
                pipeline.put(pipelineStep("headersReceived", "Headers Received", headersReceived));
                pipeline.put(pipelineStep("headersDuration", "Headers Duration", headersReceived - firstByte));
                tr.headersReceived = true;

                tr.httpResponseReport.put("statusCode", tr.responseStatus);
                tr.httpResponseReport.put("reasonPhrase", tr.responseReason);
                tr.httpResponseReport.put("headers", responseHeaders);
                tr.httpResponseReport.put("contentLength", responseHeaders.getOrDefault("Content-Length", "N/A"));
                tr.httpResponseReport.put("contentEncoding", responseHeaders.getOrDefault("Content-Encoding", "none"));
                tr.httpResponseReport.put("server", responseHeaders.getOrDefault("Server", "N/A"));
                tr.httpResponseReport.put("date", responseHeaders.getOrDefault("Date", "N/A"));

                long bodyStart = System.currentTimeMillis();
                pipeline.put(pipelineStep("bodyStarted", "Body Started", bodyStart));
                StringBuilder body = new StringBuilder();
                char[] buffer = new char[8192];
                int read;
                while ((read = reader.read(buffer)) != -1) {
                    body.append(buffer, 0, read);
                }
                long bodyFinished = System.currentTimeMillis();
                pipeline.put(pipelineStep("bodyFinished", "Body Finished", bodyFinished));
                pipeline.put(pipelineStep("bodyDuration", "Body Duration", bodyFinished - bodyStart));
                tr.bytesReceived = body.toString().getBytes(StandardCharsets.UTF_8).length;
                tr.bodyReceived = true;
                tr.httpResponseReport.put("bodyBytes", tr.bytesReceived);

                socket.close();
                tr.socketClosed = System.currentTimeMillis();
                tr.socketConnected = true;
                pipeline.put(pipelineStep("socketClosed", "Socket Closed", tr.socketClosed));
                pipeline.put(pipelineStep("completed", "Completed", tr.socketClosed));
            } else {
                throw new IOException("DNS resolution failed, cannot connect");
            }
        } catch (Exception e) {
            tr.exception = e;
            tr.exceptionReport = buildExceptionReport(e);
            tr.timeoutAnalyzer = buildTimeoutAnalyzer(e);
            try {
                if (socket != null) {
                    socket.close();
                    tr.socketClosed = System.currentTimeMillis();
                }
            } catch (Exception ignored) {}
        }

        return tr;
    }

    private JSObject maskHeaders(Map<String, String> headers) {
        JSObject masked = new JSObject();
        for (Map.Entry<String, String> e : headers.entrySet()) {
            String key = e.getKey();
            String val = e.getValue();
            if (key.equalsIgnoreCase("Authorization") || key.equalsIgnoreCase("Cookie") || key.toLowerCase().contains("token")) {
                val = "[HIDDEN]";
            }
            masked.put(key, val);
        }
        return masked;
    }

    private String maskSessionId(byte[] sessionId) {
        if (sessionId == null || sessionId.length == 0) return "N/A";
        StringBuilder sb = new StringBuilder();
        for (byte b : sessionId) sb.append(String.format("%02x", b));
        String s = sb.toString();
        if (s.length() > 8) return s.substring(0, 4) + "..." + s.substring(s.length() - 4);
        return s;
    }

    private JSObject buildExceptionReport(Exception e) {
        JSObject report = new JSObject();
        report.put("javaExceptionClass", e.getClass().getName());
        report.put("javaExceptionMessage", e.getMessage());
        report.put("rootCause", rootCause(e));
        report.put("nestedCause", nestedCause(e));
        report.put("fullStackTrace", stackTraceToString(e));
        return report;
    }

    private JSObject buildTimeoutAnalyzer(Exception e) {
        JSObject analyzer = new JSObject();
        String type = "Unknown Timeout";
        if (e instanceof UnknownHostException) {
            type = "DNS Timeout";
        } else if (e instanceof SSLHandshakeException) {
            type = "TLS Handshake Timeout";
        } else if (e instanceof SocketTimeoutException) {
            String msg = e.getMessage() != null ? e.getMessage().toLowerCase() : "";
            if (msg.contains("connect")) type = "TCP Connect Timeout";
            else if (msg.contains("write")) type = "Write Timeout";
            else if (msg.contains("read") || msg.contains("timed out")) type = "Read Timeout";
            else type = "Socket Timeout";
        } else if (e instanceof SocketException) {
            type = "Socket Timeout";
        }
        analyzer.put("finalReason", type);
        analyzer.put("dnsTimeout", "DNS Timeout".equals(type));
        analyzer.put("tcpConnectTimeout", "TCP Connect Timeout".equals(type));
        analyzer.put("tlsHandshakeTimeout", "TLS Handshake Timeout".equals(type));
        analyzer.put("writeTimeout", "Write Timeout".equals(type));
        analyzer.put("readTimeout", "Read Timeout".equals(type));
        analyzer.put("socketTimeout", "Socket Timeout".equals(type));
        analyzer.put("unknownTimeout", "Unknown Timeout".equals(type));
        return analyzer;
    }

    private String rootCause(Throwable t) {
        Throwable cause = t;
        while (cause != null && cause.getCause() != null) cause = cause.getCause();
        return cause != null ? cause.getClass().getName() + ": " + cause.getMessage() : "";
    }

    private String nestedCause(Throwable t) {
        StringBuilder sb = new StringBuilder();
        Throwable current = t;
        int depth = 0;
        while (current != null && depth < 5) {
            sb.append(current.getClass().getName()).append(": ").append(current.getMessage()).append("\n");
            current = current.getCause();
            depth++;
        }
        return sb.toString().trim();
    }

    private String stackTraceToString(Throwable t) {
        StringWriter sw = new StringWriter();
        PrintWriter pw = new PrintWriter(sw);
        t.printStackTrace(pw);
        return sw.toString();
    }

    private static class TransportResult {
        String resolvedIp = "N/A";
        boolean tcpConnected = false;
        boolean tlsSuccess = false;
        boolean httpSent = false;
        boolean responseStarted = false;
        boolean headersReceived = false;
        boolean bodyReceived = false;
        boolean socketConnected = false;
        int responseStatus = -1;
        String responseReason = "";
        long socketClosed = -1;
        long bytesSent = 0;
        long bytesReceived = 0;
        Exception exception = null;
        JSObject tlsReport = new JSObject();
        JSObject socketReport = new JSObject();
        JSObject httpRequestReport = new JSObject();
        JSObject httpResponseReport = new JSObject();
        JSObject exceptionReport = new JSObject();
        JSObject timeoutAnalyzer = new JSObject();

        JSObject toJson() {
            JSObject raw = new JSObject();
            raw.put("resolvedIp", resolvedIp);
            raw.put("tcpConnected", tcpConnected);
            raw.put("tlsSuccess", tlsSuccess);
            raw.put("httpSent", httpSent);
            raw.put("responseStarted", responseStarted);
            raw.put("headersReceived", headersReceived);
            raw.put("bodyReceived", bodyReceived);
            raw.put("socketConnected", socketConnected);
            raw.put("socketClosed", socketClosed);
            raw.put("bytesSent", bytesSent);
            raw.put("bytesReceived", bytesReceived);
            raw.put("responseStatus", responseStatus);
            raw.put("responseReason", responseReason);

            socketReport.put("connected", tcpConnected);
            socketReport.put("closed", socketClosed);
            socketReport.put("socketTimeout", READ_TIMEOUT_MS);
            socketReport.put("connectTimeout", CONNECT_TIMEOUT_MS);
            socketReport.put("readTimeout", READ_TIMEOUT_MS);
            socketReport.put("writeTimeout", READ_TIMEOUT_MS);
            socketReport.put("keepAlive", false);
            socketReport.put("reuseConnection", false);
            socketReport.put("bytesSent", bytesSent);
            socketReport.put("bytesReceived", bytesReceived);

            if (exception != null) {
                raw.put("exceptionType", exception.getClass().getName());
                raw.put("rootCause", rootCause(exception));
            } else {
                raw.put("exceptionType", "None");
                raw.put("rootCause", "");
            }

            JSObject out = new JSObject();
            out.put("tlsReport", tlsReport);
            out.put("socketReport", socketReport);
            out.put("httpRequestReport", httpRequestReport);
            out.put("httpResponseReport", httpResponseReport);
            out.put("exceptionReport", exceptionReport);
            out.put("timeoutAnalyzer", timeoutAnalyzer);
            out.put("rawRequestResult", raw);
            return out;
        }

        private String rootCause(Throwable t) {
            Throwable cause = t;
            while (cause != null && cause.getCause() != null) cause = cause.getCause();
            return cause != null ? cause.getClass().getName() + ": " + cause.getMessage() : "";
        }
    }
}
