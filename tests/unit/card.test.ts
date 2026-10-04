import { describe, expect, it } from 'vitest';
import { CARD_HEIGHT, CARD_WIDTH, templates } from '../../src/config/templates';
import { coverGeometry, clampPhotoOffset, clampToCanvas, previewScale } from '../../src/lib/card/geometry';
import { titleFontSize, tokenizeTitle } from '../../src/lib/card/highlightTitle';
import { normalizePhotoTag, countCodePoints } from '../../src/lib/card/photoTag';
import { cardReducer } from '../../src/lib/card/reducer';
import { initialCardState } from '../../src/lib/card/types';
import { formatDhakaDate, parseArticleDate, toBanglaDigits } from '../../src/lib/text/dates';

describe('card geometry', () => {
  it('covers a landscape photo viewport', () => {
    expect(
      coverGeometry({ width: 1920, height: 1080 }, { x: 1, y: 1, width: 1080, height: 730 }),
    ).toMatchObject({ x: -107.88888888888891, y: 1, width: 1297.7777777777778, height: 730 });
  });
  it('covers portrait, square and panorama images', () => {
    const viewport = { x: 1, y: 1, width: 1080, height: 730 };
    for (const image of [
      { width: 1080, height: 1350 },
      { width: 800, height: 800 },
      { width: 3000, height: 500 },
    ]) {
      const drawn = coverGeometry(image, viewport, 1, { x: 0, y: 0 });
      expect(drawn.width).toBeGreaterThanOrEqual(viewport.width - 1e-6);
      expect(drawn.height).toBeGreaterThanOrEqual(viewport.height - 1e-6);
    }
  });
  it('applies zoom and offset per shared cover math', () => {
    const drawn = coverGeometry({ width: 1000, height: 1000 }, { x: 1, y: 1, width: 1080, height: 730 }, 2, {
      x: 10,
      y: -5,
    });
    expect(drawn.width).toBeCloseTo(2160, 5);
    expect(drawn.height).toBeCloseTo(2160, 5);
    expect(drawn.x).toBeCloseTo(1 + (1080 - 2160) / 2 + 10, 5);
    expect(drawn.y).toBeCloseTo(1 + (730 - 2160) / 2 - 5, 5);
  });
  it('clamps photo offsets so the viewport stays covered', () => {
    const viewport = { x: 1, y: 1, width: 1080, height: 730 };
    const clamped = clampPhotoOffset({ width: 1920, height: 1080 }, viewport, 1, { x: 5000, y: -5000 });
    const redrawn = coverGeometry({ width: 1920, height: 1080 }, viewport, 1, clamped);
    expect(redrawn.x).toBeLessThanOrEqual(viewport.x + 1e-6);
    expect(redrawn.y).toBeLessThanOrEqual(viewport.y + 1e-6);
    expect(redrawn.x + redrawn.width).toBeGreaterThanOrEqual(viewport.x + viewport.width - 1e-6);
  });
  it('keeps title and QR inside the canvas', () => {
    expect(clampToCanvas({ x: -50, y: 1400 }, { width: 1040, height: 120 })).toEqual({ x: 0, y: 960 });
    expect(clampToCanvas({ x: 2000, y: -20 }, { width: 134, height: 134 })).toEqual({ x: 946, y: 0 });
  });
  it('caps preview scale at one', () => {
    expect(previewScale(2160, 2700)).toBe(1);
    expect(previewScale(540)).toBeCloseTo(0.5, 5);
  });
});

describe('headline rules', () => {
  it.each([
    [10, 75],
    [11, 60],
    [16, 52],
    [21, 44],
  ])('sizes %s words to %s', (count, size) => {
    expect(titleFontSize(Array(count).fill('word').join(' '))).toBe(size);
  });
  it('uses paired explicit highlights', () => {
    expect(tokenizeTitle('A *major story* now')[0]).toContainEqual({ text: 'major story', highlighted: true });
  });
  it('keeps unmatched markers literal', () => {
    expect(tokenizeTitle('A * marker')[0]?.map((t) => t.text).join('')).toBe('A * marker');
  });
  it('auto-highlights floor(30%)..floor(70%) for >3 words', () => {
    // 10 words: start=3, end=7 -> words[3..7] highlighted (0-based).
    const words = ['w0', 'w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9'];
    const tokens = tokenizeTitle(words.join(' '))[0]!.filter((t) => t.text.trim());
    expect(tokens.map((t) => t.highlighted)).toEqual([
      false, false, false, true, true, true, true, true, false, false,
    ]);
  });
  it('does not auto-highlight 3 words', () => {
    const tokens = tokenizeTitle('one two three')[0]!;
    expect(tokens.every((t) => !t.highlighted)).toBe(true);
  });
  it('preserves newlines', () => {
    expect(tokenizeTitle('line one\nline two')).toHaveLength(2);
  });
  it('renders HTML-like input as text', () => {
    const joined = tokenizeTitle('<b>bold</b>')[0]!.map((t) => t.text).join('');
    expect(joined).toBe('<b>bold</b>');
  });
});

