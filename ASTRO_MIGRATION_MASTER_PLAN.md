# Star News Photocard Generator

## Astro Migration Master Plan and Implementation Prompt

**Source:** RTV Photo Card Generator WordPress plugin v5.3.4  
**Target:** Cloudflare-native Astro + TypeScript application on Workers  
**Output contract:** Exact 1080 × 1350 PNG  
**Status:** Implementation-ready plan based on a repository and UI audit

---

## 1. Goal and Scope

Replace the WordPress shortcode with a focused newsroom tool named **Star News Photocard Generator**. An editor must be able to fetch an approved RTV Online article, adjust its content and composition, preview it, and copy or download a 1080 × 1350 PNG.

The generator—not a marketing page—must be the first screen. Preserve useful behavior while fixing security, accessibility, responsive-layout, state-management, and export defects.

### Success criteria

- No runtime dependency on WordPress, PHP, jQuery, Google Fonts, or CDN scripts.
- Valid RTV URLs populate title, date, image, language, and QR code.
- Preview and export share one intrinsic 1080 × 1350 coordinate model.
- Editors can replace the image locally, edit text, switch templates, zoom/reposition layers, reset, copy, and download.
- Server fetching is protected against SSRF, unsafe redirects, invalid content, oversized responses, and abuse within the Cloudflare Workers runtime.
- Bengali and English work with bundled fonts.
- Parsing, geometry, state transitions, and export have automated coverage.

### Out of scope for v1

- Accounts, teams, databases, cloud-saved projects, or uploaded media.
- Arbitrary news domains.
- AI-generated content, analytics, or a visual template designer.
- Deleting the old plugin before production parity is approved.

---

## 2. Audited Legacy Baseline

| Source | Responsibility | Migration treatment |
|---|---|---|
| `rtv-photo-card.php` | Shortcode UI, WordPress AJAX, fetch/parser, image download, dates | Astro shell/API plus isolated TypeScript services |
| `assets/js/tpc-script.js` | jQuery state/events, drag, QR, highlighting, export | Typed React island and pure domain helpers |
| `assets/css/tpc-style.css` | Editor layout and fixed card layers | Rebuild app UI; preserve compatibility geometry |
| `assets/templates/` | Three transparent templates | Stable names plus typed metadata |
| `assets/fonts/`, `assets/images/` | Local card fonts and fallback image | Self-host in `public/` |

There is currently no Astro project or automated test suite.

### Asset map

| Legacy | Target | Dimensions |
|---|---|---|
| `Bengali-Defaul..png` | `bengali-default.png` | 1080 × 1350 |
| `english-Default..png` | `english-default.png` | 1080 × 1350 |
| `USA-Card..png` | `usa-card.png` | 1080 × 1350 |
| `default-news.jpg` | `default-news.jpg` | 1920 × 1080 |

Do not resize or re-encode these before golden fixtures are captured. Record licensing and brand permission for templates and fonts.

### Compatibility geometry

All coordinates are intrinsic card pixels.

| Layer | Legacy geometry |
|---|---|
| Card/template | `(0,0)`, 1080 × 1350; template over photo |
| Photo viewport | `(1,1)`, 1080 × 730; overflow hidden |
| Date | top 655, left 290, width 500; centered, 34 px, white |
| Photo tag | top 585, left 40, max width 1000; 30 px |
| Title | top 745, left 20, width 1040; centered, default 75 px |
| QR | right 60, bottom 155; 120 × 120 with 7 px inset |

Move these values into typed template definitions. A template may override geometry without changing editor logic.

### Exact extraction behavior to preserve as fixtures

