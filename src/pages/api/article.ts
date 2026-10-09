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
  INVALID_URL: ['INVALID_URL', 'সঠিক নিরাপদ (https) সংবাদের লিংক দিন।', 400],
  INVALID_HOST: ['INVALID_HOST', 'শুধু স্টার নিউজের সংবাদের লিংক গ্রহণযোগ্য।', 403],
  INVALID_REQUEST: ['INVALID_REQUEST', 'সঠিক সংবাদের লিংক দিন।', 400],
  REDIRECT_LOOP: ['REDIRECT_REJECTED', 'সংবাদের রিডাইরেক্ট গ্রহণ করা হয়নি।', 502],
  REDIRECT_REJECTED: ['REDIRECT_REJECTED', 'সংবাদের রিডাইরেক্ট গ্রহণ করা হয়নি।', 502],
  RESPONSE_TOO_LARGE: ['RESPONSE_TOO_LARGE', 'সংবাদের পেজটি অনেক বড়।', 413],
  UNSUPPORTED_CONTENT: ['UNSUPPORTED_CONTENT', 'লিংকটি থেকে কোনো HTML সংবাদ পাওয়া যায়নি।', 415],
  UNSUPPORTED_IMAGE: ['UPSTREAM_ERROR', 'সংবাদটি লোড করা যায়নি।', 502],
  MISSING_TITLE: ['MISSING_TITLE', 'ব্যবহারযোগ্য কোনো শিরোনাম পাওয়া যায়নি।', 422],
  EMPTY_RESPONSE: ['EMPTY_RESPONSE', 'সংবাদের পেজে কোনো কনটেন্ট নেই।', 502],
  UPSTREAM_ERROR: ['UPSTREAM_ERROR', 'সংবাদটি লোড করা যায়নি।', 502],
  RATE_LIMITED: ['RATE_LIMITED', 'অনেক বেশি অনুরোধ। একটু পরে আবার চেষ্টা করুন।', 429],
};

function failure(code: string, message: string, status: number, requestId: string): Response {
  return Response.json({ error: { code, message, requestId } }, { status, headers: { 'cache-control': 'no-store' } });
}

function mapError(error: unknown): readonly [string, string, number] {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return ['UPSTREAM_TIMEOUT', 'সংবাদ আনতে সময় শেষ হয়ে গেছে।', 504];
  }
  if (error instanceof Error && (error.name === 'TimeoutError' || error.message.includes('timeout'))) {
    return ['UPSTREAM_TIMEOUT', 'সংবাদ আনতে সময় শেষ হয়ে গেছে।', 504];
  }
  const code = error instanceof Error ? error.message : 'UPSTREAM_ERROR';
  return messages[code] ?? ['UPSTREAM_ERROR', 'সংবাদটি লোড করা যায়নি।', 502];
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
      return failure('INVALID_REQUEST', 'সঠিক সংবাদের লিংক দিন।', 400, requestId);
    }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return failure('INVALID_REQUEST', 'সঠিক সংবাদের লিংক দিন।', 400, requestId);

    const startUrl = normalizeArticleUrl(parsed.data.url);

    // Rate limit before expensive upstream work (abuse protection, not exact accounting).
    try {
      const limiter = workerEnv.ARTICLE_RATE_LIMITER as
        | { limit?: (opts: { key: string }) => Promise<{ success: boolean }> }
        | undefined;
      if (limiter?.limit) {
        const clientIp = request.headers.get('cf-connecting-ip') ?? clientAddress ?? 'unknown';
        const result = await limiter.limit({ key: `article:${clientIp}` });
        if (!result.success) return failure('RATE_LIMITED', 'অনেক বেশি অনুরোধ। একটু পরে আবার চেষ্টা করুন।', 429, requestId);
      }
    } catch {
      // Limiter failures must not break the endpoint; continue with logging.
    }

    const secret = typeof workerEnv.IMAGE_TOKEN_SECRET === 'string' ? workerEnv.IMAGE_TOKEN_SECRET : '';

    // Short-lived metadata cache (best-effort, token-free hashed key).
    const cacheKey = await hashedArticleCacheKey(startUrl.href);
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
      // <link rel=canonical> → og:url → final post-redirect URL. The editor's QR encodes this.
      canonicalUrl: article.canonicalUrl ?? fetched.url.href,
      category: article.category,
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
