import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { getTemplate, SITE_URL, templatesForMode, type TemplateDefinition } from '../../config/templates';
import { titleFontSize, tokenizeTitle } from '../../lib/card/highlightTitle';
import { defaultRenderer } from '../../lib/card/html2canvasRenderer';
import { clampPhotoOffset, clampToCanvas, previewScale } from '../../lib/card/geometry';
import { hasTag, PHOTO_CREDIT_PRESETS, PHOTO_TAG_MAX_LENGTH, PHOTO_TAG_PRESETS } from '../../lib/card/photoTag';
import { cardReducer, clampFontSize, clampZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '../../lib/card/reducer';
import { downloadFilename, isClipboardSupported } from '../../lib/card/renderer';
import { creditStyle, highlightColor, pillStyle, qrStyle, dateStyle, titleStyle } from '../../lib/card/layerStyles';
import { FALLBACK_IMAGE_SRC, initialCardState } from '../../lib/card/types';
import { todayBanglaDate } from '../../lib/text/dates';
import { S, UI_LANG } from '../../lib/i18n/strings';
import { isStarNewsHost } from '../../lib/article/normalizeArticleUrl';

type ArticlePayload = {
  canonicalUrl: string;
  title: string;
  category?: string | null;
  language: 'bn' | 'en';
  imageUrl?: string;
};

type StatusTone = 'info' | 'success' | 'warning' | 'error';

const TITLE_SIZES = [44, 52, 60, 75];

type IconName = 'left' | 'up' | 'down' | 'right' | 'minus' | 'plus';
const ICON_PATHS: Record<IconName, string> = {
  left: 'M15 6l-6 6 6 6',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  right: 'M9 6l6 6-6 6',
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
};

/** One stroke icon family (24-unit grid, 2px round stroke); the button carries the accessible name. */
function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d={ICON_PATHS[name]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Inline sizing for the card + frame; replaces the old fixed 1080 × 1080 CSS. */
function canvasBox(template: TemplateDefinition, scale: number) {
  const { width, height } = template.canvas;
  return {
    frame: { aspectRatio: `${width} / ${height}` },
    card: { width, height, transform: `scale(${scale})`, transformOrigin: 'top left' },
  };
}

function validateSourceUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return S.url.errors.empty;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return S.url.errors.invalid;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    return S.url.errors.insecure;
  }
  if (!isStarNewsHost(parsed.hostname)) return S.url.errors.host;
  return null;
}

function exportFailureMessage(err: unknown, action: 'download' | 'copy'): string {
  const code = err instanceof Error ? err.message : '';
  if (code === 'PHOTO_UNAVAILABLE') {
    return S.status.exportPhoto;
  }
  if (code === 'TEMPLATE_UNAVAILABLE') return S.status.exportTemplate;
  return S.status.exportFailed(action);
}

