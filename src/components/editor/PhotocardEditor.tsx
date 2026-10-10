import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { AD_CREATIVE_SIZE, EXPORT_HEIGHT, EXPORT_SCALE, EXPORT_WIDTH, getTemplate, resolveTemplate, SITE_URL, type TemplateDefinition } from '../../config/templates';
import { tokenizeTitle } from '../../lib/card/highlightTitle';
import { defaultRenderer } from '../../lib/card/html2canvasRenderer';
import { clampPhotoOffset, clampToCanvas, effectivePhotoFit, previewScale } from '../../lib/card/geometry';
import { CATEGORY_PRESETS, hasTag, PHOTO_CREDIT_PRESETS, PHOTO_TAG_MAX_LENGTH } from '../../lib/card/photoTag';
import { cardReducer, type CardAction, clampZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '../../lib/card/reducer';
import { decodeImage, downloadFilename, isClipboardSupported } from '../../lib/card/renderer';
import { titleFits } from '../../lib/card/titleBounds';
import { adCreativeStyle, adSlotStyle, CARD_TEXT_WEIGHT, canvasTextMeasure, cardFontFamily, creditStyle, fitPillFontSize, highlightColor, pillStyle, qrStyle, dateStyle, titleStyle } from '../../lib/card/layerStyles';
import { createCardState, FALLBACK_IMAGE_SRC } from '../../lib/card/types';
import { todayBanglaDate } from '../../lib/text/dates';
import { S, UI_LANG, type LayerKey } from '../../lib/i18n/strings';
import { Icon, StarMark } from './Icon';
import { TemplatePicker } from './TemplatePicker';
import { NudgePad, RangeField, SectionHead } from './Controls';
import { isStarNewsHost, shortArticleUrl } from '../../lib/article/normalizeArticleUrl';

type ArticlePayload = {
  canonicalUrl: string;
  title: string;
  category?: string | null;
  language: 'bn' | 'en';
  imageUrl?: string;
  /** Set when the article has photos the server could not serve (no signing secret). */
  imageNotice?: 'signing-unconfigured';
};

/** Category dropdown sentinels (never valid category text). */
const CHOICE_AUTO = '__auto__';
const CHOICE_CUSTOM = '__custom__';

type StatusTone = 'info' | 'success' | 'warning' | 'error';

const TITLE_SIZES = Array.from({ length: 91 }, (_, i) => i + 30);

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
  if (code === 'AD_UNAVAILABLE') return S.status.exportAd;
  return S.status.exportFailed(action);
}

