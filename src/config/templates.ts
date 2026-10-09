export type Language = 'bn' | 'en';
export type Point = Readonly<{ x: number; y: number }>;
export type Rect = Readonly<Point & { width: number; height: number }>;

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1080;

export type TemplateDefinition = Readonly<{
  id: string;
  label: string;
  /** Public asset path for the full-size template PNG. */
  src: string;
  /** Thumbnail path (square preview). Reuses src until dedicated thumbnails exist. */
  thumbnail: string;
  language: Language;
  canvas: Readonly<{ width: number; height: number }>;
  photo: Rect;
  date: Readonly<Point & { width: number; fontSize: number }>;
  photoTag: Readonly<Point & { maxWidth: number; fontSize: number }>;
  title: Readonly<Point & { width: number; defaultFontSize: number; maxFontSize: number }>;
  qr: Rect & Readonly<{ inset: number }>;
}>;

const canvas = { width: CARD_WIDTH, height: CARD_HEIGHT } as const;

/**
 * Measured from the 2160 × 2160 square artwork (halved to 1080).
 * Each template carries its own geometry — layouts differ, so no shared
 * base. Date text sits right of the baked-in calendar icon (bottom-left);
 * QR floats over low-content areas because no template reserves a QR zone.
 */
export const templates: readonly TemplateDefinition[] = [
  {
    id: 'common-card',
    label: 'Common Card',
    src: '/templates/common-card.png',
    thumbnail: '/templates/common-card.png',
    language: 'bn',
    canvas,
    photo: { x: 0, y: 0, width: 1080, height: 430 },
    date: { x: 100, y: 1048, width: 270, fontSize: 28 },
    photoTag: { x: 30, y: 350, maxWidth: 600, fontSize: 30 },
    title: { x: 170, y: 745, width: 730, defaultFontSize: 60, maxFontSize: 60 },
    qr: { x: 886, y: 30, width: 134, height: 134, inset: 7 },
  },
  {
    id: 'just-in',
    label: 'Just In',
    src: '/templates/just-in.png',
    thumbnail: '/templates/just-in.png',
    language: 'bn',
    canvas,
    photo: { x: 0, y: 533, width: 1080, height: 238 },
    date: { x: 100, y: 1048, width: 270, fontSize: 28 },
    photoTag: { x: 30, y: 690, maxWidth: 600, fontSize: 30 },
    title: { x: 40, y: 130, width: 820, defaultFontSize: 72, maxFontSize: 72 },
    qr: { x: 900, y: 100, width: 134, height: 134, inset: 7 },
  },
];

export const defaultTemplate = templates[0]!;

export function getTemplate(id: string): TemplateDefinition {
  return templates.find((t) => t.id === id) ?? defaultTemplate;
}

export function isTemplateId(id: string): boolean {
  return templates.some((t) => t.id === id);
}
