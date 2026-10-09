import { afterEach, describe, expect, it, vi } from 'vitest';

describe('readImageSecret', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('accepts 32+ characters and rejects missing or short secrets', async () => {
    const { readImageSecret } = await import('../../src/lib/security/imageSecret');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const good = 'a'.repeat(32);
    expect(readImageSecret({ IMAGE_TOKEN_SECRET: good })).toBe(good);
    expect(readImageSecret({ IMAGE_TOKEN_SECRET: 'short' })).toBe('');
    expect(readImageSecret({})).toBe('');
    expect(readImageSecret({ IMAGE_TOKEN_SECRET: 42 })).toBe('');
  });

  it('logs one actionable error per isolate when the secret is unusable', async () => {
    const { readImageSecret } = await import('../../src/lib/security/imageSecret');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    readImageSecret({});
    readImageSecret({ IMAGE_TOKEN_SECRET: 'short' });
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]![0])).toMatch(/IMAGE_TOKEN_SECRET.*wrangler secret put IMAGE_TOKEN_SECRET/s);
  });
});
