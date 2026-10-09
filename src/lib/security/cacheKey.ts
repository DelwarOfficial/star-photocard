/** Privacy-conscious cache helpers. Keys are hashes; tokens never enter cache keys. */

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function articleCacheKey(canonicalUrl: string): string {
  return `article:${canonicalUrl.toLowerCase()}`;
}

export async function hashedArticleCacheKey(canonicalUrl: string): Promise<string> {
  return `article:${await sha256Hex(canonicalUrl.toLowerCase())}`;
}

export async function hashedImageCacheKey(canonicalUrl: string): Promise<string> {
  return `image:${await sha256Hex(canonicalUrl.toLowerCase())}`;
}

export async function matchCache(cache: Cache, key: string): Promise<Response | undefined> {
  try {
    return (await cache.match(key)) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function putCache(cache: Cache, key: string, response: Response): Promise<void> {
  try {
    await cache.put(key, response.clone());
  } catch {
    // Cache is best-effort; correctness must not depend on a hit.
  }
}

/** Parse a TTL var (seconds) from the Worker env; invalid or missing values use the fallback. */
export function ttlSeconds(raw: unknown, fallback: number): number {
  const value = typeof raw === 'string' ? Number(raw.trim()) : NaN;
  return Number.isInteger(value) && value > 0 && value <= 86_400 ? value : fallback;
}
