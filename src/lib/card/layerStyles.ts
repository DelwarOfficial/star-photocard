import type { TemplateDefinition } from '../../config/templates';
import type { CardState } from './types';

/**
 * Single source of truth for the text/QR layer styles. The React preview
 * passes these objects straight to `style`; the html2canvas exporter applies
 * them with {@link applyStyle}. Geometry comes from the active template only.
 */
export type LayerStyle = Readonly<Record<string, string | number>>;

const TITLE_LINE_HEIGHT = 1.3;
/** All card text (headline, date, pill, credit) uses StarNews SemiBold. */
export const CARD_TEXT_WEIGHT = 600;
const PHOTO_TITLE_SHADOW = '0 3px 10px rgba(0,0,0,.75)';
const QR_RADIUS = 10;

export function dateStyle(template: TemplateDefinition): LayerStyle {
  return {
    position: 'absolute',
    left: template.date.x,
    top: template.date.y,
    width: template.date.width,
    fontSize: template.date.fontSize,
    fontWeight: CARD_TEXT_WEIGHT,
    lineHeight: 1.15,
    color: template.dateColor,
    textAlign: template.dateAlign,
    whiteSpace: 'nowrap',
  };
}

/** Card text font family for a card language (both map to the StarNews faces). */
export function cardFontFamily(language: string): string {
  return language === 'en' ? 'StarEnglish' : 'StarBangla';
}

/** Horizontal breathing room inside the pill, each side (layout px). */
const PILL_INSET = 6;
/** Long categories shrink to fit, but never below this share of the template size. */
const PILL_MIN_SCALE = 0.6;

/**
 * Largest font size (≤ the template's) at which `text` fits inside the baked pill.
 * `measure(fontSize)` returns the rendered text width at that size; preview and export
 * pass the same canvas measurement, so they always agree.
 */
export function fitPillFontSize(template: TemplateDefinition, measure: (fontSize: number) => number): number {
  const pill = template.photoTag;
  if (!pill) return 0;
  const available = pill.width - PILL_INSET * 2;
  const floor = Math.ceil(pill.fontSize * PILL_MIN_SCALE);
  for (let size = pill.fontSize; size > floor; size -= 1) {
    if (measure(size) <= available) return size;
  }
  return floor;
}

/** Canvas text measurement with the card's font (call after the font has loaded). */
export function canvasTextMeasure(text: string, family: string): (fontSize: number) => number {
  const ctx = document.createElement('canvas').getContext('2d');
  return (fontSize) => {
    if (!ctx) return 0;
    ctx.font = `${CARD_TEXT_WEIGHT} ${fontSize}px ${family}`;
    return ctx.measureText(text).width;
  };
}

/** Category text centred inside the baked yellow pill; `fontSize` comes from fitPillFontSize. */
export function pillStyle(template: TemplateDefinition, fontSize?: number): LayerStyle | null {
  const pill = template.photoTag;
  if (!pill) return null;
  return {
    position: 'absolute',
    left: pill.x,
    top: pill.y,
    width: pill.width,
    height: pill.height,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: `0 ${PILL_INSET}px`,
    boxSizing: 'border-box',
    fontSize: fontSize ?? pill.fontSize,
    fontWeight: CARD_TEXT_WEIGHT,
    lineHeight: 1,
    color: '#000000',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  };
}

/** Photo-credit tag: small dark label in a photo corner. */
export function creditStyle(template: TemplateDefinition): LayerStyle | null {
  const credit = template.photoCredit;
  if (!credit) return null;
  return {
    position: 'absolute',
    left: credit.x,
    top: credit.y,
    padding: `${Math.round(credit.fontSize * 0.3)}px ${Math.round(credit.fontSize * 0.5)}px`,
    fontSize: credit.fontSize,
    fontWeight: CARD_TEXT_WEIGHT,
    lineHeight: 1.2,
    color: '#ffffff',
    background: 'rgba(0,0,0,.62)',
    borderRadius: 4,
    whiteSpace: 'nowrap',
  };
}

export function titleStyle(template: TemplateDefinition, state: CardState): LayerStyle {
  return {
    position: 'absolute',
    left: state.titlePosition.x,
    top: state.titlePosition.y,
    width: template.title.width,
    fontSize: state.fontSize,
    fontWeight: CARD_TEXT_WEIGHT,
    lineHeight: TITLE_LINE_HEIGHT,
    textAlign: 'center',
    color: template.titleColor,
    textShadow: template.titleShadow ? PHOTO_TITLE_SHADOW : 'none',
    whiteSpace: 'pre-line',
  };
}

/** Colour for a highlighted title token; falls back to the title colour where emphasis is disabled. */
export function highlightColor(template: TemplateDefinition): string {
  return template.highlightColor ?? template.titleColor;
}

export function qrStyle(template: TemplateDefinition, state: CardState): LayerStyle | null {
  if (!template.qr) return null;
  return {
    position: 'absolute',
    left: state.qrPosition.x,
    top: state.qrPosition.y,
    width: template.qr.width,
    height: template.qr.height,
    padding: template.qr.inset,
    background: '#ffffff',
    borderRadius: QR_RADIUS,
    boxSizing: 'border-box',
  };
}

const UNITLESS = new Set(['fontWeight', 'lineHeight', 'zIndex', 'opacity']);

/** Apply a LayerStyle to a DOM element (numbers become px except unitless properties). */
export function applyStyle(element: HTMLElement, style: LayerStyle): void {
  for (const [key, value] of Object.entries(style)) {
    const css = typeof value === 'number' && !UNITLESS.has(key) ? `${value}px` : String(value);
    element.style.setProperty(key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), css);
  }
}
