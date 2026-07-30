import { CapacitorHttp, Capacitor, registerPlugin, CapacitorCookies } from '@capacitor/core';
import type { DiagnosticTrace } from './DiagnosticTrace';

const DnsTest = registerPlugin<any>('DnsTest');

// Remove sensitive info from headers for logging
function sanitizeHeaders(headers: any) {
  const safe = { ...headers };
  if (safe['Authorization']) safe['Authorization'] = '[HIDDEN]';
  if (safe['Cookie']) safe['Cookie'] = '[HIDDEN]';
  return safe;
}

function parseRequestUrl(url: string) {
  try {
    const u = new URL(url);
    return {
      url,
      method: 'GET',
      scheme: u.protocol.replace(':', ''),
      host: u.host,
      path: u.pathname,
      query: u.search,
      queryParams: Object.fromEntries(u.searchParams.entries()),
    };
  } catch (e) {
    return { url, method: 'GET', scheme: '', host: '', path: '', query: '', queryParams: {}, parseError: String(e) };
  }
}

function getHeaderCaseInsensitive(headers: any, name: string) {
  if (!headers) return undefined;
  const n = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === n) return headers[key];
  }
  return undefined;
}

function normalizeCookieMap(cookieMap: any) {
  if (!cookieMap || typeof cookieMap !== 'object') return [];
  return Object.keys(cookieMap).map((k) => ({ key: k, value: String(cookieMap[k]) }));
}

function diffCookies(before: any, after: any) {
  const b = normalizeCookieMap(before);
  const a = normalizeCookieMap(after);
  const beforeKeys = new Set(b.map((c) => c.key));
  const afterKeys = new Set(a.map((c) => c.key));
  const added = a.filter((c) => !beforeKeys.has(c.key));
  const removed = b.filter((c) => !afterKeys.has(c.key));
  const changed = a.filter((c) => {
    const old = b.find((x) => x.key === c.key);
    return old !== undefined && old.value !== c.value;
  });
  return { before: b, after: a, added, removed, changed };
}

function parseSetCookie(headers: any) {
  const raw: string[] = [];
  for (const key of Object.keys(headers || {})) {
    if (key.toLowerCase() === 'set-cookie') {
      const val = headers[key];
      if (Array.isArray(val)) raw.push(...val);
      else raw.push(String(val));
    }
  }
  return raw.map((line) => {
    const parts = line.split(';').map((p) => p.trim());
    const [nameValue] = parts;
    const [cookieName, cookieValue] = nameValue.split('=', 2);
    const attributes: Record<string, string> = {};
    for (let i = 1; i < parts.length; i++) {
      const [attr, val] = parts[i].split('=', 2);
      attributes[attr.trim()] = val !== undefined ? val.trim() : 'true';
    }
    return { raw: line, name: cookieName.trim(), value: cookieValue !== undefined ? cookieValue.trim() : '', attributes };
  });
}

function buildRequestForensics(url: string, headers: any, timeout: number) {
  const parsed = parseRequestUrl(url);
  const sanitized = sanitizeHeaders(headers);
  return {
    ...parsed,
    fullRequestHeaders: sanitized,
    authorizationHeader: getHeaderCaseInsensitive(headers, 'Authorization') || 'MISSING',
    acceptHeader: getHeaderCaseInsensitive(headers, 'Accept') || 'MISSING',
    acceptLanguageHeader: getHeaderCaseInsensitive(headers, 'Accept-Language') || 'MISSING',
    acceptEncodingHeader: getHeaderCaseInsensitive(headers, 'Accept-Encoding') || 'MISSING',
    userAgentHeader: getHeaderCaseInsensitive(headers, 'User-Agent') || 'MISSING',
    connectionHeader: getHeaderCaseInsensitive(headers, 'Connection') || 'MISSING',
    originHeader: getHeaderCaseInsensitive(headers, 'Origin') || 'MISSING',
    refererHeader: getHeaderCaseInsensitive(headers, 'Referer') || 'MISSING',
    cookieHeader: getHeaderCaseInsensitive(headers, 'Cookie') || 'MISSING',
    contentTypeHeader: getHeaderCaseInsensitive(headers, 'Content-Type') || 'MISSING',
    contentLengthHeader: getHeaderCaseInsensitive(headers, 'Content-Length') || 'MISSING',
    clientHints: getHeaderCaseInsensitive(headers, 'Sec-CH-UA') || 'MISSING',
    customVodafoneHeaders: Object.keys(headers).filter((k) => k.toLowerCase().startsWith('x-') || k.toLowerCase() === 'clientid' || k.toLowerCase() === 'digitalid' || k.toLowerCase() === 'device-id'),
    redirectPolicy: 'follow (default)',
    connectTimeoutMs: timeout,
    readTimeoutMs: timeout,
  };
}

