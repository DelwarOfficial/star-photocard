import { describe, expect, it, vi } from 'vitest';
import {
  cleanTitle,
  detectLanguage,
  extractArticle,
  extractCanonicalUrl,
  extractCategory,
  extractImageCandidates,
  getBestSrcsetUrl,
  normalizeImageUrl,
} from '../../src/lib/article/extractArticle';
import { isRtvHost, isStarNewsHost, normalizeArticleUrl, resolveRedirect } from '../../src/lib/article/normalizeArticleUrl';
import { fetchArticleHtml, fetchImageBytes, probeImage, verifyImageSignature } from '../../src/lib/security/boundedFetch';
import { signImageUrl, verifyImageToken } from '../../src/lib/security/imageToken';

describe('Star News URL policy', () => {
  it.each(['starnews.com.bd', 'www.starnews.com.bd', 'english.starnews.com.bd'])('accepts %s', (host) => {
    expect(isStarNewsHost(host)).toBe(true);
  });
  it.each(['evilstarnews.com.bd', 'starnews.com.bd.evil.test', 'localhost', 'starnews.com.bd.'])(
    'handles %s',
    (host) => {
      // trailing-dot form normalizes to the root host and is accepted; lookalikes are rejected.
      const normalized = host.toLowerCase().replace(/\.+$/u, '');
      const expected = normalized === 'starnews.com.bd' || normalized.endsWith('.starnews.com.bd');
      expect(isStarNewsHost(host)).toBe(expected);
    },
  );
  it('keeps the legacy isRtvHost alias working', () => {
    expect(isRtvHost('www.starnews.com.bd')).toBe(true);
    expect(isRtvHost('evil.test')).toBe(false);
  });
  it('rejects credentials and HTTP', () => {
    expect(() => normalizeArticleUrl('https://user@starnews.com.bd/x')).toThrow();
    expect(() => normalizeArticleUrl('http://starnews.com.bd/x')).toThrow();
  });
  it('rejects redirect escapes and downgrades', () => {
    const current = new URL('https://www.starnews.com.bd/a');
    expect(() => resolveRedirect(current, 'https://evil.test/x')).toThrow();
    expect(() => resolveRedirect(current, 'http://www.starnews.com.bd/x')).toThrow();
    expect(() => resolveRedirect(current, 'https://user:pw@www.starnews.com.bd/x')).toThrow('REDIRECT_REJECTED');
    expect(resolveRedirect(current, '/english/x').href).toBe('https://www.starnews.com.bd/english/x');
  });
});