export default function PhotocardEditor() {
  const [card, dispatch] = useReducer(cardReducer, initialCardState);
  const [status, setStatus] = useState<{ tone: StatusTone; text: string }>({
    tone: 'info',
    text: S.status.initial,
  });
  const [urlError, setUrlError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [exporting, setExporting] = useState<'idle' | 'copy' | 'download'>('idle');
  // Custom credit: the text field stays open even while empty (empty custom = no tag).
  const [customCredit, setCustomCredit] = useState(false);
  const [lastRemoteImage, setLastRemoteImage] = useState<{ src: string; kind: 'remote' | 'fallback' } | null>(null);

  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const localUrlRef = useRef<string | undefined>(undefined);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  // Real rendered title height (card px; CSS transforms do not affect offsetHeight) for drag bounds.
  const [previewWidth, setPreviewWidth] = useState(540);

  const template = useMemo(() => getTemplate(card.templateId), [card.templateId]);
  const titleHeight = (): number =>
    Math.min(template.canvas.height, titleRef.current?.offsetHeight || card.fontSize * 1.3);
  // Article cards encode the reference news link; custom cards have none, so they encode the root domain.
  const qrTarget = template.qr ? (template.mode === 'article' ? card.articleUrl : SITE_URL) : '';
  const titleLines = useMemo(() => tokenizeTitle(card.title), [card.title]);
  // Intrinsic size of the displayed photo; drag bounds must use the same cover math as export.
  const [photoSize, setPhotoSize] = useState({ width: 1920, height: 1080 });
  // A finished composition stays exportable after a failed or cancelled refetch.
  const needsUpload = template.requiresImage && card.image.kind !== 'local';
  const canExport = card.loadStatus !== 'loading' && card.title.trim() !== '' && !needsUpload;
  const scale = useMemo(() => previewScale(previewWidth, Number.POSITIVE_INFINITY, template.canvas), [previewWidth, template.canvas]);
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
    if (!qrTarget || !card.qrVisible) {
      setQrDataUrl('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(qrTarget, { errorCorrectionLevel: 'M', margin: 0, width: 240 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [qrTarget, card.qrVisible]);

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
    announce('info', S.status.fetching);
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
        throw new Error(payload.error?.message ?? S.status.loadFailed);
      }
      const data = payload.data;
      if (localUrlRef.current) {
        URL.revokeObjectURL(localUrlRef.current);
        localUrlRef.current = undefined;
      }
      const imageSrc = data.imageUrl ?? FALLBACK_IMAGE_SRC;
      const imageKind = data.imageUrl ? ('remote' as const) : ('fallback' as const);
      setLastRemoteImage({ src: imageSrc, kind: imageKind });
      dispatch({
        type: 'GENERATE_SUCCESS',
        articleUrl: data.canonicalUrl,
        category: data.category ?? null,
        title: data.title,
        language: data.language,
        imageSrc,
        imageKind,
      });
      // Auto-size capped by the active template's title box.
      dispatch({
        type: 'SET_FONT_SIZE',
        size: Math.min(titleFontSize(data.title), template.title.maxFontSize),
      });
      if (!data.imageUrl) {
        announce('warning', S.status.readyDemo);
      } else {
        announce('success', S.status.ready);
      }
    } catch (err) {
      if (seq !== requestSeq.current) return;
      if (err instanceof DOMException && err.name === 'AbortError') {
        announce('info', S.status.cancelled);
        dispatch({ type: 'GENERATE_ERROR' });
        return;
      }
      dispatch({ type: 'GENERATE_ERROR' });
      announce('error', err instanceof Error ? err.message : S.status.loadFailed);
    }
  }, [card.sourceUrl, template, announce]);

  const cancelGenerate = useCallback(() => {
    abortRef.current?.abort();
    requestSeq.current += 1;
    dispatch({ type: 'GENERATE_ERROR' });
    announce('info', S.status.cancelled);
  }, [announce]);

  const chooseLocalImage = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowed.includes(file.type)) {
        announce('error', S.status.badFile);
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        announce('error', S.status.tooBig);
        return;
      }
      if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
      const objectUrl = URL.createObjectURL(file);
      localUrlRef.current = objectUrl;
      dispatch({ type: 'SET_LOCAL_IMAGE', src: objectUrl });
      announce('success', S.status.localLoaded);
    },
    [announce],
  );

  const restoreArticleImage = useCallback(() => {
    if (!lastRemoteImage) {
      announce('info', S.status.noArticlePhoto);
      return;
    }
    if (localUrlRef.current) {
      URL.revokeObjectURL(localUrlRef.current);
      localUrlRef.current = undefined;
    }
    dispatch({ type: 'RESTORE_REMOTE_IMAGE', src: lastRemoteImage.src, kind: lastRemoteImage.kind });
    announce('success', S.status.restored);
  }, [lastRemoteImage, announce]);

  const fullReset = useCallback(() => {
    if (card.isDirty) {
      const confirmed = window.confirm(S.status.confirmReset);
      if (!confirmed) return;
    }
    if (localUrlRef.current) {
      URL.revokeObjectURL(localUrlRef.current);
      localUrlRef.current = undefined;
    }
    abortRef.current?.abort();
    requestSeq.current += 1;
    setLastRemoteImage(null);
    setCustomCredit(false);
    setUrlError(null);
    dispatch({ type: 'FULL_RESET', date: todayBanglaDate(), templateId: template.id });
    announce('info', S.status.reset);
  }, [card.isDirty, template.id, announce]);

  const nudge = useCallback(
    (layer: 'photo' | 'title' | 'qr', dx: number, dy: number) => {
      if (layer === 'photo') {
        if (!template.photo) return;
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
          template.canvas,
        );
        dispatch({ type: 'SET_TITLE_POSITION', position: next });
      } else {
        if (!template.qr) return;
        const next = clampToCanvas(
          { x: card.qrPosition.x + dx, y: card.qrPosition.y + dy },
          { width: template.qr.width, height: template.qr.height },
          template.canvas,
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
        announce('success', S.status.downloaded(template.canvas.width, template.canvas.height));
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch (err) {
      announce('error', exportFailureMessage(err, 'download'));
    } finally {
      setExporting('idle');
    }
  }, [canExport, exportBlob, announce, template.canvas]);

  const copy = useCallback(async () => {
    if (!canExport) return;
    if (!isClipboardSupported()) {
      announce('warning', S.status.copyUnsupported);
      return;
    }
    setExporting('copy');
    let blob: Blob;
    try {
      blob = await exportBlob();
    } catch (err) {
      announce('error', exportFailureMessage(err, 'copy'));
      setExporting('idle');
      return;
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      announce('success', S.status.copied);
    } catch {
      announce('warning', S.status.copyBlocked);
    } finally {
      setExporting('idle');
    }
  }, [canExport, exportBlob, announce]);

  const loading = card.loadStatus === 'loading';
  /** Zoom and re-clamp the pan so zooming out never exposes the window behind the photo. */
  const setZoom = (scale: number) => {
    const next = clampZoom(scale);
    dispatch({ type: 'SET_IMAGE_SCALE', scale: next });
    if (template.photo) {
      dispatch({
        type: 'SET_PHOTO_POSITION',
        position: clampPhotoOffset(photoSize, template.photo, next, card.photoPosition),
      });
    }
  };
  const isArticle = template.mode === 'article';
  const box = canvasBox(template, scale);
  const pill = pillStyle(template);
  const credit = creditStyle(template);
  const creditIsPreset = (PHOTO_CREDIT_PRESETS as readonly string[]).includes(card.photoCredit);
  const showCustomCredit = customCredit || (card.photoCredit !== '' && !creditIsPreset);
  const qr = qrStyle(template, card);
  const emphasis = highlightColor(template);
  const { width: canvasW, height: canvasH } = template.canvas;

  const switchTemplate = (id: string) => {
    dispatch({ type: 'SWITCH_TEMPLATE', templateId: id });
  };

  return (
    <div className="app-shell" lang={UI_LANG}>
      <header className="app-header">
        <div>
          <h1>{S.header.title}</h1>
          <p className="subhead">
            {S.header.subhead(canvasW, canvasH)}
          </p>
        </div>
        <div className="header-side">
          <p className="header-status" aria-hidden="true">
            {template.label} ·{' '}
            {needsUpload
              ? S.header.state.needsPhoto
              : card.loadStatus === 'loading'
                ? S.header.state.fetching
                : canExport
                  ? S.header.state.ready
                  : S.header.state.needsHeadline}
          </p>
          <button type="button" className="button secondary" onClick={fullReset}>
            {S.header.reset}
          </button>
        </div>
      </header>

      <div className="workspace">
        <div className="controls" aria-label={S.sections.controls}>
          <section aria-labelledby="type-heading">
            <fieldset>
              <legend id="type-heading">{S.sections.type}</legend>
              {(['article', 'custom'] as const).map((mode) => (
                <div key={mode} className="mode-group">
                  <span className="field-label" id={`mode-${mode}-label`}>
                    {S.modes[mode].label}
                  </span>
                  <small id={`mode-${mode}-hint`}>{S.modes[mode].hint}</small>
                  <div
                    className="template-grid"
                    role="radiogroup"
                    aria-labelledby={`mode-${mode}-label`}
                    aria-describedby={`mode-${mode}-hint`}
                  >
                    {templatesForMode(mode).map((item) => (
                      <label key={item.id} className={item.id === card.templateId ? 'template selected' : 'template'}>
                        <input
                          type="radio"
                          name="template"
                          value={item.id}
                          checked={item.id === card.templateId}
                          onChange={() => switchTemplate(item.id)}
                        />
                        <img src={item.thumbnail} alt="" loading="lazy" />
                        <span>{S.templates[item.id] ?? item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>
          </section>

          <section aria-labelledby="content-heading">
            <fieldset>
              <legend id="content-heading">{S.sections.content}</legend>

              {isArticle && (
                <>
                  <label htmlFor="article-url">{S.url.label}</label>
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
                  <small id="url-help">{S.url.help}</small>
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
                      {loading ? S.url.fetching : S.url.generate}
                    </button>
                    {loading && (
                      <button type="button" className="button secondary" onClick={cancelGenerate}>
                        {S.url.cancel}
                      </button>
                    )}
                  </div>
                </>
              )}

              {template.requiresImage && (
                <>
                  <label htmlFor="local-image">{S.upload.required}</label>
                  <input
                    id="local-image"
                    type="file"
                    accept="image/*"
                    aria-describedby="local-image-help"
                    onChange={(e) => chooseLocalImage(e.target.files?.[0])}
                  />
                  <small id="local-image-help">
                    {needsUpload ? S.upload.needed : S.upload.loaded}
                  </small>
                </>
              )}

              <label htmlFor="headline">{S.headline.label}</label>
              <textarea
                id="headline" lang="bn"
                rows={3}
                value={card.title}
                placeholder={S.headline.placeholder}
                aria-describedby="headline-help headline-stats"
                onChange={(e) => dispatch({ type: 'SET_TITLE', title: e.target.value })}
              />
              <p id="headline-stats" className="word-hint" aria-live="off">
                {(() => {
                  const words = card.title.trim() ? card.title.trim().split(/\s+/u).length : 0;
                  return S.headline.stats(words, titleFontSize(card.title));
                })()}
              </p>
              <small id="headline-help">
                {template.highlightColor
                  ? S.headline.helpHighlight
                  : S.headline.helpPlain}
              </small>

              <label htmlFor="pub-date">{S.date.label}</label>
              <div className="input-action">
                <input
                  id="pub-date" lang="bn"
                  type="text"
                  value={card.publicationDate}
                  placeholder={todayBanglaDate()}
                  aria-describedby="pub-date-help"
                  onChange={(e) => dispatch({ type: 'SET_DATE', date: e.target.value })}
                />
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => dispatch({ type: 'SET_DATE', date: todayBanglaDate() })}
                >
                  {S.date.today}
                </button>
              </div>
              <small id="pub-date-help">{S.date.help}</small>

              {template.photoTag && (
                <>
                  <label htmlFor="photo-tag">{S.category.label}</label>
                  <input
                    id="photo-tag" lang="bn"
                    type="text"
                    list="photo-tag-presets"
                    value={card.photoTag}
                    maxLength={PHOTO_TAG_MAX_LENGTH}
                    placeholder={S.category.placeholder}
                    autoComplete="off"
                    aria-describedby="photo-tag-help"
                    onChange={(e) => dispatch({ type: 'SET_PHOTO_TAG', tag: e.target.value })}
                  />
                  <datalist id="photo-tag-presets">
                    {PHOTO_TAG_PRESETS.map((preset) => (
                      <option key={preset} value={preset} />
                    ))}
                  </datalist>
                  <small id="photo-tag-help">
                    {S.category.help(Array.from(card.photoTag).length, PHOTO_TAG_MAX_LENGTH)}
                  </small>
                </>
              )}

              {template.photoCredit && (
                <>
                  <label htmlFor="photo-credit">{S.credit.label}</label>
                  <select
                    id="photo-credit" lang="bn"
                    value={showCustomCredit ? '__custom__' : card.photoCredit}
                    aria-describedby="photo-credit-help"
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '__custom__') {
                        setCustomCredit(true);
                        // Start Custom empty rather than carrying a preset into the text field.
                        if (creditIsPreset) dispatch({ type: 'SET_PHOTO_CREDIT', credit: '' });
                        return;
                      }
                      setCustomCredit(false);
                      dispatch({ type: 'SET_PHOTO_CREDIT', credit: value });
                    }}
                  >
                    <option value="">{S.credit.none}</option>
                    {PHOTO_CREDIT_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>
                        {preset}
                      </option>
                    ))}
                    <option value="__custom__">{S.credit.custom}</option>
                  </select>
                  <small id="photo-credit-help">{S.credit.help}</small>
                  {showCustomCredit && (
                    <>
                      <label htmlFor="photo-credit-custom">{S.credit.customLabel}</label>
                      <input
                        id="photo-credit-custom" lang="bn"
                        type="text"
                        value={card.photoCredit}
                        placeholder={S.credit.customPlaceholder}
                        autoComplete="off"
                        aria-describedby="photo-credit-count"
                        onChange={(e) => dispatch({ type: 'SET_PHOTO_CREDIT', credit: e.target.value })}
                      />
                      <small id="photo-credit-count">
                        {S.credit.count(Array.from(card.photoCredit).length, PHOTO_TAG_MAX_LENGTH)}
                      </small>
                    </>
                  )}
                </>
              )}
            </fieldset>
          </section>

          <section aria-labelledby="design-heading">
            <fieldset>
              <legend id="design-heading">{S.sections.layout}</legend>

              {template.photo && (
                <>
                  {isArticle && (
                    <>
                      <label htmlFor="local-image">{S.upload.replace}</label>
                      <input
                        id="local-image"
                        type="file"
                        accept="image/*"
                        onChange={(e) => chooseLocalImage(e.target.files?.[0])}
                      />
                      <div className="input-action">
                        <button type="button" className="button secondary" onClick={restoreArticleImage}>
                          {S.upload.restore}
                        </button>
                      </div>
                      <p className="field-note">
                        {S.upload.source.label} {S.upload.source[card.image.kind]}.
                      </p>
                    </>
                  )}
                  <label htmlFor="zoom-range">
                    {S.zoom.label(card.imageScale.toFixed(1), ZOOM_MIN, ZOOM_MAX)}
                  </label>
                  <div className="zoom-controls">
                    <button
                      type="button"
                      className="chip"
                      aria-label={S.zoom.out}
                      disabled={card.imageScale <= ZOOM_MIN}
                      onClick={() => setZoom(card.imageScale - ZOOM_STEP)}
                    >
                      <Icon name="minus" />
                    </button>
                    <input
                      id="zoom-range"
                      type="range"
                      min={ZOOM_MIN}
                      max={ZOOM_MAX}
                      step={ZOOM_STEP}
                      value={card.imageScale}
                      onChange={(e) => setZoom(Number(e.target.value))}
                    />
                    <button
                      type="button"
                      className="chip"
                      aria-label={S.zoom.in}
                      disabled={card.imageScale >= ZOOM_MAX}
                      onClick={() => setZoom(card.imageScale + ZOOM_STEP)}
                    >
                      <Icon name="plus" />
                    </button>
                  </div>
                  <small>{S.zoom.help}</small>
                  <PositionControls
                    layer="photo"
                    x={card.photoPosition.x}
                    y={card.photoPosition.y}
                    onNudge={(dx, dy) => nudge('photo', dx, dy)}
                    onReset={() => dispatch({ type: 'RESET_PHOTO' })}
                    onKeyDown={onLayerKeyDown('photo')}
                  />
                </>
              )}

              <label htmlFor="font-size-range">{S.fontSize.label(card.fontSize)}</label>
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
                  {S.fontSize.value}
                </label>
                <input
                  id="font-size-number"
                  type="number"
                  min={30}
                  max={120}
                  value={card.fontSize}
                  onChange={(e) => dispatch({ type: 'SET_FONT_SIZE', size: clampFontSize(Number(e.target.value)) })}
                />
                <div className="size-presets" role="group" aria-label={S.fontSize.presets}>
                  {[...new Set([...TITLE_SIZES, template.title.defaultFontSize])]
                    .sort((x, y) => x - y)
                    .map((size) => (
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

              <PositionControls
                layer="title"
                x={card.titlePosition.x}
                y={card.titlePosition.y}
                onNudge={(dx, dy) => nudge('title', dx, dy)}
                onReset={() => dispatch({ type: 'RESET_TITLE' })}
                onKeyDown={onLayerKeyDown('title')}
              />

              {template.qr && (
                <>
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
                      role="switch"
                      className="switch"
                      checked={card.qrVisible}
                      onChange={(e) => dispatch({ type: 'SET_QR_VISIBLE', visible: e.target.checked })}
                    />
                    <label htmlFor="qr-visible">
                      {isArticle ? S.qr.toggleArticle : S.qr.toggleCustom}
                    </label>
                  </div>
                </>
              )}
              <button type="button" className="button secondary" onClick={() => dispatch({ type: 'RESET_LAYOUT' })}>
                {S.layoutReset}
              </button>
            </fieldset>
          </section>

          <section aria-labelledby="export-heading" aria-busy={exporting !== 'idle'}>
            <fieldset>
              <legend id="export-heading">{S.sections.export}</legend>
              <div className="export-actions">
                <button
                  type="button"
                  className="button primary"
                  disabled={!canExport || exporting !== 'idle'}
                  onClick={() => void download()}
                >
                  {exporting === 'download' ? S.export.downloading : S.export.download}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={!canExport || exporting !== 'idle'}
                  onClick={() => void copy()}
                  title={
                    clipboardSupported
                      ? S.export.copyTitle
                      : S.export.copyUnsupportedTitle
                  }
                >
                  {exporting === 'copy' ? S.export.copying : S.export.copy}
                </button>
              </div>
              {needsUpload && <p className="field-note">{S.export.needsPhoto}</p>}
              {!clipboardSupported && (
                <p className="field-note">{S.export.copyUnsupportedNote}</p>
              )}
            </fieldset>
          </section>

          <p className={`status tone-${status.tone}`} role="status" aria-live="polite">
            {status.text}
          </p>
        </div>

        <section className="preview-stage" aria-label={S.sections.preview} aria-busy={loading || exporting !== 'idle'}>
          <div className="preview-frame" ref={previewFrameRef} style={box.frame}>
            <div
              className={`card ${card.language === 'bn' ? 'bangla' : 'english'}`}
              lang={card.language}
              style={box.card}
            >
              {template.photo && (
                <DraggableLayer
                  label={S.layers.preview.photo}
                  position={{ x: 0, y: 0 }}
                  scale={scale}
                  onMove={(dx, dy) => nudge('photo', dx, dy)}
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
              )}
              <img className="card-template" src={template.src} alt="" draggable={false} />
              <div className="card-date" style={dateStyle(template) as React.CSSProperties}>
                {card.publicationDate}
              </div>
              {credit && (
                <div
                  className="card-credit"
                  style={credit as React.CSSProperties}
                  aria-hidden={hasTag(card.photoCredit) ? undefined : true}
                  hidden={!hasTag(card.photoCredit)}
                >
                  {card.photoCredit}
                </div>
              )}
              {pill && hasTag(card.photoTag) && (
                <div className="card-pill" style={pill as React.CSSProperties}>
                  {card.photoTag}
                </div>
              )}
              <DraggableLayer
                label={S.layers.preview.title}
                position={card.titlePosition}
                scale={scale}
                onMove={(dx, dy) => nudge('title', dx, dy)}
                onKeyDown={onLayerKeyDown('title')}
              >
                <div className="card-title" ref={titleRef} style={titleStyle(template, card) as React.CSSProperties}>
                  {card.title ? (
                    titleLines.map((line, i) => (
                      <div key={i}>
                        {line.map((token, j) => (
                          <span key={j} style={token.highlighted ? { color: emphasis } : undefined}>
                            {token.text}
                          </span>
                        ))}
                      </div>
                    ))
                  ) : (
                    <span className="placeholder">শিরোনাম এখানে</span>
                  )}
                </div>
              </DraggableLayer>
              {qr && card.qrVisible && qrDataUrl && (
                <DraggableLayer
                  label={S.layers.preview.qr}
                  position={card.qrPosition}
                  scale={scale}
                  onMove={(dx, dy) => nudge('qr', dx, dy)}
                  onKeyDown={onLayerKeyDown('qr')}
                >
                  <div className="qr" style={qr as React.CSSProperties}>
                    <img
                      src={qrDataUrl}
                      alt={isArticle ? S.qr.altArticle : S.qr.altCustom}
                      draggable={false}
                    />
                  </div>
                </DraggableLayer>
              )}
            </div>
          </div>
          <p className="dimensions">
            {S.export.previewScale(canvasW, canvasH, scale.toFixed(2))}
          </p>
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
  const name = S.layers.names[props.layer];
  const label = S.layers.position[props.layer];
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
        <button type="button" className="chip" aria-label={S.layers.move(name, 'left')} onClick={() => props.onNudge(-1, 0)}>
          <Icon name="left" />
        </button>
        <button type="button" className="chip" aria-label={S.layers.move(name, 'up')} onClick={() => props.onNudge(0, -1)}>
          <Icon name="up" />
        </button>
        <button type="button" className="chip" aria-label={S.layers.move(name, 'down')} onClick={() => props.onNudge(0, 1)}>
          <Icon name="down" />
        </button>
        <button type="button" className="chip" aria-label={S.layers.move(name, 'right')} onClick={() => props.onNudge(1, 0)}>
          <Icon name="right" />
        </button>
        <button type="button" className="chip" onClick={props.onReset}>
          {S.layers.reset[props.layer]}
        </button>
      </div>
      <small id={`${props.layer}-pos-help`}>{S.layers.help}</small>
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
      aria-label={S.layers.previewHint(props.label)}
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
