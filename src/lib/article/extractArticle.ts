import { type Language } from '../../config/templates';
import { formatDhakaDate, parseArticleDate } from '../text/dates';
import { isStarNewsHost } from './normalizeArticleUrl';

export type DateSource = 'json-ld' | 'meta' | 'time' | 'fallback-now';

export type ArticleData = {
  title: string;
  publishedAt: string | null;
  formattedDate: string;
  dateSource: DateSource;
  language: Language;
  imageCandidates: string[];
  /** News category (e.g. "রংপুর"); null when none can be found reliably. */
  category: string | null;
  /** Canonical article URL; null when the page declares no usable one. */
  canonicalUrl: string | null;
};

const ARTICLE_TYPES = new Set(['article', 'newsarticle', 'reportagenewsarticle', 'blogposting']);
const MAX_JSON_NODES = 500;
const MAX_JSON_DEPTH = 8;
const PUBLISHER_SUFFIX = /\s*[|\-–—]\s*(?:the\s+)?(?:star\s*news(?:\.com\.bd)?|starnews\.com\.bd|স্টার\s*নিউজ)\s*$/iu;

export function extractArticle(html: string, url: URL, now = new Date()): ArticleData {
  const language = detectLanguage(html, url);
  const title = extractTitle(html);
  if (!title) throw new Error('MISSING_TITLE');
  const { date, source, iso } = extractDate(html, now);
  return {
    title,
    publishedAt: iso,
    formattedDate: formatDhakaDate(date, language),
    dateSource: source,
    language,
    imageCandidates: extractImageCandidates(html, url.href),
    category: extractCategory(html, url),
    canonicalUrl: extractCanonicalUrl(html, url),
  };
}

// --- Titles ---

export function extractTitle(html: string): string {
  const og = firstMetaContent(html, ['og:title']);
  const twitter = firstMetaContent(html, ['twitter:title']);
  const jsonHeadline = firstJsonLdHeadline(html);
  const docTitle = matchTag(html, 'title');
  const raw = og ?? twitter ?? jsonHeadline ?? docTitle ?? '';
  return cleanTitle(raw);
}

export function cleanTitle(raw: string): string {
  const decoded = decodeEntities(raw);
  // Remove only the publisher suffix ("Headline | Star News"); a "|" inside the
  // headline itself is editorial content and must survive.
  const withoutSuffix = decoded.replace(PUBLISHER_SUFFIX, '').trim();
  // Preserve newlines, collapse other whitespace runs minimally, strip controls.
  return withoutSuffix
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .join('\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

// --- Language ---

export function detectLanguage(html: string, url: URL): Language {
  if (url.pathname.toLowerCase().startsWith('/english')) return 'en';
  const locale = firstMetaContent(html, ['og:locale'])?.toLowerCase() ?? '';
  if (locale.startsWith('en')) return 'en';
  if (locale.startsWith('bn')) return 'bn';
  const htmlLang = html.match(/<html[^>]*\blang=["']([^"']*)["']/iu)?.[1]?.toLowerCase() ?? '';
  if (htmlLang.startsWith('en')) return 'en';
  if (htmlLang.startsWith('bn')) return 'bn';
  // Script heuristic: presence of Bengali block characters.
  const textSample = html.slice(0, 20000);
  if (/[\u0980-\u09FF]/.test(textSample)) return 'bn';
  return 'bn';
}

// --- Dates ---

function extractDate(html: string, now: Date): { date: Date; source: DateSource; iso: string | null } {
  const jsonDates = collectJsonLdDates(html);
  for (const candidate of jsonDates) {
    const parsed = parseArticleDate(candidate);
    if (parsed) return { date: parsed, source: 'json-ld', iso: parsed.toISOString() };
  }
  const meta = firstMetaContent(html, ['article:published_time']);
  if (meta) {
    const parsed = parseArticleDate(meta);
    if (parsed) return { date: parsed, source: 'meta', iso: parsed.toISOString() };
  }
  const timeTag = firstTimeDatetime(html);
  if (timeTag) {
    const parsed = parseArticleDate(timeTag);
    if (parsed) return { date: parsed, source: 'time', iso: parsed.toISOString() };
  }
  return { date: new Date(now), source: 'fallback-now', iso: null };
}

function firstTimeDatetime(html: string): string | null {
  const match = html.match(/<time[^>]*\bdatetime=["']([^"']+)["'][^>]*>/iu)?.[1];
  return match ? decodeEntities(match).trim() : null;
}

// --- Canonical URL ---

/**
 * <link rel="canonical">, then og:url. Only an https Star News URL is accepted
 * (it becomes the card's QR target); otherwise null and the caller falls back
 * to the final post-redirect URL.
 */
export function extractCanonicalUrl(html: string, pageUrl: URL): string | null {
  const candidates = [
    ...tagsWithAttr(html, 'link', 'rel', (rel) => rel.toLowerCase().split(/\s+/).includes('canonical')).map((tag) =>
      attr(tag, 'href'),
    ),
    firstMetaContent(html, ['og:url']),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const parsed = new URL(decodeEntities(raw).trim(), pageUrl);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) continue;
      if (!isStarNewsHost(parsed.hostname)) continue;
      parsed.hash = '';
      return parsed.href;
    } catch {
      continue;
    }
  }
  return null;
}