describe('photo tags', () => {
  it('trims to 40 code points including emoji and combining marks', () => {
    // 'e' + combining acute = 2 code points per cluster (code-point, not grapheme, counting).
    expect(countCodePoints('é'.repeat(30))).toBe(60);
    expect(normalizePhotoTag(`${'ক'.repeat(39)}extra tail`).length).toBeLessThanOrEqual(40);
    expect(Array.from(normalizePhotoTag(`${'ক'.repeat(39)}extra tail`)).length).toBe(40);
    expect(normalizePhotoTag('  ফাইল ছবি  ')).toBe('ফাইল ছবি');
    expect(normalizePhotoTag('📰'.repeat(50))).toBe('📰'.repeat(40));
  });
});

describe('dates', () => {
  it('formats Dhaka dates with Bengali digits and months', () => {
    const date = new Date('2026-09-04T00:00:00Z');
    expect(formatDhakaDate(date, 'bn')).toBe('৪ সেপ্টেম্বর ২০২৬');
    expect(formatDhakaDate(date, 'en')).toBe('4 September 2026');
  });
  it('translates digits', () => {
    expect(toBanglaDigits('2026-09-04')).toBe('২০২৬-০৯-০৪');
  });
  it('rejects invalid dates strictly', () => {
    expect(parseArticleDate('not a date')).toBeNull();
    expect(parseArticleDate('')).toBeNull();
    expect(parseArticleDate('2026-02-29')).toBeNull(); // 2026 is not a leap year
    expect(parseArticleDate('2024-02-29T00:00:00Z')).not.toBeNull();
  });
});

describe('template registry', () => {
  it('ships four square templates with layers inside the canvas', () => {
    expect(CARD_WIDTH).toBe(1080);
    expect(CARD_HEIGHT).toBe(1080);
    expect(templates.map((t) => t.id)).toEqual(['common-card', 'digital-card', 'just-in', 'entertainment']);
    for (const template of templates) {
      expect(template.canvas).toEqual({ width: 1080, height: 1080 });
      expect(template.photo.x + template.photo.width).toBeLessThanOrEqual(1080);
      expect(template.photo.y + template.photo.height).toBeLessThanOrEqual(1080);
      expect(template.title.x + template.title.width).toBeLessThanOrEqual(1080);
      expect(template.qr.x + template.qr.width).toBeLessThanOrEqual(1080);
      expect(template.qr.y + template.qr.height).toBeLessThanOrEqual(1080);
      expect(template.title.maxFontSize).toBeLessThanOrEqual(120);
      expect(template.title.defaultFontSize).toBeLessThanOrEqual(template.title.maxFontSize);
    }
  });
});

describe('reducer', () => {
  it('generates, edits, resets layout and fully resets', () => {
    let state = initialCardState;
    state = cardReducer(state, {
      type: 'GENERATE_SUCCESS',
      title: 'Hello',
      publicationDate: '৪ সেপ্টেম্বর ২০২৬',
      language: 'bn',
      imageSrc: '/api/image?token=x',
      imageKind: 'remote',
    });
    expect(state.loadStatus).toBe('ready');
    expect(state.imageScale).toBe(1);
    state = cardReducer(state, { type: 'SET_FONT_SIZE', size: 999 });
    expect(state.fontSize).toBe(120);
    state = cardReducer(state, { type: 'SET_IMAGE_SCALE', scale: 99 });
    expect(state.imageScale).toBe(3);
    state = cardReducer(state, { type: 'SWITCH_TEMPLATE', templateId: 'digital-card' });
    expect(state.templateId).toBe('digital-card');
    expect(state.title).toBe('Hello'); // content preserved
    state = cardReducer(state, { type: 'RESET_LAYOUT' });
    expect(state.imageScale).toBe(1);
    state = cardReducer(state, { type: 'FULL_RESET' });
    expect(state).toEqual(initialCardState);
  });
  it('clamps font and zoom bounds', () => {
    expect(cardReducer(initialCardState, { type: 'SET_FONT_SIZE', size: 10 }).fontSize).toBe(30);
    expect(cardReducer(initialCardState, { type: 'SET_IMAGE_SCALE', scale: 0.5 }).imageScale).toBe(1);
  });
});
