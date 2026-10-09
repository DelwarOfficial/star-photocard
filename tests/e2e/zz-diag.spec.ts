import { test } from '@playwright/test';

test('ssr vs client text', async ({ page, request }) => {
  const html = await (await request.get('/')).text();
  const grab = (re: RegExp) => html.match(re)?.[1] ?? '(none)';
  console.log('SSR card-date   :', JSON.stringify(grab(/class="card-date"[^>]*>([^<]*)</)));
  console.log('SSR date value  :', JSON.stringify(grab(/id="pub-date"[^>]*value="([^"]*)"/)));
  console.log('SSR placeholder :', JSON.stringify(grab(/id="pub-date"[^>]*placeholder="([^"]*)"/)));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  await page.goto('/');
  await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
  console.log('CSR card-date   :', JSON.stringify(await page.locator('.card-date').textContent()));
  console.log('CSR date value  :', JSON.stringify(await page.locator('#pub-date').inputValue()));
  console.log('client now      :', await page.evaluate(() => new Date().toString()));
  console.log('errors          :', JSON.stringify(errors));
});
