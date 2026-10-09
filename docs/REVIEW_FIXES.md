# Review fixes and verification (2026-10-09)

| Finding | Result | Evidence |
| --- | --- | --- |
| F01 Quoted metadata | Attribute parsing respects its opening quote, encoded quotes and attribute order; tag boundaries respect quoted > characters. | tests/unit/article.test.ts |
| F02 Headline overflow | Six template safe regions, measured preview/export guards, explicit Fit headline. Unrecoverable overflow remains blocked. | titleBounds.ts; all-template English/Bengali browser regression |
| F03 Worker caches | Same-origin URL keys hash the complete canonical URL without lowercasing path/query. | Miniflare miss/put/hit and distinct-case tests |
| F04 Category provenance | Automatic categories update; manual edits and clearing survive regeneration until reset. Flat live-site section links are also recognized. | reducer unit and successive-article browser tests |
| F05 Request races | Content, photo and template edits cancel pending generation; sequence checks discard late results. | delayed headline/upload/template browser regression |
| F06 Abuse controls | Rate limiting precedes body parsing; streamed 8 KiB body cap; limiter failures return 503; image route has its own limiter. | streamed-body unit test and actual Workers route tests, no rejected upstream calls |
| F07 Expiring images | Approved image bytes retained in Blob URLs, shared by preview/export and revoked on replacement/reset/unmount. | endpoint returns 403 after first load; export succeeds without another fetch |
| F08 Environment selection | Build scripts set CLOUDFLARE_ENV before Astro and assert Worker name and both binding namespaces before optional deployment. | staging and production builds passed |
| F09 Character shortcuts | Explicit opt-in checkbox defaults off. | printable-key browser regression |
| F10 Verification gaps | Actual Workers handlers and Cache API tested in Miniflare with mocked outbound traffic; TypeScript ESLint and CI lint gate enabled. | npm run lint; npm test |
| F11 Stale guidance | README and brand brief match portrait output, SemiBold 600, today's editable Dhaka date and fallback policy. Historical plans are explicitly marked superseded. | README; brand skill; planning notices |

The earlier requested favicon, SemiBold registration and contain geometry already existed in the starting checkout and were retained and verified. Hydration now starts with an empty date and stable placeholder, then auto-fills after mount. Headline size is a live 30-120px dropdown initialized to the template default.

## Validation

- Astro check: zero errors, warnings or hints; Astro build passed.
- ESLint: passed. Vitest: 72 tests passed, including actual Workers route/cache tests.
- Playwright: 52 tests passed across desktop Chromium and Pixel 7 emulation. Hydration and favicon checks are assertions, not diagnostic logs.
- Separate staging/production builds validated names and limiter namespaces. No deployment performed.
- Unmocked Star News article /politics/25809/ verified: image rendered from retained bytes, category pill showed Politics in Bengali, today's date auto-filled, computed font weight was 600, dropdown changed the headline and PNG downloaded at 1600x2000. Console had no errors or 404s. Desktop/mobile preview and exported PNG were visually inspected.
- Missing-image demo fallback exports; all templates export; long headlines are blocked and recoverable headlines fit; article category regeneration and manual overrides pass.

Worker integration tests run locally with mocked outbound responses. Browser coverage uses Chromium, including mobile emulation; other browser engines and production Cloudflare behavior were not exercised.
