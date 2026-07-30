import { CapacitorHttp, Capacitor } from '@capacitor/core';
import type { DiagnosticTrace } from './DiagnosticTrace';

// Remove sensitive info from headers for logging
function sanitizeHeaders(headers: any) {
  const safe = { ...headers };
  if (safe['Authorization']) safe['Authorization'] = 'Bearer [HIDDEN]';
  return safe;
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
      
      let reqIndex = -1;
      if (trace) {
        reqIndex = trace.logRequestStart('GET', url.split('?')[0] + '?params=[HIDDEN]', sanitizeHeaders(headers), 'No Body', timeout);
        trace.addStep('HTTP Request Sent', 'seamless.ts', 'fetchSeamlessToken', 'CapacitorHttp.get', 'Success');
        trace.addStep('Waiting Response', 'seamless.ts', 'fetchSeamlessToken', 'CapacitorHttp.get', 'Started');
      }

      try {
        const response = await CapacitorHttp.get({ url, headers, connectTimeout: timeout, readTimeout: timeout });
        
        if (trace) {
           const size = response.data ? (typeof response.data === 'string' ? response.data.length : JSON.stringify(response.data).length) : 0;
           trace.logRequestEnd(reqIndex, response.status, size);
           trace.addStep('Response Received', 'seamless.ts', 'fetchSeamlessToken', 'CapacitorHttp.get', 'Success', { status: response.status });
        }
        
        const debugData = { status: response.status, url, headers, data: response.data };
        if (response.status === 200 && response.data) {
          if (trace) trace.addStep('Parsing JSON', 'seamless.ts', 'fetchSeamlessToken', 'JSON.parse', 'Started');
          const txt = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
          try {
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
          } catch(e: any) {
            if (trace) trace.addStep('Parsing JSON', 'seamless.ts', 'fetchSeamlessToken', 'JSON.parse', 'Failed', { error: e?.message });
            return { token: null, msisdn: null, error: `Parse error: ${e?.message} - ${txt.slice(0, 50)}`, debugRaw: debugData, traceId: trace?.traceId };
          }
        } else {
           if (trace) trace.addStep('Vodafone Connection Lost', 'seamless.ts', 'fetchSeamlessToken', 'CapacitorHttp.get', 'Failed', { status: response.status });
           return { token: null, msisdn: null, error: `HTTP ${response.status} - ${JSON.stringify(response.data).slice(0, 50)}`, debugRaw: debugData, traceId: trace?.traceId };
        }
      } catch (httpErr: any) {
        if (trace) {
          trace.logRequestEnd(reqIndex, 0, 0, httpErr?.message);
          trace.addStep('Waiting Response', 'seamless.ts', 'fetchSeamlessToken', 'CapacitorHttp.get', 'Failed', { error: httpErr?.message });
          if (httpErr?.message?.includes('timeout') || httpErr?.message?.includes('timed out')) {
            trace.addStep('Vodafone Connection Lost', 'seamless.ts', 'fetchSeamlessToken', 'CapacitorHttp.get', 'Failed', { reason: 'Timeout' });
          }
        }
        throw httpErr;
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
          if (trace) {
             trace.logRequestEnd(reqIndex, r.status, txt.length);
             trace.addStep('Response Received', 'seamless.ts', 'fetchSeamlessToken', 'fetch', 'Success', { status: r.status });
          }
          const debugData = { status: r.status, url, headers, responseText: txt.slice(0, 1000) };
          if (r.ok) {
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
             if (trace) trace.addStep('Vodafone Connection Lost', 'seamless.ts', 'fetchSeamlessToken', 'fetch', 'Failed', { status: r.status });
             return { token: null, msisdn: null, error: `HTTP ${r.status}`, debugRaw: debugData, traceId: trace?.traceId };
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
