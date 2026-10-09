import type { APIRoute } from 'astro';
import { z } from 'zod';
import { enforceRateLimit, readBoundedJson } from '../../lib/security/requestLimits';
import { S } from '../../lib/i18n/strings';
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
  INVALID_URL: ['INVALID_URL', S.api.invalidUrl, 400],
  INVALID_HOST: ['INVALID_HOST', S.api.invalidHost, 403],
  REQUEST_TOO_LARGE: ['REQUEST_TOO_LARGE', 'The request body is too large.', 413],
  INVALID_REQUEST: ['INVALID_REQUEST', S.api.invalidRequest, 400],
  REDIRECT_LOOP: ['REDIRECT_REJECTED', S.api.redirectRejected, 502],
  REDIRECT_REJECTED: ['REDIRECT_REJECTED', S.api.redirectRejected, 502],
  RESPONSE_TOO_LARGE: ['RESPONSE_TOO_LARGE', S.api.tooLarge, 413],
  UNSUPPORTED_CONTENT: ['UNSUPPORTED_CONTENT', S.api.notHtml, 415],
  UNSUPPORTED_IMAGE: ['UPSTREAM_ERROR', S.api.loadFailed, 502],
  MISSING_TITLE: ['MISSING_TITLE', S.api.missingTitle, 422],
  EMPTY_RESPONSE: ['EMPTY_RESPONSE', S.api.empty, 502],
  UPSTREAM_ERROR: ['UPSTREAM_ERROR', S.api.loadFailed, 502],
  RATE_LIMITED: ['RATE_LIMITED', S.api.rateLimited, 429],
};

function failure(code: string, message: string, status: number, requestId: string): Response {
  return Response.json({ error: { code, message, requestId } }, { status, headers: { 'cache-control': 'no-store' } });
}

function mapError(error: unknown): readonly [string, string, number] {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return ['UPSTREAM_TIMEOUT', S.api.timeout, 504];
  }
  if (error instanceof Error && (error.name === 'TimeoutError' || error.message.includes('timeout'))) {
    return ['UPSTREAM_TIMEOUT', S.api.timeout, 504];
  }
  const code = error instanceof Error ? error.message : 'UPSTREAM_ERROR';
  return messages[code] ?? ['UPSTREAM_ERROR', S.api.loadFailed, 502];
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
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
  return handleArticle(request, clientAddress, workerEnv);
};

export async function handleArticle(request: Request, clientAddress: string | undefined, workerEnv: Record<string, unknown>): Promise<Response> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  try {
    const limited = await enforceRateLimit(workerEnv.ARTICLE_RATE_LIMITER,
      'article:' + (request.headers.get('cf-connecting-ip') ?? clientAddress ?? 'unknown'), requestId);
    if (limited) return limited;
    const body = await readBoundedJson(request);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return failure('INVALID_REQUEST', S.api.invalidRequest, 400, requestId);
    const startUrl = normalizeArticleUrl(parsed.data.url);

    const secret = typeof workerEnv.IMAGE_TOKEN_SECRET === 'string' ? workerEnv.IMAGE_TOKEN_SECRET : '';

    // Short-lived metadata cache (best-effort, token-free hashed key).
    const cacheKey = await hashedArticleCacheKey(startUrl.href, new URL(request.url).origin);
    let cache: Cache | undefined;
    try {
      cache = await caches.open('star-photocard-article-v2');
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
    // Images are served only through signed /api/image links. Without the secret the
    // article photo cannot be delivered; say so explicitly instead of "no image found".
    const signingReady = secret.length >= 32;
    let imageNotice: 'signing-unconfigured' | undefined;
    if (!signingReady) {
      if (article.imageCandidates.length > 0) {
        imageNotice = 'signing-unconfigured';
        console.warn(JSON.stringify({ requestId, event: 'image_signing_unconfigured', hint: 'set IMAGE_TOKEN_SECRET (≥32 chars) in .dev.vars or as a Worker secret' }));
      }
    } else {
      for (const candidate of article.imageCandidates.slice(0, MAX_IMAGE_PROBES)) {
        try {
          await probeImage(new URL(candidate), { timeoutMs: IMAGE_PROBE_TIMEOUT_MS });
          const token = await signImageUrl(candidate, secret);
          imageUrl = `/api/image?token=${encodeURIComponent(token)}`;
          break;
        } catch {
          continue;
        }
      }
    }

    const data = {
      // <link rel=canonical> → og:url → final post-redirect URL. The editor's QR encodes this.
      canonicalUrl: article.canonicalUrl ?? fetched.url.href,
      category: article.category,
      title: article.title,
      publishedAt: article.publishedAt,
      formattedDate: article.formattedDate,
      dateSource: article.dateSource,
      language: article.language,
      ...(imageUrl ? { imageUrl } : {}),
      ...(imageNotice ? { imageNotice } : {}),
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
}
