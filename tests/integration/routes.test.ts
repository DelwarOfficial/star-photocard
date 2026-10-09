import { afterAll, beforeAll, expect, it } from 'vitest';
import { Miniflare, Response } from 'miniflare';
import { rolldown } from 'rolldown';
let worker: Miniflare;
let upstreamCalls = 0;
beforeAll(async () => {
  const bundle = await rolldown({ input: 'tests/integration/worker.fixture.ts', external: ['cloudflare:workers'] });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const chunk = output.find((item) => item.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing Worker bundle');
  worker = new Miniflare({ workers: [{ config: { name: 'routes', compatibilityDate: '2026-09-04', manifest: {
    mainModule: 'worker.mjs', modulesRoot: process.cwd(), modules: { 'worker.mjs': { type: 'esm', contents: chunk.code } },
  } }, dev: { outboundService: { type: 'fetcher', handler: async (request) => {
    upstreamCalls++;
    if (new URL(request.url).pathname.endsWith('.png')) return new Response(request.url.includes('bad') ? 'bad' : new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]), { headers: { 'content-type': 'image/png' } });
    return new Response(`<meta property="og:title" content="Editor's choice"><meta property="article:section" content="Sports"><meta property="og:image" content="https://starnews.com.bd/photo.png">`, { headers: { 'content-type': 'text/html' } });
  } } } }] });
});
afterAll(async () => { await worker?.dispose(); });
it('stores and hits Worker cache keys without merging URL case', async () => {
  expect(await (await worker.dispatchFetch('https://studio.test/cache')).json()).toEqual({ before: null, after: 'stored', distinct: true });
});
it('extracts, signs and caches the actual article handler', async () => {
  const request = () => worker.dispatchFetch('https://studio.test/api/article', { method: 'POST', body: JSON.stringify({ url: 'https://starnews.com.bd/article' }) });
  const first = await request();
  expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({ data: { title: "Editor's choice", category: 'Sports', imageUrl: expect.stringContaining('/api/image?token=') } });
  const count = upstreamCalls;
  expect((await request()).status).toBe(200);
  expect(upstreamCalls).toBe(count);
});
it('rejects large bodies and limiter denial/failure before upstream work', async () => {
  const count = upstreamCalls;
  expect((await worker.dispatchFetch('https://studio.test/api/article', { method: 'POST', body: 'x'.repeat(9000) })).status).toBe(413);
  for (const [mode, status] of [['deny', 429], ['failure', 503]] as const) expect((await worker.dispatchFetch('https://studio.test/api/article', { method: 'POST', body: '{}', headers: { 'x-test-limit': mode } })).status).toBe(status);
  expect(upstreamCalls).toBe(count);
});
it('limits signed image replay, caches downloads and rejects invalid images', async () => {
  const token = async (path: string) => (await (await worker.dispatchFetch('https://studio.test/token?url=' + encodeURIComponent('https://starnews.com.bd/' + path))).json() as { token: string }).token;
  const endpoint = 'https://studio.test/api/image?token=' + encodeURIComponent(await token('valid.png'));
  expect((await worker.dispatchFetch(endpoint)).status).toBe(200);
  const count = upstreamCalls;
  expect((await worker.dispatchFetch(endpoint)).status).toBe(200);
  for (const [mode, status] of [['deny', 429], ['failure', 503]] as const) expect((await worker.dispatchFetch(endpoint, { headers: { 'x-test-limit': mode } })).status).toBe(status);
  expect(upstreamCalls).toBe(count);
  expect((await worker.dispatchFetch('https://studio.test/api/image?token=' + encodeURIComponent(await token('bad.png')))).status).toBe(502);
});
