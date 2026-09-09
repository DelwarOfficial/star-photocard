import type { CardState } from './types';

export type ExportSnapshot = Readonly<{
  state: CardState;
  templateSrc: string;
  photoSrc: string;
  qrDataUrl: string | null;
}>;

export interface CardRenderer {
  readonly name: string;
  render(snapshot: ExportSnapshot): Promise<Blob>;
}

export function downloadFilename(now = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const h = pad(now.getHours());
  const min = pad(now.getMinutes());
  const s = pad(now.getSeconds());
  return `star-news-photocard-${y}${m}${d}-${h}${min}${s}.png`;
}

export function isClipboardSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext === true &&
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard &&
    typeof ClipboardItem !== 'undefined'
  );
}

/** Decode an image URL for export; rejects on failure so callers can fall back. */
export function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'sync';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('IMAGE_DECODE_FAILED'));
    img.src = src;
  });
}

export async function waitForFonts(): Promise<void> {
  try {
    await document.fonts.ready;
  } catch {
    // Font readiness is best-effort; export still proceeds.
  }
}
