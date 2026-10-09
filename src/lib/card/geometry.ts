import { CARD_HEIGHT, CARD_WIDTH, type Point, type Rect, type Size } from '../../config/templates';

const DEFAULT_CANVAS: Size = { width: CARD_WIDTH, height: CARD_HEIGHT };

export type ImageGeometry = Readonly<Rect & { scale: number }>;

/**
 * Shared cover math for intrinsic image (iw, ih), viewport (x, y, vw, vh),
 * zoom z and offset (dx, dy). Used by preview, drag bounds and export.
 */
export function coverGeometry(
  image: Readonly<{ width: number; height: number }>,
  viewport: Rect,
  zoom = 1,
  offset: Point = { x: 0, y: 0 },
): ImageGeometry {
  if (image.width <= 0 || image.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    throw new RangeError('Image and viewport dimensions must be positive.');
  }
  const safeZoom = Number.isFinite(zoom) ? Math.max(1, zoom) : 1;
  const coverScale = Math.max(viewport.width / image.width, viewport.height / image.height);
  const scale = coverScale * safeZoom;
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

/** Scale that fits the active template's canvas into a preview box (never upscales). */
export function previewScale(width: number, height = Number.POSITIVE_INFINITY, canvas: Size = DEFAULT_CANVAS): number {
  if (!Number.isFinite(width) || width < 0) return 0;
  if (height !== Number.POSITIVE_INFINITY && (!Number.isFinite(height) || height < 0)) return 0;
  return Math.min(width / canvas.width, height / canvas.height, 1);
}

/** Keep the photo covering its viewport: clamp drag offsets to drawn overflow. */
export function clampPhotoOffset(
  image: Readonly<{ width: number; height: number }>,
  viewport: Rect,
  zoom: number,
  offset: Point,
): Point {
  const drawn = coverGeometry(image, viewport, zoom, { x: 0, y: 0 });
  const overflowX = Math.max(0, (drawn.width - viewport.width) / 2);
  const overflowY = Math.max(0, (drawn.height - viewport.height) / 2);
  return {
    x: Math.min(overflowX, Math.max(-overflowX, offset.x)),
    y: Math.min(overflowY, Math.max(-overflowY, offset.y)),
  };
}

/** Keep a box fully inside the active template's canvas. */
export function clampToCanvas(position: Point, size: Size, canvas: Size = DEFAULT_CANVAS): Point {
  return {
    x: Math.min(canvas.width - size.width, Math.max(0, position.x)),
    y: Math.min(canvas.height - size.height, Math.max(0, position.y)),
  };
}