1. Accept `https://rtvonline.com` and true subdomains.
2. Infer English from normalized `/english` pathname; otherwise Bangla.
3. Prefer `og:title`; decode entities, trim, and remove a publisher suffix.
4. Try image candidates in this order:
   - `og:image:secure_url`
   - `og:image`
   - `twitter:image`
   - `twitter:image:src`
   - `__NEXT_DATA__.props.pageProps.data.mainImageFileName`
   - `link[rel~="image_src"]`
   - `#adf-overlay` or first `.post_template-0 img`, using `src`, `data-src`, `data-lazy-src`, `data-original`, and best `srcset`
   - `image` values from Article, NewsArticle, ReportageNewsArticle, or BlogPosting JSON-LD
5. Resolve relative/protocol-relative image URLs against the final article URL.
6. Extract date from supported JSON-LD, then `article:published_time`, then fallback time; format in `Asia/Dhaka` and translate digits/months for Bangla.

### Exact editor behavior to preserve

- Generating replaces a displayed local image with fetched/fallback content.
- A new image resets its position and zoom.
- Automatic title sizes: 75 px through 10 words, 60 through 15, 52 through 20, 44 above 20.
- Paired `*text*` is explicitly highlighted. Without explicit markup, titles over three words highlight indices from `floor(30%)` through `floor(70%)`, inclusive.
- Preserve newlines and render HTML-like input as text.
- Trim photo tags to 40 Unicode code points.
- Photo, title, and QR drag deltas are converted from viewport to intrinsic pixels.
- QR encodes the source URL with error-correction level M.
- Export uses explicit cover geometry and always produces 1080 × 1350.
- Full reset revokes local object URLs and clears content, layout, QR, actions, and status.

### Defects to fix, not reproduce

- A nonce is not rate limiting. The public API needs real abuse controls.
- Revalidate hostname and public IP before every request and redirect; protect against DNS rebinding.
- Validate HTML status/MIME and enforce byte limits while streaming.
- If an image candidate fails to download or validate, continue to the next candidate.
- Verify image magic bytes, not only the declared MIME.
- Use a same-origin image route instead of inflating article JSON with Base64 where possible.
- Parse nested, array, and `@graph` JSON-LD for dates/images.
- Expose when “today” is used because the publication date is missing.
- Validate local image bytes, dimensions, and size; `accept="image/*"` is not validation.
- Add drag bounds, keyboard positioning, and per-layer reset.
- Give font inputs real 30–120 bounds.
- Keep status visible until superseded; make errors actionable.
- Copy needs explicit secure-context/browser handling and Download must remain available.
- Use UTF-8 throughout and include real Bengali fixtures; existing documentation output shows mojibake risk.

---

## 3. Cloudflare-Native Target Architecture

### Stack

- Current stable Astro at implementation time, `output: 'server'`, strict TypeScript.
- Cloudflare Workers—not Cloudflare Pages or a Node server—as the fixed production runtime.
- Official `@astrojs/cloudflare` adapter with a dated Workers compatibility contract.
- React integration for a single hydrated `PhotocardEditor`; Astro owns the shell and API routes.
- Zod for environment and API boundaries.
- Workers-native `fetch` with manual redirects, aborts, and bounded streamed reads.
- `parse5` or another maintained HTML5 parser behind project-owned extraction functions.
- `qrcode`, `file-type` or equivalent signature inspection, and `html2canvas` for initial parity.
- Workers Static Assets for templates, fonts, images, CSS, and client bundles in the same deployment unit.
- Cloudflare Rate Limiting binding for application-level API limits; optional WAF rule as a second layer.
- Cache API for short-lived article/image responses. Add KV only if cache keys or metadata must survive cache eviction; do not add D1, R2, Durable Objects, or Queues without a demonstrated requirement.
- Web Crypto for HMAC-signed short-lived image tokens; the signing key is a Worker secret.
- Workers Observability for production logs and metrics, with privacy-safe application events.
- Vitest plus a Workers-compatible test pool and injected fetch fixtures; Playwright against local Wrangler preview and staging.
- ESLint, Prettier, Astro check, and CI.

Pin dependencies. No production library or font may load from a CDN.

### Required Cloudflare configuration

