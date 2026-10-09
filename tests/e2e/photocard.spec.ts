import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import QRCode from 'qrcode';
import { todayBanglaDate } from '../../src/lib/text/dates';

const ARTICLE_URL = 'https://www.starnews.com.bd/bangla-news';
const CARD_W = 1080;
const CARD_H = 1350;
const DIMENSIONS = `${CARD_W} × ${CARD_H} PNG`;
const UPLOAD_PHOTO = fileURLToPath(new URL('../../public/photos/default-news.jpg', import.meta.url));

async function mockArticle(page: Page, extra: { imageUrl?: string }): Promise<void> {
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
  await page.getByLabel('Star News article URL').fill(ARTICLE_URL);
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Card generated');
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

async function pickTemplate(page: Page, name: RegExp): Promise<void> {
  await page.getByRole('radio', { name }).check({ force: true });
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
    await page.getByLabel('Star News article URL').fill('https://evil.test/article');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Only Star News URLs');
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
    await page.getByLabel('Category (yellow label)').selectOption('রাজনীতি');
    await expect(page.locator('.card-pill')).toHaveText('রাজনীতি');
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
    await expect(page.getByLabel('Star News article URL')).toHaveCount(0);
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
    await expect(page.getByLabel('Star News article URL')).toHaveCount(0);
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
    await expect(page.getByRole('radio', { name: /Breaking News/ })).toBeChecked();
  });

  test('export fails loudly instead of swapping in the stock photo', async ({ page }) => {
    await page.route('**/api/image**', (route) =>
      route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":{"code":"IMAGE_ERROR"}}' }),
    );
    await mockArticle(page, { imageUrl: '/api/image?token=expired' });
    await generate(page);
    await page.getByRole('button', { name: 'Download PNG' }).click();
    await expect(page.getByRole('status')).toContainText('card photo could not be loaded');
  });

  test('every template renders its artwork and exports at full size', async ({ page }) => {
    await mockArticle(page, {});
    await generate(page);
    const radios = page.getByRole('radio');
    const count = await radios.count();
    expect(count).toBe(6);
    for (let i = 0; i < count; i += 1) {
      await radios.nth(i).check({ force: true });
      if (await page.getByLabel(/^Photo \(required/).count()) {
        await page.getByLabel(/^Photo \(required/).setInputFiles(UPLOAD_PHOTO);
      }
      await expect(page.locator('.card-date')).toHaveText(todayBanglaDate());
      const custom = (await page.getByLabel('Star News article URL').count()) === 0;
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
});