// --- Category ---

const MAX_CATEGORY_LENGTH = 40;

/**
 * Category priority: article:section meta → JSON-LD articleSection → the site
 * menu link (.mobile-menu-parent), accepted only when its path shares the
 * article's top-level section (article /country/25787/… → link under /country/).
 * The menu markup is site-wide, so unvalidated links would be random items.
 */
export function extractCategory(html: string, pageUrl: URL): string | null {
  const fromMeta = firstMetaContent(html, ['article:section']);
  const meta = cleanCategory(fromMeta);
  if (meta) return meta;
  const jsonLd = cleanCategory(firstJsonLdArticleSection(html));
  if (jsonLd) return jsonLd;
  return menuCategory(html, pageUrl);
}

function cleanCategory(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = decodeEntities(raw.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return Array.from(text).slice(0, MAX_CATEGORY_LENGTH).join('');
}

/** Top-level section of a path; Star News menu links end in .html ("/sports.html" ≙ "/sports/…"). */
function firstPathSegment(pathname: string): string {
  return (pathname.split('/').find(Boolean)?.toLowerCase() ?? '').replace(/\.html?$/u, '');
}

function menuCategory(html: string, pageUrl: URL): string | null {
  const section = firstPathSegment(pageUrl.pathname);
  if (!section) return null;
  const blocks = /<[^>]*\bclass=["'][^"']*\bmobile-menu-parent\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/giu;
  let match: RegExpExecArray | null;
  while ((match = blocks.exec(html)) !== null) {
    const anchor = (match[1] ?? '').match(/<a\b([^>]*)>([\s\S]*)$/iu);
    if (!anchor) continue;
    const href = attr(`<a ${anchor[1]}>`, 'href');
    if (!href) continue;
    let link: URL;
    try {
      link = new URL(decodeEntities(href), pageUrl);
    } catch {
      continue;
    }
    if (!isStarNewsHost(link.hostname)) continue;
    if (firstPathSegment(link.pathname) !== section) continue;
    const text = cleanCategory(anchor[2]);
    if (text) return text;
  }
  return null;
}

function firstJsonLdArticleSection(html: string): string | null {
  for (const block of jsonLdBlocks(html)) {
    let found: string | null = null;
    walkJsonLd(block, (node) => {
      if (found || !isArticleType(node)) return;
      const value = node.articleSection;
      const first = Array.isArray(value) ? value.find((v) => typeof v === 'string' && v.trim()) : value;
      if (typeof first === 'string' && first.trim()) found = first;
    });
    if (found) return found;
  }
  return null;
}

// --- Images ---

export function extractImageCandidates(html: string, articleUrl: string): string[] {
  const ordered: string[] = [];
  // 1-4. Meta images: og:image first (Star News' secure_url can lag behind it), then secure_url, twitter.
  for (const key of ['og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src']) {
    for (const value of allMetaContents(html, key)) ordered.push(value);
  }
  // 5. __NEXT_DATA__ mainImageFileName
  const nextData = extractNextDataImage(html);
  if (nextData) ordered.push(nextData);
  // 6. link[rel~=image_src]
  for (const href of extractImageSrcLinks(html)) ordered.push(href);
  // 7. Star News article markup
  for (const value of extractArticleMarkupImages(html)) ordered.push(value);
  // 8. JSON-LD article images
  for (const value of collectJsonLdImages(html)) ordered.push(value);

  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of ordered) {
    const normalized = normalizeImageUrl(candidate, articleUrl);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function normalizeImageUrl(imageUrl: unknown, articleUrl: string): string {
  if (typeof imageUrl !== 'string') return '';
  let value = decodeEntities(imageUrl).trim();
  if (!value) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) return '';
  if (value.startsWith('//')) value = `https:${value}`;
  else if (!/^https?:\/\//i.test(value)) {
    try {
      value = new URL(value, articleUrl).href;
    } catch {
      return '';
    }
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return '';
  }
  if (parsed.protocol !== 'https:') return '';
  if (parsed.username || parsed.password) return '';
  const host = parsed.hostname.toLowerCase().replace(/\.+$/u, '');
  if (!(host === 'starnews.com.bd' || host.endsWith('.starnews.com.bd'))) return '';
  parsed.hash = '';
  return parsed.href;
}

export function getBestSrcsetUrl(srcset: string): string {
  let best = '';
  let bestScore = -1;
  for (const candidate of srcset.split(',')) {
    const parts = candidate.trim().split(/\s+/);
    const url = parts[0] ?? '';
    const descriptor = parts[1] ?? '';
    if (!url) continue;
    let score = parseFloat(descriptor);
    if (Number.isNaN(score)) score = 0;
    if (descriptor.includes('x')) score *= 1000;
    if (score > bestScore) {
      best = url;
      bestScore = score;
    }
  }
  return best;
}

// --- Low-level HTML helpers (inert regex parsing; never executes scripts) ---

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function allMetaContents(html: string, key: string): string[] {
  const out: string[] = [];
  const pattern = new RegExp(`<meta\\s+[^>]*?(?:property|name)=["']${escapeRegExp(key)}["'][^>]*?>`, 'giu');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const content = match[0].match(/content=["']([^"']*)["']/iu)?.[1];
    if (content) out.push(decodeEntities(content).trim());
  }
  return out;
}

function firstMetaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const values = allMetaContents(html, key);
    if (values.length > 0 && values[0]!.trim()) return decodeEntities(values[0]!).trim();
  }
  return null;
}

