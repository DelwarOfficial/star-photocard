import { expect, test } from '@playwright/test';

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

  test('responsive widths do not break the workspace', async ({ page }) => {
    for (const width of [320, 375, 768, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Photocard Generator' })).toBeVisible();
      await expect(page.getByText('1080 × 1350 PNG').first()).toBeVisible();
    }
  });
});