Commit `wrangler.jsonc` as the source of truth; do not depend on dashboard-only configuration. Use a current compatibility date selected when implementation begins and update it deliberately through tested changes.

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "star-news-photocard",
  "main": "dist/_worker.js/index.js",
  "compatibility_date": "YYYY-MM-DD",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "binding": "ASSETS",
    "directory": "./dist"
  },
  "observability": { "enabled": true },
  "ratelimits": [
    {
      "name": "ARTICLE_RATE_LIMITER",
      "namespace_id": "REPLACE_WITH_ACCOUNT_UNIQUE_INTEGER",
      "simple": { "limit": 10, "period": 60 }
    }
  ]
}
```

The exact generated Worker entry path and supported configuration fields must be verified against the installed adapter/Wrangler versions. Add `public/.assetsignore` containing `_worker.js` and `_routes.json`. Generate binding types with `wrangler types`; do not hand-maintain an approximate `Env` interface.

Required scripts:

```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro check && astro build",
    "preview": "npm run build && wrangler dev",
    "deploy": "npm run build && wrangler deploy",
    "cf-typegen": "wrangler types"
  }
}
```

Use `.dev.vars` for local secrets and keep it ignored. Commit only `.dev.vars.example`. Production secrets such as `IMAGE_TOKEN_SECRET` are created with `wrangler secret put`; non-secret values belong in Wrangler `vars`. Define separate preview/staging and production environments or separate Worker names, bindings, routes, and secrets so tests cannot consume production quotas.

### Suggested structure

```text
src/
  components/editor/       # panels, controls, status, export bar
  components/preview/      # card layers and empty preview
  config/                  # validated env and template registry
  layouts/AppLayout.astro
  lib/article/             # URL normalization, fetch, parsing, dates/images
  lib/card/                # types, reducer, geometry, highlighting, export
  lib/security/            # bounded fetch, IP policy, rate limiting
  lib/text/                # date and Unicode helpers
  pages/api/article.ts
  pages/api/image.ts
  pages/index.astro
  styles/
worker-configuration.d.ts  # generated by wrangler types
wrangler.jsonc
public/fonts/
public/images/
public/templates/
public/.assetsignore
tests/fixtures/articles/
tests/unit/
tests/integration/
tests/e2e/
```

Preserve boundaries between server trust policy, article extraction, card domain, editor, and renderer. Do not split tiny components merely to match this tree.

### State model

```ts
type Language = 'bn' | 'en';
type Point = Readonly<{ x: number; y: number }>;

