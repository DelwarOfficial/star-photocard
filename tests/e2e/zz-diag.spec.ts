import { expect, test } from '@playwright/test';
import { todayBanglaDate } from '../../src/lib/text/dates';

test('stable SSR date hydrates cleanly and the declared favicon loads', async ({ page, request }) => {
  const html = await (await request.get('/')).text();
  expect(html.match(/id="pub-date"[^>]*value="([^"]*)"/)?.[1]).toBe('');
  expect(html).toContain('placeholder="Dhaka date"');
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() === 404) errors.push(r.url()); });
  await page.goto('/');
  await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue(todayBanglaDate());
  const favicon = await page.locator('link[rel="icon"]').getAttribute('href');
  expect(favicon).toBe('/photos/Star-news-file-image.webp');
  expect((await request.get(favicon!)).status()).toBe(200);
  expect(errors).toEqual([]);
});
