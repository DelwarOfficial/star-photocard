import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CARD_HEIGHT, CARD_WIDTH, EXPORT_HEIGHT, EXPORT_SCALE, EXPORT_WIDTH, templates, templatesForMode } from '../../src/config/templates';
import { coverGeometry, clampPhotoOffset, clampToCanvas, previewScale } from '../../src/lib/card/geometry';
import { titleFontSize, tokenizeTitle } from '../../src/lib/card/highlightTitle';
import { normalizePhotoTag, countCodePoints } from '../../src/lib/card/photoTag';
import { cardReducer, clampZoom, ZOOM_MAX, ZOOM_MIN } from '../../src/lib/card/reducer';
import { createCardState, initialCardState } from '../../src/lib/card/types';
import { formatDhakaDate, parseArticleDate, toBanglaDigits, todayBanglaDate } from '../../src/lib/text/dates';

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
  it('keeps title and QR inside the active canvas', () => {
    // Default canvas is the 1080 × 1350 portrait card.
    expect(clampToCanvas({ x: -50, y: 1400 }, { width: 1040, height: 120 })).toEqual({ x: 0, y: 1230 });
    expect(clampToCanvas({ x: 2000, y: -20 }, { width: 134, height: 134 })).toEqual({ x: 946, y: 0 });
    // Any other canvas size is honoured.
    expect(clampToCanvas({ x: 2000, y: 2000 }, { width: 100, height: 100 }, { width: 500, height: 800 })).toEqual({
      x: 400,
      y: 700,
    });
  });
  it('caps preview scale at one and fits the template canvas', () => {
    expect(previewScale(2160, 2700)).toBe(1);
    expect(previewScale(540)).toBeCloseTo(0.5, 5);
    expect(previewScale(540, 540, { width: 1080, height: 1350 })).toBeCloseTo(0.4, 5);
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
  it('exports at the artwork-native 1600 × 2000, same 4:5 shape as the layout', () => {
    expect([EXPORT_WIDTH, EXPORT_HEIGHT]).toEqual([1600, 2000]);
    expect(EXPORT_HEIGHT / EXPORT_WIDTH).toBeCloseTo(CARD_HEIGHT / CARD_WIDTH, 10);
    expect(EXPORT_SCALE).toBeCloseTo(1600 / 1080, 10);
  });
  it('ships six 1080 × 1350 templates with layers inside their canvas', () => {
    expect(CARD_WIDTH).toBe(1080);
    expect(CARD_HEIGHT).toBe(1350);
    expect(templates.map((t) => t.id)).toEqual([
      'common-card',
      'common-card-bottom',
      'special-card-top',
      'special-card-bottom',
      'just-in',
      'breaking-news',
    ]);
    const inside = (box: { x: number; y: number; width: number; height: number }, canvas: { width: number; height: number }) => {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(canvas.width);
      expect(box.y + box.height).toBeLessThanOrEqual(canvas.height);
    };
    for (const template of templates) {
      const { canvas } = template;
      expect(canvas).toEqual({ width: 1080, height: 1350 });
      if (template.photo) inside(template.photo, canvas);
      if (template.qr) inside(template.qr, canvas);
      if (template.photoTag) inside(template.photoTag, canvas);
      inside({ ...template.date, height: template.date.fontSize }, canvas);
      expect(template.title.x + template.title.width).toBeLessThanOrEqual(canvas.width);
      expect(template.title.y).toBeLessThan(canvas.height);
      expect(template.title.maxFontSize).toBeLessThanOrEqual(120);
      expect(template.title.defaultFontSize).toBeLessThanOrEqual(template.title.maxFontSize);
    }
  });
  it('declares the two creation modes and their per-template flow fields', () => {
    const byId = Object.fromEntries(templates.map((t) => [t.id, t]));
    expect(templatesForMode('article').map((t) => t.id)).toEqual([
      'common-card',
      'common-card-bottom',
      'special-card-top',
      'special-card-bottom',
    ]);
    expect(templatesForMode('custom').map((t) => t.id)).toEqual(['just-in', 'breaking-news']);
    // just-in: upload + text, QR (root domain), two meta rows.
    expect(byId['just-in']).toMatchObject({ requiresImage: true, metaRows: 2 });
    for (const t of templates) expect(t.qr, t.id).not.toBeNull();
    // QR sits bottom-right, left of the meta stack's icons (artwork x ≈ 1238 → 836 here).
    for (const t of templates) expect(t.qr!.x + t.qr!.width, t.id).toBeLessThan(836);
    expect(byId['just-in']!.photo).not.toBeNull();
    // breaking-news: text only — no photo at all; black headline, no emphasis colour.
    expect(byId['breaking-news']).toMatchObject({
      requiresImage: false,
      photo: null,
      titleColor: '#000000',
      titleShadow: false,
      highlightColor: null,
      dateColor: '#000000',
    });
    for (const t of templatesForMode('article')) {
      expect(t.requiresImage).toBe(false);
      expect(t.metaRows).toBe(3);
      expect(t.qr).not.toBeNull();
      expect(t.dateAlign).toBe('left');
      expect(t.highlightColor).toBe('#FFF200');
    }
    // Photo overlays get a text shadow; panel cards do not.
    expect(byId['special-card-top']!.titleShadow).toBe(true);
    expect(byId['common-card']!.titleShadow).toBe(false);
  });
  it('points every template and thumbnail at a shipped asset', () => {
    for (const template of templates) {
      for (const path of [template.src, template.thumbnail]) {
        expect(existsSync(fileURLToPath(new URL(`../../public${path}`, import.meta.url))), path).toBe(true);
      }
    }
  });
});

