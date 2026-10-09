import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import QRCode from 'qrcode';
import { todayBanglaDate } from '../../src/lib/text/dates';

const ARTICLE_URL = 'https://www.starnews.com.bd/bangla-news';
// Exported PNG size (artwork-native 1600 × 2000); layout coordinates stay in the 1080-wide space.
const CARD_W = 1600;
const CARD_H = 2000;
const DIMENSIONS = `${CARD_W} × ${CARD_H} PNG`;
const UPLOAD_PHOTO = fileURLToPath(new URL('../../public/photos/Star-news-file-image.webp', import.meta.url));

async function mockArticle(
  page: Page,
  extra: { imageUrl?: string; category?: string | null; canonicalUrl?: string },
): Promise<void> {
  await page.route('**/api/article', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          canonicalUrl: ARTICLE_URL,
          title: 'পরীক্ষামূলক *শিরোনাম* এখানে',
          publishedAt: '2026-09-04T10:30:00+06:00',
          formattedDate: '৪ সেপ্টেম্বর ২০২৬',
          dateSource: 'json-ld',
          language: 'bn',
          ...extra,
        },
      }),
    }),
  );
}

/** Astro drops the `ssr` attribute once the island hydrates; typing earlier is lost. */
async function open(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
}

async function generate(page: Page): Promise<void> {
  await open(page);
  await page.getByLabel('Star News article link').fill(ARTICLE_URL);
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Card ready');
}

/**
 * The card's QR must encode `target`: sample every module of the rendered QR
 * image and compare with the expected matrix (equivalent to scanning it).
 */
async function expectQrEncodes(page: Page, target: string): Promise<void> {
  const { modules } = QRCode.create(target, { errorCorrectionLevel: 'M' });
  const expected = Array.from(modules.data, (bit) => (bit ? '1' : '0')).join('');
  const img = page.locator('.qr img');
  await expect(img).toHaveCount(1);
  await expect
    .poll(() =>
      img.evaluate(async (el: HTMLImageElement, size: number) => {
        await el.decode();
        const canvas = document.createElement('canvas');
        canvas.width = el.naturalWidth;
        canvas.height = el.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(el, 0, 0);
        const cell = el.naturalWidth / size; // margin 0: modules fill the image
        let bits = '';
        for (let r = 0; r < size; r += 1) {
          for (let c = 0; c < size; c += 1) {
            const [red] = ctx.getImageData(Math.floor((c + 0.5) * cell), Math.floor((r + 0.5) * cell), 1, 1).data;
            bits += red! < 128 ? '1' : '0';
          }
        }
        return bits;
      }, modules.size),
    )
    .toBe(expected);
}

/** Download the PNG and return the RGB at each card point (given in 1080 × 1350 layout space). */
async function exportPixels(page: Page, points: Array<{ x: number; y: number }>): Promise<number[][]> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download PNG' }).click(),
  ]);
  const b64 = (await readFile((await download.path())!)).toString('base64');
  return page.evaluate(
    async ({ src, points }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      // Points are in the 1080-wide layout space; the PNG is rendered larger.
      const k = img.width / 1080;
      return points.map(({ x, y }) =>
        Array.from(ctx.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data.slice(0, 3)),
      );
    },
    { src: `data:image/png;base64,${b64}`, points },
  );
}

/** A solid-colour PNG generated in the page, for upload tests. */
async function solidPng(page: Page, color: string): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const b64 = await page.evaluate((fill) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1]!;
  }, color);
  return { name: 'solid.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}

/** The template picker button (its name includes the current template). */
const pickerButton = (page: Page) => page.getByRole('button', { name: /^Template/ });

async function pickTemplate(page: Page, name: RegExp): Promise<void> {
  await pickerButton(page).click();
  await page.getByRole('option', { name }).click();
}

async function downloadPng(page: Page): Promise<{ width: number; height: number; name: string }> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download PNG' }).click(),
  ]);
  const png = await readFile((await download.path())!);
  // PNG signature, then IHDR width/height as big-endian uint32 at bytes 16-23.
  expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  const ihdr = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: ihdr.getUint32(16), height: ihdr.getUint32(20), name: download.suggestedFilename() };
}