type CardState = Readonly<{
  sourceUrl: string;
  title: string;
  publicationDate: string;
  language: Language;
  templateId: string;
  image: Readonly<{ kind: 'fallback' | 'remote' | 'local'; src: string }>;
  photoTag: string;
  fontSize: number;
  imageScale: number;
  photoPosition: Point;
  titlePosition: Point;
  qrPosition: Point;
  loadStatus: 'idle' | 'loading' | 'ready' | 'error';
  isDirty: boolean;
}>;
```

Use explicit reducer transitions. Store positions only in intrinsic pixels. Own object URL creation/revocation in a lifecycle-aware hook. Never keep rendered HTML in state or use `dangerouslySetInnerHTML` for titles.

Each template definition needs an ID, label, asset/thumbnail path, language, canvas size, and photo/date/title/QR geometry. Template switching preserves content and manual layout; a separate “Reset layout” applies template defaults.

---

## 4. API and Security Contract

### `POST /api/article`

Request:

```json
{ "url": "https://www.rtvonline.com/example" }
```

Success:

```json
{
  "data": {
    "canonicalUrl": "https://www.rtvonline.com/example",
    "title": "Example headline",
    "publishedAt": "2026-09-04T10:30:00+06:00",
    "formattedDate": "৪ সেপ্টেম্বর ২০২৬",
    "dateSource": "json-ld",
    "language": "bn",
    "imageUrl": "/api/image?token=short-lived-signed-reference"
  }
}
```

Failure:

```json
{
  "error": {
    "code": "INVALID_HOST",
    "message": "Only RTV Online article URLs are supported.",
    "requestId": "opaque-id"
  }
}
```

Use consistent HTTP codes: 400 invalid input, 403 rejected destination, 408/504 timeout, 413 too large, 415 bad content, 429 rate limit, and 502 upstream failure. Never expose internal IPs, response bodies, stack traces, or signing data.

### Bounded fetch policy

1. Accept absolute `https:` URLs without credentials.
2. Normalize case/trailing dot. Allow only `rtvonline.com` or a hostname ending exactly `.rtvonline.com`.
3. Revalidate the normalized scheme and allowlisted hostname before every fetch and redirect. Cloudflare Workers does not expose portable connected-IP/DNS pinning through normal `fetch`; do not claim Node-style IP inspection. Rely on the exact RTV hostname allowlist and Cloudflare's network controls, and document this residual limitation. If stronger destination enforcement is required, route outbound requests through a separately controlled egress service.
4. Use manual redirects, maximum three, with loop and downgrade detection.
5. Default to 10-second HTML/image abort timeouts.
6. Stream-enforce default caps of 2 MiB HTML and 8 MiB image; `Content-Length` is only an early hint.
7. Require success status, expected MIME, and matching image signature.
8. Send controlled `User-Agent`/`Accept`; forward no browser cookies, auth, referer, or arbitrary headers.
9. Log request ID, safe host/path hash, timing, redirects, result code, and byte counts—not article bodies, image bytes, or sensitive query strings.
10. Call the `ARTICLE_RATE_LIMITER` binding immediately before expensive upstream work, keyed by a privacy-conscious client/request key. Optionally add a Cloudflare WAF rate-limit rule for coarse edge protection. Do not implement an in-memory production limiter.

Treat Cloudflare Rate Limiting as intentionally eventually consistent and not an exact accounting system. It is abuse protection, not billing or authorization. If staff-only use is selected, protect the custom domain with Cloudflare Access and still keep application-level limiting.

### Image delivery

Prefer a short-lived HMAC-signed same-origin `/api/image` URL using Workers Web Crypto and `IMAGE_TOKEN_SECRET`. The token includes the approved URL (or digest), expiry, and version. That route must independently repeat URL/hostname, redirect, timeout, size, MIME, and signature checks. Never trust validation performed only by `/api/article`. Cache only successful validated responses with bounded `Cache-Control`; never place errors or token-bearing URLs in a shared cache accidentally.

If the platform prevents this, isolate temporary Base64 delivery behind the same typed service and retain the decoded 8 MiB cap.

### Parser corrections

- Parse inert HTML only; never execute source scripts.
- Preserve candidate precedence, deduplicate normalized URLs, and continue after recoverable failures.
- Recursively support arrays, nested objects, and `@graph` with depth/node limits.
- Add documented title fallbacks: Twitter title, supported article headline, document title.
- Determine language from normalized path, metadata, then script heuristics; return only `bn` or `en`.
- Extract strict ISO dates from supported article JSON-LD, then meta, then `<time datetime>`.
- When date is absent, return current Dhaka date with `dateSource: 'fallback-now'` and show a warning.
- Missing image is nonfatal; the client uses the bundled fallback.

Use the Workers Cache API for normalized metadata (about five minutes) and validated images (up to fifteen minutes), with canonical hashed cache keys that do not expose signing tokens. Cache operations are best-effort; correctness must not depend on a hit. Deduplicate within an isolate where useful, but do not claim global request coalescing. Make caps/TTLs configurable and validate them at startup. Add CSP, `nosniff`, restrictive permissions policy, and an appropriate frame policy.

---

## 5. UI Specification

Create a calm editorial workspace: warm paper, ink-black type, signal-red primary accent, restrained blue information states, and system sans-serif controls. Use bundled serif fonts inside the card. Avoid purple gradients, glass effects, dashboard clutter, oversized hero copy, deeply nested cards, and icon-only primary actions.

### Layout

- Compact header with product name, status summary, and Reset.
- Desktop: 380–440 px controls beside a flexible centered preview stage.
- Mobile: Source, Content, Design, Export sections with a preview immediately after Source or an obvious Preview/Edit switch.
- Show “1080 × 1350 PNG” outside the artwork.
- Keep export actions reachable without covering fields; minimum touch targets 44 × 44 CSS px.

### Flow and controls

1. Empty state shows template art, a useful photo placeholder, and disabled export.
2. Source has labeled URL input, inline validation, Generate, loading/cancel behavior, and stale-response protection.
3. Ready state populates fields without stealing focus. Recoverable errors retain existing work.
4. Template picker uses 3:4 thumbnails and semantic radios.
5. Image controls show source, local chooser, restore article image, zoom 1–3 step 0.1, and position reset.
6. Content controls include title, bounded 30–120 font inputs, date, photo-tag presets/custom 40-code-point label, and concise highlight help.
7. Position controls expose X/Y or nudge buttons for photo/title/QR plus reset. Arrow keys nudge 1 pixel; Shift+Arrow 10.
8. QR defaults on with a source URL; an optional visibility toggle is allowed.
9. Copy PNG explains unsupported/insecure contexts. Download PNG is always available for a valid card.
10. Full Reset confirms only when meaningful edits would be lost.

### Accessibility

- Visible labels; fieldsets/legends for groups; logical headings/landmarks and DOM order.
- Strong `:focus-visible`; errors linked with `aria-describedby`.
- Persistent `role="status"`/`aria-live="polite"`; reserve alerts for urgent failures.
- Keyboard alternatives for all dragging with announced intrinsic coordinates.
- Do not rely on color, icons, motion, or placeholders alone.
- Respect reduced motion and preserve page pinch/zoom.
- Test real Bengali, long English, 200% browser zoom, and 320 px width.

Title highlighting must produce React nodes, not injected HTML. Unmatched asterisks remain literal; paired markers override auto mode; newlines are preserved.

---

## 6. Preview and Export Contract

- Card state always uses 1080 × 1350 intrinsic pixels.
- Preview scale is based on available width/height and capped at 1.
- Apply one transform to the card wrapper; divide pointer deltas by preview scale.
- Use Pointer Events with pointer capture.
- Keep title/QR fully on canvas; constrain photo movement so its viewport remains covered.

Shared cover math for intrinsic image `(iw, ih)`, viewport `(x, y, vw, vh)`, zoom `z`, and offset `(dx, dy)`:

```text
coverScale = max(vw / iw, vh / ih)
drawWidth  = iw × coverScale × z
drawHeight = ih × coverScale × z
drawX      = x + (vw - drawWidth) / 2 + dx
drawY      = y + (vh - drawHeight) / 2 + dy
```

Use this pure function for preview, bounds, and export.

### Export rules

- Await `document.fonts.ready` and decode template, photo, and QR.
- Render from an immutable state snapshot.
- Export a PNG Blob exactly 1080 × 1350; never include editor/focus/drag UI.
- Keep renderer behind an interface; start with html2canvas, allowing Canvas 2D later.
- Clean temporary DOM/object URLs in `finally`.
- Filename: `star-news-photocard-YYYYMMDD-HHmmss.png`.
- Clipboard uses `ClipboardItem` only in secure supported contexts. Preserve the Blob for immediate download on copy failure.
- Animated GIF input exports its decoded first frame; document this.

---

## 7. Delivery Phases and Gates

### Phase 0 — Decisions and baseline

Cloudflare Workers is already selected. Confirm the Cloudflare account, custom domain, public/staff-only access, Star/RTV brand scope, and asset rights. Run the legacy plugin and capture desktop/mobile screenshots plus exported fixtures for all templates, languages, fallback/local images, highlighting, zoom/drag, QR movement, and long titles.

**Gate:** Approved ADR and golden fixtures. If WordPress cannot run, mark pixel parity partly unverifiable and use repository-derived geometry.

### Phase 1 — Foundation

Initialize Astro SSR with `@astrojs/cloudflare`, React, strict checks, Workers-compatible tests, CI, local assets/fonts, generated binding types, `wrangler.jsonc`, `.assetsignore`, environment schema, security headers, template registry, shell, and empty preview.

**Gate:** Clean install, lint, Astro check, binding type generation, unit smoke test, production build, and `wrangler dev` preview pass; static assets load through Workers Assets and no runtime CDN requests occur.

### Phase 2 — Pure card domain

Implement types/reducer, defaults, title tokenization, Unicode tags, dates, cover geometry, preview scaling, drag bounds, and reset behavior.

**Gate:** Unit fixtures cover audited parity and corrected behavior.

### Phase 3 — Secure article service

Implement URL/hostname policy, bounded redirects, parsers, ordered candidate validation, Web Crypto-signed image delivery, Cache API integration, Rate Limiting binding, and structured errors. Automated tests use saved HTML and mocked Workers fetch only; live RTV is a manual smoke command.

**Gate:** Redirect/hostname, timeout, size, MIME/signature, malformed markup, fallback, rate-limit, cache-key, token-expiry, and language/date tests pass in a Workers-compatible runtime.

### Phase 4 — Editor parity

Build all panels, preview layers, local image lifecycle, QR, pointer/keyboard positioning, status, and stale-request handling.

**Gate:** Every audited feature works without WordPress/jQuery on desktop/mobile and with keyboard/pointer.

### Phase 5 — Export hardening

Implement renderer abstraction, asset readiness, blob copy/download, cleanup, deterministic snapshots, and Playwright tests.

**Gate:** All fixtures produce valid 1080 × 1350 PNGs; Chromium and Firefox or WebKit principal flows pass.

### Phase 6 — UX/accessibility

Finish responsive states, contrast/focus, reduced motion, Bengali visual verification, 200% zoom, automated accessibility tests, and manual keyboard/screen-reader smoke checks.

**Gate:** Acceptance matrix passes with no serious automated accessibility violations and documented manual results.

### Phase 7 — Release

Deploy a separate staging Worker with non-production secrets/bindings. Verify Workers Assets, custom-domain routing, Access if enabled, Rate Limiting, Cache API behavior, observability, security headers, and CPU/subrequest/memory limits. Compare fixtures and load-test safely. Promote with `wrangler deploy` through CI, retain the previous Worker version for rollback, and do not delete the plugin until a separately approved observation window ends.

---

## 8. Acceptance Matrix

### Unit/integration

- Exact host/subdomains accepted; lookalike suffixes, credentials, non-HTTPS, malformed URLs, redirect escapes, and downgrade attempts rejected. The lack of portable connected-IP pinning in Workers is documented and tested at the hostname-policy boundary.
- Redirect escape/downgrade/loop/count, timeout, streamed oversize, bad status, bad MIME/signature all rejected.
- All title/image/date fallbacks, relative URLs, srcset, nested/`@graph` JSON-LD, deduplication, and failed-first-image recovery tested.
- HTML-like titles, entities, newlines, paired/unpaired asterisks, and exact auto-highlight indices tested.
- Unicode tags cover Bangla, emoji, combining marks, and 40-code-point boundary.
- Dhaka timezone/month/digits, invalid/missing date provenance, leap dates tested.
- Geometry covers portrait, landscape, square, panorama, zoom, bounds, templates, and resets.

### Browser

- Empty/loading/ready/error states and disabled actions.
- Bangla/English generation from mocked APIs; fallback image and missing-date warning.
- Cancellation and stale-response prevention.
- Template changes preserve work; reset layout is explicit.
- Local JPEG/PNG/WebP, rejection/size checks, cleanup, restore article image.
- Live title/date/tag/font controls and safe rendering.
- Pointer drag, keyboard nudges, bounds, QR, and per-layer/full reset.
- Clipboard success/failure/unsupported plus download recovery.
- PNG MIME, exact dimensions, filename, repeated export, font readiness, and preview/export alignment.
- 320/375/768/1024/wide widths, 200% zoom, focus order, accessible names/status, reduced motion.

### Definition of done

- Gates/tests pass or have an explicit approved exception.
- No PHP, jQuery, CDN runtime assets, secrets, or user-content persistence in the Astro app.
- Outbound requests enforce URL/hostname, redirects, timeout, bytes, status, MIME, signature, Cloudflare rate limiting, and cache policy; Workers DNS/IP limitations are documented.
- Remote, fallback, and local images export deterministically at 1080 × 1350.
- README documents setup, scripts, env, architecture, API/security, deployment, troubleshooting, licensing, parity differences, and rollback.
- The original plugin remains recoverable until separately approved retirement.

---

## 9. Decisions Register

| Decision | Recommended default | Deadline |
|---|---|---|
| Hosting | **Decided:** Cloudflare Workers + Workers Static Assets + `@astrojs/cloudflare` | Fixed |
| Access | Staff authentication/edge policy; public only if required | Before Phase 3 |
| Brand | Star shell; retain source templates until replacements approved | Phase 0 |
| Images | Signed same-origin proxy; temporary Base64 only if necessary | Phase 3 |
| Rate limit | Workers Rate Limiting binding; optional WAF rule | Phase 3 |
| Metadata/image cache | Workers Cache API; KV only if a proven durable metadata need appears | Phase 3 |
| Secrets | Wrangler secrets; `.dev.vars` locally; never committed/dashboard-only | Phase 1 |
| Staff protection | Cloudflare Access on the custom domain if staff-only | Phase 7 |
| Asset rights | Written confirmation | Before production |
| Renderer | html2canvas behind interface; evaluate Canvas 2D later | Phase 5 |
| Drag bounds | Keep title/QR visible and photo viewport covered | Phase 2 |
| Missing date | Current Dhaka date plus visible warning/provenance | Phase 3 |
| Saved projects | No persistence in v1 | Post-release |

---

## 10. Copy-Paste Implementation Prompt

For the expanded professional execution prompt, use [`ASTRO_DEVELOPMENT_PROMPT.md`](./ASTRO_DEVELOPMENT_PROMPT.md). The shorter prompt below remains as a compact alternative.

```text
You are the lead engineer migrating this repository’s RTV Photo Card Generator WordPress plugin v5.3.4 into a production-ready Astro application named “Star News Photocard Generator.” Work directly in this repository.

