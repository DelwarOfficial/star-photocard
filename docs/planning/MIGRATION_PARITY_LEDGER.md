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
| Templates | Three legacy filenames with repeated dots (deleted 2026-09-05) | Four measured entries (`common-card`, `digital-card`, `just-in`, `entertainment`) with per-template photo/date/tag/title/QR geometry incl. `maxFontSize` auto-size caps; verified by Chromium screenshots | Changed with artwork swap |
| Fonts | Bundled Bengali/English plus Google Fonts CDN | StarNews brand family in `public/fonts/` — Black 900 + Bold 700 only (4 files, woff2 with woff fallback); verified Bengali cmap coverage; unused weights/obliques and IE-only `.eot` removed | Intentional brand change |
| State | jQuery and DOM state | Typed `CardState` + explicit `cardReducer` (intrinsic pixels, `isDirty`, per-layer reset) | Replace |
| Title sizing | 75 / 60 / 52 / 44 by word count | `titleFontSize()` + tests | Preserve |
| Title highlighting | Paired `*text*` overrides auto; auto = `floor(30%)..floor(70%)` over 3 words; newlines preserved; HTML escaped | `tokenizeTitle()` returns React nodes (never `dangerouslySetInnerHTML`); unmatched asterisks literal | Preserve safely |
| Photo tags | Presets + custom maxlength 40 | `normalizePhotoTag()` counts Unicode code points; presets + custom mode; tests for Bangla/emoji/combining marks | Preserve |
| Image geometry | Cover + zoom/drag; export recomputes cover | `coverGeometry()` shared by preview/bounds/export; `clampPhotoOffset()` keeps viewport covered; `clampToCanvas()` keeps title/QR visible | Preserve + fix unbounded drag |
| QR geometry | right 60, bottom 155, 120×120 + 7px inset | Per-template outer 134×134 boxes clear of logo/URL/calendar (no template reserves a QR zone); visibility toggle retained | Changed with artwork swap |
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
- Playwright Chromium installed 2026-09-14 and the new square layouts verified by screenshots (Bengali + long-English on all four templates); committed `photocard.spec.ts` still relies on `wrangler dev` preview and was not run here.

## Build decisions recorded 2026-09-05

- Legacy cleanup 2026-09-05: deleted `rtv-photo-card.php`, `assets/`, `graphify-out/`, unimported `src/lib/article/fetchArticle.ts` and `src/config/env.ts`, and the unused `parse5` dependency. Backup: `C:\Users\star\AppData\Local\Temp\opencode\legacy-plugin-backup-2026-09-05.zip`.
- Source host migrated from `rtvonline.com` to `starnews.com.bd` per owner decision (`ROOT_HOST`, image-URL policy, UA string, editor copy, fixtures, README). The backup zip is the only remaining `rtvonline.com` reference.

- `@astrojs/cloudflare` upgraded 13.6.1 → 14.3.0 and `wrangler` 4.101.0 → 4.129.0 so the adapter peer (`astro ^7.2.0`) matches pinned `astro 7.3.1`. Verified with clean `npm install` (no `--legacy-peer-deps`).
- `wrangler.jsonc` `main` changed from `dist/_worker.js/index.js` to `@astrojs/cloudflare/entrypoints/server` per the Astro 6+/adapter v13+ entrypoint change; the old path made `astro build` fail during server-entrypoint bundling.
- API routes migrated from removed `locals.runtime.env` to `import { env } from 'cloudflare:workers'`; client IP from `cf-connecting-ip` with `clientAddress` fallback. `worker-configuration.d.ts` regenerated with `wrangler types`.
- Verification: `vitest` 46/46 pass, `astro check` 0 errors (33 files), `astro build` exit 0, no runtime CDN hosts, no committed secrets, static assets present in `dist/client/`.

## Build decisions recorded 2026-09-14

- New square templates seated: canvas 1080 × 1080, four measured registry entries, registry-driven preview layers, per-template `maxFontSize` auto-size caps, balanced title wrapping.
- Smart UI pass: sticky preview (desktop), 2-column square template picker, headline word-count/auto-size hint, layout tip, tidier empty placeholder.
- Real bugs found by browser testing and fixed: CSP `script-src` blocked Astro island inline scripts (hydration fully dead — added `'unsafe-inline'` with a nonce-CSP follow-up note); `clipboardSupported` computed during render caused hydration mismatch (moved to post-mount effect); `/images/*` is shadowed by the adapter's Images binding in dev (fallback photo moved to `/photos/`; also safer in production).
- Note: the 2026-09-05 Temp backup zip no longer exists (Temp was cleaned); the fallback photo was restored byte-exact from git history (`e09d076`). Legacy plugin rollback now depends on git history plus owner copies.

## Build decisions recorded 2026-10-04

- Full dependency upgrade to latest: astro 7.3.5, `@astrojs/cloudflare`
  14.3.3, `@astrojs/react` 7, React 19.3, zod 4.6.5, vitest 5, wrangler
  4.147, Playwright 1.63 (+browsers reinstalled), `@types/node` 26,
  workers-types Oct 2026. TypeScript held at latest 6.x (6.0.3):
  TS 7.0 has no `astro check` support yet. Verified: check 0 errors,
  48/48 tests, build exit 0, binding types regenerated.
- `.graphifyignore` now also excludes third-party skill-harness dirs
  (impeccable engines/scripts); graph is app-focused again
  (~305 nodes).

