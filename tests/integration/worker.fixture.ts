import { handleArticle } from '../../src/pages/api/article';
import { handleImage } from '../../src/pages/api/image';
import { hashedImageCacheKey } from '../../src/lib/security/cacheKey';
import { signImageUrl } from '../../src/lib/security/imageToken';
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const mode = request.headers.get('x-test-limit');
    const limiter = { async limit() {
      if (mode === 'failure') throw new Error('binding unavailable');
      return { success: mode !== 'deny' };
    } };
    const env = { ARTICLE_RATE_LIMITER: limiter, IMAGE_RATE_LIMITER: limiter,
      IMAGE_TOKEN_SECRET: 'integration-test-secret-never-used-in-production' };
    if (url.pathname === '/api/article') return handleArticle(request, 'test', env);
    if (url.pathname === '/api/image') return handleImage(request, env);
    if (url.pathname === '/token') return Response.json({ token: await signImageUrl(url.searchParams.get('url')!, env.IMAGE_TOKEN_SECRET) });
    const key = await hashedImageCacheKey('https://starnews.com.bd/Photo.JPG?A=B', url.origin);
    const other = await hashedImageCacheKey('https://starnews.com.bd/photo.jpg?a=b', url.origin);
    const cache = await caches.open('cache-regression');
    const before = await cache.match(key);
    await cache.put(key, new Response('stored', { headers: { 'cache-control': 'public, max-age=60' } }));
    return Response.json({ before: before?.status ?? null, after: await (await cache.match(key))?.text(), distinct: key !== other });
  },
};