describe('article extraction', () => {
  it('extracts and formats an English article', () => {
    const result = extractArticle(
      '<meta property="og:title" content="Headline | Star News"><meta property="article:published_time" content="2026-09-04T00:00:00Z">',
      new URL('https://www.starnews.com.bd/english/story'),
    );
    expect(result.title).toBe('Headline');
    expect(result.language).toBe('en');
    expect(result.dateSource).toBe('meta');
  });

  it('prefers og:title, then twitter, then JSON-LD, then document title', () => {
    const html = [
      '<title>Doc Title</title>',
      '<script type="application/ld+json">{"@type":"NewsArticle","headline":"JSON Headline"}</script>',
      '<meta name="twitter:title" content="Twitter Title">',
      '<meta property="og:title" content="OG Title | Star News">',
    ].join('');
    expect(extractArticle(html, new URL('https://www.starnews.com.bd/x')).title).toBe('OG Title');
    expect(cleanTitle('A &amp; B | Star News')).toBe('A & B');
    expect(cleanTitle('শিরোনাম | স্টার নিউজ')).toBe('শিরোনাম');
    expect(cleanTitle('Headline - The Star News')).toBe('Headline');
    // A pipe that is part of the headline is kept.
    expect(cleanTitle('Budget 2026 | What changes for you')).toBe('Budget 2026 | What changes for you');
  });

  it('supports nested and @graph JSON-LD dates', () => {
    const html = `<meta property="og:title" content="Graph Title"><script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","datePublished":"2026-01-15T10:00:00+06:00"}]}</script>`;
    const result = extractArticle(html, new URL('https://www.starnews.com.bd/x'));
    expect(result.dateSource).toBe('json-ld');
    expect(result.publishedAt).toContain('2026-01-15');
  });

  it('falls back to now with provenance when date is missing', () => {
    const now = new Date('2026-09-05T00:00:00Z');
    const result = extractArticle('<meta property="og:title" content="T">', new URL('https://www.starnews.com.bd/x'), now);
    expect(result.dateSource).toBe('fallback-now');
    expect(result.publishedAt).toBeNull();
    expect(result.formattedDate).toBe('৫ সেপ্টেম্বর ২০২৬');
  });

  it('detects language from path, locale, then script', () => {
    expect(detectLanguage('', new URL('https://www.starnews.com.bd/english/x'))).toBe('en');
    expect(
      detectLanguage('<meta property="og:locale" content="en_US">', new URL('https://www.starnews.com.bd/x')),
    ).toBe('en');
    expect(detectLanguage('সংবাদ শিরোনাম', new URL('https://www.starnews.com.bd/x'))).toBe('bn');
  });

  it('orders image candidates and deduplicates', () => {
    const html = [
      '<meta property="og:image" content="https://www.starnews.com.bd/a.jpg">',
      '<meta property="og:image:secure_url" content="https://www.starnews.com.bd/secure.jpg">',
      '<meta property="og:image" content="https://www.starnews.com.bd/a.jpg">',
      '<link rel="image_src" href="/relative.jpg">',
    ].join('');
    const candidates = extractImageCandidates(html, 'https://www.starnews.com.bd/article');
    // og:image now outranks og:image:secure_url.
    expect(candidates.slice(0, 2)).toEqual(['https://www.starnews.com.bd/a.jpg', 'https://www.starnews.com.bd/secure.jpg']);
    expect(candidates).toContain('https://www.starnews.com.bd/relative.jpg');
    expect(new Set(candidates).size).toBe(candidates.length);
  });

  it('rejects non-Star News and non-https image URLs', () => {
    expect(normalizeImageUrl('https://evil.test/a.jpg', 'https://www.starnews.com.bd/x')).toBe('');
    expect(normalizeImageUrl('http://www.starnews.com.bd/a.jpg', 'https://www.starnews.com.bd/x')).toBe('');
    expect(normalizeImageUrl('//www.starnews.com.bd/a.jpg', 'https://www.starnews.com.bd/x')).toBe(
      'https://www.starnews.com.bd/a.jpg',
    );
  });

  it('picks the best srcset URL', () => {
    expect(getBestSrcsetUrl('a.jpg 400w, b.jpg 800w')).toBe('b.jpg');
    expect(getBestSrcsetUrl('a.jpg 1x, b.jpg 2x')).toBe('b.jpg');
  });

  it('recovers JSON-LD images from arrays and nested objects', () => {
    const html = `<script type="application/ld+json">{"@type":"Article","image":[{"url":"https://www.starnews.com.bd/json.jpg"}]}</script>`;
    expect(extractImageCandidates(html, 'https://www.starnews.com.bd/x')).toContain(
      'https://www.starnews.com.bd/json.jpg',
    );
  });
});

