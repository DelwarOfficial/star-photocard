import { resolveRedirect } from '../article/normalizeArticleUrl';

export const HTML_MAX_BYTES = 2 * 1024 * 1024;
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_REDIRECTS = 3;

const HTML_UA = 'Star News Photocard/1.0 (+https://starnews.com.bd/)';

/** truncated: the page exceeded the byte cap and only its first maxBytes (with a complete <head>) were read. */
export type FetchedHtml = { url: URL; html: string; bytes: number; redirects: number; truncated: boolean };
export type FetchedImage = { bytes: Uint8Array; contentType: string; url: URL };

/**
 * Workers-native bounded fetch. Manual redirects, per-hop hostname
 * revalidation, abort timeouts and streamed byte caps. Content-Length is
 * only an early hint; the stream is always enforced.
 *
 * NOTE (honest Workers limitation): Workers fetch does not expose portable
 * connected-IP/DNS pinning, so DNS-rebinding IP checks from Node are not
 * available. Protection rests on the exact Star News (starnews.com.bd) allowlist applied
 * at every hop plus Cloudflare network controls. Documented in README and
 * the parity ledger.
 */
export async function fetchArticleHtml(
  startUrl: URL,
  options: { maxBytes?: number; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<FetchedHtml> {
  const maxBytes = options.maxBytes ?? HTML_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  let url = startUrl;
  const visited = new Set<string>();
  let redirects = 0;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (visited.has(url.href)) throw new Error('REDIRECT_LOOP');
    visited.add(url.href);
    const response = await fetchImpl(url.href, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': HTML_UA },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || hop === MAX_REDIRECTS) throw new Error('REDIRECT_REJECTED');
      await response.body?.cancel().catch(() => undefined);
      url = resolveRedirect(url, location);
      redirects += 1;
      continue;
    }
    if (!response.ok) throw new Error('UPSTREAM_ERROR');
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    if (!contentType.includes('text/html')) throw new Error('UNSUPPORTED_CONTENT');
    // Article pages can embed multi-MB base64 images in the body, but everything we extract
    // (canonical, og:image, menu, JSON-LD) sits near the top. Read at most maxBytes — memory stays
    // bounded — and accept a cut-off page only if its <head> arrived complete.
    const { bytes, truncated } = await readPrefixBytes(response, maxBytes);
    const html = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (truncated && !/<\/head\s*>/i.test(html)) throw new Error('RESPONSE_TOO_LARGE');
    return { url, html, bytes: bytes.byteLength, redirects, truncated };
  }
  throw new Error('REDIRECT_REJECTED');
}

/** Read up to maxBytes of a body; beyond that, stop (cancel the stream) and report truncation. */
async function readPrefixBytes(response: Response, maxBytes: number): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('EMPTY_RESPONSE');
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const take = Math.min(value.byteLength, maxBytes - total);
      chunks.push(take === value.byteLength ? value : value.subarray(0, take));
      total += take;
      if (take < value.byteLength) truncated = true;
    }
    if (total >= maxBytes && !truncated) {
      // Exactly at the cap: one more read tells us whether anything was left over.
      const { done, value } = await reader.read();
      truncated = !done && !!value && value.byteLength > 0;
    }
    if (truncated) await reader.cancel().catch(() => undefined);
  } finally {
    reader.releaseLock();
  }
  if (total === 0) throw new Error('EMPTY_RESPONSE');
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes: merged, truncated };
}

type ImageFetchOptions = { maxBytes?: number; timeoutMs?: number; fetchImpl?: typeof fetch };

export async function fetchImageBytes(startUrl: URL, options: ImageFetchOptions = {}): Promise<FetchedImage> {
  const maxBytes = options.maxBytes ?? IMAGE_MAX_BYTES;
  const { response, rawType, url } = await openImage(startUrl, options);
  const bytes = await readBoundedBytes(response, maxBytes);
  const verified = verifyImageSignature(bytes, rawType);
  if (!verified) throw new Error('UNSUPPORTED_IMAGE');
  return { bytes, contentType: verified, url };
}

/** Bytes needed to recognise every allowed image signature. */
const SIGNATURE_BYTES = 12;

/**
 * Cheap candidate check: same redirect/host/MIME/size policy as fetchImageBytes,
 * but reads only the magic bytes and cancels the rest of the body. /api/image
 * still performs the full bounded download and verification when serving.
 */
export async function probeImage(startUrl: URL, options: ImageFetchOptions = {}): Promise<URL> {
  const { response, rawType, url } = await openImage(startUrl, options);
  const head = await readHeadBytes(response, SIGNATURE_BYTES);
  if (!verifyImageSignature(head, rawType)) throw new Error('UNSUPPORTED_IMAGE');
  return url;
}

async function openImage(
  startUrl: URL,
  options: ImageFetchOptions,
): Promise<{ response: Response; rawType: string; url: URL }> {
  const maxBytes = options.maxBytes ?? IMAGE_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  let url = startUrl;
  const visited = new Set<string>();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (visited.has(url.href)) throw new Error('REDIRECT_LOOP');
    visited.add(url.href);
    const response = await fetchImpl(url.href, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'image/jpeg,image/png,image/gif,image/webp', 'user-agent': HTML_UA },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || hop === MAX_REDIRECTS) throw new Error('REDIRECT_REJECTED');
      await response.body?.cancel().catch(() => undefined);
      url = resolveRedirect(url, location);
      continue;
    }
    if (!response.ok) throw new Error('UPSTREAM_ERROR');
    const rawType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    if (!isAllowedImageMime(rawType)) throw new Error('UNSUPPORTED_IMAGE');
    const hinted = Number(response.headers.get('content-length'));
    if (Number.isFinite(hinted) && hinted > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error('RESPONSE_TOO_LARGE');
    }
    return { response, rawType, url };
  }
  throw new Error('REDIRECT_REJECTED');
}

async function readHeadBytes(response: Response, count: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('EMPTY_RESPONSE');
  const head = new Uint8Array(count);
  let filled = 0;
  try {
    while (filled < count) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const take = Math.min(value.byteLength, count - filled);
      head.set(value.subarray(0, take), filled);
      filled += take;
    }
    await reader.cancel().catch(() => undefined);
  } finally {
    reader.releaseLock();
  }
  if (filled === 0) throw new Error('EMPTY_RESPONSE');
  return head.subarray(0, filled);
}

async function readBoundedBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('EMPTY_RESPONSE');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new Error('RESPONSE_TOO_LARGE');
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) throw new Error('EMPTY_RESPONSE');
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export function isAllowedImageMime(mime: string): boolean {
  return ALLOWED_IMAGE_MIMES.has(mime.toLowerCase());
}

/** Verify magic bytes; returns canonical MIME or null. Never trust declared MIME alone. */
export function verifyImageSignature(bytes: Uint8Array, declared: string): string | null {
  if (bytes.length < 12) return null;
  const declaredLower = declared.toLowerCase();
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return declaredLower === 'image/jpeg' ? 'image/jpeg' : 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  // GIF: GIF87a / GIF89a
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return 'image/gif';
  }
  // WebP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}
