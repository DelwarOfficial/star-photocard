> Current implementation (2026-10-09): portrait 1080x1350 layout, 1600x2000 PNG, self-hosted StarNews SemiBold 600, today's editable Asia/Dhaka Bengali date (auto-filled after hydration), contain-and-center photos. Missing/rejected article images use the bundled demo; approved images are retained as browser Blob URLs. README and src/config/templates.ts are authoritative. Older square/Black/Bold/publication-date/cover specifications below are historical and superseded.

# Mockup Design Language (owner previews, 2026-10)

Six owner-provided mockups define the NEXT template generation. This file
is the analysis-of-record; do not implement until the owner says go.
Six distinct layouts observed — the system is bigger than "one template":

## The five layout families (all square 1080×1080)

1. **Statement (no photo)** — full brand-yellow field with a large faint
   4-point star watermark. Bangla headline TOP in BLACK, centered,
   multi-line. Oversized black display text (brand/kicker statement)
   lower third. Logo bottom-left. QR + meta bottom-right.
   - Text-on-light inversion: black ink, no shadow, highlight = heavier
     weight or red, NOT yellow (yellow vanishes on yellow).
2. **Split: photo top / color panel bottom** — photo ~55-60% height, then
   a solid signal-red (or charcoal) panel with WHITE centered headline.
   Category pill sits centered ON the boundary between photo and panel.
3. **Split: panel top / photo bottom** — same as (2) mirrored; pill +
   headline panel first, photo below. Proves every split layout ships in
   BOTH orientations.
4. **Full-bleed overlay: text bottom** — photo fills the card; headline
   (white + yellow highlight) overlays the lower area over a dark scrim
   for legibility.
5. **Full-bleed overlay: text top** — same, mirrored; headline overlays
   the top, photo shows below, QR + meta at bottom.

## Recurring components (measure from PNGs before building)

- **Category pill**: small rounded-rect, centered horizontally, sits on
  the photo/panel boundary (split layouts) or top-center (overlay-top).
  Two styles: yellow bg + black text; black bg + white text.
  Legacy left-aligned tag is superseded by this centered pill.
- **Headline**: centered, multi-line, generous line-height, weight 900.
  White on dark/photo, black on yellow. Auto-highlight words in YELLOW
  on dark/photo surfaces only.
- **Meta stack** (bottom-right): small icons + text lines —
  `starnews.com.bd`, Dhaka date, optional `বিস্তারিত কমেন্টে` link label.
  White on dark, black on yellow. Replaces the single-line date strip.
- **QR**: white rounded box, bottom-right, LEFT of the meta stack; some
  layouts omit it (red quotes panel has none). QR presence varies per
  layout, not per user choice alone.
- **Logo**: bottom-left always; white on dark/photo, black+red diamond
  on yellow. Baked into artwork — text layers must never overlap it.

## Palette observed

- Brand yellow (statement bg / pill bg / highlight on dark) — sample
  exact hex from PNGs at build time.
- Signal red (panel bg) — close to existing `--signal`.
- Dark charcoal panel (not pure black) — sample hex.
- Ink black, pure white.

## Implications for the generator (for the future job)

1. Templates need an `orientation` concept (text-top vs text-bottom) —
   either paired template entries or a per-template toggle.
2. Pill, meta-stack, and QR zones are NEW registry geometry fields; the
   old date/tag/QR fields don't map 1:1.
3. Highlight color must be surface-aware (yellow on dark, none/red on
   yellow) — a registry field, not a hard-coded `.highlight` class.
4. Scrim (gradient overlay) needed for full-bleed layouts in preview
   AND export.
5. Faint star watermark on statement layout is artwork, not CSS.
6. Editor needs a per-layout "show QR" default; meta stack content
   (URL, date, link label) becomes editable card state.
