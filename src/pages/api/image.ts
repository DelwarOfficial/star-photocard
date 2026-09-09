import type { APIRoute } from 'astro';
import { z } from 'zod';
import { isStarNewsHost } from '../../lib/article/normalizeArticleUrl';
import { fetchImageBytes } from '../../lib/security/boundedFetch';
import { hashedImageCacheKey, matchCache, putCache } from '../../lib/security/cacheKey';
import { verifyImageToken } from '../../lib/security/imageToken';

export const prerender = false;

const querySchema = z.object({ token: z.string().min(10).max(4096) });

function failure(status: number, message: string): Response {
  return Response.json({ error: { code: 'IMAGE_ERROR', message } }, { status, headers: { 'cache-control': 'no-store' } });
}

export const GET: APIRoute = async ({ request }) => {
  let workerEnv: Record<string, unknown> = {};
  try {
    const mod = (await import('cloudflare:workers').catch(() => null)) as {
      env?: Record<string, unknown>;
    } | null;
    if (mod?.env) workerEnv = mod.env;
  } catch {
    workerEnv = {};
  }
  const secret = typeof workerEnv.IMAGE_TOKEN_SECRET === 'string' ? workerEnv.IMAGE_TOKEN_SECRET : '';
  if (!secret) return failure(500, 'Image service is not configured.');

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ token: url.searchParams.get('token') ?? '' });
  if (!parsed.success) return failure(400, 'Invalid image reference.');

  let approvedUrl: string;
  try {
    ({ url: approvedUrl } = await verifyImageToken(parsed.data.token, secret));
  } catch (error) {
    const message = error instanceof Error && error.message === 'TOKEN_EXPIRED' ? 'Image link expired.' : 'Invalid image reference.';
    return failure(403, message);
  }

  // Independently re-apply every outbound check; never trust /api/article validation alone.
  let imageUrl: URL;
  try {
    imageUrl = new URL(approvedUrl);
  } catch {
    return failure(403, 'Invalid image reference.');
  }
  if (imageUrl.protocol !== 'https:') return failure(403, 'Invalid image reference.');
  if (imageUrl.username || imageUrl.password) return failure(403, 'Invalid image reference.');
  if (!isStarNewsHost(imageUrl.hostname)) return failure(403, 'Invalid image reference.');

  try {
    const cacheKey = await hashedImageCacheKey(imageUrl.href);
    let cache: Cache | undefined;
    try {
      cache = await caches.open('star-photocard-image-v1');
      const hit = await matchCache(cache, cacheKey);
      if (hit) return hit;
    } catch {
      cache = undefined;
    }
    const result = await fetchImageBytes(imageUrl);
    const body = new Uint8Array(result.bytes);
    const response = new Response(body, {
      headers: {
        'content-type': result.contentType,
        'cache-control': 'public, max-age=900',
        'content-length': String(body.byteLength),
        'x-content-type-options': 'nosniff',
      },
    });
    if (cache) await putCache(cache, cacheKey, response);
    return response;
  } catch {
    return failure(502, 'The image could not be loaded.');
  }
};
