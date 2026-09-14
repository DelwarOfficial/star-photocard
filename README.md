# Star News Photocard Generator (Astro + Cloudflare Workers)

> Production migration of the RTV Photo Card Generator WordPress plugin (v5.3.4) into a Cloudflare-native Astro + TypeScript app. The legacy WordPress plugin (`rtv-photo-card.php`, `assets/`) was removed from this repository on 2026-09-05 per owner request. A backup zip is kept at `C:\Users\star\AppData\Local\Temp\opencode\legacy-plugin-backup-2026-09-05.zip`. There is no git history, so that zip is the only rollback copy.

## Quick start

Requirements: Node ≥ 22.12, npm ≥ 9.6.5, a Cloudflare account for deploy/preview.

```powershell
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run dev      # Astro dev server
& "C:\Program Files\nodejs\npm.cmd" test         # Vitest unit + integration
& "C:\Program Files\nodejs\npm.cmd" run build    # astro check + astro build
& "C:\Program Files\nodejs\npm.cmd" run preview  # build + wrangler dev (Workers runtime)
```

Copy `.dev.vars.example` to `.dev.vars` for local secrets (never commit `.dev.vars`):

```text
IMAGE_TOKEN_SECRET=replace-with-at-least-32-random-characters
```

Create the production secret with `wrangler secret put IMAGE_TOKEN_SECRET` (separately for staging/production). Non-secret tuning lives in `wrangler.jsonc` `vars`.

## Architecture

- Astro SSR (`output: 'server'`) + `@astrojs/cloudflare` on Cloudflare Workers (not Pages, not a Node server).
- One React island (`PhotocardEditor`) for the interactive tool; Astro owns shell, metadata, API routes.
- `src/config/templates.ts` — typed registry (stable IDs, asset paths, 1080×1080 canvas, photo/date/tag/title/QR geometry). No magic numbers in components.
- `src/lib/card/` — pure domain: `types`/`reducer` (explicit transitions, intrinsic pixels), `highlightTitle`, `geometry` (one shared cover function), `photoTag` (40 code-point Unicode), `renderer` + `html2canvasRenderer` (deterministic 1080×1080 PNG).
- `src/lib/article/` — URL policy plus inert-HTML extraction (title/image/date/language with documented fallbacks).
- `src/lib/security/` — `boundedFetch` (manual redirects ≤3, per-hop host revalidation, 10s aborts, streamed 2 MiB HTML / 8 MiB image caps, MIME + magic-byte checks), `imageToken` (Web Crypto HMAC, short-lived), `cacheKey` (token-free hashed keys, best-effort Cache API).
- `src/pages/api/article.ts` — `POST { url }` → typed envelope with `canonicalUrl/title/publishedAt/formattedDate/dateSource/language/imageUrl?`. Rate-limits before upstream work, caches metadata ~5 min, validates image candidates in order (first downloadable wins).
- `src/pages/api/image.ts` — `GET ?token=` verifies HMAC + expiry, then independently repeats hostname/redirect/timeout/size/MIME/signature checks. Caches validated images ~15 min. Never an open proxy.
- `src/middleware.ts` — CSP, `nosniff`, restrictive permissions policy, `SAMEORIGIN` framing.
- Static assets (`public/templates`, `public/fonts`, `public/images`) served through Workers Static Assets. No runtime CDN.

## API and security notes

- Accept: absolute `https:` URLs without credentials, host exactly `starnews.com.bd` or `*.starnews.com.bd`. Suffix lookalikes, downgrades, loops, and >3 redirects rejected.
- HTTP codes: 400 invalid input, 403 rejected destination/image ref, 504 timeout, 413 too large, 415 bad content, 429 rate limit, 502 upstream failure. Errors carry `{ code, message, requestId }` — never bodies, IPs, stacks, or signing data.
- **Honest Workers limitation:** Workers `fetch` exposes no portable connected-IP/DNS pinning, so Node-style IP inspection is impossible. Protection = exact hostname allowlist at every hop + Cloudflare network controls. Stronger egress needs a separately controlled proxy. Rate limiting is abuse protection (eventually consistent), not exact accounting.
- Animated GIF input exports its decoded first frame. Local images never leave the browser.

## Deployment and rollback

- `wrangler.jsonc` is the source of truth (compatibility date `2026-09-04`, `nodejs_compat`, `ASSETS`, observability, `ARTICLE_RATE_LIMITER`, staging/production envs). Regenerate bindings with `npm run cf-typegen`.
- Staging first: `npm run build && wrangler deploy --env staging` with non-production secrets; verify assets, routes, rate limiting, cache, headers, observability, CPU/subrequest/memory. Promote via CI; keep the previous Worker version for rollback.
- Rollback = redeploy the previous Worker version. The legacy WordPress plugin was deleted from the repo on 2026-09-05; restore it from the backup zip if WordPress rollback is ever needed.

## Parity differences (intentional)

See `MIGRATION_PARITY_LEDGER.md`. Headliners: square 1080 × 1080 canvas matching the template artwork, per-template layer geometry, no Google Fonts/CDN, bounded photo drag + keyboard controls, exposed missing-date provenance, persistent status, secure-context clipboard handling, `star-news-photocard-YYYYMMDD-HHmmss.png` filenames.

## Troubleshooting

- `IMAGE_TOKEN_SECRET` too short/missing → article images fall back to bundled photo; `/api/image` returns 500. Set a ≥32-char secret.
- Rate-limited (429) → wait 60s; the limiter is per-client abuse protection.
- Copy unavailable → use Download (copy needs HTTPS + `ClipboardItem`).
- Export uses fallback image → remote missing/oversized/unsupported/off-host or fetch rejected; pick a local image (≤8 MB).

## License

No license file is currently included. Add an explicit license before public distribution.
