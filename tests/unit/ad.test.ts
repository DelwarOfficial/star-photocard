import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AD_CREATIVE_SIZE, AD_STRIP_HEIGHT, adSlot, CARD_HEIGHT, CARD_WIDTH, EXPORT_SCALE, resolveTemplate, templates } from '../../src/config/templates';
import { adCreativeStyle } from '../../src/lib/card/layerStyles';
import { cardReducer } from '../../src/lib/card/reducer';
import { createCardState, layoutDefaults } from '../../src/lib/card/types';

// Exact-case listing: existsSync is case-insensitive on Windows/macOS, but the Workers asset server is not.
const TEMPLATE_FILES = readdirSync(fileURLToPath(new URL('../../public/templates', import.meta.url)));
const served = (path: string) => TEMPLATE_FILES.includes(path.replace('/templates/', ''));

const AD = { src: 'blob:ad', width: AD_CREATIVE_SIZE.width, height: AD_CREATIVE_SIZE.height };

describe('ad registry', () => {
  it('every template has an existing ad artwork and the one strip height', () => {
    expect(templates).toHaveLength(6);
    for (const t of templates) {
      for (const path of [t.src, t.thumbnail, t.ad.artwork]) expect(served(path), `${path} (exact case)`).toBe(true);
      expect(t.ad.stripHeight).toBe(AD_STRIP_HEIGHT);
    }
  });

  it('the strip is 100 layout px = the recommended 1600 × 148 creative at export', () => {
    expect(AD_STRIP_HEIGHT).toBe(100);
    expect(Math.abs(AD_STRIP_HEIGHT * EXPORT_SCALE - AD_CREATIVE_SIZE.height)).toBeLessThan(1);
    expect(AD_CREATIVE_SIZE.width).toBe(CARD_WIDTH * EXPORT_SCALE);
  });

  it('ad mode swaps the artwork and lifts date and QR by exactly the strip height', () => {
    for (const t of templates) {
      expect(resolveTemplate(t, false)).toBe(t);
      const ad = resolveTemplate(t, true);
      expect(ad.src).toBe(t.ad.artwork);
      expect(ad.canvas).toEqual(t.canvas);
      expect(ad.date.y).toBe(t.date.y - t.ad.stripHeight);
      if (t.qr) expect(ad.qr!.y).toBe(t.qr.y - t.ad.stripHeight);
    }
  });

  it('ad layouts keep every box above the strip', () => {
    for (const t of templates) {
      const ad = resolveTemplate(t, true);
      const slot = adSlot(ad);
      expect(slot).toEqual({ x: 0, y: CARD_HEIGHT - AD_STRIP_HEIGHT, width: CARD_WIDTH, height: AD_STRIP_HEIGHT });
      const boxes = [ad.titleRegion, ad.photo, ad.photoTag, ad.qr].filter((b) => b !== null);
      for (const b of boxes) expect(b.y + b.height, t.id).toBeLessThanOrEqual(slot.y + 1);
      expect(ad.date.y + ad.date.fontSize * 1.15).toBeLessThanOrEqual(slot.y);
    }
  });
});

describe('ad creative fit', () => {
  const slot = adSlot(templates[0]!);
  it('a 1600 × 148 creative fills the strip edge to edge', () => {
    const s = adCreativeStyle(templates[0]!, AD);
    expect(Math.abs((s.left as number))).toBeLessThan(0.5);
    expect(Math.abs((s.top as number))).toBeLessThan(0.5);
    expect(Math.abs((s.width as number) - slot.width)).toBeLessThan(0.5);
    expect(Math.abs((s.height as number) - slot.height)).toBeLessThan(0.5);
  });
  it('other ratios are contained, centred and letterboxed — never cropped', () => {
    const tall = adCreativeStyle(templates[0]!, { src: 'x', width: 400, height: 400 });
    expect(tall).toMatchObject({ top: 0, width: slot.height, height: slot.height, left: (slot.width - slot.height) / 2 });
    const wide = adCreativeStyle(templates[0]!, { src: 'x', width: 4000, height: 100 });
    expect(wide).toMatchObject({ left: 0, width: slot.width });
    expect((wide.top as number) * 2 + (wide.height as number)).toBeCloseTo(slot.height);
  });
});

describe('ad state', () => {
  it('cannot turn on without a creative', () => {
    const s = createCardState('x');
    expect(cardReducer(s, { type: 'SET_AD_VISIBLE', visible: true })).toBe(s);
  });

  it('a creative turns ad mode on, shifts the QR, keeps nudges; off restores; reset clears both', () => {
    const t = templates[0]!;
    let s = cardReducer(createCardState('x'), { type: 'SET_QR_POSITION', position: { x: t.qr!.x + 5, y: t.qr!.y + 7 } });
    s = cardReducer(s, { type: 'SET_AD_IMAGE', image: AD });
    expect(s.adVisible).toBe(true);
    expect(s.adImage).toEqual(AD);
    expect(s.qrPosition).toEqual({ x: t.qr!.x + 5, y: t.qr!.y + 7 - AD_STRIP_HEIGHT });
    expect(s.titlePosition).toEqual(layoutDefaults(resolveTemplate(t, true)).titlePosition);

    const off = cardReducer(s, { type: 'SET_AD_VISIBLE', visible: false });
    expect(off.qrPosition).toEqual({ x: t.qr!.x + 5, y: t.qr!.y + 7 });
    expect(off.adImage).toEqual(AD); // kept, so toggling back on needs no re-upload
    expect(cardReducer(off, { type: 'SET_AD_VISIBLE', visible: true }).adVisible).toBe(true);

    const reset = cardReducer(s, { type: 'FULL_RESET', date: 'x', templateId: t.id });
    expect(reset).toMatchObject({ adVisible: false, adImage: null });
    expect(reset.qrPosition).toEqual({ x: t.qr!.x, y: t.qr!.y });
  });

  it('switching templates and resetting layout use the ad layout while ad mode is on', () => {
    let s = cardReducer(createCardState('x'), { type: 'SET_AD_IMAGE', image: AD });
    for (const t of templates) {
      s = cardReducer(s, { type: 'SWITCH_TEMPLATE', templateId: t.id });
      expect(s).toMatchObject(layoutDefaults(resolveTemplate(t, true)));
      expect(cardReducer(s, { type: 'RESET_LAYOUT' })).toMatchObject(layoutDefaults(resolveTemplate(t, true)));
    }
  });
});
