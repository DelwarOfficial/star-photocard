import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { CARD_HEIGHT, getTemplate, templates } from '../../config/templates';
import { titleFontSize, tokenizeTitle } from '../../lib/card/highlightTitle';
import { defaultRenderer } from '../../lib/card/html2canvasRenderer';
import { clampPhotoOffset, clampToCanvas, previewScale } from '../../lib/card/geometry';
import { normalizePhotoTag, PHOTO_TAG_MAX_LENGTH, PHOTO_TAG_PRESETS } from '../../lib/card/photoTag';
import { cardReducer, clampFontSize, clampZoom } from '../../lib/card/reducer';
import { downloadFilename, isClipboardSupported } from '../../lib/card/renderer';
import { initialCardState } from '../../lib/card/types';
import { isStarNewsHost } from '../../lib/article/normalizeArticleUrl';

type ArticlePayload = {
  canonicalUrl: string;
  title: string;
  formattedDate: string;
  dateSource: string;
  language: 'bn' | 'en';
  imageUrl?: string;
};

type StatusTone = 'info' | 'success' | 'warning' | 'error';

const TITLE_SIZES = [44, 52, 60, 75];

function validateSourceUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'Enter a Star News article URL.';
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return 'Enter a valid secure (https) URL, for example https://starnews.com.bd/….';
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    return 'Only secure https URLs without credentials are supported.';
  }
  if (!isStarNewsHost(parsed.hostname)) return 'Only Star News URLs (starnews.com.bd and true subdomains) are supported.';
  return null;
}

function exportFailureMessage(err: unknown, action: 'Download' | 'Copy'): string {
  const code = err instanceof Error ? err.message : '';
  if (code === 'PHOTO_UNAVAILABLE') {
    return 'The card photo could not be loaded (article image links expire after 10 minutes). Click Generate again or choose a local image, then retry.';
  }
  if (code === 'TEMPLATE_UNAVAILABLE') return 'The template artwork could not be loaded. Pick another template or reload the page.';
  return `Export failed. Check the image and try ${action} again.`;
}

