# Migration Parity Ledger

## Status

> 2026-09-14: owner replaced the artwork with four 2160 × 2160 square
> templates (`01. common-card.png`, `02. Digital-Card.png`,
> `03. Just-in.png`, `04. Entertainment.png`); the registry entries below
> predate that swap. Execution prompt: `TEMPLATE_REPOSITION_PROMPT.md`.

Implementation in progress on 2026-09-05. The legacy WordPress plugin was deleted from the repo on 2026-09-05 per owner request; the only rollback copy is `C:\Users\star\AppData\Local\Temp\opencode\legacy-plugin-backup-2026-09-05.zip` (no git history exists).

| Area | Legacy behavior | Astro status | Decision |
|---|---|---|---|
| Canvas | Fixed 1080 × 1350 | Square 1080 × 1080 (`CARD_WIDTH`/`CARD_HEIGHT`) to match the 2160 × 2160 artwork; exporter reads the active template's canvas | Changed with artwork swap |
| Templates | Three legacy filenames with repeated dots (deleted 2026-09-05) | Stable names in `public/templates/` (`bengali-default.png`, `english-default.png`, `usa-card.png`) are now canonical | Preserve |
| Fonts | Bundled Bengali/English plus Google Fonts CDN | StarNews brand family in `public/fonts/` — Black 900 + Bold 700 only (4 files, woff2 with woff fallback); verified Bengali cmap coverage; unused weights/obliques and IE-only `.eot` removed | Intentional brand change |
| State | jQuery and DOM state | Typed `CardState` + explicit `cardReducer` (intrinsic pixels, `isDirty`, per-layer reset) | Replace |
| Title sizing | 75 / 60 / 52 / 44 by word count | `titleFontSize()` + tests | Preserve |
| Title highlighting | Paired `*text*` overrides auto; auto = `floor(30%)..floor(70%)` over 3 words; newlines preserved; HTML escaped | `tokenizeTitle()` returns React nodes (never `dangerouslySetInnerHTML`); unmatched asterisks literal | Preserve safely |
| Photo tags | Presets + custom maxlength 40 | `normalizePhotoTag()` counts Unicode code points; presets + custom mode; tests for Bangla/emoji/combining marks | Preserve |
| Image geometry | Cover + zoom/drag; export recomputes cover | `coverGeometry()` shared by preview/bounds/export; `clampPhotoOffset()` keeps viewport covered; `clampToCanvas()` keeps title/QR visible | Preserve + fix unbounded drag |
| QR geometry | right 60, bottom 155, 120×120 + 7px inset | Outer 134×134 box at (886, 1061, 134, 134) with 7px inset documented in `templates.ts`. Earlier slice used (893, 1068); corrected to exact right/bottom math | Preserve (corrected 7px offset) |
| Article API | WordPress AJAX, nonce, 20s/15s timeouts, 2/8 MB caps, Base64 image in JSON | `POST /api/article` with Zod, `ARTICLE_RATE_LIMITER`, manual redirects (max 3, loop/downgrade detection), 10s aborts, streamed 2 MiB HTML / 8 MiB image caps, MIME + magic-byte checks, Cache API (5-min metadata), HMAC-signed `/api/image` | Replace and harden |
| Image extraction | Ordered candidates, Star News (`starnews.com.bd`) host check, srcset best, JSON-LD (top-level only) | Same precedence + dedup + continue-on-failure; JSON-LD arrays/nesting/`@graph` with depth/node limits; documented title/date/language fallbacks; missing image nonfatal (fallback) | Preserve + fix |
| Dates | JSON-LD `datePublished` (top-level), `article:published_time`, else now; Dhaka formatting with Bangla digits/months | Same + `<time datetime>` fallback, strict parsing, `dateSource` provenance (`json-ld`/`meta`/`time`/`fallback-now`) with visible warning | Preserve + expose provenance |
| Language | `/english` path check | Path first, then `og:locale`/`<html lang>`, then Bengali-script heuristic; returns only `bn`/`en` | Preserve + documented fallbacks |
| DNS/IP | N/A (WordPress egress) | Workers `fetch` has no portable connected-IP/DNS pinning. Enforced exact `starnews.com.bd` allowlist at every hop; documented residual DNS-rebinding limitation. Stronger egress needs a separate proxy | Documented limitation, not claimed |
| Rate limiting | Nonce only (not rate limiting) | `ARTICLE_RATE_LIMITER` binding before upstream work + optional WAF; treated as abuse protection, not exact accounting | Fix, not reproduce |
| Dragging | Unbounded mouse/touch, no keyboard | Pointer Events + capture, viewport→intrinsic scaling, bounds, Arrow/Shift+Arrow nudging with announced coordinates, per-layer reset | Replace with accessible controls |
| Export | html2canvas clone, `toDataURL`, `rtv-card-<ts>.png` | `CardRenderer` interface (html2canvas impl), `document.fonts.ready` + decoded assets, immutable snapshot, `canvas.toBlob()` PNG exactly matching the template canvas (1080×1080), `finally` cleanup, `star-news-photocard-YYYYMMDD-HHmmss.png`, clipboard with secure-context fallback to download | Preserve output contract, harden |
| Copy | `ClipboardItem`, HTTPS alert | Explicit secure-context/browser handling; Download always available; blob preserved for immediate download on copy failure | Fix, not reproduce |
| Local images | `accept="image/*"`, type check only | MIME allowlist (JPEG/PNG/GIF/WebP) + 8 MB cap, object-URL lifecycle (replace/reset/unmount), animated GIF exports first frame (documented) | Fix validation gap |
| Status | Auto-fading message | Persistent `role="status"`/`aria-live="polite"` until superseded; actionable errors; loading/cancel + stale-response protection | Fix |
| Verification | No automated suite | Vitest unit/integration (URL, redirects, timeouts, sizes, MIME/signature, fallbacks, Unicode, geometry, reducer, tokens) + Playwright (empty/loading/ready, mocked bn/en, templates, responsive, keyboard) | New |

