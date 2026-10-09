import type { TemplateDefinition } from '../../config/templates';
import type { CardState } from './types';

/**
 * Single source of truth for the text/QR layer styles. The React preview
 * passes these objects straight to `style`; the html2canvas exporter applies
 * them with {@link applyStyle}. Geometry comes from the active template only.
 */
export type LayerStyle = Readonly<Record<string, string | number>>;

const TITLE_LINE_HEIGHT = 1.3;
const PHOTO_TITLE_SHADOW = '0 3px 10px rgba(0,0,0,.75)';
const QR_RADIUS = 10;

export function dateStyle(template: TemplateDefinition): LayerStyle {
  return {
    position: 'absolute',
    left: template.date.x,
    top: template.date.y,
    width: template.date.width,
    fontSize: template.date.fontSize,
    fontWeight: 700,
    lineHeight: 1.15,
    color: template.dateColor,
    textAlign: template.dateAlign,
    whiteSpace: 'nowrap',
  };
}

/** Category text centred inside the baked yellow pill. */
export function pillStyle(template: TemplateDefinition): LayerStyle | null {
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
    fontSize: pill.fontSize,
    fontWeight: 700,
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
    fontWeight: 700,
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
    // Reference cards set headlines in StarNews Bold (700), not Black.
    fontWeight: 700,
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
