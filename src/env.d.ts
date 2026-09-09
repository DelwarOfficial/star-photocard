/// <reference path="../.astro/types.d.ts" />

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}

interface Env {
  ASSETS: Fetcher;
  ARTICLE_RATE_LIMITER: RateLimit;
  IMAGE_TOKEN_SECRET: string;
  ARTICLE_CACHE_TTL_SECONDS?: string;
  IMAGE_CACHE_TTL_SECONDS?: string;
}
