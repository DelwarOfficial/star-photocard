import html2canvas from 'html2canvas';
import { getTemplate } from '../../config/templates';
import { coverGeometry } from './geometry';
import { tokenizeTitle } from './highlightTitle';
import { decodeImage, waitForFonts, type CardRenderer, type ExportSnapshot } from './renderer';

/**
 * html2canvas renderer behind the CardRenderer interface.
 * Uses the shared cover-geometry function instead of object-fit + transforms
 * so preview, bounds and export agree. Animated GIF input exports its decoded
 * first frame (browser decoding behavior); documented in README.
 *
 * Text layers must mirror the preview (.card-title / .highlight in
 * global.css): same brand font family, weights and highlight colour.
 */
const HIGHLIGHT_COLOR = '#ff0';

function cardFontFamily(language: string): string {
  return language === 'en' ? 'StarEnglish' : 'StarBangla';
}

async function loadCardFonts(family: string): Promise<void> {
  try {
    // The off-screen export DOM may use faces the page never requested; load them explicitly.
    await Promise.all([document.fonts.load(`900 60px ${family}`), document.fonts.load(`700 30px ${family}`)]);
  } catch {
    // Font loading is best-effort; fonts.ready still runs below.
  }
}
export class Html2CanvasRenderer implements CardRenderer {
  readonly name = 'html2canvas';

  async render(snapshot: ExportSnapshot): Promise<Blob> {
    const fontFamily = cardFontFamily(snapshot.state.language);
    await loadCardFonts(fontFamily);
    await waitForFonts();
    // Decode assets before snapshotting so export is deterministic. Never swap in a
    // different photo: a news card with the wrong image must fail loudly instead.
    const [templateImg, photoImg] = await Promise.all([
      decodeImage(snapshot.templateSrc).catch(() => {
        throw new Error('TEMPLATE_UNAVAILABLE');
      }),
      decodeImage(snapshot.photoSrc).catch(() => {
        throw new Error('PHOTO_UNAVAILABLE');
      }),
    ]);
    if (snapshot.qrDataUrl) {
      await decodeImage(snapshot.qrDataUrl).catch(() => undefined);
    }

    const template = getTemplate(snapshot.state.templateId);
    const canvasWidth = template.canvas.width;
    const canvasHeight = template.canvas.height;

    const container = document.createElement('div');
    container.setAttribute('aria-hidden', 'true');
    container.style.cssText = `position:fixed;left:-9999px;top:0;width:${canvasWidth}px;height:${canvasHeight}px;overflow:hidden;background:#fff;`;

    try {
      container.innerHTML = '';
      const card = document.createElement('div');
      card.style.cssText = `position:relative;width:${canvasWidth}px;height:${canvasHeight}px;overflow:hidden;background:#fff;font-family:${fontFamily},serif;`;
      container.appendChild(card);

      // Photo layer with explicit cover geometry.
      const photoViewport = template.photo;
      const naturalWidth = photoImg.naturalWidth || 1920;
      const naturalHeight = photoImg.naturalHeight || 1080;
      const drawn = coverGeometry(
        { width: naturalWidth, height: naturalHeight },
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

      // Template overlay.
      const overlay = document.createElement('img');
      overlay.crossOrigin = 'anonymous';
      overlay.src = templateImg.src;
      overlay.style.cssText = `position:absolute;inset:0;width:${canvasWidth}px;height:${canvasHeight}px;`;
      card.appendChild(overlay);

      // Date / tag / title are rendered as plain text nodes (no editor chrome).
      const date = document.createElement('div');
      date.textContent = snapshot.state.publicationDate;
      date.style.cssText = `position:absolute;left:${template.date.x}px;top:${template.date.y}px;width:${template.date.width}px;text-align:center;color:#fff;font-size:${template.date.fontSize}px;font-weight:900;`;
      card.appendChild(date);

      if (snapshot.state.photoTag) {
        const tag = document.createElement('div');
        tag.textContent = snapshot.state.photoTag;
        tag.style.cssText = `position:absolute;left:${template.photoTag.x}px;top:${template.photoTag.y}px;max-width:${template.photoTag.maxWidth}px;padding:10px 20px;border-left:8px solid #d71920;background:rgba(0,0,0,.78);color:#fff;font-size:${template.photoTag.fontSize}px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
        card.appendChild(tag);
      }

      const title = document.createElement('div');
      title.style.cssText = `position:absolute;left:${snapshot.state.titlePosition.x}px;top:${snapshot.state.titlePosition.y}px;width:${template.title.width}px;text-align:center;color:#fff;font-weight:900;line-height:1.3;font-size:${snapshot.state.fontSize}px;text-shadow:2px 2px 5px rgba(0,0,0,.6);white-space:pre-line;`;
      for (const line of tokenizeTitle(snapshot.state.title)) {
        const lineEl = document.createElement('div');
        for (const token of line) {
          const span = document.createElement('span');
          span.textContent = token.text;
          if (token.highlighted) span.style.color = HIGHLIGHT_COLOR;
          lineEl.appendChild(span);
        }
        title.appendChild(lineEl);
      }
      card.appendChild(title);

      if (snapshot.state.qrVisible && snapshot.qrDataUrl) {
        const qrBox = document.createElement('div');
        qrBox.style.cssText = `position:absolute;left:${snapshot.state.qrPosition.x}px;top:${snapshot.state.qrPosition.y}px;width:${template.qr.width}px;height:${template.qr.height}px;padding:${template.qr.inset}px;background:#fff;border-radius:10px;box-sizing:border-box;`;
        const qrImg = document.createElement('img');
        qrImg.src = snapshot.qrDataUrl;
        qrImg.style.cssText = 'width:100%;height:100%;display:block;';
        qrBox.appendChild(qrImg);
        card.appendChild(qrBox);
      }

      document.body.appendChild(container);
      const canvas = await html2canvas(card, {
        backgroundColor: '#ffffff',
        scale: 1,
        useCORS: true,
        allowTaint: false,
        width: canvasWidth,
        height: canvasHeight,
        windowWidth: canvasWidth,
        windowHeight: canvasHeight,
      });
      const output = document.createElement('canvas');
      output.width = canvasWidth;
      output.height = canvasHeight;
      const ctx = output.getContext('2d');
      if (!ctx) throw new Error('EXPORT_FAILED');
      ctx.drawImage(canvas, 0, 0, canvasWidth, canvasHeight);
      const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('EXPORT_FAILED');
      return blob;
    } finally {
      container.remove();
    }
  }
}

export const defaultRenderer = new Html2CanvasRenderer();
