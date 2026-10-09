import html2canvas from 'html2canvas';
import { EXPORT_HEIGHT, EXPORT_WIDTH, getTemplate } from '../../config/templates';
import { photoGeometry } from './geometry';
import { tokenizeTitle } from './highlightTitle';
import { hasTag } from './photoTag';
import { applyStyle, CARD_TEXT_WEIGHT, creditStyle, dateStyle, highlightColor, pillStyle, qrStyle, titleStyle } from './layerStyles';
import { decodeImage, waitForFonts, type CardRenderer, type ExportSnapshot } from './renderer';

/**
 * html2canvas renderer behind the CardRenderer interface.
 * Uses the shared cover-geometry function instead of object-fit + transforms
 * so preview, bounds and export agree. Animated GIF input exports its decoded
 * first frame (browser decoding behavior); documented in README.
 *
 * Text and QR layers take their styles from layerStyles.ts, the same
 * source the preview uses, so the two cannot drift apart.
 */
function cardFontFamily(language: string): string {
  return language === 'en' ? 'StarEnglish' : 'StarBangla';
}

async function loadCardFonts(family: string): Promise<void> {
  try {
    // The off-screen export DOM may use faces the page never requested; load them explicitly.
    await document.fonts.load(`${CARD_TEXT_WEIGHT} 60px ${family}`);
  } catch {
    // Font loading is best-effort; fonts.ready still runs below.
  }
}
export class Html2CanvasRenderer implements CardRenderer {
  readonly name = 'html2canvas';

  async render(snapshot: ExportSnapshot): Promise<Blob> {
    const template = getTemplate(snapshot.state.templateId);
    const fontFamily = cardFontFamily(snapshot.state.language);
    await loadCardFonts(fontFamily);
    await waitForFonts();
    // Decode assets before snapshotting so export is deterministic. Never swap in a
    // different photo: a news card with the wrong image must fail loudly instead.
    const [templateImg, photoImg] = await Promise.all([
      decodeImage(snapshot.templateSrc).catch(() => {
        throw new Error('TEMPLATE_UNAVAILABLE');
      }),
      template.photo
        ? decodeImage(snapshot.photoSrc).catch(() => {
            throw new Error('PHOTO_UNAVAILABLE');
          })
        : Promise.resolve(null),
    ]);
    if (snapshot.qrDataUrl) {
      await decodeImage(snapshot.qrDataUrl).catch(() => undefined);
    }

    const canvasWidth = template.canvas.width;
    const canvasHeight = template.canvas.height;

    const container = document.createElement('div');
    container.setAttribute('aria-hidden', 'true');
    container.style.cssText = `position:fixed;left:-9999px;top:0;width:${canvasWidth}px;height:${canvasHeight}px;overflow:hidden;background:#fff;`;

    try {
      const card = document.createElement('div');
      card.lang = snapshot.state.language;
      card.style.cssText = `position:relative;width:${canvasWidth}px;height:${canvasHeight}px;overflow:hidden;background:#fff;font-family:${fontFamily},serif;`;
      container.appendChild(card);

      // Photo layer with explicit cover geometry (cards without a photo window skip it).
      const photoViewport = template.photo;
      if (photoViewport && photoImg) {
        const drawn = photoGeometry(
          { width: photoImg.naturalWidth || 1920, height: photoImg.naturalHeight || 1080 },
          photoViewport,
          snapshot.state.imageScale,
          snapshot.state.photoPosition,
        );
        const photoWindow = document.createElement('div');
        photoWindow.style.cssText = `position:absolute;left:${photoViewport.x}px;top:${photoViewport.y}px;width:${photoViewport.width}px;height:${photoViewport.height}px;overflow:hidden;`;
        const photo = document.createElement('img');
        photo.crossOrigin = 'anonymous';
        photo.src = photoImg.src;
        photo.style.cssText = `position:absolute;left:${drawn.x - photoViewport.x}px;top:${drawn.y - photoViewport.y}px;width:${drawn.width}px;height:${drawn.height}px;max-width:none;`;
        photoWindow.appendChild(photo);
        card.appendChild(photoWindow);
      }

      // Template overlay.
      const overlay = document.createElement('img');
      overlay.crossOrigin = 'anonymous';
      overlay.src = templateImg.src;
      overlay.style.cssText = `position:absolute;inset:0;width:${canvasWidth}px;height:${canvasHeight}px;`;
      card.appendChild(overlay);

      // Text layers share their styles with the preview (layerStyles.ts).
      const date = document.createElement('div');
      date.textContent = snapshot.state.publicationDate;
      applyStyle(date, dateStyle(template));
      card.appendChild(date);

      const credit = creditStyle(template);
      if (credit && hasTag(snapshot.state.photoCredit)) {
        const creditEl = document.createElement('div');
        creditEl.textContent = snapshot.state.photoCredit;
        applyStyle(creditEl, credit);
        card.appendChild(creditEl);
      }

      const pill = pillStyle(template);
      if (pill && hasTag(snapshot.state.photoTag)) {
        const tag = document.createElement('div');
        tag.textContent = snapshot.state.photoTag;
        applyStyle(tag, pill);
        card.appendChild(tag);
      }

      const title = document.createElement('div');
      applyStyle(title, titleStyle(template, snapshot.state));
      const emphasis = highlightColor(template);
      for (const line of tokenizeTitle(snapshot.state.title)) {
        const lineEl = document.createElement('div');
        for (const token of line) {
          const span = document.createElement('span');
          span.textContent = token.text;
          if (token.highlighted) span.style.color = emphasis;
          lineEl.appendChild(span);
        }
        title.appendChild(lineEl);
      }
      card.appendChild(title);

      const qr = qrStyle(template, snapshot.state);
      if (qr && snapshot.state.qrVisible && snapshot.qrDataUrl) {
        const qrBox = document.createElement('div');
        applyStyle(qrBox, qr);
        const qrImg = document.createElement('img');
        qrImg.src = snapshot.qrDataUrl;
        qrImg.style.cssText = 'width:100%;height:100%;display:block;';
        qrBox.appendChild(qrImg);
        card.appendChild(qrBox);
      }

      document.body.appendChild(container);
      const canvas = await html2canvas(card, {
        backgroundColor: '#ffffff',
        // Render the 1080-wide layout at 1600 / 1080: vector text re-rasterised, images sampled at full size.
        scale: EXPORT_WIDTH / canvasWidth,
        useCORS: true,
        allowTaint: false,
        width: canvasWidth,
        height: canvasHeight,
        windowWidth: canvasWidth,
        windowHeight: canvasHeight,
      });
      const output = document.createElement('canvas');
      output.width = EXPORT_WIDTH;
      output.height = EXPORT_HEIGHT;
      const ctx = output.getContext('2d');
      if (!ctx) throw new Error('EXPORT_FAILED');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
      const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('EXPORT_FAILED');
      return blob;
    } finally {
      container.remove();
    }
  }
}

export const defaultRenderer = new Html2CanvasRenderer();
