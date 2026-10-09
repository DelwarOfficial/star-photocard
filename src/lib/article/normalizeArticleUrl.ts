const ROOT_HOST = 'starnews.com.bd';

export function isStarNewsHost(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  return host === ROOT_HOST || host.endsWith(`.${ROOT_HOST}`);
}

/** Deprecated alias. Use {@link isStarNewsHost} instead. */
export const isRtvHost = isStarNewsHost;

export function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.+$/u, '');
}

/**
 * Accept only absolute https: URLs without credentials on the Star News
 * host (starnews.com.bd) or a true subdomain. Strips hash fragments. Throws
 * coded errors that map directly to API error codes.
 */
export function normalizeArticleUrl(input: string): URL {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('INVALID_URL');
  }
  if (url.protocol !== 'https:') throw new Error('INVALID_URL');
  if (url.username || url.password) throw new Error('INVALID_URL');
  if (!url.hostname) throw new Error('INVALID_URL');
  url.hostname = normalizeHostname(url.hostname);
  if (!isStarNewsHost(url.hostname)) throw new Error('INVALID_HOST');
  url.hash = '';
  return url;
}

/** Revalidate every redirect destination (scheme + exact host allowlist). */
export function resolveRedirect(current: URL, location: string): URL {
  let next: URL;
  try {
    next = new URL(location, current);
  } catch {
    throw new Error('REDIRECT_REJECTED');
  }
  if (next.protocol !== 'https:') throw new Error('REDIRECT_REJECTED');
  if (next.username || next.password) throw new Error('REDIRECT_REJECTED');
  next.hostname = normalizeHostname(next.hostname);
  if (!isStarNewsHost(next.hostname)) throw new Error('REDIRECT_REJECTED');
  next.hash = '';
  return next;
}
