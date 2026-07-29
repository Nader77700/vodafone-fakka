import { CapacitorHttp, Capacitor } from '@capacitor/core';

export async function fetchSeamlessToken(clientId: string = "ana-vodafone-app-seamless"): Promise<{ token: string | null; msisdn: string | null; error?: string; debugRaw?: any }> {
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

    const timeout = 6000; // 6 seconds
    
    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.get({ url, headers, connectTimeout: timeout, readTimeout: timeout });
      const debugData = { status: response.status, url, headers, data: response.data };
      if (response.status === 200 && response.data) {
        const txt = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        try {
          const d = JSON.parse(txt);
          if (d?.seamlessToken) {
            return { token: d.seamlessToken, msisdn: d?.msisdn ? String(d.msisdn) : null, debugRaw: debugData };
          } else {
            return { token: null, msisdn: null, error: `Invalid format: ${txt.slice(0, 50)}`, debugRaw: debugData };
          }
        } catch(e: any) {
          return { token: null, msisdn: null, error: `Parse error: ${e?.message} - ${txt.slice(0, 50)}`, debugRaw: debugData };
        }
      } else {
         return { token: null, msisdn: null, error: `HTTP ${response.status} - ${JSON.stringify(response.data).slice(0, 50)}`, debugRaw: debugData };
      }
    } else {
      const ctrl = new AbortController();
      const id = setTimeout(() => ctrl.abort(), timeout);
      const r = await fetch(url, { method: "GET", headers, signal: ctrl.signal });
      clearTimeout(id);
      const txt = await r.text().catch(() => "");
      const debugData = { status: r.status, url, headers, responseText: txt.slice(0, 1000) };
      if (r.ok) {
        try {
          const d = JSON.parse(txt);
          if (d?.seamlessToken) {
             return { token: d.seamlessToken, msisdn: d?.msisdn ? String(d.msisdn) : null, debugRaw: debugData };
          } else {
             return { token: null, msisdn: null, error: `Invalid format: ${txt.slice(0, 50)}`, debugRaw: debugData };
          }
        } catch (e: any) {
           return { token: null, msisdn: null, error: `Parse error: ${e?.message} - ${txt.slice(0, 50)}`, debugRaw: debugData };
        }
      } else {
         return { token: null, msisdn: null, error: `HTTP ${r.status}`, debugRaw: debugData };
      }
    }
  } catch (err: any) {
    return { token: null, msisdn: null, error: `Fetch error: ${err?.message || 'Unknown'}`, debugRaw: { error: err?.message } };
  }
}
