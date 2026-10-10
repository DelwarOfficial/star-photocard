export type Language = 'bn' | 'en';
export type Point = Readonly<{ x: number; y: number }>;
export type Rect = Readonly<Point & { width: number; height: number }>;
export type Size = Readonly<{ width: number; height: number }>;

/** `cover` fills the photo window and crops; `contain` fits the whole photo, letterboxed. */
export type PhotoFit = 'contain' | 'cover';

/** Article cards are filled from a fetched URL; custom cards are written from scratch. */
export type CardMode = 'article' | 'custom';

/** Every card exports at 1080 × 1350 (4:5 portrait, the reference cards' ratio). */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

/**
 * Exported PNG size: the artwork's native 1600 × 2000. Layout stays in the
 * 1080-wide layout space above; the exporter renders it at 1600 / 1080 so
 * text and the QR are redrawn sharp and the artwork and photo keep full detail.
 */
export const EXPORT_WIDTH = 1600;
export const EXPORT_HEIGHT = 2000;
export const EXPORT_SCALE = EXPORT_WIDTH / CARD_WIDTH;

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
  /**
   * How the photo fills its window by default. `cover` fills it edge to edge (the
   * reference cards) and crops overflow; `contain` shows the whole photo, letterboxed.
   * The editor's "Show whole photo" toggle forces `contain` on any template.
   */
  photoFit: PhotoFit;
  /** Date text sits beside the baked calendar icon; y is the text box top. */
  date: Readonly<Point & { width: number; fontSize: number }>;
  dateAlign: 'left' | 'center';
  dateColor: string;
  /** Category label drawn inside the baked (empty) yellow pill; null when there is no editable pill. */
  photoTag: Rect & Readonly<{ fontSize: number }> | null;
  /**
   * Photo-credit tag (সংগৃহীত, এআই ছবি, …): top-left of the tag box inside the photo,
   * placed in a corner clear of the headline, pill and footer. null when there is no photo.
   */
  photoCredit: Readonly<Point & { fontSize: number }> | null;
  titleRegion: Rect;
  title: Readonly<Point & { width: number; defaultFontSize: number; maxFontSize: number }>;
  titleColor: string;
  titleShadow: boolean;
  /** Colour for *highlighted* words; null renders highlights in titleColor (no emphasis). */
  highlightColor: string | null;
  /** White QR box left of the meta stack; null hides the QR for that card. */
  qr: (Rect & Readonly<{ inset: number }>) | null;
  /** Rows in the baked meta stack (url, date, "বিস্তারিত কমেন্টে"). */
  metaRows: 2 | 3;
  /** Ad variant of this card (see {@link AdVariant}); every template has one. */
  ad: AdVariant;
}>;

/**
 * Ad mode: a separate artwork with a white strip baked into the bottom of the same
 * 1600 × 2000 card. Its footer (logo, url, date icon) sits exactly one strip higher,
 * so the date and QR shift is derived from `stripHeight` alone (see resolveTemplate).
 * `layout` holds the other boxes the ad artwork moved, re-measured from the ad PNG.
 */
