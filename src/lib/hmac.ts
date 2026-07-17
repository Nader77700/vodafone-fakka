// دالة لتوليد توقيع تشفيري للطلبات (HMAC-SHA256)
export const generateRequestSignature = async (): Promise<{ signature: string; timestamp: string }> => {
  const secret = 'VodafoneFakkaPremium2024SecureHMACKey_V9';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(timestamp);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  const signatureHex = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return { signature: signatureHex, timestamp };
};
