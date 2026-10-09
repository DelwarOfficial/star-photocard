import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const ARTICLE_URL = 'https://www.starnews.com.bd/bangla-news';

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

async function generate(page: Page): Promise<void> {
  await page.goto('/');
  // Astro drops the `ssr` attribute once the island hydrates; typing earlier is lost.
  await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
  await page.getByLabel('Star News article URL').fill(ARTICLE_URL);
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Card generated');
}

test.describe('photocard generator', () => {
  test('empty state disables export and validates URLs', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Photocard Generator' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download PNG' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Copy PNG' })).toBeDisabled();
    await page.getByLabel('Star News article URL').fill('https://evil.test/article');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Only Star News URLs');
  });

  test('mocked Bangla generation populates the card', async ({ page }) => {
    await page.route('**/api/article', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            canonicalUrl: 'https://www.starnews.com.bd/bangla-news',
            title: 'পরীক্ষামূলক *শিরোনাম* এখানে',
            publishedAt: '2026-09-04T10:30:00+06:00',
            formattedDate: '৪ সেপ্টেম্বর ২০২৬',
            dateSource: 'json-ld',
            language: 'bn',
          },
        }),
      });
    });
    await page.goto('/');
    await page.getByLabel('Star News article URL').fill('https://www.starnews.com.bd/bangla-news');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Card generated');
    await expect(page.getByRole('button', { name: 'Download PNG' })).toBeEnabled();
    await expect(page.locator('.card-date')).toContainText('৪ সেপ্টেম্বর');
  });

  test('downloads a 1080 × 1080 PNG', async ({ page }) => {
    await mockArticle(page, {});
    await generate(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download PNG' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^star-news-photocard-\d{8}-\d{6}\.png$/);
    const png = await readFile((await download.path())!);
    // PNG signature, then IHDR width/height as big-endian uint32 at bytes 16-23.
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const ihdr = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(ihdr.getUint32(16)).toBe(1080);
    expect(ihdr.getUint32(20)).toBe(1080);
    await expect(page.getByRole('status')).toContainText('PNG downloaded');
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

  test('every template renders its artwork and exports', async ({ page }) => {
    await mockArticle(page, {});
    await generate(page);
    const radios = page.getByRole('radio');
    const count = await radios.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      await radios.nth(i).check({ force: true });
      const loaded = await page
        .locator('.card-template')
        .evaluate((img: HTMLImageElement) => img.decode().then(() => img.naturalWidth > 0, () => false));
      expect(loaded).toBe(true);
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Download PNG' }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/\.png$/);
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

    // Bottom-left of the card holds no draggable layer (template art + date only).
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
      await expect(page.getByText('1080 × 1080 PNG').first()).toBeVisible();
      // The 1080px card must not widen the layout (mobile browsers would zoom the whole tool out).
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
    }
  });
});
