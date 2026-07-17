import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { zeroTrustCheck, CORS_HEADERS } from "../_shared/zero_trust.ts";

const ALLOWED_TARGET_HOSTS = [
  'web.vodafone.com.eg',
  'api.vodafone.com.eg',
  'services.vodafone.com.eg',
  'vfeg.auth0.com'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // ── Zero Trust Check (Layer 1-15) ──
    const zt = await zeroTrustCheck(req);
    if (zt.error) {
       return new Response(JSON.stringify({ error: zt.error }), {
          status: zt.status,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
       });
    }

    const { targetUrl, method, headers, body } = await req.json();

    if (!targetUrl) {
      throw new Error('targetUrl is required');
    }

    // SSRF Prevention: Enforce allowed hosts
    const targetUrlObj = new URL(targetUrl);
    if (!ALLOWED_TARGET_HOSTS.some(host => targetUrlObj.hostname.endsWith(host))) {
       throw new Error('Invalid target URL host');
    }

    const fetchOptions: RequestInit = {
      method: method || 'GET',
      headers: headers || {},
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const responseText = await response.text();

    return new Response(responseText, {
      status: response.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': response.headers.get('Content-Type') || 'application/json'
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
});