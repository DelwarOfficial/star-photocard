import { expect, it } from 'vitest';
import { readBoundedJson } from '../../src/lib/security/requestLimits';
it('caps a streamed JSON body without trusting Content-Length', async () => {
  const bytes = new TextEncoder().encode(' '.repeat(5000));
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.enqueue(bytes); } });
  const request = new Request('https://studio.test/api/article', { method: 'POST', body, duplex: 'half' } as RequestInit);
  await expect(readBoundedJson(request)).rejects.toThrow('REQUEST_TOO_LARGE');
});