function buildResponseForensics(response: any) {
  const h = response.headers || {};
  const isRedirect = response.status >= 301 && response.status <= 308;
  const securityHeaders = ['strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy'];
  const allKeys = Object.keys(h);
  return {
    status: response.status,
    httpVersion: 'HTTP/1.1 (assumed from CapacitorHttp)',
    reasonPhrase: 'N/A (not exposed by CapacitorHttp)',
    allResponseHeaders: h,
    contentType: getHeaderCaseInsensitive(h, 'Content-Type') || 'unknown',
    contentLength: getHeaderCaseInsensitive(h, 'Content-Length') || 'unknown',
    server: getHeaderCaseInsensitive(h, 'Server') || 'unknown',
    date: getHeaderCaseInsensitive(h, 'Date') || 'unknown',
    cacheControl: getHeaderCaseInsensitive(h, 'Cache-Control') || 'unknown',
    expires: getHeaderCaseInsensitive(h, 'Expires') || 'unknown',
    location: getHeaderCaseInsensitive(h, 'Location') || 'none',
    xHeaders: allKeys.filter((k) => k.toLowerCase().startsWith('x-')).map((k) => `${k}: ${h[k]}`),
    via: getHeaderCaseInsensitive(h, 'Via') || 'unknown',
    cfAkamaiHeaders: allKeys.filter((k) => /^cf-/i.test(k) || /^akamai/i.test(k) || /^x-cache/i.test(k) || k.toLowerCase() === 'via'),
    securityHeaders: allKeys.filter((k) => securityHeaders.includes(k.toLowerCase())).map((k) => `${k}: ${h[k]}`),
    isRedirect,
    setCookieHeaders: parseSetCookie(h),
  };
}

function buildRedirectAnalyzer(response: any) {
  const status = response.status;
  const redirectStatuses = [301, 302, 303, 307, 308];
  const isRedirect = redirectStatuses.includes(status);
  const location = getHeaderCaseInsensitive(response.headers, 'Location') || 'none';
  return {
    isRedirect,
    status,
    redirectStatusDetected: redirectStatuses.includes(status) ? status : null,
    locationHeader: location,
    redirectUrl: location,
    redirectCount: 'unknown (client followed automatically)',
    finalUrl: response.url || 'unknown',
    policy: 'follow (default)',
  };
}

function detectBodyType(contentType: string) {
  if (!contentType) return 'unknown';
  const ct = contentType.toLowerCase();
  if (ct.includes('application/json')) return 'application/json';
  if (ct.includes('text/html')) return 'text/html';
  if (ct.includes('text/plain')) return 'text/plain';
  if (ct.includes('application/xml') || ct.includes('text/xml')) return 'xml';
  if (ct.includes('application/octet-stream')) return 'binary';
  return 'unknown';
}