Read ASTRO_MIGRATION_MASTER_PLAN.md completely before editing. Inspect rtv-photo-card.php, assets/js/tpc-script.js, assets/css/tpc-style.css, README.md, and every bundled asset. Treat the plan’s audit, geometry, security contract, phase gates, and acceptance matrix as requirements. If code and plan disagree, document the discrepancy in a parity ledger before choosing behavior. Do not invent silent compatibility behavior.

Build Astro SSR with strict TypeScript for Cloudflare Workers using `@astrojs/cloudflare`. Cloudflare Workers is the fixed runtime; do not add a Node server or target Cloudflare Pages. Astro owns the shell/routes; use one React island for the editor. Serve templates, fonts, images, CSS, and client bundles through Workers Static Assets. Remove runtime WordPress, PHP, jQuery, Google Fonts, globals, and CDN dependencies. Pin packages and self-host assets.

Commit `wrangler.jsonc`, `public/.assetsignore`, `.dev.vars.example`, and Wrangler-generated binding types. Set a tested compatibility date and use `nodejs_compat` only where the installed Astro adapter requires it. Configure the generated Worker entry, `ASSETS` binding, observability, and `ARTICLE_RATE_LIMITER`. Use separate staging/production Worker names, routes, bindings, and secrets. Store `IMAGE_TOKEN_SECRET` with Wrangler secrets, never source or dashboard-only undocumented configuration. Add scripts for build, `wrangler dev`, `wrangler deploy`, and `wrangler types`.

