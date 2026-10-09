# Template Reposition Prompt — New Star News Artwork

> **Executed 2026-09-14** (registry rewritten, square canvas, Chromium
> screenshot-verified). Kept for history — do not re-run as-is; the
> filenames, geometry, and canvas statements inside are now stale.

Copy the prompt below into your coding agent from the repository root.
It re-seats every card layer (photo, title, date, photo tag, QR) onto the
replacement template artwork in `public/templates/`.

```text
Act as a senior front-end + TypeScript engineer on the “Star News Photocard
Generator” Astro app in this repository. The template artwork was replaced
and the old 1080 × 1350 geometry no longer fits. Your job: re-seat every
card layer onto the new artwork so preview and exported PNG agree exactly.

## 1. Facts you must verify first (do not trust these blindly)

1. List `public/templates/` and read every PNG yourself (they render as
   images). Current set at time of writing:
   - `01. common-card.png` (blue)
   - `02. Digital-Card.png` (dark red)
   - `03. Just-in.png` (black / white / red bands, logo top-left,
     “সদ্য প্রাপ্ত” pill bottom-center)
   - `04. Entertainment.png` (purple)
2. Confirm pixel dimensions with a script (they were 2160 × 2160 SQUARE,
   not 1080 × 1350 — re-verify; if any file differs, stop and report).
3. Confirm the old registry entries (`bengali-default`, `english-default`,
   `usa-card` in `src/config/templates.ts`) no longer have matching files.
4. Read `src/config/templates.ts`, `src/lib/card/geometry.ts`,
   `src/lib/card/reducer.ts`, `src/lib/card/types.ts`,
   `src/components/editor/PhotocardEditor.tsx`,
   `src/lib/card/html2canvasRenderer.ts`, `src/styles/global.css`, and the
   unit tests before changing anything.

Observed layer zones (guidance only — measure and confirm each one):
- Photo occupies the top region (white area in 01/02/04; verify which band
  is the photo well in 03).
- Title sits inside the white-bordered box in 01/02; 03/04 have no visible
  box — find the intended title band (contrasting background, clear of the
  logo, calendar, URL, and pill graphics).
- Date has no text placeholder, only a calendar icon at bottom-left; date
  text belongs immediately right of that icon.
- NO template reserves a QR zone or a photo-tag zone. Logo is centered at
  the bottom and `www.starnews.com.bd` sits bottom-right — keep all layers
  clear of them.

## 2. Required changes

1. Rename the four files to stable kebab-case names with `git mv`
   (spaces and `01.` prefixes break URLs and thumbnails), e.g.
   `common-card.png`, `digital-card.png`, `just-in.png`,
   `entertainment.png`. Update every reference.
2. Replace the registry in `src/config/templates.ts` with four entries
   carrying INDIVIDUAL geometry — do not reuse one shared base. Each entry
   keeps: id, label, src, thumbnail, language, canvas size, and
   photo/date/photoTag/title/QR geometry, all in intrinsic card pixels.
3. Resolve the canvas-shape conflict explicitly: artwork is square but the
   shipped contract is a 1080 × 1350 PNG. Implement per-template canvas
   dimensions in the registry and make preview scale, drag bounds
   (`clampPhotoOffset`, `clampToCanvas`), and the exporter all read the
   active template's canvas — no hardcoded 1080/1350 outside the registry
   and geometry helpers. If you instead keep a single 1080 × 1350 canvas,
   document exactly how square art maps onto it (cover-crop vs fit) and get
   the trade-off into the parity ledger.
4. For each template, set: photo viewport (top well), title box (position,
   width, default/ min/max font sizes that fit the box), date origin +
   width + size (right of the calendar icon), photo-tag anchor, and a QR
   placement that collides with nothing (or a per-template `qrVisible`
   default of false with the toggle still available — record the choice).
5. Title/date/tag/QR must never overlap the baked-in logo, URL line,
   calendar icon, or pill graphic at default positions, in preview AND in
   export. White title text is fine on the dark bands; verify contrast on
   the white band of 03 and adjust per-template title color if needed
   (color belongs in the registry, not in component conditionals).
6. Keep all positioning logic reading from the registry. No scattered
   template-specific magic numbers in components, CSS, or the exporter.
   `RESET_LAYOUT` / per-layer resets must restore the active template's
   defaults.
7. Update `global.css` layer styles only where the new artwork demands it
   (title color, tag style); keep the newsroom editor chrome unchanged.

## 3. Verification (must all pass before you report done)

- `npm run check` (0 errors), `vitest run` (update/extend geometry +
  registry + reducer-default tests for all four templates and both canvas
  shapes), `npm run build` (exit 0).
- Render all four templates with long Bengali AND long English headlines
  in `wrangler dev` / dev server: screenshot preview and exported PNG and
  confirm layer-for-layer alignment, no overlap with baked-in graphics, no
  clipped text at default and extreme (30 / 120 px) font sizes.
- Confirm exported PNG dimensions equal the active template's registry
  canvas size, for every template.
- Playwright: template switching preserves edits; per-layer reset returns
  each template's own defaults.

## 4. Deliverables

1. Renamed assets + rewritten `src/config/templates.ts`.
2. Editor, exporter, CSS, and tests updated to the registry-driven model.
3. `MIGRATION_PARITY_LEDGER.md` entry: per-template geometry table,
   canvas-shape decision, QR/tag placement decisions, and any intentional
   deviation from the old 1080 × 1350 contract.
4. Completion report: measured dimensions, final geometry per template,
   commands with exact results, and screenshots reviewed.

Do not commit, push, deploy, or delete anything unless explicitly asked.
If artwork dimensions or layer zones differ from §1, stop and report the
discrepancy instead of guessing.
```

## Notes for the owner (not part of the agent prompt)

- New artwork is 2160 × 2160 square; the shipped 1080 × 1350 PNG contract
  cannot hold unchanged — the agent must resolve this and record it.
- None of the four templates reserves QR or photo-tag zones; expect the
  agent to propose placement or per-template QR defaults.
- Old registry ids (`bengali-default`, `english-default`, `usa-card`) are
  orphaned and will be replaced by the four new entries.
