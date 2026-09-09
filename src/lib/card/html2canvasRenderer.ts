import html2canvas from 'html2canvas';
import { getTemplate } from '../../config/templates';
import { coverGeometry } from './geometry';
import { decodeImage, waitForFonts, type CardRenderer, type ExportSnapshot } from './renderer';

/**
 * html2canvas renderer behind the CardRenderer interface.
 * Uses the shared cover-geometry function instead of object-fit + transforms
 * so preview, bounds and export agree. Animated GIF input exports its decoded
 * first frame (browser decoding behavior); documented in README.
 */
export class Html2CanvasRenderer implements CardRenderer {
  readonly name = 'html2canvas';

  async render(snapshot: ExportSnapshot): Promise<Blob> {
    await waitForFonts();
    // Decode assets before snapshotting so export is deterministic.
    const [templateImg, photoImg] = await Promise.all([
      decodeImage(snapshot.templateSrc),
      decodeImage(snapshot.photoSrc).catch(() => decodeImage('/images/default-news.jpg')),
    ]);
    if (snapshot.qrDataUrl) {
      await decodeImage(snapshot.qrDataUrl).catch(() => undefined);
    }

    const container = document.createElement('div');
    container.setAttribute('aria-hidden', 'true');
    container.style.cssText =
      'position:fixed;left:-9999px;top:0;width:1080px;height:1350px;overflow:hidden;background:#fff;';
    const template = getTemplate(snapshot.state.templateId);

    try {
      container.innerHTML = '';
      const card = document.createElement('div');
      card.style.cssText =
        'position:relative;width:1080px;height:1350px;overflow:hidden;background:#fff;';
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
      overlay.style.cssText = 'position:absolute;inset:0;width:1080px;height:1350px;';
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
      title.textContent = snapshot.state.title.replace(/\*([^*]+)\*/g, '$1');
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
        width: 1080,
        height: 1350,
        windowWidth: 1080,
        windowHeight: 1350,
      });
      const output = document.createElement('canvas');
      output.width = 1080;
      output.height = 1350;
      const ctx = output.getContext('2d');
      if (!ctx) throw new Error('EXPORT_FAILED');
      ctx.drawImage(canvas, 0, 0, 1080, 1350);
      const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('EXPORT_FAILED');
      return blob;
    } finally {
      container.remove();
    }
  }
}

export const defaultRenderer = new Html2CanvasRenderer();
