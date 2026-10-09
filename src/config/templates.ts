export type Language = 'bn' | 'en';
export type Point = Readonly<{ x: number; y: number }>;
export type Rect = Readonly<Point & { width: number; height: number }>;
export type Size = Readonly<{ width: number; height: number }>;

/** Article cards are filled from a fetched URL; custom cards are written from scratch. */
export type CardMode = 'article' | 'custom';

/** Every card exports at 1080 × 1350 (4:5 portrait, the reference cards' ratio). */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

/** Root domain; the QR target for custom cards, which have no reference article URL. */
export const SITE_URL = 'https://starnews.com.bd';

export type TemplateDefinition = Readonly<{
  id: string;
  label: string;
  /** Public asset path for the full-size template PNG. */
  src: string;
  /** Thumbnail path. Reuses src until dedicated thumbnails exist. */
  thumbnail: string;
  language: Language;
  mode: CardMode;
  /** Custom cards that cannot export until the user uploads their own photo. */
  requiresImage: boolean;
  canvas: Size;
  /** Transparent photo window in the artwork; null when the card has no photo. */
  photo: Rect | null;
  /** Date text sits beside the baked calendar icon; y is the text box top. */
  date: Readonly<Point & { width: number; fontSize: number }>;
  dateAlign: 'left' | 'center';
  dateColor: string;
  /** Category label drawn inside the baked (empty) yellow pill; null when there is no editable pill. */
  photoTag: Rect & Readonly<{ fontSize: number }> | null;
  title: Readonly<Point & { width: number; defaultFontSize: number; maxFontSize: number }>;
  titleColor: string;
  titleShadow: boolean;
  /** Colour for *highlighted* words; null renders highlights in titleColor (no emphasis). */
  highlightColor: string | null;
  /** White QR box left of the meta stack; null hides the QR for that card. */
  qr: (Rect & Readonly<{ inset: number }>) | null;
  /** Rows in the baked meta stack (url, date, "বিস্তারিত কমেন্টে"). */
  metaRows: 2 | 3;
}>;

/**
 * The artwork is 1600 × 2000. Positions below are written in those artwork
 * pixels — measured from the blank PNGs (transparent photo windows, pill
 * boxes, meta icons) and the owner's reference cards (headline lines, QR
 * boxes, date text) — and scaled once to the 1080 × 1350 export canvas.
 */
const ARTWORK_SCALE = CARD_WIDTH / 1600;
const a = (artworkPx: number): number => Math.round(artworkPx * ARTWORK_SCALE);
const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x: a(x),
  y: a(y),
  width: a(width),
  height: a(height),
});

const canvas: Size = { width: CARD_WIDTH, height: CARD_HEIGHT };

// Measured from the reference cards' highlighted words (the pill yellow is baked into the artwork).
const HIGHLIGHT_YELLOW = '#FFF200';
const WHITE = '#FFFFFF';
const BLACK = '#000000';

/** Date text starts right of the baked calendar icon (icon x ≈ 1238–1265). */
const dateAt = (top: number) => ({ x: a(1284), y: a(top), width: a(300), fontSize: a(30) });
const title = (x: number, y: number, width: number, fontSize: number) => ({
  x: a(x),
  y: a(y),
  width: a(width),
  defaultFontSize: a(fontSize),
  maxFontSize: a(fontSize),
});
const qrAt = (x: number, y: number) => ({ ...rect(x, y, 131, 131), inset: a(10) });
const pillAt = (y: number) => ({ ...rect(681, y, 236, 73), fontSize: a(44) });