test.describe('photocard generator', () => {
  test('empty state disables export, auto-dates the card and validates URLs', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('heading', { name: 'Photocard Generator' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download PNG' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Copy PNG' })).toBeDisabled();
    // Auto-date: today in Bengali, already on the card and in the editable field.
    await expect(page.getByLabel('Date', { exact: true })).toHaveValue(todayBanglaDate());
    await expect(page.locator('.card-date')).toHaveText(todayBanglaDate());
    await page.getByLabel('Star News article link').fill('https://evil.test/article');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Only Star News links');
  });

  test('article mode: fetched values populate the card and stay editable', async ({ page }) => {
    await mockArticle(page, {});
    await generate(page);
    await expect(page.getByRole('button', { name: 'Download PNG' })).toBeEnabled();
    // The card date stays today's date — the article's own date is not used.
    await expect(page.locator('.card-date')).toHaveText(todayBanglaDate());
    await expectQrEncodes(page, ARTICLE_URL);
    await page.getByLabel('Headline', { exact: true }).fill('সম্পাদিত শিরোনাম');
    await expect(page.locator('.card-title')).toHaveText('সম্পাদিত শিরোনাম');
    await page.getByLabel('Category (yellow label)').fill('রাজনীতি');
    await expect(page.locator('.card-pill')).toHaveText('রাজনীতি');
  });

  test('article mode: category pre-fills the pill and the QR encodes the canonical URL', async ({ page }) => {
    const canonical = 'https://starnews.com.bd/division/25787/canonical-story';
    await mockArticle(page, { category: 'রংপুর', canonicalUrl: canonical });
    await generate(page);
    await expect(page.locator('.card-pill')).toHaveText('রংপুর');
    // Pre-filled, and still an ordinary editable text field.
    await expect(page.getByLabel('Category (yellow label)')).toHaveValue('রংপুর');
    await page.getByLabel('Category (yellow label)').fill('রংপুর বিভাগ');
    await expect(page.locator('.card-pill')).toHaveText('রংপুর বিভাগ');
    await expectQrEncodes(page, canonical);
  });

  test('post-render editing: text fields, zoom buttons, custom upload and QR toggle', async ({ page }) => {
    await mockArticle(page, { category: 'রংপুর' });
    await generate(page);

    // Text fields stay editable after generate and update the card live.
    await page.getByLabel('Headline', { exact: true }).fill('নতুন *শিরোনাম*');
    await expect(page.locator('.card-title')).toHaveText('নতুন শিরোনাম');
    await page.getByLabel('Date', { exact: true }).fill('১২ অক্টোবর ২০২৬');
    await expect(page.locator('.card-date')).toHaveText('১২ অক্টোবর ২০২৬');
    await page.getByLabel('Category (yellow label)').fill('খেলা');
    await expect(page.locator('.card-pill')).toHaveText('খেলা');

    // Zoom +/- composes with panning, and zooming back out re-clamps the pan.
    const zoomIn = page.getByRole('button', { name: 'Zoom photo in' });
    const zoomOut = page.getByRole('button', { name: 'Zoom photo out' });
    await expect(zoomOut).toBeDisabled();
    for (let i = 0; i < 5; i += 1) await zoomIn.click();
    await expect(page.getByLabel(/^Photo zoom/)).toHaveValue('1.5');
    const photoPos = page.getByText(/^Photo position:/);
    for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: 'Move photo up', exact: true }).click({ modifiers: [] });
    await page.locator('.drag-layer').first().focus();
    await page.keyboard.press('Shift+ArrowUp');
    await expect(photoPos).not.toHaveText('Photo position: 0, 0 px');
    for (let i = 0; i < 5; i += 1) await zoomOut.click();
    await expect(page.getByLabel(/^Photo zoom/)).toHaveValue('1');
    // Back at zoom 1 the pan is re-clamped into the (smaller) overflow — never left out of bounds.
    await expect(photoPos).toHaveText(/^Photo position: 0, -?\d+ px$/);

    // Custom upload overrides the article photo in preview and export.
    await page.getByLabel(/^Use your own photo/).setInputFiles(await solidPng(page, '#00c853'));
    await expect(page.locator('.photo')).toHaveAttribute('src', /^blob:/);
    const photoCentre = { x: 540, y: 300 };
    const qrCentre = { x: 765, y: 1265 }; // inside the common-card QR box
    const [photoOn, qrOn] = await exportPixels(page, [photoCentre, qrCentre]);
    expect(photoOn![1]).toBeGreaterThan(150); // green upload, not the article photo
    expect(photoOn![0]).toBeLessThan(60);
    expect(Math.min(...qrOn!)).toBeLessThan(80); // QR modules or white box are there…

    // QR off: gone from the preview and from the exported PNG.
    await page.getByLabel(/^Show QR code/).uncheck();
    await expect(page.locator('.qr')).toHaveCount(0);
    const [, qrOff] = await exportPixels(page, [photoCentre, qrCentre]);
    expect(Math.max(...qrOff!)).toBeLessThan(80); // dark footer, no white QR box
    // …and back on.
    await page.getByLabel(/^Show QR code/).check();
    await expect(page.locator('.qr')).toHaveCount(1);
  });

  test('photo credit presets, custom text and reset (preview + export)', async ({ page }) => {
    await mockArticle(page, {});
    await generate(page);
    const select = page.getByLabel('Photo tag', { exact: true });
    const tag = page.locator('.card-credit');
    await expect(tag).toBeHidden();
    for (const preset of ['সংগৃহীত', 'এআই ছবি', 'ফাইল ছবি', 'প্রতীকী ছবি', 'সৌজন্য ছবি', 'ছবি: স্টার নিউজ', 'স্টার নিউজ গ্রাফিক্স']) {
      await select.selectOption(preset);
      await expect(tag).toBeVisible();
      await expect(tag).toHaveText(preset);
    }
    await select.selectOption('');
    await expect(tag).toBeHidden();
    await expect(tag).toHaveAttribute('aria-hidden', 'true');

    // Custom: field appears, live updates on each keystroke (spaces survive), 40-character cap.
    await select.selectOption('__custom__');
    const custom = page.getByLabel('Your tag', { exact: true });
    await expect(custom).toBeVisible();
    await expect(tag).toBeHidden(); // empty custom = no tag
    await custom.pressSequentially('ছবি সংগৃহীত');
    await expect(tag).toHaveText('ছবি সংগৃহীত');
    await expect(tag).not.toHaveAttribute('aria-hidden', 'true');
    await custom.fill('ক'.repeat(45));
    await expect(custom).toHaveValue('ক'.repeat(40));
    await custom.fill('   ');
    await expect(tag).toBeHidden();
    await custom.fill('ছবি: সংগৃহীত');

    // Exported PNG carries the dark credit box at the registry position (common-card: bottom-left of photo).
    await page.getByLabel(/^Use your own photo/).setInputFiles(await solidPng(page, '#00c853'));
    const inTag = { x: 30, y: 612 };
    const [withTag] = await exportPixels(page, [inTag]);
    expect(withTag![1]).toBeLessThan(100); // dark tag over the green photo

    // Reset clears the selection, the custom field and the tag.
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(select).toHaveValue('');
    await expect(page.getByLabel('Your tag', { exact: true })).toHaveCount(0);
    await expect(tag).toBeHidden();
  });

  test('article without an image falls back to the demo photo in preview and export', async ({ page }) => {
    await mockArticle(page, {}); // no imageUrl
    await generate(page);
    await expect(page.getByRole('status')).toContainText('using the demo photo');
    await expect(page.locator('.photo')).toHaveAttribute('src', '/photos/Star-news-file-image.webp');
    // The demo photo's own centre pixel; cover geometry keeps the image centre at the window centre.
    const demoCentre = await page.evaluate(async () => {
      const img = new Image();
      img.src = '/photos/Star-news-file-image.webp';
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      return Array.from(ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data.slice(0, 3));
    });
    // common-card photo window: 0..1080 × 0..651 → centre (540, 325).
    const [exported] = await exportPixels(page, [{ x: 540, y: 325 }]);
    for (let i = 0; i < 3; i += 1) expect(Math.abs(exported![i]! - demoCentre[i]!)).toBeLessThan(40);
  });

  test('the editor chrome is English; Bengali only in card content', async ({ page }) => {
    await mockArticle(page, { category: 'খেলা' });
    await generate(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('.card')).toHaveAttribute('lang', 'bn');
    const bengaliChrome = await page.locator('.controls').evaluate((root) => {
      const hits: string[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const parent = n.parentElement!;
        // Card-content values: preset options, the category suggestions and Bengali field contents.
        if (parent.closest('option, datalist, [lang="bn"]')) continue;
        if (/[ঀ-৿]/.test(n.textContent ?? '')) hits.push((n.textContent ?? '').trim());
      }
      for (const el of root.querySelectorAll('[aria-label], [title], [placeholder]')) {
        for (const attr of ['aria-label', 'title']) {
          const v = el.getAttribute(attr);
          if (v && /[ঀ-৿]/.test(v)) hits.push(`${attr}=${v}`);
        }
      }
      return hits;
    });
    expect(bengaliChrome).toEqual([]);
  });

  test('template dropdown: grouped options, keyboard selection, cross-fade', async ({ page }) => {
    await open(page);
    const button = pickerButton(page);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toContainText('Photo on top');
    await button.click();
    const list = page.getByRole('listbox');
    await expect(list).toBeVisible();
    const article = list.getByRole('group', { name: /Article cards/ });
    const custom = list.getByRole('group', { name: /Custom cards/ });
    await expect(article.getByRole('option')).toHaveText([
      /Photo on top/,
      /Photo at bottom/,
      /Full photo, headline on top/,
      /Full photo, headline at bottom/,
    ]);
    await expect(custom.getByRole('option')).toHaveText([/Just In/, /Breaking News/]);
    await expect(article.getByRole('option').first()).toContainText('Article');
    await expect(custom.getByRole('option').first()).toContainText('Custom');
    // Keyboard: End jumps to the last option, Enter picks it and returns focus to the button.
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(list).toBeHidden();
    await expect(button).toBeFocused();
    await expect(button).toContainText('Breaking News');
    await expect(page.locator('.card')).toHaveClass(/card-enter/);
    // Escape closes without changing the choice.
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Home');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toBeHidden();
    await expect(button).toContainText('Breaking News');
  });

  test('nudge pad moves the selected layer, including diagonals', async ({ page }) => {
    await mockArticle(page, {});
    await generate(page);
    await page.getByRole('radio', { name: 'Headline' }).click();
    const pos = page.getByText(/^Headline position:/);
    const before = (await pos.textContent())!.match(/(-?\d+), (-?\d+)/)!.slice(1).map(Number);
    await page.getByRole('button', { name: 'Move headline up-right' }).click();
    await page.getByRole('button', { name: 'Move headline up-right' }).click({ modifiers: ['Shift'] });
    await expect(pos).toHaveText(`Headline position: ${before[0]! + 11}, ${before[1]! - 11} px`);
    await page.getByRole('button', { name: 'Reset headline' }).click();
    await expect(pos).toHaveText(`Headline position: ${before[0]}, ${before[1]} px`);
  });

  test('keyboard shortcuts: G generate, arrows nudge, D download, R reset; not while typing', async ({ page }) => {
    await mockArticle(page, {});
    await open(page);
    await page.getByLabel('Star News article link').fill(ARTICLE_URL);
    // Typing "g" in a field must not trigger Generate.
    await page.getByLabel('Headline', { exact: true }).press('g');
    await expect(page.getByRole('status')).not.toContainText('Card ready');
    await page.getByLabel('Enable keyboard shortcuts').check();
    await page.locator('h1').click(); // move focus out of the fields
    await page.keyboard.press('g');
    await expect(page.getByRole('status')).toContainText('Card ready');
    await page.getByRole('radio', { name: 'Headline' }).click();
    await page.locator('h1').click();
    const pos = page.getByText(/^Headline position:/);
    const before = await pos.textContent();
    await page.keyboard.press('Shift+ArrowDown');
    await expect(pos).not.toHaveText(before!);
    const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('d')]);
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    page.once('dialog', (dialog) => void dialog.accept());
    await page.keyboard.press('r');
    await expect(page.getByLabel('Headline', { exact: true })).toHaveValue('');
  });

  test('empty state, loading shimmer and export toast', async ({ page }) => {
    await page.route('**/api/article', async (route) => {
      await new Promise((r) => setTimeout(r, 600));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { canonicalUrl: ARTICLE_URL, title: 'শিরোনাম', language: 'bn' } }),
      });
    });
    await open(page);
    await expect(page.locator('.preview-empty')).toContainText('Your card will appear here');
    await page.getByLabel('Star News article link').fill(ARTICLE_URL);
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.locator('.preview-skeleton')).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Card ready');
    await expect(page.locator('.preview-skeleton')).toHaveCount(0);
    await expect(page.locator('.preview-empty')).toHaveCount(0);
    await page.getByRole('button', { name: 'Download PNG' }).click();
    await expect(page.locator('.toast')).toContainText('PNG downloaded');
    await expect(page.locator('.toast')).toBeHidden({ timeout: 6000 });
  });

  test('preview stays visible while the controls scroll (desktop)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 800 });
    await mockArticle(page, {});
    await generate(page);
    await page.getByRole('button', { name: 'Download PNG' }).scrollIntoViewIfNeeded();
    const frame = (await page.locator('.preview-frame').boundingBox())!;
    expect(frame.y).toBeGreaterThanOrEqual(0);
    expect(frame.y + frame.height / 2).toBeLessThan(800);
  });

  test('photo fills each template window by default; "Show whole photo" letterboxes it (preview + export)', async ({ page }) => {
    await mockArticle(page, {});
    await generate(page);
    // Full photo, headline at bottom: the artwork is transparent over the top ~950 artwork px.
    await pickTemplate(page, /Full photo, headline at bottom/);
    await page.getByLabel(/^Use your own photo/).setInputFiles(await solidPng(page, '#00c853')); // 16:10 landscape
    const photo = page.locator('.photo');
    await expect(photo).toHaveCSS('object-fit', 'cover');
    const top = { x: 540, y: 30 }; // layout px, inside the window, well above a 16:10 letterbox
    const [covered] = await exportPixels(page, [top]);
    expect(covered![1]).toBeGreaterThan(150); // green photo reaches the top edge
    expect(covered![0]).toBeLessThan(60);

    const toggle = page.getByLabel('Show whole photo (no crop)');
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await expect(photo).toHaveCSS('object-fit', 'contain');
    await expect(page.getByText(/^Photo position:/)).toHaveText('Photo position: 0, 0 px');
    const [letterboxed] = await exportPixels(page, [top]);
    expect(Math.min(...letterboxed!)).toBeGreaterThan(200); // card background, not photo

    // Switching templates keeps the choice; reset clears it.
    await pickTemplate(page, /Photo on top/);
    await expect(page.getByLabel('Show whole photo (no crop)')).toBeChecked();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.getByLabel('Show whole photo (no crop)')).not.toBeChecked();
  });

  test(`downloads a ${CARD_W} × ${CARD_H} PNG`, async ({ page }) => {
    await mockArticle(page, {});
    await generate(page);
    const png = await downloadPng(page);
    expect(png.name).toMatch(/^star-news-photocard-\d{8}-\d{6}\.png$/);
    expect(png).toMatchObject({ width: CARD_W, height: CARD_H });
    await expect(page.getByRole('status')).toContainText(`PNG downloaded at exactly ${CARD_W} × ${CARD_H}`);
  });

  test('custom mode: breaking news is text-only', async ({ page }) => {
    await open(page);
    await pickTemplate(page, /Breaking News/);
    await expect(page.getByLabel('Star News article link')).toHaveCount(0);
    await expect(page.locator('input[type=file]')).toHaveCount(0);
    await expect(page.locator('.photo-window')).toHaveCount(0);
    await expect(page.locator('.card-date')).toHaveText(todayBanglaDate());
    await expect(page.getByRole('button', { name: 'Download PNG' })).toBeDisabled();
    await page.getByLabel('Headline', { exact: true }).fill('মিরপুরে স্বাস্থ্যকেন্দ্রে হামলা');
    await expectQrEncodes(page, 'https://starnews.com.bd');
    await expect(page.getByRole('button', { name: 'Download PNG' })).toBeEnabled();
    expect(await downloadPng(page)).toMatchObject({ width: CARD_W, height: CARD_H });
  });

  test('custom mode: just-in needs an uploaded photo before export', async ({ page }) => {
    await open(page);
    await pickTemplate(page, /Just In/);
    await expect(page.getByLabel('Star News article link')).toHaveCount(0);
    await page.getByLabel('Headline', { exact: true }).fill('আগামী দুই মাসে প্রধানমন্ত্রীর তিন দেশ সফরের প্রস্তুতি');
    await expect(page.getByRole('button', { name: 'Download PNG' })).toBeDisabled();
    await page.getByLabel(/^Photo \(required/).setInputFiles(UPLOAD_PHOTO);
    await expect(page.getByRole('button', { name: 'Download PNG' })).toBeEnabled();
    await expect(page.locator('.card-date')).toHaveText(todayBanglaDate());
    await expectQrEncodes(page, 'https://starnews.com.bd');
    expect(await downloadPng(page)).toMatchObject({ width: CARD_W, height: CARD_H });
  });

  test('reset re-applies the auto-date and keeps the card type', async ({ page }) => {
    await open(page);
    await pickTemplate(page, /Breaking News/);
    await page.getByLabel('Date', { exact: true }).fill('১ জানুয়ারি ২০২০');
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.getByLabel('Date', { exact: true })).toHaveValue(todayBanglaDate());
    await expect(pickerButton(page)).toContainText('Breaking News');
  });

  test('an approved image download failure preserves the card and blocks empty export', async ({ page }) => {
    await page.route('**/api/image**', (route) =>
      route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":{"code":"IMAGE_ERROR"}}' }),
    );
    await mockArticle(page, { imageUrl: '/api/image?token=expired' });
    await open(page);
    await page.getByLabel('Star News article link').fill(ARTICLE_URL);
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('couldn’t load the card photo');
    await expect(page.getByRole('button', { name: 'Download PNG' })).toBeDisabled();
  });

  test('every template renders its artwork and exports at full size', async ({ page }) => {
    await mockArticle(page, {});
    await generate(page);
    await pickerButton(page).click();
    const count = await page.getByRole('listbox').getByRole('option').count();
    expect(count).toBe(6);
    await page.keyboard.press('Escape');
    for (let i = 0; i < count; i += 1) {
      await pickerButton(page).click();
      await page.getByRole('listbox').getByRole('option').nth(i).click();
      if (await page.getByLabel(/^Photo \(required/).count()) {
        await page.getByLabel(/^Photo \(required/).setInputFiles(UPLOAD_PHOTO);
      }
      await expect(page.locator('.card-date')).toHaveText(todayBanglaDate());
      const custom = (await page.getByLabel('Star News article link').count()) === 0;
      await expectQrEncodes(page, custom ? 'https://starnews.com.bd' : ARTICLE_URL);
      const loaded = await page
        .locator('.card-template')
        .evaluate((img: HTMLImageElement) => img.decode().then(() => img.naturalWidth > 0, () => false));
      expect(loaded).toBe(true);
      expect(await downloadPng(page)).toMatchObject({ width: CARD_W, height: CARD_H });
    }
  });

  test('dragging empty card space moves nothing; dragging the headline moves only it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockArticle(page, {});
    await generate(page);
    const qrLabel = page.getByText(/^QR position:/);
    const titleLabel = page.getByText(/^Headline position:/);
    const qrBefore = await qrLabel.textContent();
    const titleBefore = await titleLabel.textContent();
    const frame = (await page.locator('.preview-frame').boundingBox())!;

    // Bottom-left of the card holds no draggable layer (baked logo only).
    await page.mouse.move(frame.x + 10, frame.y + frame.height - 50);
    await page.mouse.down();
    await page.mouse.move(frame.x + 60, frame.y + frame.height - 100, { steps: 5 });
    await page.mouse.up();
    await expect(qrLabel).toHaveText(qrBefore!);
    await expect(titleLabel).toHaveText(titleBefore!);

    const title = (await page.locator('.card-title').boundingBox())!;
    await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2);
    await page.mouse.down();
    await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2 - 40, { steps: 5 });
    await page.mouse.up();
    await expect(titleLabel).not.toHaveText(titleBefore!);
    await expect(qrLabel).toHaveText(qrBefore!);
  });

  test('responsive widths do not break the workspace', async ({ page }) => {
    for (const width of [320, 375, 768, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Photocard Generator' })).toBeVisible();
      await expect(page.getByText(DIMENSIONS).first()).toBeVisible();
      // The card must not widen the layout (mobile browsers would zoom the whole tool out).
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
    }
  });

  test('shortcuts are opt-in and font sizes update through the dropdown', async ({ page }) => {
    await open(page);
    await page.getByLabel('Headline', { exact: true }).fill('A short headline');
    await page.locator('h1').click();
    await page.keyboard.press('g');
    await expect(page.getByRole('status')).not.toContainText('Fetching');
    await page.getByLabel('Headline size', { exact: true }).selectOption('52');
    await expect(page.locator('.card-title')).toHaveCSS('font-size', '52px');
    await expect(page.locator('.card-title')).toHaveCSS('font-weight', '600');
  });
  test('successive articles replace automatic categories and preserve manual overrides', async ({ page }) => {
    let category = 'Sports';
    await page.route('**/api/article', route => route.fulfill({ json: { data: { canonicalUrl: ARTICLE_URL, title: 'Short headline', language: 'bn', category } } }));
    await generate(page);
    category = 'Politics';
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.locator('.card-pill')).toHaveText('Politics');
    await page.getByLabel('Category (yellow label)').fill('Manual');
    category = 'Economy';
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Card ready');
    await expect(page.locator('.card-pill')).toHaveText('Manual');
  });
  test('edits during fetch cancel the old composition request', async ({ page }) => {
    await page.route('**/api/article', async route => {
      await new Promise(resolve => setTimeout(resolve, 400));
      await route.fulfill({ json: { data: { canonicalUrl: ARTICLE_URL, title: 'Old server headline', language: 'bn' } } }).catch(() => {});
    });
    await open(page);
    await page.getByLabel('Star News article link').fill(ARTICLE_URL);
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await page.getByLabel('Headline', { exact: true }).fill('Keep my edit');
    await expect(page.getByRole('status')).toContainText('latest edits');
    await page.waitForTimeout(600);
    await expect(page.getByLabel('Headline', { exact: true })).toHaveValue('Keep my edit');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles(UPLOAD_PHOTO);
    const uploadedSrc = await page.locator('.photo').getAttribute('src');
    await page.waitForTimeout(600);
    await expect(page.locator('.photo')).toHaveAttribute('src', uploadedSrc!);
    await expect(page.getByLabel('Headline', { exact: true })).toHaveValue('Keep my edit');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await pickTemplate(page, /Breaking News/);
    await page.waitForTimeout(600);
    await expect(page.getByLabel('Headline', { exact: true })).toHaveValue('Keep my edit');
  });
  test('retained article image exports after its signed endpoint expires', async ({ page }) => {
    let calls = 0;
    const bytes = await readFile(UPLOAD_PHOTO);
    await page.route('**/api/image**', route => { calls++; return calls === 1 ? route.fulfill({ contentType: 'image/webp', body: bytes }) : route.fulfill({ status: 403 }); });
    await mockArticle(page, { imageUrl: '/api/image?token=short-lived' });
    await generate(page);
    await expect(page.locator('.photo')).toHaveAttribute('src', /^blob:/);
    await page.getByLabel('Headline', { exact: true }).fill('Still editable');
    expect(await downloadPng(page)).toMatchObject({ width: CARD_W, height: CARD_H });
    expect(calls).toBe(1);
  });
  test('overflow blocks export and Fit headline resolves recoverable overflow', async ({ page }) => {
    await mockArticle(page, {});
    await generate(page);
    for (const name of [/Photo on top/, /Photo at bottom/, /Full photo, headline on top/, /Full photo, headline at bottom/, /Just In/, /Breaking News/]) {
      await pickTemplate(page, name);
      if (await page.getByLabel(/^Photo \(required/).count()) await page.getByLabel(/^Photo \(required/).setInputFiles(UPLOAD_PHOTO);
      await page.getByLabel('Headline', { exact: true }).fill(Array(30).fill('বাংলা headline').join('\n'));
      await expect(page.getByRole('button', { name: 'Download PNG' })).toBeDisabled();
      await expect(page.getByRole('alert')).toContainText('safe area');
      await page.getByLabel('Headline', { exact: true }).fill('বাংলা headline one two three four five six seven eight');
      await page.getByLabel('Headline size', { exact: true }).selectOption('120');
      await page.getByRole('button', { name: 'Fit headline', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Download PNG' })).toBeEnabled();
      expect(await downloadPng(page)).toMatchObject({ width: CARD_W, height: CARD_H });
    }
  });
});