/** imageSigningReady: false when the server has no usable IMAGE_TOKEN_SECRET (set by the page). */
export default function PhotocardEditor({ imageSigningReady = true }: { imageSigningReady?: boolean }) {
  // Keep SSR and the first client render stable; auto-fill the Dhaka date after mount.
  const [card, rawDispatch] = useReducer(cardReducer, undefined, () => createCardState(''));
  useEffect(() => { rawDispatch({ type: 'INITIALIZE_DATE', date: todayBanglaDate() }); }, []);
  const [shortcutsEnabled, setShortcutsEnabled] = useState(true);
  const [headlineOverflow, setHeadlineOverflow] = useState(false);
  const [status, setStatus] = useState<{ tone: StatusTone; text: string }>({
    tone: 'info',
    text: S.status.initial,
  });
  const [urlError, setUrlError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [exporting, setExporting] = useState<'idle' | 'copy' | 'download'>('idle');
  // Layer the nudge pad and arrow-key shortcuts move; set by the switcher or by touching a layer.
  const [selectedLayer, setSelectedLayer] = useState<LayerKey>('photo');
  // Visual toast for export results (the status region still announces them).
  const [toast, setToast] = useState<{ id: number; tone: StatusTone; text: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  const notify = useCallback((tone: StatusTone, text: string) => {
    setStatus({ tone, text });
    setToast({ id: Date.now(), tone, text });
  }, []);
  // Custom credit: the text field stays open even while empty (empty custom = no tag).
  const [customCredit, setCustomCredit] = useState(false);
  // Pill text shrinks to fit the baked pill; measured with the loaded card font (same as export).
  const [pillFontSize, setPillFontSize] = useState<number | undefined>(undefined);
  // Custom category: the text field stays open even while empty (empty custom = no label).
  const [customCategory, setCustomCategory] = useState(false);
  const [lastRemoteImage, setLastRemoteImage] = useState<{ src: string; kind: 'remote' | 'fallback' } | null>(null);

  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const localUrlRef = useRef<string | undefined>(undefined);
  const adUrlRef = useRef<string | undefined>(undefined);
  const adInputRef = useRef<HTMLInputElement>(null);
  const remoteUrlRef = useRef<string | undefined>(undefined);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  // Real rendered title height (card px; CSS transforms do not affect offsetHeight) for drag bounds.
  const [previewWidth, setPreviewWidth] = useState(540);

  const dispatch = useCallback((action: CardAction) => {
    if (!action.type.startsWith('GENERATE_') && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      requestSeq.current += 1;
      rawDispatch({ type: 'GENERATE_ERROR' });
      setStatus({ tone: 'info', text: 'Fetch cancelled to keep your latest edits.' });
    }
    rawDispatch(action);
  }, []);
  // The template as drawn: ad mode swaps in the ad artwork and its re-measured boxes.
  const template = useMemo(() => resolveTemplate(getTemplate(card.templateId), card.adVisible), [card.templateId, card.adVisible]);
  useEffect(() => {
    let cancelled = false;
    const family = cardFontFamily(card.language);
    void document.fonts
      .load(`${CARD_TEXT_WEIGHT} 30px ${family}`)
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setPillFontSize(fitPillFontSize(template, canvasTextMeasure(card.photoTag, family)));
      });
    return () => {
      cancelled = true;
    };
  }, [card.photoTag, card.language, template]);
  const titleHeight = (): number =>
    Math.min(template.canvas.height, titleRef.current?.offsetHeight || card.fontSize * 1.3);
  // Article cards encode the reference news link; custom cards have none, so they encode the root domain.
  // Article cards: the short link (section + ID); custom cards have no article, so the root domain.
  const qrTarget = template.qr ? (template.mode === 'article' ? (card.articleUrl ? shortArticleUrl(card.articleUrl) : '') : SITE_URL) : '';
  const titleLines = useMemo(() => tokenizeTitle(card.title), [card.title]);
  // Intrinsic size of the displayed photo; drag bounds must use the same cover math as export.
  const [photoSize, setPhotoSize] = useState({ width: 1920, height: 1080 });
  // A finished composition stays exportable after a failed or cancelled refetch.
  // One fit for preview CSS, drag bounds and export: the template's own, unless "show whole photo".
  const photoFit = effectivePhotoFit(template.photoFit, card.showWholePhoto);
  const needsUpload = template.requiresImage && card.image.kind !== 'local';
  const canExport = card.loadStatus !== 'loading' && card.title.trim() !== '' && !needsUpload && !headlineOverflow;
  const scale = useMemo(() => previewScale(previewWidth, Number.POSITIVE_INFINITY, template.canvas), [previewWidth, template.canvas]);
  // Computed after mount so SSR and first client render agree (avoids hydration mismatch).
  const [clipboardSupported, setClipboardSupported] = useState(false);

  useEffect(() => {
    const node = titleRef.current;
    if (!node) return;
    const check = () => setHeadlineOverflow(!!card.title.trim() && !titleFits(node, card.titlePosition, template.titleRegion));
    const observer = new ResizeObserver(check);
    observer.observe(node);
    check();
    let cancelled = false;
    void document.fonts.ready.then(() => { if (!cancelled) check(); });
    return () => { cancelled = true; observer.disconnect(); };
  }, [card.title, card.fontSize, card.titlePosition, card.language, template]);

  const fitHeadline = () => {
    const node = titleRef.current;
    if (!node) return;
    const position = { x: template.title.x, y: template.title.y };
    const available = template.titleRegion.y + template.titleRegion.height - position.y;
    const previous = node.style.fontSize;
    let size = card.fontSize;
    for (; size > 30; size--) {
      node.style.fontSize = size + 'px';
      if (node.offsetHeight <= available && node.scrollWidth <= node.clientWidth + 1) break;
    }
    node.style.fontSize = previous;
    dispatch({ type: 'SET_TITLE_POSITION', position });
    dispatch({ type: 'SET_FONT_SIZE', size });
  };

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
      if (remoteUrlRef.current) URL.revokeObjectURL(remoteUrlRef.current);
      if (adUrlRef.current) URL.revokeObjectURL(adUrlRef.current);
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
      let nextRemote: string | undefined;
      if (data.imageUrl) {
        const imageResponse = await fetch(data.imageUrl, { signal: controller.signal });
        if (!imageResponse.ok) throw new Error(S.status.exportPhoto);
        const blob = await imageResponse.blob();
        if (blob.size > 8 * 1024 * 1024) throw new Error(S.status.tooBig);
        nextRemote = URL.createObjectURL(blob);
        try { await decodeImage(nextRemote); }
        catch { URL.revokeObjectURL(nextRemote); throw new Error(S.status.exportPhoto); }
      }
      if (seq !== requestSeq.current) {
        if (nextRemote) URL.revokeObjectURL(nextRemote);
        return;
      }
      abortRef.current = null;
      if (remoteUrlRef.current) URL.revokeObjectURL(remoteUrlRef.current);
      remoteUrlRef.current = nextRemote;
      if (localUrlRef.current) {
        URL.revokeObjectURL(localUrlRef.current);
        localUrlRef.current = undefined;
      }
      const imageSrc = nextRemote ?? FALLBACK_IMAGE_SRC;
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
      // Start at the template default; Fit headline is an explicit user action.
      dispatch({
        type: 'SET_FONT_SIZE',
        size: template.title.defaultFontSize,
      });
      if (data.imageNotice === 'signing-unconfigured') {
        announce('warning', S.status.readySigningOff);
      } else if (!data.imageUrl) {
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
      abortRef.current = null;
      announce('error', err instanceof Error ? err.message : S.status.loadFailed);
    }
  }, [card.sourceUrl, template, announce, dispatch]);

  const cancelGenerate = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
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

  // Ad creative: same object-URL lifecycle as the photo upload. Decoded first so the fit
  // math has its real size; choosing one also switches ad mode on (never an empty strip).
  const chooseAdImage = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      // A rejected file must not stay named in the input as if it were the creative.
      const reject = (message: string) => {
        if (adInputRef.current) adInputRef.current.value = '';
        announce('error', message);
      };
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        reject(S.ad.badFile);
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        reject(S.status.tooBig);
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      let img: HTMLImageElement;
      try {
        img = await decodeImage(objectUrl);
      } catch {
        URL.revokeObjectURL(objectUrl);
        reject(S.ad.badFile);
        return;
      }
      if (adUrlRef.current) URL.revokeObjectURL(adUrlRef.current);
      adUrlRef.current = objectUrl;
      dispatch({ type: 'SET_AD_IMAGE', image: { src: objectUrl, width: img.naturalWidth, height: img.naturalHeight } });
      announce('success', S.ad.loaded);
    },
    [announce, dispatch],
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
  }, [lastRemoteImage, announce, dispatch]);

  const fullReset = useCallback(() => {
    if (card.isDirty) {
      const confirmed = window.confirm(S.status.confirmReset);
      if (!confirmed) return;
    }
    if (localUrlRef.current) {
      URL.revokeObjectURL(localUrlRef.current);
      localUrlRef.current = undefined;
    }
    if (adUrlRef.current) {
      URL.revokeObjectURL(adUrlRef.current);
      adUrlRef.current = undefined;
    }
    if (adInputRef.current) adInputRef.current.value = '';
    abortRef.current?.abort();
    requestSeq.current += 1;
    setLastRemoteImage(null);
    if (remoteUrlRef.current) URL.revokeObjectURL(remoteUrlRef.current);
    remoteUrlRef.current = undefined;
    setCustomCredit(false);
    setCustomCategory(false);
    setUrlError(null);
    dispatch({ type: 'FULL_RESET', date: todayBanglaDate(), templateId: template.id });
    announce('info', S.status.reset);
  }, [card.isDirty, template.id, announce, dispatch]);

  const nudge = useCallback(
    (layer: 'photo' | 'title' | 'qr', dx: number, dy: number) => {
      if (layer === 'photo') {
        if (!template.photo) return;
        const next = clampPhotoOffset(
          photoSize,
          template.photo,
          card.imageScale,
          { x: card.photoPosition.x + dx, y: card.photoPosition.y + dy },
          photoFit,
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
    [card.imageScale, card.photoPosition, card.qrPosition, card.titlePosition, photoSize, photoFit, template, dispatch],
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
    if (titleRef.current && !titleFits(titleRef.current, card.titlePosition, template.titleRegion)) throw new Error('HEADLINE_OVERFLOW');
    const snapshot = {
      state: card,
      templateSrc: template.src,
      photoSrc: card.image.src,
      qrDataUrl: card.qrVisible ? qrDataUrl || null : null,
    };
    return defaultRenderer.render(snapshot);
  }, [card, template, qrDataUrl]);

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
        notify('success', S.status.downloaded(EXPORT_WIDTH, EXPORT_HEIGHT));
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch (err) {
      notify('error', exportFailureMessage(err, 'download'));
    } finally {
      setExporting('idle');
    }
  }, [canExport, exportBlob, notify]);

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
      notify('error', exportFailureMessage(err, 'copy'));
      setExporting('idle');
      return;
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      notify('success', S.status.copied);
    } catch {
      notify('warning', S.status.copyBlocked);
    } finally {
      setExporting('idle');
    }
  }, [canExport, exportBlob, announce, notify]);

  const loading = card.loadStatus === 'loading';
  /** Zoom and re-clamp the pan so zooming out never exposes the window behind the photo. */
  const setZoom = (scale: number) => {
    const next = clampZoom(scale);
    dispatch({ type: 'SET_IMAGE_SCALE', scale: next });
    if (template.photo) {
      dispatch({
        type: 'SET_PHOTO_POSITION',
        position: clampPhotoOffset(photoSize, template.photo, next, card.photoPosition, photoFit),
      });
    }
  };
  const isArticle = template.mode === 'article';
  const box = canvasBox(template, scale);
  const pill = pillStyle(template, pillFontSize);
  const credit = creditStyle(template);
  const creditIsPreset = (PHOTO_CREDIT_PRESETS as readonly string[]).includes(card.photoCredit);
  // Category dropdown: a preset, the article's own (non-preset) category, or a custom value.
  const categoryIsPreset = (CATEGORY_PRESETS as readonly string[]).includes(card.photoTag);
  const categoryIsAuto = !card.categoryEdited && card.photoTag !== '' && card.photoTag === card.autoCategory;
  const categoryChoice = customCategory
    ? CHOICE_CUSTOM
    : card.photoTag === ''
      ? ''
      : categoryIsPreset
        ? card.photoTag
        : categoryIsAuto
          ? CHOICE_AUTO
          : CHOICE_CUSTOM;
  const showCustomCredit = customCredit || (card.photoCredit !== '' && !creditIsPreset);
  const qr = qrStyle(template, card);
  const emphasis = highlightColor(template);
  const layers: LayerKey[] = [...(template.photo ? ['photo' as const] : []), 'title', ...(template.qr ? ['qr' as const] : [])];
  const activeLayer: LayerKey = layers.includes(selectedLayer) ? selectedLayer : 'title';
  const isEmpty = card.loadStatus === 'idle' && !card.title.trim();

  const switchTemplate = (id: string) => {
    dispatch({ type: 'SWITCH_TEMPLATE', templateId: id });
  };
  const resetLayer = (layer: LayerKey) =>
    dispatch({ type: layer === 'photo' ? 'RESET_PHOTO' : layer === 'title' ? 'RESET_TITLE' : 'RESET_QR' });

  // Keyboard shortcuts: G generate, D download, C copy, R reset, arrows nudge the selected layer.
  // Ignored while typing in a field, inside the template list, or with a modifier held.
  const shortcutRef = useRef({ generate, download, copy, fullReset, nudge, activeLayer, isArticle, canExport, shortcutsEnabled, exporting });
  shortcutRef.current = { generate, download, copy, fullReset, nudge, activeLayer, isArticle, canExport, shortcutsEnabled, exporting };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="listbox"], [role="radiogroup"]')) return;
      const k = shortcutRef.current;
      if (!k.shortcutsEnabled || k.exporting !== 'idle') return;
      const key = e.key.toLowerCase();
      if (key === 'g' && k.isArticle) void k.generate();
      else if (key === 'd' && k.canExport) void k.download();
      else if (key === 'c' && k.canExport) void k.copy();
      else if (key === 'r') k.fullReset();
      else if (e.key.startsWith('Arrow')) {
        const step = e.shiftKey ? 10 : 1;
        const [dx, dy] =
          e.key === 'ArrowLeft' ? [-step, 0] : e.key === 'ArrowRight' ? [step, 0] : e.key === 'ArrowUp' ? [0, -step] : [0, step];
        k.nudge(k.activeLayer, dx, dy);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app-shell" lang={UI_LANG}>
      <header className="app-header">
        <div className="brand">
          <StarMark size={34} />
          <div>
            <h1>{S.header.title}</h1>
            <p className="subhead">{S.header.subhead(EXPORT_WIDTH, EXPORT_HEIGHT)}</p>
          </div>
        </div>
        <div className="toolbar">
          <p className="header-status" aria-hidden="true">
            <span className={`status-dot ${canExport ? 'ok' : loading ? 'busy' : ''}`} />
            {needsUpload
              ? S.header.state.needsPhoto
              : loading
                ? S.header.state.fetching
                : canExport
                  ? S.header.state.ready
                  : S.header.state.needsHeadline}
          </p>
          <button type="button" className="button ghost" onClick={fullReset} disabled={exporting !== 'idle'} title={S.header.resetHint} aria-keyshortcuts="R">
            <Icon name="reset" size={18} />
            {S.header.reset}
          </button>
        </div>
      </header>

      <div className="workspace">
        <div className="controls" aria-label={S.sections.controls}>
          {!imageSigningReady && (
            <div className="config-warning" role="alert">
              <strong>{S.signing.title}</strong>
              <p>{S.signing.body}</p>
            </div>
          )}
          <section aria-labelledby="type-heading">
            <fieldset disabled={exporting !== 'idle'}>
              <SectionHead id="type-heading" step={1} title={S.sections.type.title} hint={S.sections.type.hint} />
              <TemplatePicker value={card.templateId} onChange={switchTemplate} />
            </fieldset>
          </section>

          <section aria-labelledby="content-heading">
            <fieldset disabled={exporting !== 'idle'}>
              <SectionHead id="content-heading" step={2} title={S.sections.content.title} hint={S.sections.content.hint} />

              {isArticle && (
                <>
                  <label htmlFor="article-url">{S.url.label}</label>
                  <div className="url-row">
                    <span className="url-icon">
                      <Icon name="link" size={18} />
                    </span>
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
                  </div>
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
                      aria-keyshortcuts="G"
                    >
                      {loading ? <span className="spinner" aria-hidden="true" /> : <Icon name="sparkle" size={18} />}
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
                  <small id="local-image-help">{needsUpload ? S.upload.needed : S.upload.loaded}</small>
                </>
              )}

              <label htmlFor="headline">{S.headline.label}</label>
              <textarea
                id="headline" lang={card.language}
                rows={3}
                value={card.title}
                placeholder={S.headline.placeholder}
                aria-describedby="headline-help headline-stats"
                onChange={(e) => dispatch({ type: 'SET_TITLE', title: e.target.value })}
              />
              <p id="headline-stats" className="word-hint" aria-live="off">
                {(() => {
                  const words = card.title.trim() ? card.title.trim().split(/\s+/u).length : 0;
                  return S.headline.stats(words, card.fontSize);
                })()}
              </p>
              <small id="headline-help">{template.highlightColor ? S.headline.helpHighlight : S.headline.helpPlain}</small>

              <label htmlFor="pub-date">{S.date.label}</label>
              <div className="input-action">
                <input
                  id="pub-date" lang="bn"
                  type="text"
                  value={card.publicationDate}
                  placeholder="Dhaka date"
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

              <label htmlFor="photo-tag">{S.category.label}</label>
              <select
                id="photo-tag" lang="bn"
                value={categoryChoice}
                aria-describedby="photo-tag-help"
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === CHOICE_CUSTOM) {
                    setCustomCategory(true);
                    // Start Custom empty rather than carrying a preset into the text field.
                    if (categoryIsPreset || categoryIsAuto) dispatch({ type: 'SET_PHOTO_TAG', tag: '' });
                    return;
                  }
                  setCustomCategory(false);
                  if (value === CHOICE_AUTO) dispatch({ type: 'RESET_CATEGORY' });
                  else dispatch({ type: 'SET_PHOTO_TAG', tag: value });
                }}
              >
                <option value="">{S.category.none}</option>
                {categoryIsAuto && !categoryIsPreset && (
                  <option value={CHOICE_AUTO}>{S.category.fromArticle(card.photoTag)}</option>
                )}
                {CATEGORY_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
                <option value={CHOICE_CUSTOM}>{S.category.custom}</option>
              </select>
              <small id="photo-tag-help">{template.photoTag ? S.category.help : S.category.noPill}</small>
              {categoryChoice === CHOICE_CUSTOM && (
                <div className="reveal">
                  <label htmlFor="photo-tag-custom">{S.category.customLabel}</label>
                  <input
                    id="photo-tag-custom" lang="bn"
                    type="text"
                    value={card.photoTag}
                    placeholder={S.category.customPlaceholder}
                    autoComplete="off"
                    aria-describedby="photo-tag-count"
                    onChange={(e) => dispatch({ type: 'SET_PHOTO_TAG', tag: e.target.value })}
                  />
                  <small id="photo-tag-count">{S.category.count(Array.from(card.photoTag).length, PHOTO_TAG_MAX_LENGTH)}</small>
                </div>
              )}
              {card.categoryEdited && card.autoCategory && (
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => {
                    setCustomCategory(false);
                    dispatch({ type: 'RESET_CATEGORY' });
                  }}
                >
                  <Icon name="reset" size={18} />
                  {S.category.useArticle}
                </button>
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
                    <div className="reveal">
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
                      <small id="photo-credit-count">{S.credit.count(Array.from(card.photoCredit).length, PHOTO_TAG_MAX_LENGTH)}</small>
                    </div>
                  )}
                </>
              )}
            </fieldset>
          </section>

          <section aria-labelledby="design-heading">
            <fieldset disabled={exporting !== 'idle'}>
              <SectionHead id="design-heading" step={3} title={S.sections.layout.title} hint={S.sections.layout.hint} />

              {template.photo && isArticle && (
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

              {template.photo && (
                <div className="qr-toggle">
                  <input
                    id="whole-photo"
                    type="checkbox"
                    role="switch"
                    className="switch"
                    checked={card.showWholePhoto}
                    aria-describedby="whole-photo-help"
                    onChange={(e) => dispatch({ type: 'SET_SHOW_WHOLE_PHOTO', value: e.target.checked })}
                  />
                  <label htmlFor="whole-photo">{S.wholePhoto.label}</label>
                </div>
              )}
              {template.photo && <small id="whole-photo-help">{S.wholePhoto.help}</small>}

              {template.photo && (
                <RangeField
                  id="zoom-range"
                  label={S.zoom.label(card.imageScale.toFixed(1), ZOOM_MIN, ZOOM_MAX)}
                  min={ZOOM_MIN}
                  max={ZOOM_MAX}
                  step={ZOOM_STEP}
                  value={card.imageScale}
                  display={`${card.imageScale.toFixed(1)}×`}
                  onChange={setZoom}
                  before={
                    <button
                      type="button"
                      className="chip"
                      aria-label={S.zoom.out}
                      disabled={card.imageScale <= ZOOM_MIN}
                      onClick={() => setZoom(card.imageScale - ZOOM_STEP)}
                    >
                      <Icon name="minus" />
                    </button>
                  }
                  after={
                    <button
                      type="button"
                      className="chip"
                      aria-label={S.zoom.in}
                      disabled={card.imageScale >= ZOOM_MAX}
                      onClick={() => setZoom(card.imageScale + ZOOM_STEP)}
                    >
                      <Icon name="plus" />
                    </button>
                  }
                />
              )}

              <label htmlFor="font-size-select">{S.fontSize.label}</label>
              <select id="font-size-select" value={card.fontSize} onChange={(e) => dispatch({ type: 'SET_FONT_SIZE', size: Number(e.target.value) })}>
                {TITLE_SIZES.map((size) => <option key={size} value={size}>{size}px</option>)}
              </select>
              <button type="button" className="button secondary" onClick={fitHeadline}>Fit headline</button>
              {headlineOverflow && <p className="field-error" role="alert">Headline exceeds its safe area. Fit it, shorten it, or move it back before export.</p>}

              <NudgePad
                layers={layers}
                selected={activeLayer}
                onSelect={setSelectedLayer}
                positions={{ photo: card.photoPosition, title: card.titlePosition, qr: card.qrPosition }}
                onNudge={(dx, dy) => nudge(activeLayer, dx, dy)}
                onReset={() => resetLayer(activeLayer)}
              />

              {template.qr && (
                <div className="qr-toggle">
                  <input
                    id="qr-visible"
                    type="checkbox"
                    role="switch"
                    className="switch"
                    checked={card.qrVisible}
                    onChange={(e) => dispatch({ type: 'SET_QR_VISIBLE', visible: e.target.checked })}
                  />
                  <label htmlFor="qr-visible">{isArticle ? S.qr.toggleArticle : S.qr.toggleCustom}</label>
                </div>
              )}
              <div className="qr-toggle">
                <input
                  id="ad-visible"
                  type="checkbox"
                  role="switch"
                  className="switch"
                  checked={card.adVisible}
                  aria-describedby="ad-help"
                  onChange={(e) => {
                    // No creative yet: ask for one first; ad mode turns on once it is chosen.
                    if (e.target.checked && !card.adImage) adInputRef.current?.click();
                    else dispatch({ type: 'SET_AD_VISIBLE', visible: e.target.checked });
                  }}
                />
                <label htmlFor="ad-visible">{S.ad.toggle}</label>
              </div>
              <div hidden={!card.adVisible}>
                <label htmlFor="ad-image">{S.ad.upload}</label>
                <input
                  id="ad-image"
                  ref={adInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-describedby="ad-help"
                  // Keep the chosen file's name on screen; clear only when opening the picker,
                  // so choosing the same file again still fires onChange.
                  onClick={(e) => {
                    e.currentTarget.value = '';
                  }}
                  onChange={(e) => void chooseAdImage(e.target.files?.[0])}
                />
              </div>
              <small id="ad-help">{S.ad.help(AD_CREATIVE_SIZE.width, AD_CREATIVE_SIZE.height)}</small>
              <button type="button" className="button ghost" onClick={() => dispatch({ type: 'RESET_LAYOUT' })}>
                <Icon name="reset" size={18} />
                {S.layoutReset}
              </button>
            </fieldset>
          </section>

          <section aria-labelledby="export-heading" aria-busy={exporting !== 'idle'}>
            <fieldset disabled={exporting !== 'idle'}>
              <SectionHead id="export-heading" step={4} title={S.sections.export.title} hint={S.sections.export.hint} />
              <div className="export-actions">
                <button
                  type="button"
                  className="button primary"
                  disabled={!canExport || exporting !== 'idle'}
                  onClick={() => void download()}
                  aria-keyshortcuts="D"
                >
                  {exporting === 'download' ? <span className="spinner" aria-hidden="true" /> : <Icon name="download" size={18} />}
                  {exporting === 'download' ? S.export.downloading : S.export.download}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={!canExport || exporting !== 'idle'}
                  onClick={() => void copy()}
                  aria-keyshortcuts="C"
                  title={clipboardSupported ? S.export.copyTitle : S.export.copyUnsupportedTitle}
                >
                  {exporting === 'copy' ? <span className="spinner" aria-hidden="true" /> : <Icon name="copy" size={18} />}
                  {exporting === 'copy' ? S.export.copying : S.export.copy}
                </button>
              </div>
              {needsUpload && <p className="field-note">{S.export.needsPhoto}</p>}
              {!clipboardSupported && <p className="field-note">{S.export.copyUnsupportedNote}</p>}
            </fieldset>
          </section>

          <p className={`status tone-${status.tone}`} role="status" aria-live="polite">
            {status.text}
          </p>
        </div>

        <section className="preview-stage" aria-label={S.sections.preview} aria-busy={loading || exporting !== 'idle'}>
          <div className="preview-canvas">
            <div className="preview-frame" ref={previewFrameRef} style={box.frame}>
              <div
                key={template.id}
                className={`card card-enter ${card.language === 'bn' ? 'bangla' : 'english'}`}
                lang={card.language}
                style={box.card}
              >
                {template.photo && (
                  <DraggableLayer
                    label={S.layers.preview.photo}
                    position={{ x: 0, y: 0 }}
                    scale={scale}
                    onSelect={() => setSelectedLayer('photo')}
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
                          objectFit: photoFit,
                          transform: `translate(${card.photoPosition.x}px, ${card.photoPosition.y}px) scale(${card.imageScale})`,
                        }}
                      />
                    </div>
                  </DraggableLayer>
                )}
                <img className="card-template" src={template.src} alt="" draggable={false} />
                {card.adVisible && card.adImage && (
                  <div className="card-ad" style={adSlotStyle(template) as React.CSSProperties}>
                    <img src={card.adImage.src} alt={S.ad.alt} draggable={false} style={adCreativeStyle(template, card.adImage) as React.CSSProperties} />
                  </div>
                )}
                {/* A render that straddles Dhaka midnight may differ by a day; the client value wins. */}
                <div className="card-date" style={dateStyle(template) as React.CSSProperties} >
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
                  onSelect={() => setSelectedLayer('title')}
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
                    onSelect={() => setSelectedLayer('qr')}
                    onMove={(dx, dy) => nudge('qr', dx, dy)}
                    onKeyDown={onLayerKeyDown('qr')}
                  >
                    <div className="qr" style={qr as React.CSSProperties}>
                      <img src={qrDataUrl} alt={isArticle ? S.qr.altArticle : S.qr.altCustom} draggable={false} />
                    </div>
                  </DraggableLayer>
                )}
              </div>
              {loading && <div className="preview-skeleton" aria-hidden="true" />}
              {isEmpty && !loading && (
                <div className="preview-empty">
                  <StarMark size={40} />
                  <p className="preview-empty-title">{S.empty.title}</p>
                  <p>{S.empty.body}</p>
                </div>
              )}
            </div>
          </div>
          <p className="dimensions">
            <span className="badge">{S.export.previewScale(EXPORT_WIDTH, EXPORT_HEIGHT, (scale / EXPORT_SCALE).toFixed(2))}</span>
          </p>
          <label className="shortcut-toggle"><input type="checkbox" checked={shortcutsEnabled} onChange={(e) => setShortcutsEnabled(e.target.checked)} /> Enable keyboard shortcuts</label>
          <p className="shortcuts" aria-label={S.shortcuts.label}>
            {isArticle && (
              <span>
                <kbd>G</kbd> {S.shortcuts.generate}
              </span>
            )}
            <span>
              <kbd>D</kbd> {S.shortcuts.download}
            </span>
            <span>
              <kbd>C</kbd> {S.shortcuts.copy}
            </span>
            <span>
              <kbd>R</kbd> {S.shortcuts.reset}
            </span>
            <span>
              <kbd>←↑↓→</kbd> {S.shortcuts.nudge}
            </span>
          </p>
        </section>
      </div>

      {toast && (
        <div key={toast.id} className={`toast tone-${toast.tone}`} aria-hidden="true">
          <Icon name={toast.tone === 'success' ? 'check' : 'sparkle'} size={18} />
          {toast.text}
        </div>
      )}
    </div>
  );
}

function DraggableLayer(props: {
  label: string;
  position: { x: number; y: number };
  scale: number;
  onSelect: () => void;
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
      onFocus={props.onSelect}
      onKeyDown={props.onKeyDown}
      onPointerDown={(e) => {
        props.onSelect();
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
