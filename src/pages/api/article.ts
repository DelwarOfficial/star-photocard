import type { APIRoute } from 'astro';
import { z } from 'zod';
import { extractArticle } from '../../lib/article/extractArticle';
import { normalizeArticleUrl } from '../../lib/article/normalizeArticleUrl';
import { fetchArticleHtml, probeImage } from '../../lib/security/boundedFetch';
import { hashedArticleCacheKey, matchCache, putCache, ttlSeconds } from '../../lib/security/cacheKey';
import { imageTokenTtlSeconds, signImageUrl } from '../../lib/security/imageToken';

export const prerender = false;

const MAX_IMAGE_PROBES = 4;
const IMAGE_PROBE_TIMEOUT_MS = 5_000;

const requestSchema = z.object({ url: z.string().trim().min(1).max(2048) }).strict();

const messages: Record<string, readonly [string, string, number]> = {
  INVALID_URL: ['INVALID_URL', 'Enter a valid secure (https) article URL.', 400],
  INVALID_HOST: ['INVALID_HOST', 'Only Star News article URLs are supported.', 403],
  INVALID_REQUEST: ['INVALID_REQUEST', 'Enter a valid article URL.', 400],
  REDIRECT_LOOP: ['REDIRECT_REJECTED', 'The article redirect was rejected.', 502],
  REDIRECT_REJECTED: ['REDIRECT_REJECTED', 'The article redirect was rejected.', 502],
  RESPONSE_TOO_LARGE: ['RESPONSE_TOO_LARGE', 'The article response is too large.', 413],
  UNSUPPORTED_CONTENT: ['UNSUPPORTED_CONTENT', 'The URL did not return an HTML article.', 415],
  UNSUPPORTED_IMAGE: ['UPSTREAM_ERROR', 'The article could not be loaded.', 502],
  MISSING_TITLE: ['MISSING_TITLE', 'No usable article headline was found.', 422],
  EMPTY_RESPONSE: ['EMPTY_RESPONSE', 'The article returned no content.', 502],
  UPSTREAM_ERROR: ['UPSTREAM_ERROR', 'The article could not be loaded.', 502],
  RATE_LIMITED: ['RATE_LIMITED', 'Too many requests. Try again shortly.', 429],
};

function failure(code: string, message: string, status: number, requestId: string): Response {
  return Response.json({ error: { code, message, requestId } }, { status, headers: { 'cache-control': 'no-store' } });
}

function mapError(error: unknown): readonly [string, string, number] {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return ['UPSTREAM_TIMEOUT', 'The article request timed out.', 504];
  }
  if (error instanceof Error && (error.name === 'TimeoutError' || error.message.includes('timeout'))) {
    return ['UPSTREAM_TIMEOUT', 'The article request timed out.', 504];
  }
  const code = error instanceof Error ? error.message : 'UPSTREAM_ERROR';
  return messages[code] ?? ['UPSTREAM_ERROR', 'The article could not be loaded.', 502];
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  // Cloudflare Workers runtime env (Astro v6+/adapter v13+ removed locals.runtime).
  let workerEnv: Record<string, unknown> = {};
  try {
    const mod = (await import('cloudflare:workers').catch(() => null)) as {
      env?: Record<string, unknown>;
    } | null;
    if (mod?.env) workerEnv = mod.env;
  } catch {
    workerEnv = {};
  }
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failure('INVALID_REQUEST', 'Enter a valid article URL.', 400, requestId);
    }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return failure('INVALID_REQUEST', 'Enter a valid article URL.', 400, requestId);

    const startUrl = normalizeArticleUrl(parsed.data.url);

    // Rate limit before expensive upstream work (abuse protection, not exact accounting).
    try {
      const limiter = workerEnv.ARTICLE_RATE_LIMITER as
        | { limit?: (opts: { key: string }) => Promise<{ success: boolean }> }
        | undefined;
      if (limiter?.limit) {
        const clientIp = request.headers.get('cf-connecting-ip') ?? clientAddress ?? 'unknown';
        const result = await limiter.limit({ key: `article:${clientIp}` });
        if (!result.success) return failure('RATE_LIMITED', 'Too many requests. Try again shortly.', 429, requestId);
      }
    } catch {
      // Limiter failures must not break the endpoint; continue with logging.
    }

    const secret = typeof workerEnv.IMAGE_TOKEN_SECRET === 'string' ? workerEnv.IMAGE_TOKEN_SECRET : '';

    // Short-lived metadata cache (best-effort, token-free hashed key).
    const cacheKey = await hashedArticleCacheKey(startUrl.href);
    let cache: Cache | undefined;
    try {
      cache = await caches.open('star-photocard-article-v1');
      const hit = await matchCache(cache, cacheKey);
      if (hit) {
        const payload = (await hit.json()) as { data?: Record<string, unknown> };
        if (payload?.data) {
          return Response.json({ data: payload.data }, { headers: { 'cache-control': 'no-store' } });
        }
      }
    } catch {
      cache = undefined;
    }

    const fetched = await fetchArticleHtml(startUrl);
    const article = extractArticle(fetched.html, fetched.url);

    // Probe image candidates in order (headers + magic bytes only); first valid wins.
    // /api/image does the full bounded download when the client requests it.
    let imageUrl: string | undefined;
    for (const candidate of article.imageCandidates.slice(0, MAX_IMAGE_PROBES)) {
      try {
        await probeImage(new URL(candidate), { timeoutMs: IMAGE_PROBE_TIMEOUT_MS });
        if (secret.length >= 32) {
          const token = await signImageUrl(candidate, secret);
          imageUrl = `/api/image?token=${encodeURIComponent(token)}`;
        } else {
          // Without a signing secret (local dev), expose nothing cross-origin; client falls back.
          imageUrl = undefined;
        }
        break;
      } catch {
        continue;
      }
    }

    const data = {
      canonicalUrl: fetched.url.href,
      title: article.title,
      publishedAt: article.publishedAt,
      formattedDate: article.formattedDate,
      dateSource: article.dateSource,
      language: article.language,
      ...(imageUrl ? { imageUrl } : {}),
    };

    // Cached payloads carry a signed image link; never cache longer than that link lives.
    const articleCacheTtl = Math.min(ttlSeconds(workerEnv.ARTICLE_CACHE_TTL_SECONDS, 300), imageTokenTtlSeconds());
    if (cache) {
      await putCache(
        cache,
        cacheKey,
        new Response(JSON.stringify({ data }), {
          headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${articleCacheTtl}` },
        }),
      );
    }

    console.log(
      JSON.stringify({
        requestId,
        event: 'article_ok',
        redirects: fetched.redirects,
        bytes: fetched.bytes,
        ms: Date.now() - startedAt,
      }),
    );

    return Response.json({ data }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const [code, message, status] = mapError(error);
    console.error(JSON.stringify({ requestId, code, ms: Date.now() - startedAt }));
    return failure(code, message, status, requestId);
  }
};