Preserve the intrinsic 1080 × 1350 model and migrate templates to stable filenames. Put coordinates in typed template metadata. Use explicit reducer transitions and intrinsic-pixel positions. Preserve audited title sizing/highlighting, newlines, 30–120 font range, 1–3 image zoom, 40-code-point tags, languages/fonts/dates, QR level M, reset, copy, and download. Render title tokens safely—never use dangerouslySetInnerHTML.

Build the generator as the first screen: paper/ink/signal-red newsroom styling, compact header, Source/Content/Design/Export hierarchy, visual template radios, useful empty preview, persistent status, and excellent mobile behavior. Avoid a marketing hero, purple styling, glass effects, dashboard clutter, and icon-only primary actions. Label every control, connect errors/help, support visible focus, Pointer Events, keyboard nudging, reduced motion, page zoom, and 44 px touch targets.

Implement POST /api/article with Zod and a Workers-native bounded-fetch policy. Accept only absolute HTTPS rtvonline.com URLs/true subdomains without credentials. Revalidate each manually handled redirect, cap redirects, detect loops/downgrades, enforce aborts and streamed byte caps, validate status/MIME/image magic bytes, and forward no browser credentials. Workers `fetch` does not provide portable DNS resolution or connected-IP pinning: document this honestly, enforce the exact host allowlist at every hop, and do not import Node DNS APIs. Use the Workers Rate Limiting binding before upstream work, Cache API with token-free hashed keys, privacy-safe observability events, and stable structured errors. Do not claim globally exact rate counts, cache persistence, or isolate-wide deduplication.