function extractHtmlInfo(html: string) {
  const lower = html.toLowerCase();
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';
  const meta = [...html.matchAll(/<meta[^>]*>/gi)].map((m) => m[0]).slice(0, 10);
  const formMatch = html.match(/<form[^>]*>/i);
  const form = formMatch ? formMatch[0] : '';
  const bodyIdMatch = html.match(/<body[^>]*id="([^"]*)"/i);
  const bodyId = bodyIdMatch ? bodyIdMatch[1] : '';
  const bodyClassMatch = html.match(/<body[^>]*class="([^"]*)"/i);
  const bodyClass = bodyClassMatch ? bodyClassMatch[1] : '';
  const keywords = ['captcha', 'request rejected', 'access denied', 'forbidden', 'akamai', 'cloudflare', 'imperva', 'bot protection', 'blocked', 'unauthorized', 'error', 'invalid request', 'challenge', 'recaptcha', 'hcaptcha', 'incapsula'];
  const foundKeywords = keywords.filter((k) => lower.includes(k));
  const errorTextMatch = html.match(/<div[^>]*class="[^"]*error[^"]*"[^>]*>([^<]*)<\/div>/i);
  const errorText = errorTextMatch ? errorTextMatch[1].trim() : '';
  return { title, meta, form, bodyId, bodyClass, foundKeywords, errorText };
}

function buildBodyAnalyzer(response: any, bodyText: string) {
  const contentType = getHeaderCaseInsensitive(response.headers, 'Content-Type') || 'unknown';
  const detectedType = detectBodyType(contentType);
  const first1000 = bodyText.slice(0, 1000);
  const htmlInfo = detectedType === 'text/html' ? extractHtmlInfo(bodyText) : null;
  return {
    detectedType,
    contentType,
    bodyLength: bodyText.length,
    isEmpty: bodyText.length === 0,
    first1000Characters: first1000,
    htmlInfo,
  };
}

function detectServerProtection(html: string, headers: any) {
  const lower = html.toLowerCase();
  const headerStr = Object.keys(headers || {})
    .map((k) => `${k}:${headers[k]}`)
    .join(' ')
    .toLowerCase();
  return {
    cloudflare: lower.includes('cloudflare') || headerStr.includes('cf-ray') || headerStr.includes('cloudflare'),
    akamai: lower.includes('akamai') || headerStr.includes('akamai'),
    imperva: lower.includes('imperva') || lower.includes('incapsula'),
    captcha: lower.includes('captcha') || lower.includes('recaptcha') || lower.includes('hcaptcha'),
    requestRejected: lower.includes('request rejected') || lower.includes('request has been rejected') || lower.includes('your request has been rejected'),
    accessDenied: lower.includes('access denied') || lower.includes('forbidden') || lower.includes('403'),
    botProtection: lower.includes('bot protection') || lower.includes('blocked') || lower.includes('unusual traffic') || lower.includes('automated') || lower.includes('suspicious'),
  };
}

function jsonParserDecision(status: number, contentType: string, bodyText: string) {
  const ct = (contentType || '').toLowerCase();
  const isJsonContentType = ct.includes('application/json');
  const trimmed = bodyText.trim();
  const isJsonBody = trimmed.startsWith('{') || trimmed.startsWith('[');
  const decision: any = {
    shouldParse: false,
    contentType,
    status,
    bodyStartsWith: trimmed.slice(0, 40),
    isJsonContentType,
    isJsonBody,
  };
  if (status !== 200) {
    decision.reason = `Status ${status} is not 200; skip JSON.parse to avoid exception.`;
    return decision;
  }
  if (!isJsonContentType && !isJsonBody) {
    decision.reason = 'Content-Type is not application/json and body does not look like JSON; skip JSON.parse. Return forensic report instead.';
    return decision;
  }
  if (isJsonContentType && !isJsonBody) {
    decision.reason = 'Content-Type claims application/json but body does not start with { or [; skip JSON.parse.';
    return decision;
  }
  decision.shouldParse = true;
  decision.reason = 'Status 200 and body looks like JSON; safe to parse JSON.';
  return decision;
}