## Known blockers / open decisions

- Cloudflare account ID, custom domain, public vs Access-protected staff use, and production `IMAGE_TOKEN_SECRET` are not configured. Staging/production envs exist in `wrangler.jsonc` but use placeholder rate-limit namespace `1001`.
- Template/font brand rights need written confirmation before production.
- Live Star News upstream is manual smoke-test only; CI uses fixtures + mocked fetch.
- Playwright browsers are not installed in this workspace; `tests/e2e/photocard.spec.ts` is written but not executed here.

## Build decisions recorded 2026-09-05

- Legacy cleanup 2026-09-05: deleted `rtv-photo-card.php`, `assets/`, `graphify-out/`, unimported `src/lib/article/fetchArticle.ts` and `src/config/env.ts`, and the unused `parse5` dependency. Backup: `C:\Users\star\AppData\Local\Temp\opencode\legacy-plugin-backup-2026-09-05.zip`.
- Source host migrated from `rtvonline.com` to `starnews.com.bd` per owner decision (`ROOT_HOST`, image-URL policy, UA string, editor copy, fixtures, README). The backup zip is the only remaining `rtvonline.com` reference.

- `@astrojs/cloudflare` upgraded 13.6.1 → 14.3.0 and `wrangler` 4.101.0 → 4.129.0 so the adapter peer (`astro ^7.2.0`) matches pinned `astro 7.3.1`. Verified with clean `npm install` (no `--legacy-peer-deps`).
- `wrangler.jsonc` `main` changed from `dist/_worker.js/index.js` to `@astrojs/cloudflare/entrypoints/server` per the Astro 6+/adapter v13+ entrypoint change; the old path made `astro build` fail during server-entrypoint bundling.
- API routes migrated from removed `locals.runtime.env` to `import { env } from 'cloudflare:workers'`; client IP from `cf-connecting-ip` with `clientAddress` fallback. `worker-configuration.d.ts` regenerated with `wrangler types`.
- Verification: `vitest` 46/46 pass, `astro check` 0 errors (33 files), `astro build` exit 0, no runtime CDN hosts, no committed secrets, static assets present in `dist/client/`.
