export const PHOTO_TAG_MAX_LENGTH = 40;

export const PHOTO_TAG_PRESETS = ['সংগৃহীত', 'এআই ছবি', 'ফাইল ছবি', 'ভারতের ছবি'] as const;

/** Trim to 40 Unicode code points, mirroring the legacy maxlength behavior. */
export function normalizePhotoTag(input: unknown, maxLength = PHOTO_TAG_MAX_LENGTH): string {
  if (typeof input !== 'string') return '';
  return Array.from(input.trim()).slice(0, maxLength).join('');
}

export function countCodePoints(input: string): number {
  return Array.from(input).length;
}