describe('bounded fetch', () => {
  function htmlResponse(body: string, headers: Record<string, string> = {}, status = 200): Response {
    return new Response(body, { status, headers: { 'content-type': 'text/html', ...headers } });
  }

  it('rejects redirect escapes', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://evil.test/' } }));
    await expect(
      fetchArticleHtml(new URL('https://www.starnews.com.bd/a'), { fetchImpl: fetchImpl as typeof fetch }),
    ).rejects.toThrow('REDIRECT_REJECTED');
  });

  it('detects redirect loops', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 302, headers: { location: 'https://www.starnews.com.bd/a' } }),
    );
    await expect(
      fetchArticleHtml(new URL('https://www.starnews.com.bd/a'), { fetchImpl: fetchImpl as typeof fetch }),
    ).rejects.toThrow('REDIRECT_LOOP');
  });

  it('enforces streamed byte caps', async () => {
    const big = 'x'.repeat(100);
    const fetchImpl = vi.fn(async () => htmlResponse(big));
    await expect(
      fetchArticleHtml(new URL('https://www.starnews.com.bd/a'), { maxBytes: 10, fetchImpl: fetchImpl as typeof fetch }),
    ).rejects.toThrow('RESPONSE_TOO_LARGE');
  });

  it('rejects bad MIME and status', async () => {
    const badMime = vi.fn(async () => htmlResponse('hi', { 'content-type': 'application/json' }));
    await expect(
      fetchArticleHtml(new URL('https://www.starnews.com.bd/a'), { fetchImpl: badMime as typeof fetch }),
    ).rejects.toThrow('UNSUPPORTED_CONTENT');
    const badStatus = vi.fn(async () => htmlResponse('hi', {}, 500));
    await expect(
      fetchArticleHtml(new URL('https://www.starnews.com.bd/a'), { fetchImpl: badStatus as typeof fetch }),
    ).rejects.toThrow('UPSTREAM_ERROR');
  });

  it('validates image magic bytes, not just MIME', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(verifyImageSignature(png, 'image/png')).toBe('image/png');
    const fake = new Uint8Array(16).fill(1);
    expect(verifyImageSignature(fake, 'image/png')).toBeNull();
    const okFetch = vi.fn(
      async () =>
        new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }),
    );
    const result = await fetchImageBytes(new URL('https://www.starnews.com.bd/a.png'), {
      fetchImpl: okFetch as typeof fetch,
    });
    expect(result.contentType).toBe('image/png');
    const badFetch = vi.fn(
      async () => new Response(fake, { status: 200, headers: { 'content-type': 'image/png' } }),
    );
    await expect(
      fetchImageBytes(new URL('https://www.starnews.com.bd/a.png'), { fetchImpl: badFetch as typeof fetch }),
    ).rejects.toThrow('UNSUPPORTED_IMAGE');
  });

  it('probes only the image head and cancels the rest of the body', async () => {
    const pngHead = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
    let pulls = 0;
    let cancelled = false;
    const streamFetch = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulls += 1;
          // First chunk carries the signature; later chunks would be the (large) remainder.
          controller.enqueue(pulls === 1 ? new Uint8Array([...pngHead, 1, 2, 3]) : new Uint8Array(64 * 1024));
        },
        cancel() {
          cancelled = true;
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'image/png' } });
    });
    const url = await probeImage(new URL('https://www.starnews.com.bd/a.png'), {
      fetchImpl: streamFetch as typeof fetch,
    });
    expect(url.href).toBe('https://www.starnews.com.bd/a.png');
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(2);

    const textFetch = vi.fn(
      async () => new Response(new Uint8Array(16).fill(1), { status: 200, headers: { 'content-type': 'image/png' } }),
    );
    await expect(
      probeImage(new URL('https://www.starnews.com.bd/a.png'), { fetchImpl: textFetch as typeof fetch }),
    ).rejects.toThrow('UNSUPPORTED_IMAGE');
    const offHost = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://evil.test/x.png' } }));
    await expect(
      probeImage(new URL('https://www.starnews.com.bd/a.png'), { fetchImpl: offHost as typeof fetch }),
    ).rejects.toThrow('REDIRECT_REJECTED');
  });
});

describe('image tokens', () => {
  it('signs, verifies, and rejects tampered tokens', async () => {
    const secret = 'test-secret-that-is-long-enough-123456';
    const token = await signImageUrl('https://www.starnews.com.bd/a.jpg', secret, 600);
    await expect(verifyImageToken(token, secret)).resolves.toMatchObject({
      url: 'https://www.starnews.com.bd/a.jpg',
    });
    await expect(verifyImageToken(`${token}x`, secret)).rejects.toThrow();
    const expired = await signImageUrl('https://www.starnews.com.bd/a.jpg', secret, -60);
    await expect(verifyImageToken(expired, secret)).rejects.toThrow('TOKEN_EXPIRED');
  });
});

