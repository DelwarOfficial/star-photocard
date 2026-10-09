---
name: starnews-brand
description: StarNews product brand lock for this repository. Use when designing, restyling, polishing, or reviewing any UI here so output stays on-brand: warm paper newsroom surfaces, StarNews Black/Bold card type, signal-red primary, restrained blue info states, Bengali+English support, and the accessibility contract. This brief wins over any generic design taste.
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  workflow: ui
---

# StarNews Brand Lock

This is the pinned brief for every UI task in this repository. Honor it
even when it conflicts with saturated-pattern warnings or your own taste.
Redirecting this brief toward generic aesthetics is failure.

## Palette (CSS custom properties in `src/styles/global.css`)

- `--paper: #f5f1e8` — page background (warm paper)
- `--surface: #fffdf8` — control panels
- `--ink: #171717` — text
- `--muted: #66645f` — secondary text (keep ≥4.5:1 contrast)
- `--line: #d8d2c6` — borders
- `--signal: #c51f2a` — primary accent / buttons (hover `#a71922`)
- `--blue: #185f8d` — info states; focus ring `#146fa3`

## Typography

- Controls and chrome: system sans-serif stack (never a display face).
- Generated card only: self-hosted `StarNews-Black` (900) and
  `StarNews-Bold` (700) from `public/fonts/` — both cover Bengali and
  English. Never load fonts from a CDN (runtime policy).
- Card title: white, weight 900, `text-shadow` for legibility,
  `text-wrap: balance`; explicit `*highlight*` renders yellow.

## Absolute bans (no brief earns these back here)

- Purple gradients, glass/blur decoration, marketing hero copy.
- Dashboard clutter, deeply nested cards, icon-only primary actions.
- Status communicated by color alone; emojis unless the user asks.

## Accessibility contract (non-negotiable)

- Visible labels, fieldsets/legends, `aria-describedby` wiring.
- Visible `:focus-visible`, logical keyboard order, 44 × 44 px targets.
- Persistent `role="status"` live region; every drag has a keyboard
  equivalent (arrows = 1 px, Shift+arrows = 10 px).
- Respect `prefers-reduced-motion`; never break page pinch/zoom.

## Card model

- Square 1080 × 1080 canvas; every layer position lives in
  `src/config/templates.ts` in intrinsic pixels — no magic numbers in
  components, CSS, or the exporter. Preview, drag bounds, and export must
  agree through the shared cover-geometry function.

## Next-generation mockups (captured, NOT yet implemented)

Owner preview mockups define a five-family layout system (statement /
split / split-mirrored / full-bleed overlay / overlay-mirrored) with
category pills, meta stacks, surface-aware highlight colors, and
per-layout QR presence. Full analysis and build implications:
[references/mockup-language.md](references/mockup-language.md).
Do not build these until the owner explicitly asks.
