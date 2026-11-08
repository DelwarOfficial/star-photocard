// Builds the template-picker thumbnails: each card artwork composited over the demo photo,
// so photo windows show a photo instead of blank white. Re-run after changing any artwork:
//   node scripts/thumbnails.mjs
// Output: public/templates/thumbs/<artwork>.webp (picker only — never used by the export).
import { mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const ART_W = 1600;
const ART_H = 2000;
const THUMB_W = 120;
const THUMB_H = 150;

await mkdir(`${root}templates/thumbs`, { recursive: true });
const photo = await sharp(`${root}photos/Star-news-file-image.webp`).resize(ART_W, ART_H, { fit: 'cover' }).toBuffer();
const files = (await readdir(`${root}templates`)).filter((f) => f.endsWith('.png') && !f.startsWith('ad-'));

for (const file of files) {
  // Some artworks are exported at 2160 × 2700; normalise to the 1600 × 2000 artwork size first.
  const art = await sharp(`${root}templates/${file}`).resize(ART_W, ART_H, { fit: 'fill' }).toBuffer();
  const out = `${root}templates/thumbs/${file.replace(/\.png$/, '.webp')}`;
  // Composite at full size first: in one pipeline sharp would resize before compositing.
  const card = await sharp(photo).composite([{ input: art }]).png().toBuffer();
  await sharp(card)
    .resize(THUMB_W, THUMB_H)
    .webp({ quality: 82 })
    .toFile(out);
  console.log(`thumbs/${file.replace(/\.png$/, '.webp')}`);
}
