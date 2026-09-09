import type { Language } from '../../config/templates';

const BANGLA_MONTHS: Record<string, string> = {
  January: 'জানুয়ারি',
  February: 'ফেব্রুয়ারি',
  March: 'মার্চ',
  April: 'এপ্রিল',
  May: 'মে',
  June: 'জুন',
  July: 'জুলাই',
  August: 'আগস্ট',
  September: 'সেপ্টেম্বর',
  October: 'অক্টোবর',
  November: 'নভেম্বর',
  December: 'ডিসেম্বর',
};

const BANGLA_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBanglaDigits(input: string): string {
  return input.replace(/[0-9]/g, (digit) => BANGLA_DIGITS[Number(digit)] ?? digit);
}

function englishParts(date: Date): { day: string; month: string; year: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Dhaka',
  }).formatToParts(date);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return { day: get('day'), month: get('month'), year: get('year') };
}

/** Deterministic Dhaka date formatting (avoids ICU variance for Bangla digits). */
export function formatDhakaDate(date: Date, language: Language): string {
  const { day, month, year } = englishParts(date);
  if (language === 'bn') {
    const banglaMonth = BANGLA_MONTHS[month] ?? month;
    return `${toBanglaDigits(day)} ${banglaMonth} ${toBanglaDigits(year)}`;
  }
  return `${day} ${month} ${year}`;
}

/** Strict ISO-ish date parsing; returns null instead of falling back to now. */
export function parseArticleDate(input: unknown): Date | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  const value = input.trim();
  // Strict calendar validation for date-only inputs (Date.parse rolls Feb 29 over).
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day > daysInMonth) return null;
    return new Date(Date.UTC(year, month - 1, day));
  }
  const time = Date.parse(value);
  if (Number.isNaN(time)) return null;
  return new Date(time);
}