export default function PhotocardEditor() {
  const [card, dispatch] = useReducer(cardReducer, initialCardState);
  const [status, setStatus] = useState<{ tone: StatusTone; text: string }>({
    tone: 'info',
    text: 'Paste a Star News article URL to begin. Export stays disabled until a card is ready.',
  });
  const [urlError, setUrlError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [exporting, setExporting] = useState<'idle' | 'copy' | 'download'>('idle');
  const [customTagMode, setCustomTagMode] = useState(false);
  const [lastRemoteImage, setLastRemoteImage] = useState<{ src: string; kind: 'remote' | 'fallback' } | null>(null);

  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const localUrlRef = useRef<string | undefined>(undefined);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  // Real rendered title height (card px; CSS transforms do not affect offsetHeight) for drag bounds.
  const titleHeight = (): number => Math.min(CARD_HEIGHT, titleRef.current?.offsetHeight || card.fontSize * 1.3);
  const [previewWidth, setPreviewWidth] = useState(540);

  const template = useMemo(() => getTemplate(card.templateId), [card.templateId]);
  const titleLines = useMemo(() => tokenizeTitle(card.title), [card.title]);
  // Intrinsic size of the displayed photo; drag bounds must use the same cover math as export.
  const [photoSize, setPhotoSize] = useState({ width: 1920, height: 1080 });
  // A finished composition stays exportable after a failed or cancelled refetch.
  const canExport = card.loadStatus !== 'loading' && card.title.trim() !== '';
  const scale = useMemo(() => previewScale(previewWidth, Number.POSITIVE_INFINITY), [previewWidth]);
  // Computed after mount so SSR and first client render agree (avoids hydration mismatch).
  const [clipboardSupported, setClipboardSupported] = useState(false);

  useEffect(() => {
    const node = previewFrameRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && width > 0) setPreviewWidth(width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setClipboardSupported(isClipboardSupported());
  }, []);

  useEffect(() => {
    if (!card.articleUrl || !card.qrVisible) {
      setQrDataUrl('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(card.articleUrl, { errorCorrectionLevel: 'M', margin: 0, width: 240 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [card.articleUrl, card.qrVisible]);

  useEffect(
    () => () => {
      if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
      abortRef.current?.abort();
    },
    [],
  );

  const announce = useCallback((tone: StatusTone, text: string) => {
    setStatus({ tone, text });
  }, []);

  const generate = useCallback(async () => {
    const error = validateSourceUrl(card.sourceUrl);
    setUrlError(error);
    if (error) {
      announce('error', error);
      return;
    }
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: 'GENERATE_START' });
    announce('info', 'Fetching the Star News article… You can Cancel without losing your current work.');
    try {
      const response = await fetch('/api/article', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: card.sourceUrl.trim() }),
        signal: controller.signal,
      });
      const payload = (await response.json()) as {
        data?: ArticlePayload;
        error?: { code?: string; message?: string };
      };
      if (seq !== requestSeq.current) return; // stale response protection
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? 'The article could not be loaded.');
      }
      const data = payload.data;
      if (localUrlRef.current) {
        URL.revokeObjectURL(localUrlRef.current);
        localUrlRef.current = undefined;
      }
      const imageSrc = data.imageUrl ?? '/photos/default-news.jpg';
      const imageKind = data.imageUrl ? ('remote' as const) : ('fallback' as const);
      setLastRemoteImage({ src: imageSrc, kind: imageKind });
      dispatch({
        type: 'GENERATE_SUCCESS',
        articleUrl: data.canonicalUrl,
        title: data.title,
        publicationDate: data.formattedDate,
        language: data.language,
        imageSrc,
        imageKind,
      });
      // Auto-size capped by the active template's title box.
      dispatch({
        type: 'SET_FONT_SIZE',
        size: Math.min(titleFontSize(data.title), template.title.maxFontSize),
      });
      if (data.dateSource === 'fallback-now') {
        announce(
          'warning',
          'Publication date was missing, so today’s Dhaka date was used. You can edit the date field.',
        );
      } else if (!data.imageUrl) {
        announce('warning', 'Card generated with the bundled fallback photo because no article image was found.');
      } else {
        announce('success', 'Card generated. Refine the content, then Copy or Download the PNG.');
      }
    } catch (err) {
      if (seq !== requestSeq.current) return;
      if (err instanceof DOMException && err.name === 'AbortError') {
        announce('info', 'Article request cancelled. Your existing composition was kept.');
        dispatch({ type: 'GENERATE_ERROR' });
        return;
      }
      dispatch({ type: 'GENERATE_ERROR' });
      announce('error', err instanceof Error ? err.message : 'The article could not be loaded.');
    }
  }, [card.sourceUrl, template, announce]);

  const cancelGenerate = useCallback(() => {
    abortRef.current?.abort();
    requestSeq.current += 1;
    dispatch({ type: 'GENERATE_ERROR' });
    announce('info', 'Article request cancelled. Your existing composition was kept.');
  }, [announce]);

  const chooseLocalImage = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowed.includes(file.type)) {
        announce('error', 'Choose a JPG, PNG, WebP, or GIF file. The selected file was rejected.');
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        announce('error', 'Local images must be no larger than 8 MB.');
        return;
      }
      if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
      const objectUrl = URL.createObjectURL(file);
      localUrlRef.current = objectUrl;
      dispatch({ type: 'SET_LOCAL_IMAGE', src: objectUrl });
      announce('success', 'Local image loaded in this browser only. It is never uploaded.');
    },
    [announce],
  );

  const restoreArticleImage = useCallback(() => {
    if (!lastRemoteImage) {
      announce('info', 'No article image has been fetched yet.');
      return;
    }
    if (localUrlRef.current) {
      URL.revokeObjectURL(localUrlRef.current);
      localUrlRef.current = undefined;
    }
    dispatch({ type: 'RESTORE_REMOTE_IMAGE', src: lastRemoteImage.src, kind: lastRemoteImage.kind });
    announce('success', 'Restored the article image and reset photo zoom/position.');
  }, [lastRemoteImage, announce]);

  const fullReset = useCallback(() => {
    if (card.isDirty) {
      const confirmed = window.confirm('Reset the editor? Your current composition will be lost.');
      if (!confirmed) return;
    }
    if (localUrlRef.current) {
      URL.revokeObjectURL(localUrlRef.current);
      localUrlRef.current = undefined;
    }
    abortRef.current?.abort();
    requestSeq.current += 1;
    setLastRemoteImage(null);
    setCustomTagMode(false);
    setUrlError(null);
    dispatch({ type: 'FULL_RESET' });
    announce('info', 'Editor reset. Paste an Star News article URL to begin.');
  }, [card.isDirty, announce]);

  const nudge = useCallback(
    (layer: 'photo' | 'title' | 'qr', dx: number, dy: number) => {
      if (layer === 'photo') {
        const next = clampPhotoOffset(
          photoSize,
          template.photo,
          card.imageScale,
          { x: card.photoPosition.x + dx, y: card.photoPosition.y + dy },
        );
        dispatch({ type: 'SET_PHOTO_POSITION', position: next });
      } else if (layer === 'title') {
        const next = clampToCanvas(
          { x: card.titlePosition.x + dx, y: card.titlePosition.y + dy },
          { width: template.title.width, height: titleHeight() },
        );
        dispatch({ type: 'SET_TITLE_POSITION', position: next });
      } else {
        const next = clampToCanvas(
          { x: card.qrPosition.x + dx, y: card.qrPosition.y + dy },
          { width: template.qr.width, height: template.qr.height },
        );
        dispatch({ type: 'SET_QR_POSITION', position: next });
      }
    },
    [card.imageScale, card.photoPosition, card.qrPosition, card.titlePosition, photoSize, template],
  );

  const onLayerKeyDown = useCallback(
    (layer: 'photo' | 'title' | 'qr') => (event: React.KeyboardEvent) => {
      const step = event.shiftKey ? 10 : 1;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        nudge(layer, -step, 0);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        nudge(layer, step, 0);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        nudge(layer, 0, -step);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        nudge(layer, 0, step);
      }
    },
    [nudge],
  );

  const exportBlob = useCallback(async () => {
    const snapshot = {
      state: card,
      templateSrc: template.src,
      photoSrc: card.image.src,
      qrDataUrl: card.qrVisible ? qrDataUrl || null : null,
    };
    return defaultRenderer.render(snapshot);
  }, [card, template.src, qrDataUrl]);

  const download = useCallback(async () => {
    if (!canExport) return;
    setExporting('download');
    try {
      const blob = await exportBlob();
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = downloadFilename(new Date());
        document.body.appendChild(link);
        link.click();
        link.remove();
        announce('success', 'PNG downloaded at exactly 1080 × 1080.');
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch (err) {
      announce('error', exportFailureMessage(err, 'Download'));
    } finally {
      setExporting('idle');
    }
  }, [canExport, exportBlob, announce]);

  const copy = useCallback(async () => {
    if (!canExport) return;
    if (!isClipboardSupported()) {
      announce('warning', 'Copy needs a secure (HTTPS) browser with ClipboardItem support. Use Download PNG instead.');
      return;
    }
    setExporting('copy');
    let blob: Blob;
    try {
      blob = await exportBlob();
    } catch (err) {
      announce('error', exportFailureMessage(err, 'Copy'));
      setExporting('idle');
      return;
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      announce('success', 'Card copied as a PNG image. You can paste it into your newsroom workflow.');
    } catch {
      announce('warning', 'Copy was blocked or failed. The PNG is still available via Download.');
    } finally {
      setExporting('idle');
    }
  }, [canExport, exportBlob, announce]);

  const loading = card.loadStatus === 'loading';

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Star News Studio</p>
          <h1>Photocard Generator</h1>
          <p className="subhead">1080 × 1080 PNG · Star News articles · Bengali + English</p>
        </div>
        <div className="header-side">
          <p className="header-status" aria-hidden="true">
            {template.label} ·{' '}
            {card.loadStatus === 'loading'
              ? 'Fetching…'
              : card.loadStatus === 'ready'
                ? 'Ready to export'
                : card.loadStatus === 'error'
                  ? 'Needs attention'
                  : 'Idle'}
          </p>
          <button type="button" className="button secondary" onClick={fullReset}>
            Reset
          </button>
        </div>
      </header>

      <div className="workspace">
        <div className="controls" aria-label="Photocard controls">
          <section aria-labelledby="source-heading">
            <fieldset>
              <legend id="source-heading">1. Source</legend>
              <label htmlFor="article-url">Star News article URL</label>
              <input
                id="article-url"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://starnews.com.bd/…"
                value={card.sourceUrl}
                aria-invalid={urlError ? true : undefined}
                aria-describedby={urlError ? 'article-url-error url-help' : 'url-help'}
                onChange={(e) => {
                  dispatch({ type: 'SET_SOURCE_URL', url: e.target.value });
                  if (urlError) setUrlError(validateSourceUrl(e.target.value));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void generate();
                  }
                }}
              />
              <small id="url-help">Only https Star News URLs (starnews.com.bd and true subdomains) are accepted.</small>
              {urlError && (
                <p id="article-url-error" className="field-error" role="alert">
                  {urlError}
                </p>
              )}
              <div className="input-action">
                <button
                  type="button"
                  className="button primary"
                  onClick={() => void generate()}
                  disabled={loading || exporting !== 'idle'}
                >
                  {loading ? 'Fetching…' : 'Generate'}
                </button>
                {loading && (
                  <button type="button" className="button secondary" onClick={cancelGenerate}>
                    Cancel
                  </button>
                )}
              </div>
            </fieldset>
          </section>

          <section aria-labelledby="content-heading">
            <fieldset>
              <legend id="content-heading">2. Content</legend>
              <label htmlFor="headline">Headline</label>
              <textarea
                id="headline"
                rows={3}
                value={card.title}
                placeholder="Article headline"
                aria-describedby="headline-help headline-stats"
                onChange={(e) => dispatch({ type: 'SET_TITLE', title: e.target.value })}
              />
              <p id="headline-stats" className="word-hint" aria-live="off">
                {(() => {
                  const words = card.title.trim() ? card.title.trim().split(/\s+/u).length : 0;
                  return `${words} ${words === 1 ? 'word' : 'words'} · auto size ${titleFontSize(card.title)}px`;
                })()}
              </p>
              <small id="headline-help">
                Wrap words in *asterisks* to highlight them. Without markup, part of the title highlights
                automatically. New lines are preserved.
              </small>

              <label htmlFor="pub-date">Publication date</label>
              <input
                id="pub-date"
                type="text"
                value={card.publicationDate}
                placeholder="৪ সেপ্টেম্বর ২০২৬"
                onChange={(e) => dispatch({ type: 'SET_DATE', date: e.target.value })}
              />

              <label htmlFor="photo-tag-select">Photo tag</label>
              <select
                id="photo-tag-select"
                value={customTagMode ? '__custom__' : card.photoTag || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '__custom__') {
                    setCustomTagMode(true);
                    return;
                  }
                  setCustomTagMode(false);
                  dispatch({ type: 'SET_PHOTO_TAG', tag: normalizePhotoTag(value) });
                }}
              >
                <option value="">No Tag</option>
                {PHOTO_TAG_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
                <option value="__custom__">Custom…</option>
              </select>

              {customTagMode && (
                <div>
                  <label htmlFor="photo-tag-custom">Custom label (max 40 characters)</label>
                  <input
                    id="photo-tag-custom"
                    type="text"
                    value={card.photoTag}
                    maxLength={PHOTO_TAG_MAX_LENGTH}
                    placeholder="নিজের ট্যাগ লিখুন"
                    autoComplete="off"
                    aria-describedby="photo-tag-count"
                    onChange={(e) =>
                      dispatch({ type: 'SET_PHOTO_TAG', tag: normalizePhotoTag(e.target.value) })
                    }
                  />
                  <small id="photo-tag-count">
                    {Array.from(card.photoTag).length}/{PHOTO_TAG_MAX_LENGTH} characters
                  </small>
                </div>
              )}
            </fieldset>
          </section>

          <section aria-labelledby="design-heading">
            <fieldset>
              <legend id="design-heading">3. Design</legend>
              <span className="field-label" id="template-label">
                Template
              </span>
              <div className="template-grid" role="radiogroup" aria-labelledby="template-label">
                {templates.map((item) => (
                  <label key={item.id} className={item.id === card.templateId ? 'template selected' : 'template'}>
                    <input
                      type="radio"
                      name="template"
                      value={item.id}
                      checked={item.id === card.templateId}
                      onChange={() => dispatch({ type: 'SWITCH_TEMPLATE', templateId: item.id })}
                    />
                    <img src={item.thumbnail} alt="" loading="lazy" />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>

              <label htmlFor="local-image">Local image (JPG, PNG, WebP, GIF ≤ 8 MB)</label>
              <input
                id="local-image"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => chooseLocalImage(e.target.files?.[0])}
              />
              <div className="input-action">
                <button type="button" className="button secondary" onClick={restoreArticleImage}>
                  Restore article image
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => dispatch({ type: 'RESET_PHOTO' })}
                >
                  Reset photo position
                </button>
              </div>
              <p className="field-note">
                Image source: {card.image.kind === 'local' ? 'local file (this browser only)' : card.image.kind}.
              </p>

              <label htmlFor="font-size-range">
                Headline size: {card.fontSize}px (30–120)
              </label>
              <input
                id="font-size-range"
                type="range"
                min={30}
                max={120}
                step={1}
                value={card.fontSize}
                onChange={(e) => dispatch({ type: 'SET_FONT_SIZE', size: Number(e.target.value) })}
              />
              <div className="input-action">
                <label htmlFor="font-size-number" className="visually-hidden">
                  Headline size value
                </label>
                <input
                  id="font-size-number"
                  type="number"
                  min={30}
                  max={120}
                  value={card.fontSize}
                  onChange={(e) => dispatch({ type: 'SET_FONT_SIZE', size: clampFontSize(Number(e.target.value)) })}
                />
                <div className="size-presets" role="group" aria-label="Suggested headline sizes">
                  {TITLE_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      className="chip"
                      onClick={() => dispatch({ type: 'SET_FONT_SIZE', size })}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <label htmlFor="zoom-range">Photo zoom: {card.imageScale.toFixed(1)}× (1–3)</label>
              <input
                id="zoom-range"
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={card.imageScale}
                onChange={(e) => dispatch({ type: 'SET_IMAGE_SCALE', scale: clampZoom(Number(e.target.value)) })}
              />

              <PositionControls
                layer="photo"
                x={card.photoPosition.x}
                y={card.photoPosition.y}
                onNudge={(dx, dy) => nudge('photo', dx, dy)}
                onReset={() => dispatch({ type: 'RESET_PHOTO' })}
                onKeyDown={onLayerKeyDown('photo')}
              />
              <PositionControls
                layer="title"
                x={card.titlePosition.x}
                y={card.titlePosition.y}
                onNudge={(dx, dy) => nudge('title', dx, dy)}
                onReset={() => dispatch({ type: 'RESET_TITLE' })}
                onKeyDown={onLayerKeyDown('title')}
              />
              <PositionControls
                layer="qr"
                x={card.qrPosition.x}
                y={card.qrPosition.y}
                onNudge={(dx, dy) => nudge('qr', dx, dy)}
                onReset={() => dispatch({ type: 'RESET_QR' })}
                onKeyDown={onLayerKeyDown('qr')}
              />

              <div className="qr-toggle">
                <input
                  id="qr-visible"
                  type="checkbox"
                  checked={card.qrVisible}
                  onChange={(e) => dispatch({ type: 'SET_QR_VISIBLE', visible: e.target.checked })}
                />
                <label htmlFor="qr-visible">Show QR code (links to the source URL)</label>
              </div>
              <button type="button" className="button secondary" onClick={() => dispatch({ type: 'RESET_LAYOUT' })}>
                Reset layout to template defaults
              </button>
            </fieldset>
          </section>

          <section aria-labelledby="export-heading">
            <fieldset>
              <legend id="export-heading">4. Preview and Export</legend>
              <div className="export-actions">
                <button
                  type="button"
                  className="button primary"
                  disabled={!canExport || exporting !== 'idle'}
                  onClick={() => void download()}
                >
                  {exporting === 'download' ? 'Exporting…' : 'Download PNG'}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={!canExport || exporting !== 'idle'}
                  onClick={() => void copy()}
                  title={
                    clipboardSupported
                      ? 'Copy the PNG to the clipboard'
                      : 'Copy needs HTTPS + ClipboardItem support; Download always works'
                  }
                >
                  {exporting === 'copy' ? 'Copying…' : 'Copy PNG'}
                </button>
              </div>
              {!clipboardSupported && (
                <p className="field-note">Copy needs a secure browser with image-clipboard support. Download always works.</p>
              )}
            </fieldset>
          </section>

          <p className={`status tone-${status.tone}`} role="status" aria-live="polite">
            {status.text}
          </p>
        </div>

        <section className="preview-stage" aria-label="Photocard preview">
          <div className="preview-frame" ref={previewFrameRef}>
            <div
              className={`card ${card.language === 'bn' ? 'bangla' : 'english'}`}
              lang={card.language}
              style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
            >
              <DraggableLayer
                label="Photo layer"
                position={{ x: 0, y: 0 }}
                scale={scale}
                onMove={(dx, dy) => {
                  const next = clampPhotoOffset(
                    photoSize,
                    template.photo,
                    card.imageScale,
                    { x: card.photoPosition.x + dx, y: card.photoPosition.y + dy },
                  );
                  dispatch({ type: 'SET_PHOTO_POSITION', position: next });
                }}
                onKeyDown={onLayerKeyDown('photo')}
              >
                <div
                  className="photo-window"
                  style={{
                    left: template.photo.x,
                    top: template.photo.y,
                    width: template.photo.width,
                    height: template.photo.height,
                  }}
                >
                  <img
                    className="photo"
                    src={card.image.src}
                    alt=""
                    draggable={false}
                    onLoad={(e) => {
                      const { naturalWidth, naturalHeight } = e.currentTarget;
                      if (naturalWidth > 0 && naturalHeight > 0) {
                        setPhotoSize({ width: naturalWidth, height: naturalHeight });
                      }
                    }}
                    style={{
                      transform: `translate(${card.photoPosition.x}px, ${card.photoPosition.y}px) scale(${card.imageScale})`,
                    }}
                  />
                </div>
              </DraggableLayer>
              <img className="card-template" src={template.src} alt="" draggable={false} />
              <div
                className="card-date"
                style={{
                  left: template.date.x,
                  top: template.date.y,
                  width: template.date.width,
                  fontSize: template.date.fontSize,
                }}
              >
                {card.publicationDate || 'তারিখ'}
              </div>
              {card.photoTag && (
                <div
                  className="photo-tag"
                  style={{
                    left: template.photoTag.x,
                    top: template.photoTag.y,
                    maxWidth: template.photoTag.maxWidth,
                    fontSize: template.photoTag.fontSize,
                  }}
                >
                  {card.photoTag}
                </div>
              )}
              <DraggableLayer
                label="Headline layer"
                position={card.titlePosition}
                scale={scale}
                onMove={(dx, dy) => {
                  const next = clampToCanvas(
                    { x: card.titlePosition.x + dx, y: card.titlePosition.y + dy },
                    { width: template.title.width, height: titleHeight() },
                  );
                  dispatch({ type: 'SET_TITLE_POSITION', position: next });
                }}
                onKeyDown={onLayerKeyDown('title')}
              >
                <div
                  className="card-title"
                  ref={titleRef}
                  style={{
                    left: card.titlePosition.x,
                    top: card.titlePosition.y,
                    width: template.title.width,
                    fontSize: card.fontSize,
                  }}
                >
                  {card.title ? (
                    titleLines.map((line, i) => (
                      <div key={i}>
                        {line.map((token, j) => (
                          <span key={j} className={token.highlighted ? 'highlight' : undefined}>
                            {token.text}
                          </span>
                        ))}
                      </div>
                    ))
                  ) : (
                    <span className="placeholder">Headline preview</span>
                  )}
                </div>
              </DraggableLayer>
              {card.qrVisible && qrDataUrl && (
                <DraggableLayer
                  label="QR code layer"
                  position={card.qrPosition}
                  scale={scale}
                  onMove={(dx, dy) => {
                    const next = clampToCanvas(
                      { x: card.qrPosition.x + dx, y: card.qrPosition.y + dy },
                      { width: template.qr.width, height: template.qr.height },
                    );
                    dispatch({ type: 'SET_QR_POSITION', position: next });
                  }}
                  onKeyDown={onLayerKeyDown('qr')}
                >
                  <div
                    className="qr"
                    style={{
                      left: card.qrPosition.x,
                      top: card.qrPosition.y,
                      width: template.qr.width,
                      height: template.qr.height,
                      padding: template.qr.inset,
                    }}
                  >
                    <img src={qrDataUrl} alt="QR code linking to the source article" draggable={false} />
                  </div>
                </DraggableLayer>
              )}
            </div>
          </div>
          <p className="dimensions">1080 × 1080 PNG · preview scale {scale.toFixed(2)}×</p>
          {card.loadStatus === 'idle' && (
            <p className="dimensions">Tip: paste a Star News URL above, or type a headline to preview the layout.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function PositionControls(props: {
  layer: 'photo' | 'title' | 'qr';
  x: number;
  y: number;
  onNudge: (dx: number, dy: number) => void;
  onReset: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}) {
  const label = props.layer === 'photo' ? 'Photo position' : props.layer === 'title' ? 'Headline position' : 'QR position';
  return (
    <div className="position-controls" onKeyDown={props.onKeyDown}>
      <span className="field-label" id={`${props.layer}-pos-label`}>
        {label}: {Math.round(props.x)}, {Math.round(props.y)} px
      </span>
      <div
        className="nudge-grid"
        role="group"
        aria-labelledby={`${props.layer}-pos-label`}
        aria-describedby={`${props.layer}-pos-help`}
      >
        <button type="button" className="chip" aria-label={`Move ${props.layer} left`} onClick={() => props.onNudge(-1, 0)}>
          ←
        </button>
        <button type="button" className="chip" aria-label={`Move ${props.layer} up`} onClick={() => props.onNudge(0, -1)}>
          ↑
        </button>
        <button type="button" className="chip" aria-label={`Move ${props.layer} down`} onClick={() => props.onNudge(0, 1)}>
          ↓
        </button>
        <button type="button" className="chip" aria-label={`Move ${props.layer} right`} onClick={() => props.onNudge(1, 0)}>
          →
        </button>
        <button type="button" className="chip" onClick={props.onReset}>
          Reset {props.layer}
        </button>
      </div>
      <small id={`${props.layer}-pos-help`}>Arrow keys move 1 px, Shift+Arrow moves 10 px. Dragging also works.</small>
    </div>
  );
}

function DraggableLayer(props: {
  label: string;
  position: { x: number; y: number };
  scale: number;
  onMove: (dx: number, dy: number) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  children: React.ReactNode;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      role="group"
      aria-label={`${props.label}. Use arrow keys to nudge.`}
      tabIndex={0}
      className="drag-layer"
      style={{ position: 'absolute', inset: 0 }}
      onKeyDown={props.onKeyDown}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const dx = (e.clientX - start.current.x) / Math.max(0.01, props.scale);
        const dy = (e.clientY - start.current.y) / Math.max(0.01, props.scale);
        start.current = { x: e.clientX, y: e.clientY };
        props.onMove(dx, dy);
      }}
      onPointerUp={() => {
        start.current = null;
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
    >
      {props.children}
    </div>
  );
}
