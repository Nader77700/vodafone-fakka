// دالة لتوليد توقيع تشفيري للطلبات (HMAC-SHA256)
export const generateRequestSignature = async (): Promise<{ signature: string; timestamp: string }> => {
  const secret = 'VodafoneFakkaPremium2026_V10_ULTRA_SECURE';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const fallbackSignature = 'fallback_signature_timeout';
  
  if (!crypto || !crypto.subtle) {
    return { signature: fallbackSignature, timestamp };
  }

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(timestamp);

  try {
    // 500ms timeout for crypto operations to prevent hanging on broken Android WebViews
    const cryptoPromise = (async () => {
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
      const signatureArray = Array.from(new Uint8Array(signatureBuffer));
      return signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
    })();

    const signatureHex = await Promise.race([
      cryptoPromise,
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('crypto timeout')), 500))
    ]);

    return { signature: signatureHex, timestamp };
  } catch (err) {
    console.warn('[Security] Crypto signature failed or timed out, using fallback', err);
    return { signature: fallbackSignature, timestamp };
  }
};