describe('category, canonical URL and image priority', () => {
  const article = new URL('https://starnews.com.bd/country/25787/some-story');
  const menu = (href: string, text: string) =>
    `<li class="uc-parent"><div class="mobile-menu-parent"><a href="${href}">${text}</a></div></li>`;

  it('prefers article:section, then JSON-LD articleSection, then a validated menu link', () => {
    const jsonLd = '<script type="application/ld+json">{"@type":"NewsArticle","articleSection":["সারাদেশ","x"]}</script>';
    const menuLink = menu('https://starnews.com.bd/country', 'দেশ');
    expect(extractCategory(`<meta property="article:section" content="রাজনীতি">${jsonLd}${menuLink}`, article)).toBe('রাজনীতি');
    expect(extractCategory(`${jsonLd}${menuLink}`, article)).toBe('সারাদেশ');
    expect(extractCategory(menuLink, article)).toBe('দেশ');
  });

  it('skips site-wide menu links outside the article section', () => {
    const html = [
      menu('https://starnews.com.bd/division/rangpur', 'রংপুর'), // first menu item, wrong section
      menu('https://evil.test/country/x', 'ভুয়া'), // right path, wrong host
      menu('/country/dhaka', 'ঢাকা &amp; আশপাশ'), // relative, same section
    ].join('');
    expect(extractCategory(html, article)).toBe('ঢাকা & আশপাশ');
    expect(extractCategory(menu('https://starnews.com.bd/division/rangpur', 'রংপুর'), article)).toBeNull();
    // The brief's example: a /division/ article accepts the /division/rangpur link.
    expect(
      extractCategory(menu('https://starnews.com.bd/division/rangpur', 'রংপুর'), new URL('https://starnews.com.bd/division/123/x')),
    ).toBe('রংপুর');
  });

  it('matches the live site menu: multi-line markup and .html section links', () => {
    // Shape copied from starnews.com.bd (2026-10-09): menu links end in .html.
    const html = `
      <li class="uc-parent">
        <div class="mobile-menu-parent">
          <a href="https://starnews.com.bd/districts.html">সারা দেশ</a>
        </div>
      </li>
      <li class="uc-parent">
        <div class="mobile-menu-parent">
          <a href="https://starnews.com.bd/sports.html">
              খেলা
          </a>
          <button type="button" class="mobile-submenu-toggle" aria-label="খেলা উপবিভাগ"></button>
        </div>
      </li>`;
    expect(extractCategory(html, new URL('https://starnews.com.bd/sports/25803/story.html'))).toBe('খেলা');
    // /country/ articles have no /country menu link on the live site → no category.
    expect(extractCategory(html, new URL('https://starnews.com.bd/country/25807/story.html'))).toBeNull();
  });

  it('extracts the canonical URL: link rel=canonical, then og:url, else null', () => {
    const page = new URL('https://www.starnews.com.bd/amp/country/25787');
    expect(
      extractCanonicalUrl(
        '<link href="https://starnews.com.bd/country/25787/story" rel="canonical"><meta property="og:url" content="https://starnews.com.bd/og">',
        page,
      ),
    ).toBe('https://starnews.com.bd/country/25787/story');
    expect(extractCanonicalUrl('<meta property="og:url" content="/country/25787/story#top">', page)).toBe(
      'https://www.starnews.com.bd/country/25787/story',
    );
    // Off-site or insecure canonicals are ignored (the QR must stay on Star News).
    expect(extractCanonicalUrl('<link rel="canonical" href="https://evil.test/x">', page)).toBeNull();
    expect(extractCanonicalUrl('<link rel="canonical" href="http://starnews.com.bd/x">', page)).toBeNull();
    expect(extractCanonicalUrl('<p>none</p>', page)).toBeNull();
    const full = extractArticle('<meta property="og:title" content="T"><link rel="canonical" href="https://starnews.com.bd/c">', page);
    expect(full.canonicalUrl).toBe('https://starnews.com.bd/c');
    expect(full.category).toBeNull();
  });

  it('orders images og:image, og:image:secure_url, twitter:image, then the old fallbacks', () => {
    const html = [
      '<meta name="twitter:image:src" content="https://starnews.com.bd/5.jpg">',
      '<meta name="twitter:image" content="https://starnews.com.bd/4.jpg">',
      '<meta property="og:image:secure_url" content="https://starnews.com.bd/3.jpg">',
      '<meta property="og:image" content="https://starnews.com.bd/1.jpg">',
      '<link rel="image_src" href="https://starnews.com.bd/6.jpg">',
    ].join('');
    expect(extractImageCandidates(html, article.href)).toEqual([
      'https://starnews.com.bd/1.jpg',
      'https://starnews.com.bd/3.jpg',
      'https://starnews.com.bd/4.jpg',
      'https://starnews.com.bd/5.jpg',
      'https://starnews.com.bd/6.jpg',
    ]);
  });
});
