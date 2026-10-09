import { CARD_HEIGHT, CARD_WIDTH, type Point, type Rect, type Size } from '../../config/templates';

const DEFAULT_CANVAS: Size = { width: CARD_WIDTH, height: CARD_HEIGHT };

export type ImageGeometry = Readonly<Rect & { scale: number }>;

/**
 * How a photo sits in its template window. `contain` (the default) shows the whole
 * image — scale-to-fit, centred, letterboxed on the card background — so nothing is
 * cropped at zoom 1. `cover` fills the window and crops the overflow.
 */
export type PhotoFit = 'contain' | 'cover';
export const PHOTO_FIT: PhotoFit = 'contain';

/**
 * Shared photo math for intrinsic image (iw, ih), viewport (x, y, vw, vh), zoom z and
 * offset (dx, dy). The ONE function preview CSS, drag bounds and the exporter agree on.
 */
export function photoGeometry(
  image: Readonly<{ width: number; height: number }>,
  viewport: Rect,
  zoom = 1,
  offset: Point = { x: 0, y: 0 },
  fit: PhotoFit = PHOTO_FIT,
): ImageGeometry {
  if (image.width <= 0 || image.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    throw new RangeError('Image and viewport dimensions must be positive.');
  }
  const safeZoom = Number.isFinite(zoom) ? Math.max(1, zoom) : 1;
  const sx = viewport.width / image.width;
  const sy = viewport.height / image.height;
  const baseScale = fit === 'contain' ? Math.min(sx, sy) : Math.max(sx, sy);
  const scale = baseScale * safeZoom;
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: viewport.x + (viewport.width - width) / 2 + offset.x,
    y: viewport.y + (viewport.height - height) / 2 + offset.y,
    width,
    height,
    scale,
  };
}

/** Cover variant, kept for callers and tests that want fill-and-crop explicitly. */
export function coverGeometry(
  image: Readonly<{ width: number; height: number }>,
  viewport: Rect,
  zoom = 1,
  offset: Point = { x: 0, y: 0 },
): ImageGeometry {
  return photoGeometry(image, viewport, zoom, offset, 'cover');
}

/** Scale that fits the active template's canvas into a preview box (never upscales). */
export function previewScale(width: number, height = Number.POSITIVE_INFINITY, canvas: Size = DEFAULT_CANVAS): number {
  if (!Number.isFinite(width) || width < 0) return 0;
  if (height !== Number.POSITIVE_INFINITY && (!Number.isFinite(height) || height < 0)) return 0;
  return Math.min(width / canvas.width, height / canvas.height, 1);
}

/**
 * Clamp a drag offset per axis to half the difference between drawn size and window:
 * - photo smaller than the window (letterboxed axis): it may move but stays fully inside;
 * - photo larger (zoomed in): it may pan, but never so far that a gap opens at the edge.
 */
export function clampPhotoOffset(
  image: Readonly<{ width: number; height: number }>,
  viewport: Rect,
  zoom: number,
  offset: Point,
  fit: PhotoFit = PHOTO_FIT,
): Point {
  const drawn = photoGeometry(image, viewport, zoom, { x: 0, y: 0 }, fit);
  const slackX = Math.abs(drawn.width - viewport.width) / 2;
  const slackY = Math.abs(drawn.height - viewport.height) / 2;
  return {
    x: Math.min(slackX, Math.max(-slackX, offset.x)),
    y: Math.min(slackY, Math.max(-slackY, offset.y)),
  };
}

/** Keep a box fully inside the active template's canvas. */
export function clampToCanvas(position: Point, size: Size, canvas: Size = DEFAULT_CANVAS): Point {
  return {
    x: Math.min(canvas.width - size.width, Math.max(0, position.x)),
    y: Math.min(canvas.height - size.height, Math.max(0, position.y)),
  };
}