- UI skills installed project-scoped: `impeccable` (official installer) plus a hand-authored `starnews-brand` lock (palette, type, bans, a11y contract, card model). Public `brand-guidelines` skill found to encode Anthropic's own brand, not generic brand-locking — not installed.
- Skill-guided polish pass (Operate mode): header status summary (`Template · State`), secondary-button hover, `::selection`/caret theming, tabular numerals on position readouts, status restyled off the side-tab pattern, Inter dropped from the font stack, mobile header simplified.
- Detector findings adjudicated: status side-tab fixed, Inter removed; photo-tag red bar kept as intentional card-artwork language.
- Verified by Chromium screenshots (desktop 1600 + mobile 390): Bengali shaping, highlight, template switching, sticky preview, responsive stacking.

## Portrait reference cards + two-mode creation flow (2026-10-09)

Canvas is now **1080 × 1350** (4:5), matching the 1600 × 2000 artwork. Registry values are written in artwork pixels and scaled once (`ARTWORK_SCALE = 1080 / 1600`) in `src/config/templates.ts`. Sources: transparency/pill/icon measurements of the blank PNGs plus headline/QR/date measurements of the owner's six reference cards.

| id | mode | photo window (1080 space) | title box top / width / size | pill | QR | meta rows |
|---|---|---|---|---|---|---|
| `common-card` | article | 0–651 (artwork 0–964) | 782 / 810 / 66 | yellow, 1028–1100 artwork | yes | 3 |
| `common-card-bottom` | article | 488–1140 (artwork 723–1689) | 183 / 810 / 66 | yellow, 141–213 artwork | yes | 3 |
| `special-card-top` | article | full bleed | 84 / 945 / 68, shadow | — | yes | 3 |
| `special-card-bottom` | article | full bleed | 954 / 945 / 68, shadow | — | yes | 3 |
| `just-in` | custom (upload + text) | 0–847 (artwork 0–1255) | 927 / 945 / 68 | baked "সদ্য প্রাপ্ত" | yes (root domain) | 2 |
| `breaking-news` | custom (text only) | **none** | 265 / 864 / 92, black | — | yes | 2 |

Flow decisions:
- **Modes.** Article cards keep URL → `/api/article` → editable fields. Custom cards hide the URL input and never call the API. `just-in` requires an uploaded photo before export (`requiresImage`); `breaking-news` has no photo layer at all.
- **Date = today, always.** Every card, in both modes, shows today's Dhaka date in Bengali with a two-digit day (`todayBanglaDate()`, e.g. "০৯ অক্টোবর ২০২৬"), set on creation and on reset. Fetching an article does **not** replace it with the article's publish date. The field stays editable; a "Today" button restores it. Reset keeps the chosen card type.
- **Meta stack.** URL, calendar icon and "বিস্তারিত কমেন্টে" are baked into every artwork; only the date text is rendered, left-aligned beside the calendar icon (`dateAlign: 'left'`). Date is black on the yellow breaking card.
- **QR.** Article cards encode the reference news link the card was made from (the fetched article's canonical URL). Custom cards (`just-in`, `breaking-news`) have no reference URL, so they encode the root domain `https://starnews.com.bd`. All six cards show the QR in the standard spot (white rounded box, bottom-right, left of the meta stack); `just-in`'s is centred on its 2-row stack. The `special-card-bottom` reference had no QR; it is shown by default and can be toggled off. E2E verifies the encoded content by sampling the rendered QR's module grid.
- **Pill / category.** `photoTag` now renders category text (presets: রাজনীতি, জাতীয়, …) centred in the baked empty yellow pill on the two common cards. **just-in caveat:** its pill text "সদ্য প্রাপ্ত" is baked into the artwork, so a user tag would overlay it; `photoTag` is therefore `null` there and no tag input is shown.
- **Title styling.** `titleColor`, `titleShadow`, `highlightColor` per template. Highlight = `#FFF200`, measured from the references (the pill yellow `#FFD700` is baked). Breaking and just-in have `highlightColor: null`, so `*marked*` words stay in the title colour.
- **One style source.** Text/QR layer styles live in `src/lib/card/layerStyles.ts` and are used by both the React preview and the html2canvas exporter, so they cannot drift.
- **Known gap — typeface.** The references set headlines in a lighter, narrower Bengali face than the bundled StarNews fonts. Positions match; line breaks can differ (e.g. breaking demo headline wraps to 4 lines instead of 3). Needs the reference font file to close.

## Article category, canonical URL, image priority (2026-10-09)

- **Category** (`extractCategory`): `article:section` meta → JSON-LD `articleSection` → `.mobile-menu-parent` link, accepted only when its top-level path matches the article's (`/sports.html` counts as `sports`, matching `/sports/25803/…`). Unvalidated menu links would be arbitrary site-wide items. It pre-fills the yellow pill (`photoTag`) on Generate only when the pill is empty; non-preset values appear in the editable custom field.
- **Live check (starnews.com.bd, 2026-10-09):** pages have neither `article:section` nor `articleSection`, so the menu is the only source. A `/sports/` article yields "খেলা". **`/country/` articles yield no category**, because the menu has no `/country` link ("সারা দেশ" points to `/districts.html`).
- **Canonical URL** (`extractCanonicalUrl`): `<link rel="canonical">` → `og:url` → final post-redirect URL. Accepted only as an https Star News URL, since it becomes the QR target on article cards. Custom cards still encode `https://starnews.com.bd`.
- **Image priority:** `og:image` → `og:image:secure_url` → `twitter:image` → `twitter:image:src` → `__NEXT_DATA__` → `link[rel=image_src]` → in-article `<img>` → JSON-LD. The first that probes as a real image wins.
- The article cache moved to `star-photocard-article-v2`, because v1 entries lack the category and declared-canonical fields.