function networkDifferenceReport(requestForensics: any, responseForensics: any, bodyAnalyzer: any, protection: any) {
  const expected = {
    contentType: 'application/json',
    status: 200,
    bodyType: 'application/json',
    requiredHeaders: ['User-Agent', 'Accept-Language', 'clientId', 'x-agent-version', 'x-agent-device', 'x-agent-build'],
    requiredCookies: ['JSESSIONID', 'session cookie'],
    expectedRedirect: 'none',
    expectedAuth: 'Authorization header or valid session cookie',
  };
  const actual = {
    status: responseForensics.status,
    contentType: responseForensics.contentType,
    bodyType: bodyAnalyzer.detectedType,
    hasSetCookie: responseForensics.setCookieHeaders && responseForensics.setCookieHeaders.length > 0,
    hasRedirect: responseForensics.isRedirect,
    protectionDetected: protection,
    requestCookiesCount: requestForensics.cookieHeader === 'MISSING' ? 0 : 1,
    responseCookiesCount: responseForensics.setCookieHeaders.length,
  };
  const mismatch: string[] = [];
  if (actual.status !== 200) mismatch.push(`Status mismatch: expected 200, received ${actual.status}`);
  if (actual.contentType !== 'application/json') mismatch.push(`Content-Type mismatch: expected application/json, received ${actual.contentType}`);
  if (actual.bodyType !== 'application/json') mismatch.push(`Body type mismatch: expected JSON, received ${actual.bodyType}`);
  if (requestForensics.cookieHeader === 'MISSING') mismatch.push('No Cookie header sent in request');
  if (requestForensics.authorizationHeader === 'MISSING') mismatch.push('No Authorization header sent in request');
  if (actual.hasSetCookie) mismatch.push('Server tried to set cookies; session may be missing or invalid');
  if (actual.hasRedirect) mismatch.push('Server returned redirect; endpoint may require different URL');
  if (protection.cloudflare) mismatch.push('Cloudflare WAF protection detected');
  if (protection.akamai) mismatch.push('Akamai security layer detected');
  if (protection.imperva) mismatch.push('Imperva/Incapsula bot protection detected');
  if (protection.captcha) mismatch.push('CAPTCHA challenge detected');
  if (protection.botProtection) mismatch.push('Bot protection detected');
  if (protection.requestRejected) mismatch.push('Server returned generic Request Rejected page');
  if (protection.accessDenied) mismatch.push('Access denied / Forbidden page detected');
  if (mismatch.length === 0) mismatch.push('No obvious mismatch detected by heuristics');
  return { expected, actual, mismatch };
}

function rootCauseAnalysis(protection: any, mismatch: string[], bodyAnalyzer: any) {
  const causes: string[] = [];
  if (protection.captcha) causes.push('CAPTCHA challenge is blocking the request.');
  if (protection.botProtection) causes.push('Bot protection identified the request as automated.');
  if (protection.cloudflare) causes.push('Cloudflare WAF is blocking the request.');
  if (protection.akamai) causes.push('Akamai security layer is blocking the request.');
  if (protection.imperva) causes.push('Imperva/Incapsula bot protection is blocking the request.');
  if (protection.requestRejected) causes.push('Server returned a generic Request Rejected page.');
  if (protection.accessDenied) causes.push('Server returned Access Denied / Forbidden.');
  if (mismatch.some((m) => m.includes('Content-Type') || m.includes('Body type'))) causes.push('Endpoint did not return JSON; likely rejected or wrong endpoint.');
  if (mismatch.some((m) => m.includes('No Cookie header') || m.includes('session'))) causes.push('Missing or invalid session cookie may be the cause.');
  if (mismatch.some((m) => m.includes('No Authorization header'))) causes.push('Missing Authorization header may be the cause.');
  if (causes.length === 0) causes.push('No known protection signature; likely server-side rejection due to missing headers/cookies or endpoint behavior.');
  return {
    causes,
    primaryCause: causes[0],
    bodyType: bodyAnalyzer.detectedType,
    htmlTitle: bodyAnalyzer.htmlInfo?.title || '',
  };
}

