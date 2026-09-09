export type Language = 'bn' | 'en';
export type Point = Readonly<{ x: number; y: number }>;
export type Rect = Readonly<Point & { width: number; height: number }>;

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

export type TemplateDefinition = Readonly<{
  id: string;
  label: string;
  /** Public asset path for the full-size template PNG. */
  src: string;
  /** Thumbnail path (3:4 preview). Reuses src until dedicated thumbnails exist. */
  thumbnail: string;
  language: Language;
  canvas: Readonly<{ width: number; height: number }>;
  photo: Rect;
  date: Readonly<Point & { width: number; fontSize: number }>;
  photoTag: Readonly<Point & { maxWidth: number; fontSize: number }>;
  title: Readonly<Point & { width: number; defaultFontSize: number }>;
  qr: Rect & Readonly<{ inset: number }>;
}>;

/**
 * Compatibility geometry (intrinsic card pixels, from legacy audit).
 * QR: outer 134x134 box (120px code + 7px inset each side), anchored
 * 60px from right and 155px from bottom: x = 1080-60-134 = 886,
 * y = 1350-155-134 = 1061.
 */
const base = {
  canvas: { width: CARD_WIDTH, height: CARD_HEIGHT },
  photo: { x: 1, y: 1, width: 1080, height: 730 },
  date: { x: 290, y: 655, width: 500, fontSize: 34 },
  photoTag: { x: 40, y: 585, maxWidth: 1000, fontSize: 30 },
  title: { x: 20, y: 745, width: 1040, defaultFontSize: 75 },
  qr: { x: 886, y: 1061, width: 134, height: 134, inset: 7 },
} as const;

export const templates: readonly TemplateDefinition[] = [
  {
    id: 'bengali-default',
    label: 'Bengali Default',
    src: '/templates/bengali-default.png',
    thumbnail: '/templates/bengali-default.png',
    language: 'bn',
    ...base,
  },
  {
    id: 'english-default',
    label: 'English Default',
    src: '/templates/english-default.png',
    thumbnail: '/templates/english-default.png',
    language: 'en',
    ...base,
  },
  {
    id: 'usa-card',
    label: 'USA Card',
    src: '/templates/usa-card.png',
    thumbnail: '/templates/usa-card.png',
    language: 'en',
    ...base,
  },
];

export const defaultTemplate = templates[0]!;

export function getTemplate(id: string): TemplateDefinition {
  return templates.find((t) => t.id === id) ?? defaultTemplate;
}

export function isTemplateId(id: string): boolean {
  return templates.some((t) => t.id === id);
}
