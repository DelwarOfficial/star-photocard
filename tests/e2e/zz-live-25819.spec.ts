import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

// Temporary live verification against the unmocked Star News article from the bug report.
const LIVE = 'https://starnews.com.bd/country/25819/accused-in-tajmin-murder-case-brought-to-cumilla-mobile-phone-recovered.html';

test('live /country/25819: category সারা দেশ, image in preview + export, dropdown updates pill', async ({ page }) => {
  test.setTimeout(120_000);
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
  await page.getByLabel('Star News article link').fill(LIVE);
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Card ready', { timeout: 45_000 });

  const select = page.getByLabel('Category (yellow label)', { exact: true });
  const pill = page.locator('.card-pill');
  await expect(select).toHaveValue('সারা দেশ');
  await expect(pill).toHaveText('সারা দেশ');

  const photo = page.locator('.photo');
  await expect(photo).toHaveAttribute('src', /^blob:/);
  const natural = await photo.evaluate((i: HTMLImageElement) => `${i.naturalWidth}x${i.naturalHeight}`);
  const centre = await photo.evaluate((i: HTMLImageElement) => {
    const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight;
    const g = c.getContext('2d')!; g.drawImage(i, 0, 0);
    return Array.from(g.getImageData(Math.floor(i.naturalWidth / 2), Math.floor(i.naturalHeight / 2), 1, 1).data.slice(0, 3));
  });

  await select.selectOption('আইন ও আদালত');
  await expect(pill).toHaveText('আইন ও আদালত');

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PNG' }).click()]);
  const b64 = (await readFile((await dl.path())!)).toString('base64');
  const exported = await page.evaluate(async (s) => {
    const i = new Image(); i.src = s; await i.decode();
    const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
    const g = c.getContext('2d')!; g.drawImage(i, 0, 0);
    let dark = 0; const d = g.getImageData(690, 1037, 220, 55).data; // photo-top pill zone, 1600-space
    for (let k = 0; k < d.length; k += 4) if (d[k]! + d[k + 1]! + d[k + 2]! < 200) dark += 1;
    return { size: `${i.width}x${i.height}`, photoCentre: Array.from(g.getImageData(800, 482, 1, 1).data.slice(0, 3)), pillTextPixels: dark };
  }, `data:image/png;base64,${b64}`);
  await import('node:fs/promises').then((m) => m.copyFile(dl.path() as unknown as string, 'C:/Users/star/AppData/Local/Temp/claude/D--Code-Project-star-photocard/faf637a3-9309-41d4-9711-3a0b8ce99873/scratchpad/live-25819-export.png').catch(async () => m.copyFile((await dl.path())!, 'C:/Users/star/AppData/Local/Temp/claude/D--Code-Project-star-photocard/faf637a3-9309-41d4-9711-3a0b8ce99873/scratchpad/live-25819-export.png')));
  console.log('LIVE', JSON.stringify({ natural, centre, exported, problems }));
  for (let k = 0; k < 3; k += 1) expect(Math.abs(exported.photoCentre[k]! - centre[k]!)).toBeLessThan(40);
  expect(exported.pillTextPixels).toBeGreaterThan(50);
  expect(problems).toEqual([]);
});