export async function fetchSeamlessToken(
  clientId: string = "ana-vodafone-app-seamless", 
  trace?: DiagnosticTrace
): Promise<{ token: string | null; msisdn: string | null; error?: string; debugRaw?: any; traceId?: string }> {
  
  if (trace) trace.addStep('Starting Token Request', 'seamless.ts', 'fetchSeamlessToken', 'fetchSeamlessToken', 'Started');
  
  try {
    const url = `https://mobile.vodafone.com.eg/checkSeamless/realms/vf-realm/protocol/openid-connect/auth?client_id=${clientId}&response_type=code&scope=openid&redirect_uri=ana-vodafone://seamless-login`;
    
    const headers = {
      "User-Agent": "okhttp/4.12.0",
      "Connection": "Keep-Alive",
      "x-dynatrace": "MT_3_5_2386790616_1-0_a556db1b-4506-43f3-854a-1d2527767923_0_21317_157",
      "x-agent-operatingsystem": "16",
      "clientId": "AnaVodafoneAndroid",
      "Accept-Language": "ar",
      "x-agent-device": "OPPO CPH2701",
      "x-agent-version": "2026.7.1",
      "x-agent-build": "1176",
      "digitalId": "",
      "device-id": ""
    };

    const timeout = 12000;
    
    if (Capacitor.isNativePlatform()) {
      if (trace) trace.addStep('Native Bridge Started', 'seamless.ts', 'fetchSeamlessToken', 'CapacitorHttp.get', 'Started');
      
      // 1. DNS & URL Analysis before making the request
      let dnsDebugInfo = null;
      try {
         const dnsResult = await DnsTest.testDns({ url: url });
         dnsDebugInfo = dnsResult;
         if (trace) {
            trace.addStep('DNS Test Executed', 'seamless.ts', 'fetchSeamlessToken', 'DnsTestPlugin', 'Success', dnsResult);
         }
      } catch (e) {
         if (trace) trace.addStep('DNS Test Executed', 'seamless.ts', 'fetchSeamlessToken', 'DnsTestPlugin', 'Failed', { error: String(e) });
      }

      // 2. REQUEST FORENSICS — before sending
      let requestCookies: any = {};
      try {
        requestCookies = await CapacitorCookies.getCookies({ url });
      } catch (e) {
        requestCookies = { error: String(e) };
      }
      const requestForensics = buildRequestForensics(url, headers, timeout);
      const cookieReportBefore = { requestCookies: normalizeCookieMap(requestCookies) };
      if (trace) {
        trace.addStep('REQUEST FORENSICS', 'seamless.ts', 'fetchSeamlessToken', 'ForensicAnalyzer', 'Started', { requestForensics, cookieReportBefore });
      }

      let reqIndex = -1;
      if (trace) {
        reqIndex = trace.logRequestStart('GET', url.split('?')[0] + '?params=[HIDDEN]', sanitizeHeaders(headers), 'No Body', timeout);
        trace.addStep('HTTP Request Sent', 'seamless.ts', 'fetchSeamlessToken', 'CapacitorHttp.get', 'Success');
        trace.addStep('Waiting Response', 'seamless.ts', 'fetchSeamlessToken', 'CapacitorHttp.get', 'Started');
      }

      try {
        const response = await CapacitorHttp.get({ url, headers, connectTimeout: timeout, readTimeout: timeout, responseType: 'text' });

        // 3. RESPONSE FORENSICS
        let responseCookies: any = {};
        try {
          responseCookies = await CapacitorCookies.getCookies({ url });
        } catch (e) {
          responseCookies = { error: String(e) };
        }
        const bodyText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        const responseForensics = buildResponseForensics(response);
        const redirectAnalyzer = buildRedirectAnalyzer(response);
        const bodyAnalyzer = buildBodyAnalyzer(response, bodyText);
        const cookieReport = {
          requestCookies: normalizeCookieMap(requestCookies),
          responseCookies: normalizeCookieMap(responseCookies),
          setCookieHeaders: responseForensics.setCookieHeaders,
          cookieDiff: diffCookies(requestCookies, responseCookies),
        };
        const protection = detectServerProtection(bodyText, response.headers);
        const jsonDecision = jsonParserDecision(response.status, responseForensics.contentType, bodyText);
        const diffReport = networkDifferenceReport(requestForensics, responseForensics, bodyAnalyzer, protection);
        const rootCause = rootCauseAnalysis(protection, diffReport.mismatch, bodyAnalyzer);

        const debugData = {
          status: response.status,
          url,
          headers,
          responseHeaders: response.headers,
          bodyPreview: bodyText.slice(0, 2000),
          dnsInfo: dnsDebugInfo,
          REQUEST_FORENSICS: requestForensics,
          COOKIE_REPORT: cookieReport,
          REDIRECT_REPORT: redirectAnalyzer,
          RESPONSE_FORENSICS: responseForensics,
          BODY_ANALYZER: bodyAnalyzer,
          SERVER_PROTECTION_DETECTOR: protection,
          JSON_PARSER_DECISION: jsonDecision,
          NETWORK_DIFFERENCE_REPORT: diffReport,
          ROOT_CAUSE_ANALYSIS: rootCause,
        };
        
        if (trace) {
           const size = bodyText.length;
           trace.logRequestEnd(reqIndex, response.status, size);
           trace.addStep('Response Received', 'seamless.ts', 'fetchSeamlessToken', 'CapacitorHttp.get', 'Success', { status: response.status });
           trace.addStep('RESPONSE FORENSICS', 'seamless.ts', 'fetchSeamlessToken', 'ForensicAnalyzer', response.status === 200 ? 'Success' : 'Failed', { status: response.status, contentType: responseForensics.contentType, bodyType: bodyAnalyzer.detectedType });
           trace.addStep('BODY ANALYZER', 'seamless.ts', 'fetchSeamlessToken', 'ForensicAnalyzer', 'Success', { detectedType: bodyAnalyzer.detectedType, bodyLength: bodyAnalyzer.bodyLength, htmlTitle: bodyAnalyzer.htmlInfo?.title || '' });
           trace.addStep('SERVER PROTECTION DETECTOR', 'seamless.ts', 'fetchSeamlessToken', 'ForensicAnalyzer', 'Success', protection);
           trace.addStep('JSON PARSER DECISION', 'seamless.ts', 'fetchSeamlessToken', 'ForensicAnalyzer', 'Success', jsonDecision);
           trace.addStep('ROOT CAUSE ANALYSIS', 'seamless.ts', 'fetchSeamlessToken', 'ForensicAnalyzer', 'Success', rootCause);
        }
        
        if (jsonDecision.shouldParse) {
           if (trace) trace.addStep('Parsing JSON', 'seamless.ts', 'fetchSeamlessToken', 'JSON.parse', 'Started');
           try {
             const d = JSON.parse(bodyText);
             if (d?.seamlessToken) {
               if (trace) {
                 trace.addStep('Parsing JSON', 'seamless.ts', 'fetchSeamlessToken', 'JSON.parse', 'Success');
                 trace.addStep('Token Retrieved Successfully', 'seamless.ts', 'fetchSeamlessToken', 'fetchSeamlessToken', 'Success');
               }
               return { token: d.seamlessToken, msisdn: d?.msisdn ? String(d.msisdn) : null, debugRaw: debugData, traceId: trace?.traceId };
             } else {
               if (trace) trace.addStep('Token Extraction Failed', 'seamless.ts', 'fetchSeamlessToken', 'JSON.parse', 'Failed', { reason: 'No seamlessToken in response', txt: bodyText.slice(0, 50) });
               return { token: null, msisdn: null, error: `Invalid format: ${bodyText.slice(0, 50)}`, debugRaw: debugData, traceId: trace?.traceId };
             }
           } catch (e: any) {
             if (trace) trace.addStep('Parsing JSON', 'seamless.ts', 'fetchSeamlessToken', 'JSON.parse', 'Failed', { error: e?.message });
             return { token: null, msisdn: null, error: `Parse error: ${e?.message} - ${bodyText.slice(0, 50)}`, debugRaw: debugData, traceId: trace?.traceId };
           }
        } else {
          if (trace) trace.addStep('Vodafone Connection Lost', 'seamless.ts', 'fetchSeamlessToken', 'CapacitorHttp.get', 'Failed', { status: response.status, reason: jsonDecision.reason });
          return { token: null, msisdn: null, error: `HTTP ${response.status} - ${jsonDecision.reason} - ${bodyText.slice(0, 100)}`, debugRaw: debugData, traceId: trace?.traceId };
        }
      } catch (httpErr: any) {
        if (trace) {
          trace.logRequestEnd(reqIndex, 0, 0, httpErr?.message);
          trace.addStep('Waiting Response', 'seamless.ts', 'fetchSeamlessToken', 'CapacitorHttp.get', 'Failed', { error: httpErr?.message, dnsInfo: dnsDebugInfo });
          if (httpErr?.message?.includes('timeout') || httpErr?.message?.includes('timed out')) {
            trace.addStep('Vodafone Connection Lost', 'seamless.ts', 'fetchSeamlessToken', 'CapacitorHttp.get', 'Failed', { reason: 'Timeout' });
          }
        }
        return { token: null, msisdn: null, error: String(httpErr), debugRaw: { error: String(httpErr), dnsInfo: dnsDebugInfo }, traceId: trace?.traceId };
      }
    } else {
      if (trace) trace.addStep('Web Fetch Started', 'seamless.ts', 'fetchSeamlessToken', 'fetch', 'Started');
      const doStandardFetch = async () => {
        const ctrl = new AbortController();
        const id = setTimeout(() => ctrl.abort(), timeout);
        let reqIndex = -1;
        if (trace) {
          reqIndex = trace.logRequestStart('GET', url.split('?')[0] + '?params=[HIDDEN]', sanitizeHeaders(headers), 'No Body', timeout);
          trace.addStep('HTTP Request Sent', 'seamless.ts', 'fetchSeamlessToken', 'fetch', 'Success');
          trace.addStep('Waiting Response', 'seamless.ts', 'fetchSeamlessToken', 'fetch', 'Started');
        }
        
        try {
          const r = await fetch(url, { method: "GET", headers, signal: ctrl.signal });
          clearTimeout(id);
          const txt = await r.text().catch(() => "");
          const responseHeaders: any = {};
          r.headers.forEach((value, key) => { responseHeaders[key] = value; });
          const requestForensics = buildRequestForensics(url, headers, timeout);
          const responseForensics = buildResponseForensics({ status: r.status, headers: responseHeaders, url: r.url });
          const redirectAnalyzer = buildRedirectAnalyzer({ status: r.status, headers: responseHeaders, url: r.url });
          const bodyAnalyzer = buildBodyAnalyzer({ status: r.status, headers: responseHeaders, url: r.url }, txt);
          const protection = detectServerProtection(txt, responseHeaders);
          const jsonDecision = jsonParserDecision(r.status, responseForensics.contentType, txt);
          const diffReport = networkDifferenceReport(requestForensics, responseForensics, bodyAnalyzer, protection);
          const rootCause = rootCauseAnalysis(protection, diffReport.mismatch, bodyAnalyzer);
          const debugData = {
            status: r.status,
            url,
            headers,
            responseHeaders,
            bodyPreview: txt.slice(0, 2000),
            REQUEST_FORENSICS: requestForensics,
            RESPONSE_FORENSICS: responseForensics,
            REDIRECT_REPORT: redirectAnalyzer,
            BODY_ANALYZER: bodyAnalyzer,
            SERVER_PROTECTION_DETECTOR: protection,
            JSON_PARSER_DECISION: jsonDecision,
            NETWORK_DIFFERENCE_REPORT: diffReport,
            ROOT_CAUSE_ANALYSIS: rootCause,
          };
          if (trace) {
             trace.logRequestEnd(reqIndex, r.status, txt.length);
             trace.addStep('Response Received', 'seamless.ts', 'fetchSeamlessToken', 'fetch', 'Success', { status: r.status });
             trace.addStep('RESPONSE FORENSICS', 'seamless.ts', 'fetchSeamlessToken', 'ForensicAnalyzer', r.status === 200 ? 'Success' : 'Failed', { status: r.status, contentType: responseForensics.contentType, bodyType: bodyAnalyzer.detectedType });
             trace.addStep('BODY ANALYZER', 'seamless.ts', 'fetchSeamlessToken', 'ForensicAnalyzer', 'Success', { detectedType: bodyAnalyzer.detectedType, bodyLength: bodyAnalyzer.bodyLength, htmlTitle: bodyAnalyzer.htmlInfo?.title || '' });
             trace.addStep('SERVER PROTECTION DETECTOR', 'seamless.ts', 'fetchSeamlessToken', 'ForensicAnalyzer', 'Success', protection);
             trace.addStep('JSON PARSER DECISION', 'seamless.ts', 'fetchSeamlessToken', 'ForensicAnalyzer', 'Success', jsonDecision);
             trace.addStep('ROOT CAUSE ANALYSIS', 'seamless.ts', 'fetchSeamlessToken', 'ForensicAnalyzer', 'Success', rootCause);
          }
          if (jsonDecision.shouldParse) {
            try {
              if (trace) trace.addStep('Parsing JSON', 'seamless.ts', 'fetchSeamlessToken', 'JSON.parse', 'Started');
              const d = JSON.parse(txt);
              if (d?.seamlessToken) {
                 if (trace) {
                   trace.addStep('Parsing JSON', 'seamless.ts', 'fetchSeamlessToken', 'JSON.parse', 'Success');
                   trace.addStep('Token Retrieved Successfully', 'seamless.ts', 'fetchSeamlessToken', 'fetchSeamlessToken', 'Success');
                 }
                 return { token: d.seamlessToken, msisdn: d?.msisdn ? String(d.msisdn) : null, debugRaw: debugData, traceId: trace?.traceId };
              } else {
                 if (trace) trace.addStep('Token Extraction Failed', 'seamless.ts', 'fetchSeamlessToken', 'JSON.parse', 'Failed', { reason: 'No seamlessToken in response', txt: txt.slice(0,50) });
                 return { token: null, msisdn: null, error: `Invalid format: ${txt.slice(0, 50)}`, debugRaw: debugData, traceId: trace?.traceId };
              }
            } catch (e: any) {
               if (trace) trace.addStep('Parsing JSON', 'seamless.ts', 'fetchSeamlessToken', 'JSON.parse', 'Failed', { error: e?.message });
               return { token: null, msisdn: null, error: `Parse error: ${e?.message} - ${txt.slice(0, 50)}`, debugRaw: debugData, traceId: trace?.traceId };
            }
          } else {
            if (trace) trace.addStep('Vodafone Connection Lost', 'seamless.ts', 'fetchSeamlessToken', 'fetch', 'Failed', { status: r.status, reason: jsonDecision.reason });
            return { token: null, msisdn: null, error: `HTTP ${r.status} - ${jsonDecision.reason} - ${txt.slice(0, 100)}`, debugRaw: debugData, traceId: trace?.traceId };
          }
        } catch (fetchErr: any) {
           clearTimeout(id);
           if (trace) {
             trace.logRequestEnd(reqIndex, 0, 0, fetchErr?.message);
             trace.addStep('Waiting Response', 'seamless.ts', 'fetchSeamlessToken', 'fetch', 'Failed', { error: fetchErr?.message });
           }
           throw fetchErr;
        }
      };
      return await doStandardFetch();
    }

  } catch (err: any) {
    if (trace) trace.addStep('Native fetch error', 'seamless.ts', 'fetchSeamlessToken', 'ExceptionBlock', 'Failed', { error: err?.message });
    return { token: null, msisdn: null, error: `Native fetch error: ${err?.message || 'Unknown'}`, debugRaw: { error: err?.message }, traceId: trace?.traceId };
  }
}