function attr(tag: string, name: string): string | null {
  return tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'iu'))?.[1] ?? null;
}

function tagsWithAttr(html: string, tagName: string, attrName: string, test: (value: string) => boolean): string[] {
  const out: string[] = [];
  const pattern = new RegExp(`<${tagName}\\b[^>]*>`, 'giu');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const value = attr(match[0], attrName);
    if (value !== null && test(value)) out.push(match[0]);
  }
  return out;
}

function matchTag(html: string, tag: string): string | null {
  return html.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'iu'))?.[1] ?? null;
}

function extractNextDataImage(html: string): string | null {
  const block = html.match(/<script[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/iu)?.[1];
  if (!block) return null;
  try {
    const data: unknown = JSON.parse(block);
    const value = (data as Record<string, unknown> | null) !== null
      ? ((data as { props?: { pageProps?: { data?: { mainImageFileName?: unknown } } } }).props?.pageProps?.data
          ?.mainImageFileName ?? null)
      : null;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

function extractImageSrcLinks(html: string): string[] {
  const out: string[] = [];
  const pattern = /<link[^>]*>/giu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const tag = match[0];
    const rel = tag.match(/\brel=["']([^"']*)["']/iu)?.[1] ?? '';
    if (!rel.split(/\s+/).map((s) => s.toLowerCase()).includes('image_src')) continue;
    const href = tag.match(/\bhref=["']([^"']*)["']/iu)?.[1];
    if (href) out.push(href);
  }
  return out;
}

function extractArticleMarkupImages(html: string): string[] {
  const out: string[] = [];
  // Mirror legacy: #adf-overlay OR first .post_template-0 img.
  const overlay = html.match(/<[^>]*\bid=["']adf-overlay["'][^>]*>([\s\S]*?)<\/[^>]+>/iu)?.[1] ?? html;
  const postSection = html.match(
    /<[^>]*\bclass=["'][^"']*\bpost_template-0\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/iu,
  )?.[1];
  const scopes = [overlay, postSection].filter(Boolean) as string[];
  const imgPattern = /<img\b[^>]*>/giu;
  for (const scope of scopes) {
    let firstOnly = scope === postSection;
    let match: RegExpExecArray | null;
    imgPattern.lastIndex = 0;
    while ((match = imgPattern.exec(scope)) !== null) {
      const tag = match[0];
      // For post_template-0 legacy takes //img[1] (first img); overlay takes all.
      if (firstOnly && out.length > 0) break;
      for (const attr of ['src', 'data-src', 'data-lazy-src', 'data-original']) {
        const value = tag.match(new RegExp(`\\b${attr}=["']([^"']*)["']`, 'iu'))?.[1];
        if (value) out.push(value);
      }
      const srcset = tag.match(/\bsrcset=["']([^"']*)["']/iu)?.[1];
      if (srcset) {
        const best = getBestSrcsetUrl(srcset);
        if (best) out.push(best);
      }
      if (firstOnly) break;
    }
  }
  return out;
}

// --- JSON-LD ---

function jsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern = /<script[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const raw = (match[1] ?? '').trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // Malformed JSON-LD is ignored (legacy parity: continue after failures).
    }
  }
  return blocks;
}

function walkJsonLd(root: unknown, visit: (node: Record<string, unknown>) => void): void {
  let count = 0;
  const visitNode = (node: unknown, depth: number): void => {
    if (count > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) return;
    if (Array.isArray(node)) {
      for (const item of node) visitNode(item, depth + 1);
      return;
    }
    if (node && typeof node === 'object') {
      count += 1;
      visit(node as Record<string, unknown>);
      for (const value of Object.values(node as Record<string, unknown>)) {
        if (value && typeof value === 'object') visitNode(value, depth + 1);
      }
    }
  };
  visitNode(root, 0);
}

function isArticleType(node: Record<string, unknown>): boolean {
  const raw = node['@type'];
  const types = Array.isArray(raw) ? raw : [raw];
  return types.some((t) => typeof t === 'string' && ARTICLE_TYPES.has(t.toLowerCase()));
}

function firstJsonLdHeadline(html: string): string | null {
  for (const block of jsonLdBlocks(html)) {
    let found: string | null = null;
    walkJsonLd(block, (node) => {
      if (found || !isArticleType(node)) return;
      const headline = node.headline;
      if (typeof headline === 'string' && headline.trim()) found = headline;
    });
    if (found) return found;
  }
  return null;
}

function collectJsonLdDates(html: string): string[] {
  const out: string[] = [];
  for (const block of jsonLdBlocks(html)) {
    walkJsonLd(block, (node) => {
      if (!isArticleType(node)) return;
      for (const key of ['datePublished', 'dateCreated', 'uploadDate']) {
        const value = node[key];
        if (typeof value === 'string' && value.trim()) out.push(value.trim());
      }
    });
  }
  return out;
}

function collectJsonLdImages(html: string): string[] {
  const out: string[] = [];
  for (const block of jsonLdBlocks(html)) {
    walkJsonLd(block, (node) => {
      if (!isArticleType(node) || !('image' in node)) return;
      collectSchemaImageValues(node.image, out);
    });
  }
  return out;
}

function collectSchemaImageValues(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    if (value.trim()) out.push(value.trim());
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaImageValues(item, out);
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of ['url', 'contentUrl']) {
    if (typeof record[key] === 'string' && (record[key] as string).trim()) out.push((record[key] as string).trim());
  }
  for (const nested of Object.values(record)) {
    if (nested && (typeof nested === 'object' || typeof nested === 'string')) {
      if (nested === record.url || nested === record.contentUrl) continue;
      collectSchemaImageValues(nested, out);
    }
  }
}

export function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_m, code: string) => {
      const point = Number(code);
      if (!Number.isFinite(point) || point <= 0 || point > 0x10ffff) return _m;
      try {
        return String.fromCodePoint(point);
      } catch {
        return _m;
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, code: string) => {
      const point = parseInt(code, 16);
      if (!Number.isFinite(point)) return _m;
      try {
        return String.fromCodePoint(point);
      } catch {
        return _m;
      }
    });
}
