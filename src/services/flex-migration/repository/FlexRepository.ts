// src/services/flex-migration/repository/FlexRepository.ts
import { supabase } from '@/db/supabase';
import { LoginRequest } from '../models/FlexModels';
import { securityManager } from '@/lib/security';

export interface VFError {
  code?: string;
  reason?: string;
  message?: string;
  description?: string;
}

export interface VFResponse<T = any> {
  success: boolean;
  httpStatus: number;
  data?: T;
  error?: VFError;
  raw?: any;
}

/**
 * FlexRepository: The strict integration layer implementing the exact logic
 * from the official Vodafone python script.
 * No endpoints, headers, or payloads are changed.
 */
export class FlexRepository {
  
  static async proxyFetchRaw(targetUrl: string, method: string, headers: Record<string, string>, body?: string | object): Promise<Response> {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    
    // LAYER 6 & 7: Nonce & Signature
    const nonce = securityManager.generateNonce();
    const payloadForSig = JSON.stringify({ targetUrl, method, body: body ?? {} });
    const signature = await securityManager.signRequest(payloadForSig, nonce);
    const ztHeaders = securityManager.getSecurityHeaders(nonce, signature);
    
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/legacy-flex-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...ztHeaders
      },
      body: JSON.stringify({
        targetUrl,
        method,
        headers,
        body
      })
    });
    
    return res;
  }
  private static async parseResponse<T>(resp: Response): Promise<VFResponse<T>> {
    const status = resp.status;
    const text = await resp.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}

    let success = (status >= 200 && status < 300);
    
    // Vodafone APIs often return HTTP 200/201 with an error or failed state in the JSON body.
    if (json) {
      const state = (json.state || json.status || '').toLowerCase();
      
      if (
          state === 'failed' || 
          state === 'rejected' || 
          state === 'error' ||
          json.error !== undefined || 
          json.error_description !== undefined || 
          (json.code && json.code !== "0" && json.code !== 0 && json.code !== "200" && json.code !== "201") ||
          (json.reason && json.reason.toLowerCase().includes('error'))
      ) {
        success = false;
      }

      // Check orderItem state if present (TMF standard)
      if (Array.isArray(json.orderItem)) {
         const failedItem = json.orderItem.find((item: any) => {
            const itemState = (item.state || item.status || '').toLowerCase();
            return itemState === 'failed' || itemState === 'rejected';
         });
         if (failedItem) {
            success = false;
            // Elevate the nested error so it can be parsed
            if (!json.reason && !json.message && !json.description) {
               json.reason = failedItem.error?.reason || 'Order Item Failed';
               json.message = failedItem.error?.message || 'فشل تنفيذ الطلب داخلياً';
               json.description = failedItem.error?.description;
               json.code = failedItem.error?.code;
            }
         }
      }
    }
    
    return {
      success,
      httpStatus: status,
      data: json as T,
      error: (!success && json) ? {
        code: json.code || json.status,
        reason: json.reason || json.error,
        message: json.message,
        description: json.description || json.error_description || (typeof json.error === 'string' ? json.error : undefined)
      } : undefined,
      raw: json || text
    };
  }

  static async login(request: LoginRequest): Promise<VFResponse<{ access_token: string }>> {
    const url = "https://mobile.vodafone.com.eg/auth/realms/vf-realm/protocol/openid-connect/token";
    
    const payload = new URLSearchParams({
        "grant_type": "password",
        "username": request.msisdn,
        "password": request.password || '',
        "client_secret": "95fd95fb-7489-4958-8ae6-d31a525cd20a",
        "client_id": "ana-vodafone-app"
    }).toString();

    const headers = {
        "User-Agent": "okhttp/4.11.0",
        "Accept": "application/json",
        "silentLogin": "false",
        "x-agent-operatingsystem": "15",
        "Accept-Language": "ar",
        "x-agent-device": "HONOR ALI-NX1",
        "x-agent-version": "2025.11.1.1",
        "Content-Type": "application/x-www-form-urlencoded"
    };

    try {
        const resp = await this.proxyFetchRaw(url, 'POST', headers, payload);
        return await this.parseResponse<{ access_token: string }>(resp);
    } catch (e: any) {
        return { success: false, httpStatus: 0, error: { message: e.message } };
    }
  }

  static async get_eligible(phone: string, token: string): Promise<VFResponse<{ bundles: any[], originalData: any }>> {
    const url = new URL("https://mobile.vodafone.com.eg/services/dxl/epo/eligibleProductOffering");
    url.searchParams.append('customerAccountId', phone);
    url.searchParams.append('parts.customerAccount.type', "Consumer");
    url.searchParams.append('Accept-Language', "ar");
    url.searchParams.append('type', "Tarrifs");

    const headers = {
        'User-Agent': "okhttp/4.12.0",
        'Accept': "application/json",
        'api-host': "EligibleProductOfferingHost",
        'useCase': "Tarrifs",
        'Authorization': `Bearer ${token}`,
        'api-version': "v2",
        'device-id': "aba8140ecd392169",
        'x-agent-operatingsystem': "15",
        'clientId': "AnaVodafoneAndroid",
        'x-agent-device': "OPPO CPH2565",
        'x-agent-version': "2026.4.1",
        'x-agent-build': "1139",
        'msisdn': phone,
        'Content-Type': "application/json",
        'Accept-Language': "ar"
    };

    try {
        const resp = await this.proxyFetchRaw(url.toString(), 'GET', headers);
        const parsed = await this.parseResponse<any[]>(resp);
        
        const bundles: any[] = [];
        
        if (parsed.success && Array.isArray(parsed.data)) {
            for (const item of parsed.data) {
                const productOfferings = item.parts?.productOffering || [];
                for (const off of productOfferings) {
                    const info = { name: off.name || '', enc_id: null as string | null, prod_id: null as string | null, price: 0, rawOffering: off };
                    
                    for (const i of (off.id || [])) {
                        if (i.schemeName === "EncProductID") info.enc_id = i.value;
                        else if (i.schemeID === "ProductID") info.prod_id = i.value;
                    }
                    
                    for (const p of (off.price || [])) {
                        if (p.text === "mainFees") {
                            info.price = p.priceValue?.taxIncludedAmount?.value || 0;
                        }
                    }
                    
                    if (info.enc_id && info.prod_id) {
                        bundles.push(info);
                    }
                }
            }
        }
        
        return {
            ...parsed,
            data: { bundles, originalData: parsed.data }
        };
    } catch (e: any) {
        return { success: false, httpStatus: 0, error: { message: e.message } };
    }
  }

  static async activate_eligible(phone: string, token: string, bundle: any): Promise<VFResponse<any>> {
    const url = "https://mobile.vodafone.com.eg/services/dxl/pom/productOrder";
    
    const payload = {
        "channel": {"name": "MobileApp"},
        "orderItem": [{
            "action": "add",
            "product": {
                "encProductId": bundle.enc_id,
                "id": bundle.prod_id,
                "relatedParty": [{"id": phone, "name": "MSISDN", "role": "Subscriber"}]
            },
            "eCode": 0
        }],
        "@type": "flex"
    };

    const headers = {
        'Authorization': `Bearer ${token}`,
        'api-version': "v2",
        'api-host': "ProductOrderingManagement",
        'useCase': "Flex",
        'device-id': "aba8140ecd392169",
        'x-agent-operatingsystem': "15",
        'clientId': "AnaVodafoneAndroid",
        'x-agent-device': "OPPO CPH2565",
        'x-agent-version': "2026.4.1",
        'x-agent-build': "1139",
        'msisdn': phone,
        'Content-Type': "application/json",
        'Accept-Language': "ar",
        'User-Agent': "okhttp/4.12.0"
    };

    try {
        const resp = await this.proxyFetchRaw(url, 'POST', headers, payload);
        const parsed = await this.parseResponse(resp);
        return parsed;
    } catch (e: any) {
        return { success: false, httpStatus: 0, error: { message: e.message } };
    }
  }

  static async try_direct_acp(phone: string, token: string, bundle_id: string): Promise<VFResponse<any>> {
    const url = "https://mobile.vodafone.com.eg/services/dxl/pom/productOrder";
    
    const headers = {
        "api-host": "ProductOrderingManagement",
        "useCase": "FlexACPRenewal",
        "Authorization": `Bearer ${token}`,
        "api-version": "v2",
        "x-agent-operatingsystem": "16",
        "clientId": "AnaVodafoneAndroid",
        "x-agent-version": "2026.1.1",
        "x-agent-build": "1100",
        "msisdn": phone,
        "Accept": "application/json",
        "Accept-Language": "en",
        "Content-Type": "application/json; charset=UTF-8",
        "User-Agent": "okhttp/4.11.0"
    };

    const payload = {
        "channel": {"name": "MobileApp"},
        "orderItem": [{
            "action": "insert",
            "id": bundle_id,
            "product": {
                "characteristic": [
                    {"name": "PaymentMethod", "value": "ACP"},
                    {"name": "ACP", "value": "True"}
                ],
                "relatedParty": [{"id": phone, "name": "MSISDN", "role": "Subscriber"}]
            },
            "eCode": 0
        }],
        "@type": "FlexACPRenewal"
    };

    let lastResp: VFResponse<any> | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const resp = await this.proxyFetchRaw(url, 'POST', headers, payload);
            const parsed = await this.parseResponse(resp);
            lastResp = parsed;

            if (parsed.success) {
                return parsed;
            }
            // wait 2 seconds
            await new Promise(r => setTimeout(r, 2000));
        } catch (e: any) {
            lastResp = { success: false, httpStatus: 0, error: { message: e.message } };
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    return lastResp || { success: false, httpStatus: 0, error: { message: 'Failed after retries' } };
  }
}
