const TOKEN_VERSION = 'v1';
const DEFAULT_TTL_SECONDS = 600;

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function base64UrlDecode(input: string): Uint8Array<ArrayBuffer> {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/** Sign an approved image URL into a short-lived opaque token (URL digest + expiry + version). */
export async function signImageUrl(imageUrl: string, secret: string, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = JSON.stringify({ v: TOKEN_VERSION, url: imageUrl, exp });
  const payloadBytes = new TextEncoder().encode(payload);
  const key = await hmacKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, payloadBytes));
  return `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(signature)}`;
}

export type VerifiedImageToken = { url: string };

/** Verify signature + expiry with timing-safe Web Crypto verify. Returns approved URL. */
export async function verifyImageToken(token: string, secret: string): Promise<VerifiedImageToken> {
  const [encodedPayload, encodedSignature] = token.split('.');
  if (!encodedPayload || !encodedSignature) throw new Error('INVALID_TOKEN');
  let payloadBytes: Uint8Array<ArrayBuffer>;
  let signature: Uint8Array<ArrayBuffer>;
  try {
    payloadBytes = base64UrlDecode(encodedPayload);
    signature = base64UrlDecode(encodedSignature);
  } catch {
    throw new Error('INVALID_TOKEN');
  }
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify('HMAC', key, signature, payloadBytes);
  if (!valid) throw new Error('INVALID_TOKEN');
  let payload: { v?: unknown; url?: unknown; exp?: unknown };
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as typeof payload;
  } catch {
    throw new Error('INVALID_TOKEN');
  }
  if (payload.v !== TOKEN_VERSION || typeof payload.url !== 'string' || typeof payload.exp !== 'number') {
    throw new Error('INVALID_TOKEN');
  }
  if (!Number.isFinite(payload.exp) || payload.exp * 1000 < Date.now() - 30_000) throw new Error('TOKEN_EXPIRED');
  return { url: payload.url };
}

export function imageTokenTtlSeconds(): number {
  return DEFAULT_TTL_SECONDS;
}