Port the audited parser order. Deduplicate image candidates and continue after recoverable failures. Support nested arrays/@graph JSON-LD with traversal limits. Add documented title/date/language fallbacks, format in Asia/Dhaka, and expose missing-date provenance. Missing image uses the bundled fallback.

Serve remote images through a short-lived HMAC-signed same-origin route using Workers Web Crypto and a Wrangler secret. It independently reapplies every outbound-fetch check and caches only validated success responses. If a platform limit prevents this, isolate temporary bounded Base64 behind the same typed interface and document it; never weaken hostname controls.

Use one pure cover-geometry function for preview, bounds, and export. Keep export behind a renderer interface, initially html2canvas. Await fonts and decoded assets, snapshot state, create a PNG Blob exactly 1080 × 1350, clean resources in finally, and keep Download available when clipboard is unsupported or denied. Never upload, persist, or log local images/article bodies.

Implement by the plan’s phases. Preserve unrelated user changes. After each small slice run the narrowest relevant formatter/check/test. Automated article tests must use deterministic fixtures and mocked fetch; live RTV is manual smoke testing only. Do not claim completion from a build alone.

Required deliverables:
1. Astro app and stable asset migration.
2. Template registry, card domain/reducer, accessible responsive editor, and preview.
3. Secure article/image APIs using Workers bindings, Cache API, Rate Limiting, Web Crypto signing, validated environment, and safe errors.
4. Deterministic 1080 × 1350 copy/download renderer.
5. Vitest unit/integration and Playwright coverage matching the acceptance matrix.
6. Updated README, .env.example, architecture/security notes, asset/license inventory, parity ledger, deployment and rollback instructions.

In the completion report list changed files, architecture decisions, commands and exact results, untested environments, security limitations, intentional parity differences, and open decisions. Do not commit, deploy, publish, delete the plugin, or rewrite unrelated files unless explicitly asked.
```

## 11. Immediate Next Step

Cloudflare Workers and `@astrojs/cloudflare` are selected. Before coding, record the remaining decisions in a short ADR: Cloudflare account/custom domain, public versus Cloudflare Access-protected staff use, legal retention of RTV artwork/fonts, and whether Star News changes only the app shell or also requires replacement templates.