export type AdVariant = Readonly<{
  /** Public path of the ad artwork. */
  artwork: string;
  /** Strip height in layout px (the creative is fitted into full width × this). */
  stripHeight: number;
  layout: Partial<Pick<TemplateDefinition, 'photo' | 'photoTag' | 'photoCredit' | 'titleRegion' | 'title'>>;
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
/** Credit tag box is ≈ 50 artwork px tall (28px text + padding); keep 24px off the photo edge. */
const CREDIT_HEIGHT = 50;
const creditAt = (x: number, y: number) => ({ x: a(x), y: a(y), fontSize: a(28) });
const creditAbove = (photoBottom: number) => creditAt(32, photoBottom - 24 - CREDIT_HEIGHT);

/**
 * The ad strip is 148 of the artwork's 2000 px (rows 1852–2000; every ad footer moved up
 * by exactly 148). 148 × 1080 / 1600 ≈ 100 layout px — the "1080px × 100px" printed on the
 * placeholder — and 148 px tall in the 1600-wide export, so the recommended creative is 1600 × 148.
 */
const AD_STRIP_ARTWORK = 148;
export const AD_STRIP_HEIGHT = a(AD_STRIP_ARTWORK);
/** Recommended ad creative size in export pixels (full card width × strip). */
export const AD_CREATIVE_SIZE: Size = { width: EXPORT_WIDTH, height: AD_STRIP_ARTWORK };
const adVariant = (artwork: string, layout: AdVariant['layout'] = {}): AdVariant => ({
  artwork,
  stripHeight: AD_STRIP_HEIGHT,
  layout,
});

export const templates: readonly TemplateDefinition[] = [
  {
    id: 'common-card',
    label: 'Photo on top',
    src: '/templates/common-card.png',
    thumbnail: '/templates/common-card.png',
    language: 'bn',
    mode: 'article',
    requiresImage: false,
    canvas,
    photo: rect(0, 0, 1600, 964),
    photoFit: 'cover',
    date: dateAt(1858),
    dateAlign: 'left',
    dateColor: WHITE,
    photoTag: pillAt(1028),
    // Bottom-left of the photo (0–964).
    photoCredit: creditAbove(964),
    titleRegion: rect(160, 1120, 1280, 540),
    title: title(200, 1158, 1200, 98),
    titleColor: WHITE,
    titleShadow: false,
    highlightColor: HIGHLIGHT_YELLOW,
    qr: qrAt(1066, 1807),
    metaRows: 3,
    // Ad art: same photo window; the pill rides up 101 px onto the photo edge and the panel ends at 1555.
    ad: adVariant('/templates/ad-common-card.png', {
      photoTag: pillAt(927),
      titleRegion: rect(160, 1019, 1280, 520),
      title: title(200, 1057, 1200, 98),
    }),
  },
  {
    id: 'common-card-bottom',
    label: 'Photo at bottom',
    src: '/templates/common-card-bottom.png',
    thumbnail: '/templates/common-card-bottom.png',
    language: 'bn',
    mode: 'article',
    requiresImage: false,
    canvas,
    photo: rect(0, 723, 1600, 966),
    photoFit: 'cover',
    date: dateAt(1858),
    dateAlign: 'left',
    dateColor: WHITE,
    photoTag: pillAt(141),
    // Bottom-left of the photo (723–1689).
    photoCredit: creditAbove(1689),
    titleRegion: rect(160, 235, 1280, 445),
    title: title(200, 271, 1200, 98),
    titleColor: WHITE,
    titleShadow: false,
    highlightColor: HIGHLIGHT_YELLOW,
    qr: qrAt(1066, 1807),
    metaRows: 3,
    // Ad art: the whole stack moved up 74 px (pill 67, photo 652–1615).
    ad: adVariant('/templates/ad-common-card-bottom.png', {
      photo: rect(0, 652, 1600, 963),
      photoTag: pillAt(67),
      photoCredit: creditAbove(1615),
      titleRegion: rect(160, 161, 1280, 445),
      title: title(200, 197, 1200, 98),
    }),
  },
  {
    id: 'special-card-top',
    label: 'Full photo, headline on top',
    src: '/templates/special-card-top.png',
    thumbnail: '/templates/special-card-top.png',
    language: 'bn',
    mode: 'article',
    requiresImage: false,
    canvas,
    photo: rect(0, 0, 1600, 2000),
    // Full-bleed: the photo must reach every edge, as in the reference cards.
    photoFit: 'cover',
    date: dateAt(1839),
    dateAlign: 'left',
    dateColor: WHITE,
    photoTag: null,
    // Headline is at the top; credit sits bottom-left, above the logo/meta footer.
    photoCredit: creditAt(32, 1690),
    titleRegion: rect(80, 80, 1440, 1000),
    title: title(100, 124, 1400, 101),
    titleColor: WHITE,
    titleShadow: true,
    highlightColor: HIGHLIGHT_YELLOW,
    qr: qrAt(1067, 1794),
    metaRows: 3,
    // Ad art: the photo stops at the strip; headline unchanged, credit follows the footer up.
    ad: adVariant('/templates/ad-special-card-top.png', {
      photo: rect(0, 0, 1600, 1852),
      photoCredit: creditAt(32, 1690 - AD_STRIP_ARTWORK),
    }),
  },
  {
    id: 'special-card-bottom',
    label: 'Full photo, headline at bottom',
    src: '/templates/special-card-bottom.png',
    thumbnail: '/templates/special-card-bottom.png',
    language: 'bn',
    mode: 'article',
    requiresImage: false,
    canvas,
    photo: rect(0, 0, 1600, 2000),
    // Full-bleed: the photo must reach every edge, as in the reference cards.
    photoFit: 'cover',
    date: dateAt(1839),
    dateAlign: 'left',
    dateColor: WHITE,
    photoTag: null,
    // Headline and footer fill the bottom; credit goes top-left.
    photoCredit: creditAt(32, 32),
    titleRegion: rect(80, 1320, 1440, 410),
    title: title(100, 1413, 1400, 101),
    titleColor: WHITE,
    titleShadow: true,
    highlightColor: HIGHLIGHT_YELLOW,
    qr: qrAt(1067, 1794),
    metaRows: 3,
    // Ad art: photo stops at the strip; headline block moves up with the footer.
    ad: adVariant('/templates/ad-special-card-bottom.png', {
      photo: rect(0, 0, 1600, 1852),
      titleRegion: rect(80, 1320 - AD_STRIP_ARTWORK, 1440, 410),
      title: title(100, 1413 - AD_STRIP_ARTWORK, 1400, 101),
    }),
  },
  {
    id: 'just-in',
    label: 'Just In',
    src: '/templates/just-in.png',
    thumbnail: '/templates/just-in.png',
    language: 'bn',
    mode: 'custom',
    requiresImage: true,
    canvas,
    photo: rect(0, 0, 1600, 1255),
    photoFit: 'cover',
    date: dateAt(1841),
    dateAlign: 'left',
    dateColor: WHITE,
    // The pill text "সদ্য প্রাপ্ত" is baked into the artwork; a user tag would overlay it.
    photoTag: null,
    // Bottom-left of the photo (0–1255), clear of the centred "সদ্য প্রাপ্ত" pill.
    photoCredit: creditAbove(1255),
    titleRegion: rect(80, 1330, 1440, 410),
    title: title(100, 1374, 1400, 101),
    titleColor: WHITE,
    titleShadow: false,
    highlightColor: null,
    // Centred on the 2-row meta stack (url ≈ 1810, date ≈ 1862), left of the icons.
    qr: qrAt(1066, 1771),
    metaRows: 2,
    // Ad art: the red panel and "সদ্য প্রাপ্ত" pill moved up 148 px, so the photo ends at 1107.
    ad: adVariant('/templates/ad-just-in.png', {
      photo: rect(0, 0, 1600, 1255 - AD_STRIP_ARTWORK),
      photoCredit: creditAbove(1255 - AD_STRIP_ARTWORK),
      titleRegion: rect(80, 1330 - AD_STRIP_ARTWORK, 1440, 410),
      title: title(100, 1374 - AD_STRIP_ARTWORK, 1400, 101),
    }),
  },
  {
    id: 'breaking-news',
    label: 'Breaking News',
    src: '/templates/breaking_news.png',
    thumbnail: '/templates/breaking_news.png',
    language: 'bn',
    mode: 'custom',
    requiresImage: false,
    canvas,
    photo: null,
    photoFit: 'cover', // no photo window; unused
    date: dateAt(1886),
    dateAlign: 'left',
    dateColor: BLACK,
    photoTag: null,
    photoCredit: null,
    titleRegion: rect(120, 330, 1360, 1300),
    title: title(160, 393, 1280, 137),
    titleColor: BLACK,
    titleShadow: false,
    // Yellow on the yellow card would vanish; emphasis stays black.
    highlightColor: null,
    qr: qrAt(1067, 1795),
    metaRows: 2,
    // Ad art: star and baked "ব্রেকিং নিউজ" are 82 px higher.
    ad: adVariant('/templates/ad-breaking-news.png', {
      titleRegion: rect(120, 330 - 82, 1360, 1300),
      title: title(160, 393 - 82, 1280, 137),
    }),
  },
];

export const defaultTemplate = templates[0]!;

export function getTemplate(id: string): TemplateDefinition {
  return templates.find((t) => t.id === id) ?? defaultTemplate;
}

/**
 * The template as it is drawn: with ad mode on, the ad artwork, its re-measured boxes, and
 * the date and QR lifted by the strip height. Everything (preview, bounds, export) reads this.
 */
export function resolveTemplate(template: TemplateDefinition, adVisible: boolean): TemplateDefinition {
  if (!adVisible) return template;
  const { artwork, stripHeight, layout } = template.ad;
  return {
    ...template,
    ...layout,
    src: artwork,
    date: { ...template.date, y: template.date.y - stripHeight },
    qr: template.qr && { ...template.qr, y: template.qr.y - stripHeight },
  };
}

/** The ad strip: full card width × stripHeight, flush with the card bottom (layout px). */
export function adSlot(template: TemplateDefinition): Rect {
  const { stripHeight } = template.ad;
  return { x: 0, y: template.canvas.height - stripHeight, width: template.canvas.width, height: stripHeight };
}

export function templatesForMode(mode: CardMode): readonly TemplateDefinition[] {
  return templates.filter((t) => t.mode === mode);
}
