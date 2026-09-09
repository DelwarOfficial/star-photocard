# Professional Astro Conversion and Development Prompt

Copy the prompt below into your coding agent from the repository root.

```text
Act as a senior Astro, TypeScript, Cloudflare Workers, frontend, and application-security engineer. Convert the existing WordPress plugin in this repository into a complete, production-ready application named “Star News Photocard Generator.”

Your responsibility is to inspect, implement, test, document, and verify the migration—not merely scaffold an Astro project or propose code snippets. Continue until the application satisfies the repository’s migration plan and all feasible verification checks pass.

## 1. Read and understand the source

Before modifying files:

1. Read ASTRO_MIGRATION_MASTER_PLAN.md completely. It is the authoritative product, architecture, security, UI, migration, and acceptance specification.
2. Inspect these legacy sources in full:
   - rtv-photo-card.php
   - assets/js/tpc-script.js
   - assets/css/tpc-style.css
   - README.md
   - assets/templates/*
   - assets/fonts/*
   - assets/images/*
3. Record the current feature set, extraction precedence, UI behavior, canvas coordinates, asset dimensions, and export behavior before replacing anything.
4. Preserve unrelated user files and edits.
5. If the implementation and master plan conflict, record the discrepancy in a migration parity ledger and follow the master plan unless doing so is technically unsafe.

Do not delete the original WordPress plugin. Keep it as a migration reference and rollback artifact.

## 2. Required architecture

Build a Cloudflare-native Astro SSR application with:

- Current stable Astro and strict TypeScript.
- `output: 'server'` and the official `@astrojs/cloudflare` adapter.
- Cloudflare Workers as the deployment runtime—not a Node server and not Cloudflare Pages.
- One React island for the interactive photocard editor; keep the document shell, metadata, static content, and server endpoints in Astro.
- Workers Static Assets for templates, fonts, images, CSS, and browser bundles.
- Zod validation for environment variables, API requests, and API responses.
- Vitest for unit/integration tests and Playwright for browser workflows.
- ESLint, Prettier, Astro check, and repeatable CI commands.

Create and correctly configure:

- astro.config.mjs
- wrangler.jsonc
- worker-configuration.d.ts generated with `wrangler types`
- public/.assetsignore
- .dev.vars.example containing placeholders only
- separate staging and production Wrangler environments or Worker configurations
- package scripts for dev, check, test, build, Cloudflare preview, type generation, and deploy

Use a tested Workers compatibility date. Enable `nodejs_compat` only when required by the installed Astro adapter or a verified dependency. Store production secrets with Wrangler secrets. Never commit real credentials or depend on undocumented dashboard-only settings.

## 3. Asset migration

Move browser-served assets into `public/` and rename templates predictably:

- Bengali-Defaul..png → bengali-default.png
- english-Default..png → english-default.png
- USA-Card..png → usa-card.png
- retain default-news.jpg as the fallback photo

Preserve the original files until migration is verified. Do not resize, optimize, recolor, or re-encode source artwork during the parity phase.

Create a typed template registry containing stable ID, visible name, asset path, thumbnail, default language, 1080 × 1350 canvas size, and photo/date/title/QR geometry. Component code must not contain scattered template-specific magic numbers.

## 4. Application UI

The first screen must be the working generator, not a landing page.

Create a refined newsroom interface using warm paper, ink black, signal red, and restrained informational blue. Use system sans-serif typography for controls and the bundled Bengali/English serif fonts inside the generated card. Avoid generic purple styling, gradients, glass effects, oversized marketing content, excessive nested cards, and icon-only primary buttons.

Build a responsive editor with these sections:

1. Source
   - RTV Online article URL
   - local validation
   - Generate action
   - loading, cancellation, success, warning, and error states

2. Content
   - editable title
   - editable date
   - automatic and explicit `*highlight*` title styling
   - photo-tag presets
   - conditional custom photo tag limited to 40 Unicode code points

3. Design
   - visual template picker
   - local image chooser
   - restore article image
   - title font size from 30 to 120
   - image zoom from 1 to 3 in 0.1 steps
   - photo, title, and QR position controls
   - individual layout reset actions

4. Preview and Export
   - live scaled preview
   - Copy PNG
   - Download PNG
   - full Reset
   - persistent status messaging

Desktop should use a compact control column beside a large preview stage. Mobile must provide fast access to the preview without forcing users to scroll past every control. Use at least 44 × 44 CSS-pixel touch targets.

## 5. Accessibility and interaction

- Give every input a visible programmatic label.
- Use fieldsets and legends for grouped controls.
- Connect help and validation errors with `aria-describedby`.
- Use visible `:focus-visible` styling and logical keyboard order.
- Use a persistent polite live region for operation status.
- Do not communicate status using color alone.
- Respect `prefers-reduced-motion` and browser zoom.
- Implement dragging with Pointer Events and pointer capture.
- Provide keyboard position controls: Arrow keys move 1 intrinsic pixel and Shift+Arrow moves 10.
- Keep title and QR inside the canvas and constrain the photo so it continues covering the photo viewport.
- Render user title text as safe React nodes. Never use `dangerouslySetInnerHTML`.
- Treat unmatched asterisks as literal characters and preserve title newlines.
- Verify real Bengali content visually and through Unicode-aware tests.

## 6. Card state and geometry

Use one typed reducer or equivalent explicit state machine. The DOM must not be the source of truth. Store every position in intrinsic 1080 × 1350 card pixels, never preview pixels or percentages.

Preserve the legacy compatibility preset:

- card: 1080 × 1350
- photo viewport: x 1, y 1, width 1080, height 730
- date: top 655, left 290, width 500, font size 34
- photo tag: top 585, left 40, max width 1000, font size 30
- title: top 745, left 20, width 1040, default font size 75
- QR: right 60, bottom 155, 120 × 120

Preserve automatic title sizing:

- 1–10 words: 75 px
- 11–15 words: 60 px
- 16–20 words: 52 px
- more than 20 words: 44 px

When explicit paired `*highlight*` markup is absent and the title has more than three words, reproduce the legacy automatic highlight range from `floor(totalWords × 0.30)` through `floor(totalWords × 0.70)`, inclusive.

Implement one pure cover-geometry function and use it for preview rendering, drag constraints, and export:

coverScale = max(viewportWidth / imageWidth, viewportHeight / imageHeight)
drawWidth  = imageWidth × coverScale × userZoom
drawHeight = imageHeight × coverScale × userZoom
drawX      = viewportX + (viewportWidth - drawWidth) / 2 + offsetX
drawY      = viewportY + (viewportHeight - drawHeight) / 2 + offsetY

Choosing a new image resets only photo zoom and position. Generating a new article loads the article image or fallback and updates article-derived fields. Prevent an older response from overwriting a newer request. Revoke local object URLs during replacement, reset, and unmount.

## 7. Secure article API

Implement `POST /api/article` with a JSON request `{ "url": string }` and a stable typed success/error envelope.

The endpoint must:

- accept only absolute HTTPS URLs without credentials;
- allow exactly `rtvonline.com` and true subdomains ending in `.rtvonline.com`;
- reject suffix lookalikes and protocol downgrades;
- handle redirects manually, revalidating every destination;
- cap redirects and detect loops;
- apply AbortSignal timeouts;
- enforce byte limits while streaming, not only through Content-Length;
- require successful upstream status and valid content type;
- forward no browser cookies, authorization, referer, or arbitrary headers;
- expose safe error codes and request IDs without leaking response bodies, internal details, or tokens.

Workers `fetch` does not expose portable connected-IP/DNS pinning. Do not import Node DNS modules or pretend this check exists. Enforce the exact hostname allowlist at every hop and document the residual limitation. If stronger egress guarantees are required, document the need for a separately controlled outbound proxy.

Use the Cloudflare Rate Limiting binding before expensive upstream work. Use a privacy-conscious rate key and treat the limiter as abuse prevention, not exact accounting. Use the Workers Cache API with token-free hashed cache keys. Cache operations are best-effort and correctness must not rely on a cache hit. Do not add KV, D1, R2, Durable Objects, Queues, or another Cloudflare product unless there is a demonstrated requirement.

## 8. Article parsing

Parse downloaded HTML as inert data and never execute source scripts.

Title precedence:

1. Open Graph title
2. Twitter title
3. supported Article JSON-LD headline
4. document title

Preserve entity decoding and safe publisher-suffix removal.

Image candidate precedence:

1. `og:image:secure_url`
2. `og:image`
3. `twitter:image`
4. `twitter:image:src`
5. `__NEXT_DATA__.props.pageProps.data.mainImageFileName`
6. `link[rel~="image_src"]`
7. RTV article markup using `src`, `data-src`, `data-lazy-src`, `data-original`, and best `srcset`
8. images from Article, NewsArticle, ReportageNewsArticle, or BlogPosting JSON-LD

Normalize relative URLs against the final approved article URL, deduplicate while preserving order, and continue to the next candidate after recoverable validation/download failure. Validate image MIME and magic bytes. Allow only JPEG, PNG, GIF, and WebP. Missing article image is nonfatal and uses the bundled fallback.

Support JSON-LD objects, arrays, nesting, and `@graph`, with traversal depth/node limits. Extract dates from supported Article JSON-LD, then `article:published_time`, then relevant `<time datetime>`. Parse dates strictly and format in `Asia/Dhaka`. Return date provenance; if no valid date exists, use the current Dhaka date and show a nonblocking warning.

Determine language from the normalized pathname first, then supported HTML metadata, then a documented script heuristic. Return only `bn` or `en`.

## 9. Same-origin image route

Implement a short-lived signed `/api/image` route so browser canvas export receives a same-origin image.

- Sign the approved URL or URL digest, expiry, and token version using HMAC through Workers Web Crypto.
- Store `IMAGE_TOKEN_SECRET` as a Wrangler secret.
- Verify signature and expiry with timing-safe practices.
- Independently repeat hostname, redirect, timeout, byte, status, MIME, and magic-byte validation.
- Cache only successful validated image responses with bounded headers and token-free canonical keys.
- Never turn the endpoint into an open proxy.

If a verified Workers limit makes this design impossible, isolate a temporary bounded Base64 implementation behind the same typed service interface and clearly document the limitation.

## 10. Export requirements

Keep export behind a `CardRenderer` interface and use html2canvas for initial compatibility.

- Snapshot editor state when export begins.
- Await `document.fonts.ready` and decode the template, photo, and QR.
- Use the shared cover geometry instead of relying on `object-fit` plus transforms.
- Produce a PNG Blob exactly 1080 × 1350 pixels.
- Exclude focus rings, drag handles, controls, and preview chrome.
- Use `canvas.toBlob()` rather than a Base64 data URL.
- Clean temporary nodes and object URLs in `finally`.
- Name downloads `star-news-photocard-YYYYMMDD-HHmmss.png`.
- Use ClipboardItem only in a secure supported context.
- If clipboard writing fails or is unsupported, keep the generated Blob and offer immediate download.
- Document that animated GIF input exports its decoded first frame.

## 11. Testing and verification

Write deterministic tests while implementing—not after all features are finished.

Unit and integration coverage must include:

- URL/hostname and redirect attack cases
- timeouts, statuses, MIME types, byte limits, and image signatures
- every title, image, date, and language fallback
- nested and malformed JSON-LD
- failed-first-image candidate recovery
- Bengali dates and timezone boundaries
- Unicode tags, emoji, combining characters, and the 40-code-point boundary
- explicit/unmatched highlights, automatic highlight indices, newlines, and HTML-like text
- cover geometry for portrait, landscape, square, panorama, and zoom
- reducer transitions, drag bounds, stale requests, and reset behavior
- signed image token validity, tampering, and expiry
- rate-limit and cache-key behavior

Playwright coverage must include:

- empty, loading, ready, warning, and error states
- mocked Bangla and English article generation
- template switching without lost edits
- local-image selection, rejection, cleanup, and restore
- pointer dragging and keyboard nudging
- title/date/tag/font/zoom editing
- full and per-layer reset
- clipboard success/failure and download fallback
- repeated export with exact PNG MIME and 1080 × 1350 dimensions
- responsive layouts at 320, 375, 768, 1024, and wide desktop widths
- keyboard-only use, focus states, accessible names/status, reduced motion, and 200% browser zoom

Run the application through `wrangler dev` for Cloudflare-runtime verification. Automated parser tests must use local fixtures and mocked fetch; live RTV requests are optional manual smoke tests and must not make CI flaky.

## 12. Required implementation sequence

Work in these verified increments:

1. Audit and parity ledger.
2. Astro/Cloudflare foundation and asset migration.
3. Typed template registry and pure card-domain tests.
4. Secure article parsing/fetching and API tests.
5. Signed image route and Workers binding tests.
6. Responsive accessible editor and preview.
7. Deterministic export/copy/download.
8. Browser and accessibility hardening.
9. Documentation and final verification.

After every increment, run the narrowest relevant type check, unit test, integration test, browser test, or production build. Fix failures before progressing. Do not declare success because the UI renders or the build alone passes.

## 13. Required deliverables

Deliver all of the following:

1. Complete Astro application running on Cloudflare Workers.
2. Migrated stable assets and typed template metadata.
3. Accessible responsive editor and accurate live preview.
4. Secure article and signed-image API routes.
5. Cloudflare Rate Limiting, Cache API, observability, assets, and secret configuration.
6. Deterministic 1080 × 1350 copy/download renderer.
7. Vitest unit/integration tests and Playwright browser tests.
8. Updated README and `.dev.vars.example`.
9. Architecture/security notes, asset-license inventory, and parity/difference ledger.
10. Staging, production deployment, observability, troubleshooting, and rollback instructions.

## 14. Completion rules

Before reporting completion:

- run formatting, lint, Astro check, tests, production build, and Cloudflare local preview verification;
- verify there are no runtime CDN dependencies or committed secrets;
- verify exported PNG dimensions programmatically;
- verify all three templates and both language paths;
- inspect the final responsive UI in browser tests;
- identify any unverified deployment, browser, accessibility, licensing, or live-upstream behavior honestly.

In your final report, provide:

- concise outcome summary;
- changed-file list grouped by purpose;
- architecture and security decisions;
- commands run and exact results;
- completed acceptance criteria;
- intentional differences from plugin v5.3.4;
- remaining risks, open decisions, and manual verification steps.

Do not commit, push, deploy, publish, delete the legacy plugin, purchase services, or modify unrelated files unless the user explicitly authorizes it.
```
