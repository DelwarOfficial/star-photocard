// Read-only diagnosis of the article image chain against a running server.
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4321';
const ARTICLE = process.argv[3];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const log = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) log.push(`console.${m.type()}: ${m.text().slice(0, 200)}`); });
page.on('pageerror', (e) => log.push(`pageerror: ${e.message.slice(0, 200)}`));
page.on('response', async (r) => {
  const u = r.url();
  if (u.includes('/api/article')) {
    let body = '';
    try { body = await r.text(); } catch {}
    log.push(`API article ${r.status()} ${body.slice(0, 600)}`);
  } else if (u.includes('/api/image')) {
    log.push(`API image ${r.status()} ${r.headers()['content-type']} ${r.headers()['content-length'] ?? ''}`);
  }
});
await page.goto(BASE + '/');
await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
await page.getByLabel('Star News article link').fill(ARTICLE);
await page.getByRole('button', { name: 'Generate', exact: true }).click();
await page.waitForTimeout(15000);
const photo = page.locator('.photo');
log.push('status: ' + (await page.getByRole('status').textContent()));
log.push('photo src: ' + ((await photo.getAttribute('src')) ?? '').slice(0, 60));
log.push('photo: ' + (await photo.evaluate((i) => `${i.naturalWidth}x${i.naturalHeight} complete=${i.complete}`)));
await page.locator('.preview-frame').screenshot({ path: process.argv[4] });
console.log(log.join('\n'));
await browser.close();
