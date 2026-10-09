/** Minimum IMAGE_TOKEN_SECRET length; shorter values are treated as missing. */
export const IMAGE_SECRET_MIN_LENGTH = 32;

let warned = false;

/**
 * The image-signing secret from the Worker env, or '' when it is missing or too short.
 * The single definition used by the page, /api/article and /api/image. The first time it
 * is unusable in an isolate, logs one loud, actionable error (fail fast in logs as well
 * as in the editor UI, instead of silently serving the demo photo).
 */
export function readImageSecret(env: Record<string, unknown>): string {
  const value = typeof env.IMAGE_TOKEN_SECRET === 'string' ? env.IMAGE_TOKEN_SECRET : '';
  if (value.length >= IMAGE_SECRET_MIN_LENGTH) return value;
  if (!warned) {
    warned = true;
    console.error(
      JSON.stringify({
        event: 'image_signing_unconfigured',
        problem: value ? `IMAGE_TOKEN_SECRET is only ${value.length} characters` : 'IMAGE_TOKEN_SECRET is not set',
        effect: 'article photos cannot be served; cards fall back to the demo photo',
        fix: `set a random secret of at least ${IMAGE_SECRET_MIN_LENGTH} characters — locally in .dev.vars, deployed with \`wrangler secret put IMAGE_TOKEN_SECRET\` (see README → Deployment)`,
      }),
    );
  }
  return '';
}

/** Cloudflare Workers env for Astro routes/pages (empty outside the Workers runtime). */
export async function workerEnv(): Promise<Record<string, unknown>> {
  try {
    const mod = (await import('cloudflare:workers').catch(() => null)) as { env?: Record<string, unknown> } | null;
    return mod?.env ?? {};
  } catch {
    return {};
  }
}