describe('reducer', () => {
  it('generates, edits, resets layout and fully resets', () => {
    let state = initialCardState;
    state = cardReducer(state, {
      type: 'GENERATE_SUCCESS',
      articleUrl: 'https://www.starnews.com.bd/a',
      title: 'Hello',
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
    state = cardReducer(state, { type: 'SWITCH_TEMPLATE', templateId: 'just-in' });
    expect(state.templateId).toBe('just-in');
    expect(state.title).toBe('Hello'); // content preserved
    expect(state.articleUrl).toBe('https://www.starnews.com.bd/a');
    // Layout follows the new template's geometry.
    const justIn = templates.find((t) => t.id === 'just-in')!;
    expect(state.titlePosition).toEqual({ x: justIn.title.x, y: justIn.title.y });
    expect(state.qrPosition).toEqual({ x: justIn.qr!.x, y: justIn.qr!.y });
    expect(state.fontSize).toBe(justIn.title.defaultFontSize);
    expect(state.imageScale).toBe(1);
    state = cardReducer(state, { type: 'GENERATE_START' });
    state = cardReducer(state, { type: 'GENERATE_ERROR' });
    expect(state.title).toBe('Hello'); // failed refetch keeps the composition
    state = cardReducer(state, { type: 'RESET_LAYOUT' });
    expect(state.imageScale).toBe(1);
    state = cardReducer(state, { type: 'FULL_RESET' });
    expect(state).toEqual(initialCardState);
  });
  it('auto-dates every new and reset card in Bengali', () => {
    const today = todayBanglaDate();
    expect(initialCardState.publicationDate).toBe(today);
    expect(createCardState().publicationDate).toBe(today);
    expect(todayBanglaDate(new Date('2026-10-09T06:00:00Z'))).toBe('০৯ অক্টোবর ২০২৬');
    // Late UTC evening is already the next day in Dhaka (UTC+6).
    expect(todayBanglaDate(new Date('2026-10-09T19:00:00Z'))).toBe('১০ অক্টোবর ২০২৬');
    const edited = cardReducer(initialCardState, { type: 'SET_DATE', date: 'custom' });
    // Fetching an article never replaces the card date.
    const fetched = cardReducer(initialCardState, {
      type: 'GENERATE_SUCCESS',
      articleUrl: 'https://www.starnews.com.bd/a',
      title: 'x',
      language: 'bn',
      imageSrc: '/p.jpg',
      imageKind: 'remote',
    });
    expect(fetched.publicationDate).toBe(today);
    const reset = cardReducer(edited, { type: 'FULL_RESET', date: '১ জানুয়ারি ২০২৭', templateId: 'breaking-news' });
    expect(reset.publicationDate).toBe('১ জানুয়ারি ২০২৭');
    // A reset keeps the chosen card type and its layout defaults.
    expect(reset.templateId).toBe('breaking-news');
    expect(reset.titlePosition).toEqual({ x: templates[5]!.title.x, y: templates[5]!.title.y });
  });
  it('pre-fills the pill with the article category only when the user has not set one', () => {
    const success = { type: 'GENERATE_SUCCESS', articleUrl: 'https://starnews.com.bd/a', title: 't', language: 'bn', imageSrc: '/p.jpg', imageKind: 'remote', category: 'রংপুর' } as const;
    expect(cardReducer(initialCardState, success).photoTag).toBe('রংপুর');
    const userSet = cardReducer(initialCardState, { type: 'SET_PHOTO_TAG', tag: 'খেলা' });
    expect(cardReducer(userSet, success).photoTag).toBe('খেলা');
    expect(cardReducer(initialCardState, { ...success, category: null }).photoTag).toBe('');
    // Still editable afterwards.
    const edited = cardReducer(cardReducer(initialCardState, success), { type: 'SET_PHOTO_TAG', tag: 'জাতীয়' });
    expect(edited.photoTag).toBe('জাতীয়');
  });
  it('sets photo credits: presets, 40 code points, spaces kept while typing, cleared by reset', () => {
    let st = cardReducer(initialCardState, { type: 'SET_PHOTO_CREDIT', credit: 'এআই ছবি' });
    expect(st.photoCredit).toBe('এআই ছবি');
    // Typing "ছবি " must keep the trailing space so the next word can follow.
    st = cardReducer(st, { type: 'SET_PHOTO_CREDIT', credit: 'ছবি ' });
    expect(st.photoCredit).toBe('ছবি ');
    const long = 'ক'.repeat(45);
    expect(Array.from(cardReducer(st, { type: 'SET_PHOTO_CREDIT', credit: long }).photoCredit)).toHaveLength(40);
    // Category pill gets the same live-typing behaviour.
    expect(cardReducer(st, { type: 'SET_PHOTO_TAG', tag: 'রংপুর ' }).photoTag).toBe('রংপুর ');
    expect(cardReducer(st, { type: 'FULL_RESET' }).photoCredit).toBe('');
  });
  it('places every credit tag inside its template photo window', () => {
    for (const t of templates) {
      if (!t.photo) {
        expect(t.photoCredit, t.id).toBeNull();
        continue;
      }
      const c = t.photoCredit!;
      const height = Math.round(c.fontSize * 1.2 + c.fontSize * 0.6); // line + vertical padding
      expect(c.x, t.id).toBeGreaterThanOrEqual(t.photo.x);
      expect(c.y, t.id).toBeGreaterThanOrEqual(t.photo.y);
      expect(c.y + height, t.id).toBeLessThanOrEqual(t.photo.y + t.photo.height);
    }
  });
  it('steps zoom without float drift and clamps it', () => {
    let z = 1;
    for (let i = 0; i < 5; i += 1) z = clampZoom(z + 0.1);
    expect(z).toBe(1.5);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(-1)).toBe(ZOOM_MIN);
    expect(clampZoom(Number.NaN)).toBe(ZOOM_MIN);
  });
  it('clamps font and zoom bounds', () => {
    expect(cardReducer(initialCardState, { type: 'SET_FONT_SIZE', size: 10 }).fontSize).toBe(30);
    expect(cardReducer(initialCardState, { type: 'SET_IMAGE_SCALE', scale: 0.5 }).imageScale).toBe(1);
  });
});