export const templates: readonly TemplateDefinition[] = [
  {
    id: 'common-card',
    label: 'ছবি ওপরে',
    src: '/templates/common-card.png',
    thumbnail: '/templates/common-card.png',
    language: 'bn',
    mode: 'article',
    requiresImage: false,
    canvas,
    photo: rect(0, 0, 1600, 964),
    date: dateAt(1858),
    dateAlign: 'left',
    dateColor: WHITE,
    photoTag: pillAt(1028),
    title: title(200, 1158, 1200, 98),
    titleColor: WHITE,
    titleShadow: false,
    highlightColor: HIGHLIGHT_YELLOW,
    qr: qrAt(1066, 1807),
    metaRows: 3,
  },
  {
    id: 'common-card-bottom',
    label: 'ছবি নিচে',
    src: '/templates/common-card-bottom.png',
    thumbnail: '/templates/common-card-bottom.png',
    language: 'bn',
    mode: 'article',
    requiresImage: false,
    canvas,
    photo: rect(0, 723, 1600, 966),
    date: dateAt(1858),
    dateAlign: 'left',
    dateColor: WHITE,
    photoTag: pillAt(141),
    title: title(200, 271, 1200, 98),
    titleColor: WHITE,
    titleShadow: false,
    highlightColor: HIGHLIGHT_YELLOW,
    qr: qrAt(1066, 1807),
    metaRows: 3,
  },
  {
    id: 'special-card-top',
    label: 'পূর্ণ ছবি, শিরোনাম ওপরে',
    src: '/templates/Special-card-top.png',
    thumbnail: '/templates/Special-card-top.png',
    language: 'bn',
    mode: 'article',
    requiresImage: false,
    canvas,
    photo: rect(0, 0, 1600, 2000),
    date: dateAt(1839),
    dateAlign: 'left',
    dateColor: WHITE,
    photoTag: null,
    title: title(100, 124, 1400, 101),
    titleColor: WHITE,
    titleShadow: true,
    highlightColor: HIGHLIGHT_YELLOW,
    qr: qrAt(1067, 1794),
    metaRows: 3,
  },
  {
    id: 'special-card-bottom',
    label: 'পূর্ণ ছবি, শিরোনাম নিচে',
    src: '/templates/Special-card-bottom.png',
    thumbnail: '/templates/Special-card-bottom.png',
    language: 'bn',
    mode: 'article',
    requiresImage: false,
    canvas,
    photo: rect(0, 0, 1600, 2000),
    date: dateAt(1839),
    dateAlign: 'left',
    dateColor: WHITE,
    photoTag: null,
    title: title(100, 1413, 1400, 101),
    titleColor: WHITE,
    titleShadow: true,
    highlightColor: HIGHLIGHT_YELLOW,
    qr: qrAt(1067, 1794),
    metaRows: 3,
  },
  {
    id: 'just-in',
    label: 'সদ্য প্রাপ্ত',
    src: '/templates/just-in.png',
    thumbnail: '/templates/just-in.png',
    language: 'bn',
    mode: 'custom',
    requiresImage: true,
    canvas,
    photo: rect(0, 0, 1600, 1255),
    date: dateAt(1841),
    dateAlign: 'left',
    dateColor: WHITE,
    // The pill text "সদ্য প্রাপ্ত" is baked into the artwork; a user tag would overlay it.
    photoTag: null,
    title: title(100, 1374, 1400, 101),
    titleColor: WHITE,
    titleShadow: false,
    highlightColor: null,
    // Centred on the 2-row meta stack (url ≈ 1810, date ≈ 1862), left of the icons.
    qr: qrAt(1066, 1771),
    metaRows: 2,
  },
  {
    id: 'breaking-news',
    label: 'ব্রেকিং নিউজ',
    src: '/templates/Breaking_NEWS.png',
    thumbnail: '/templates/Breaking_NEWS.png',
    language: 'bn',
    mode: 'custom',
    requiresImage: false,
    canvas,
    photo: null,
    date: dateAt(1886),
    dateAlign: 'left',
    dateColor: BLACK,
    photoTag: null,
    title: title(160, 393, 1280, 137),
    titleColor: BLACK,
    titleShadow: false,
    // Yellow on the yellow card would vanish; emphasis stays black.
    highlightColor: null,
    qr: qrAt(1067, 1795),
    metaRows: 2,
  },
];

export const defaultTemplate = templates[0]!;

export function getTemplate(id: string): TemplateDefinition {
  return templates.find((t) => t.id === id) ?? defaultTemplate;
}

export function isTemplateId(id: string): boolean {
  return templates.some((t) => t.id === id);
}

export function templatesForMode(mode: CardMode): readonly TemplateDefinition[] {
  return templates.filter((t) => t.mode === mode);
}
