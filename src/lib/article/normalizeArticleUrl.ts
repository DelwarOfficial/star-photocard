/**
 * Exact outbound allowlist: the only Star News hosts that serve articles and images
 * (verified Nov 2026; every other *.starnews.com.bd name does not resolve). A suffix
 * match would also trust any future, forgotten or taken-over subdomain.
 */
const STAR_NEWS_HOSTS: ReadonlySet<string> = new Set(['starnews.com.bd', 'www.starnews.com.bd']);

export function isStarNewsHost(hostname: string): boolean {
  return STAR_NEWS_HOSTS.has(normalizeHostname(hostname));
}

/** Only the default HTTPS port (443 normalises to ''), so no other service on the host is reachable. */
function hasDefaultPort(url: URL): boolean {
  return url.port === '';
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
  if (!hasDefaultPort(url)) throw new Error('INVALID_HOST');
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
  if (!hasDefaultPort(next)) throw new Error('REDIRECT_REJECTED');
  next.hash = '';
  return next;
}

/**
 * Star News article route: /<section>/<numeric id>/<slug>.html (optionally without the slug).
 * Only this shape is known to resolve from its short form /<section>/<id>.
 */
const ARTICLE_ROUTE = /^\/([a-z0-9-]+)\/(\d+)(?:\/[^/]+)?\/?$/iu;

/**
 * Short form of an article URL for the card's QR code: origin + section + ID, dropping
 * the slug, query and hash.
 *   https://starnews.com.bd/country/25819/some-long-slug.html → https://starnews.com.bd/country/25819
 * Any other route keeps its full URL (minus the hash), so a QR never points somewhere else.
 * Unparseable input is returned unchanged.
 */
export function shortArticleUrl(canonical: string): string {
  let url: URL;
  try {
    url = new URL(canonical);
  } catch {
    return canonical;
  }
  const article = url.pathname.match(ARTICLE_ROUTE);
  if (article) return `${url.origin}/${article[1]}/${article[2]}`;
  url.hash = '';
  return url.pathname === '/' && !url.search ? url.origin : url.href;
}
