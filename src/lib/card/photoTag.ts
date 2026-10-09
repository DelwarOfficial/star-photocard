export const PHOTO_TAG_MAX_LENGTH = 40;

/** Category labels for the yellow pill on article cards (e.g. "রাজনীতি" in the reference cards). */
export const PHOTO_TAG_PRESETS = ['রাজনীতি', 'জাতীয়', 'আন্তর্জাতিক', 'অর্থনীতি', 'খেলা', 'বিনোদন'] as const;

/** Trim to 40 Unicode code points, mirroring the legacy maxlength behavior. */
export function normalizePhotoTag(input: unknown, maxLength = PHOTO_TAG_MAX_LENGTH): string {
  if (typeof input !== 'string') return '';
  return Array.from(input.trim()).slice(0, maxLength).join('');
}

export function countCodePoints(input: string): number {
  return Array.from(input).length;
}
