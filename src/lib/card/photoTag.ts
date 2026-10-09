export const PHOTO_TAG_MAX_LENGTH = 40;

/** Category labels for the yellow pill on article cards (e.g. "রাজনীতি" in the reference cards). */
export const PHOTO_TAG_PRESETS = ['রাজনীতি', 'জাতীয়', 'আন্তর্জাতিক', 'অর্থনীতি', 'খেলা', 'বিনোদন'] as const;

/** Trim to 40 Unicode code points, mirroring the legacy maxlength behavior. */
export function normalizePhotoTag(input: unknown, maxLength = PHOTO_TAG_MAX_LENGTH): string {
  if (typeof input !== 'string') return '';
  return Array.from(input.trim()).slice(0, maxLength).join('');
}

/**
 * Live-typing limit: cap at 40 code points (Array.from, so Bengali conjuncts are not split by
 * UTF-16 length) but do NOT trim — trimming on each keystroke eats the space between words.
 */
export function limitTagInput(input: string, maxLength = PHOTO_TAG_MAX_LENGTH): string {
  return Array.from(input).slice(0, maxLength).join('');
}

/** A tag that is empty or whitespace-only shows nothing on the card. */
export function hasTag(tag: string): boolean {
  return tag.trim() !== '';
}

export function countCodePoints(input: string): number {
  return Array.from(input).length;
}

/** Photo-credit presets, ported from the RTV plugin's tag "levels". */
export const PHOTO_CREDIT_PRESETS = [
  'সংগৃহীত',
  'এআই ছবি',
  'ফাইল ছবি',
  'প্রতীকী ছবি',
  'সৌজন্য ছবি',
  'ছবি: স্টার নিউজ',
  'স্টার নিউজ গ্রাফিক্স',
] as const;
