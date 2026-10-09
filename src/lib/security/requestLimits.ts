export type RateLimiter = { limit: (options: { key: string }) => Promise<{ success: boolean }> };

/** Fail closed when a configured binding is unavailable. Never log client identifiers. */
export async function enforceRateLimit(binding: unknown, key: string, requestId: string): Promise<Response | null> {
  try {
    if (!binding || typeof (binding as RateLimiter).limit !== 'function') throw new Error('LIMITER_UNAVAILABLE');
    if ((await (binding as RateLimiter).limit({ key })).success) return null;
    return Response.json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.', requestId } },
      { status: 429, headers: { 'cache-control': 'no-store', 'retry-after': '60' } });
  } catch {
    console.error(JSON.stringify({ event: 'rate_limiter_unavailable', requestId }));
    return Response.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable. Try again shortly.', requestId } },
      { status: 503, headers: { 'cache-control': 'no-store', 'retry-after': '60' } });
  }
}

export const REQUEST_MAX_BYTES = 8192;

export async function readBoundedJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > REQUEST_MAX_BYTES) throw new Error('REQUEST_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('INVALID_REQUEST');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > REQUEST_MAX_BYTES) {
        await reader.cancel();
        throw new Error('REQUEST_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown; }
  catch { throw new Error('INVALID_REQUEST'); }
}
