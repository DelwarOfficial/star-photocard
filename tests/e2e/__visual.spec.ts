import { expect, test } from '@playwright/test';

// TEMPORARY visual-verification spec (deleted before completion).
test.describe('visual check', () => {
  test('card layouts per template with Bengali headline', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1100 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Photocard Generator' })).toBeVisible();
    page.on('console', (msg) => console.log(`BROWSER-${msg.type()}: ${msg.text().slice(0, 300)}`));
    page.on('pageerror', (err) => console.log(`BROWSER-PAGEERROR: ${String(err).slice(0, 300)}`));
    // Wait for the React island to hydrate before interacting.
    await page.waitForFunction(() => document.querySelector('#headline') instanceof HTMLTextAreaElement);
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'test-results/visual/00-page.png' });

    await page.locator('#headline').fill('পরীক্ষামূলক শিরোনাম এখানে *গুরুত্বপূর্ণ* খবর');
    await expect(page.locator('#headline')).toHaveValue('পরীক্ষামূলক শিরোনাম এখানে *গুরুত্বপূর্ণ* খবর');
    await expect(page.locator('.card-title')).toContainText('গুরুত্বপূর্ণ');
    await page.locator('#pub-date').fill('৪ সেপ্টেম্বর ২০২৬');
    await page.waitForTimeout(500);
    await page.locator('.preview-frame').screenshot({ path: 'test-results/visual/01-common.png' });

    for (const name of ['Digital Card', 'Just In', 'Entertainment']) {
      await page.getByRole('radio', { name }).check({ force: true });
      await page.waitForTimeout(400);
      const slug = name.toLowerCase().replace(/\s+/g, '-');
      await page.locator('.preview-frame').screenshot({ path: `test-results/visual/02-${slug}.png` });
    }

    // Long English headline stress case on common card.
    await page.getByRole('radio', { name: 'Common Card' }).check({ force: true });
    await page
      .locator('#headline')
      .fill('Breaking news editors verify every layer position on the new square artwork before release day arrives');
    await page.waitForTimeout(400);
    await page.locator('.preview-frame').screenshot({ path: 'test-results/visual/03-long-english.png' });
  });
});
