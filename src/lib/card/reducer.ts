import { getTemplate, resolveTemplate, type TemplateDefinition } from '../../config/templates';
import { limitTagInput, normalizePhotoTag } from './photoTag';
import { createCardState, layoutDefaults, type AdImage, type CardState } from './types';

export type CardAction =
  | Readonly<{ type: 'SET_SOURCE_URL'; url: string }>
  | Readonly<{ type: 'GENERATE_START' }>
  | Readonly<{
      type: 'GENERATE_SUCCESS';
      articleUrl: string;
      title: string;
      /** Article category; pre-fills the pill only when the user has not set one. */
      category?: string | null;
      language: CardState['language'];
      imageSrc: string;
      imageKind: CardState['image']['kind'];
    }>
  | Readonly<{ type: 'GENERATE_ERROR' }>
  | Readonly<{ type: 'SET_TITLE'; title: string }>
  | Readonly<{ type: 'SET_DATE'; date: string }>
  | Readonly<{ type: 'INITIALIZE_DATE'; date: string }>
  | Readonly<{ type: 'SET_PHOTO_TAG'; tag: string }>
  | Readonly<{ type: 'RESET_CATEGORY' }>
  | Readonly<{ type: 'SET_PHOTO_CREDIT'; credit: string }>
  | Readonly<{ type: 'SET_FONT_SIZE'; size: number }>
  | Readonly<{ type: 'SET_IMAGE_SCALE'; scale: number }>
  | Readonly<{ type: 'SET_SHOW_WHOLE_PHOTO'; value: boolean }>
  | Readonly<{ type: 'SET_PHOTO_POSITION'; position: CardState['photoPosition'] }>
  | Readonly<{ type: 'SET_TITLE_POSITION'; position: CardState['titlePosition'] }>
  | Readonly<{ type: 'SET_QR_POSITION'; position: CardState['qrPosition'] }>
  | Readonly<{ type: 'SET_QR_VISIBLE'; visible: boolean }>
  /** Ad mode never turns on without a creative, so the exported strip is never empty. */
  | Readonly<{ type: 'SET_AD_VISIBLE'; visible: boolean }>
  /** A new creative also switches ad mode on. */
  | Readonly<{ type: 'SET_AD_IMAGE'; image: AdImage }>
  | Readonly<{ type: 'SET_LOCAL_IMAGE'; src: string }>
  | Readonly<{ type: 'RESTORE_REMOTE_IMAGE'; src: string; kind: CardState['image']['kind'] }>
  | Readonly<{ type: 'SWITCH_TEMPLATE'; templateId: string }>
  | Readonly<{ type: 'RESET_LAYOUT' }>
  | Readonly<{ type: 'RESET_PHOTO' }>
  | Readonly<{ type: 'RESET_TITLE' }>
  | Readonly<{ type: 'RESET_QR' }>
  /** date: the auto-date for the fresh card (defaults to today's Bengali date). */
  | Readonly<{ type: 'FULL_RESET'; date?: string; templateId?: string }>;

export function clampFontSize(size: number): number {
  if (!Number.isFinite(size)) return 75;
  return Math.min(120, Math.max(30, Math.round(size)));
}

/** Photo zoom bounds: 1 = contain the whole photo; 3 = triple. */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.1;

export function clampZoom(scale: number): number {
  if (!Number.isFinite(scale)) return ZOOM_MIN;
  // Round to the step so repeated +/- never accumulates float drift (1.1 + 0.1 = 1.2000000000000002).
  const stepped = Math.round(scale / ZOOM_STEP) * ZOOM_STEP;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(stepped.toFixed(2))));
}

/** The template as drawn for this state (ad artwork and boxes when ad mode is on). */
function activeTemplate(state: CardState, templateId = state.templateId): TemplateDefinition {
  return resolveTemplate(getTemplate(templateId), state.adVisible);
}

/**
 * Switch ad mode, moving the headline and QR with the artwork: each keeps the user's
 * nudge relative to its default spot (the QR's default moves up by the strip height).
 */
function withAdMode(state: CardState, adVisible: boolean): CardState {
  if (adVisible === state.adVisible) return state;
  const from = layoutDefaults(activeTemplate(state));
  const to = layoutDefaults(activeTemplate({ ...state, adVisible }));
  const move = (p: CardState['titlePosition'], a: CardState['titlePosition'], b: CardState['titlePosition']) => ({
    x: p.x + b.x - a.x,
    y: p.y + b.y - a.y,
  });
  return {
    ...state,
    adVisible,
    titlePosition: move(state.titlePosition, from.titlePosition, to.titlePosition),
    qrPosition: move(state.qrPosition, from.qrPosition, to.qrPosition),
    // Photo windows differ between the two artworks; start the framing fresh.
    imageScale: 1,
    photoPosition: { x: 0, y: 0 },
    isDirty: true,
  };
}

export function cardReducer(state: CardState, action: CardAction): CardState {
  switch (action.type) {
    case 'SET_SOURCE_URL':
      return { ...state, sourceUrl: action.url, isDirty: true };
    case 'GENERATE_START':
      return { ...state, loadStatus: 'loading' };
    case 'GENERATE_SUCCESS':
      return {
        ...state,
        articleUrl: action.articleUrl,
        // Auto category always updates; it reaches the pill only while there is no manual override.
        autoCategory: normalizePhotoTag(action.category ?? ''),
        photoTag: state.categoryEdited ? state.photoTag : normalizePhotoTag(action.category ?? ''),
        title: action.title,
        // The card date is always today's (or the user's edit); the article date is not used.
        language: action.language,
        image: { kind: action.imageKind, src: action.imageSrc },
        imageScale: 1,
        photoPosition: { x: 0, y: 0 },
        loadStatus: 'ready',
        isDirty: true,
      };
    case 'GENERATE_ERROR':
      return { ...state, loadStatus: 'error' };
    case 'SET_TITLE':
      return { ...state, title: action.title, isDirty: true };
    case 'SET_DATE':
      return { ...state, publicationDate: action.date, isDirty: true };
    case 'INITIALIZE_DATE':
      return { ...state, publicationDate: action.date };
    case 'SET_PHOTO_CREDIT':
      return { ...state, photoCredit: limitTagInput(action.credit), isDirty: true };
    case 'SET_PHOTO_TAG':
      return { ...state, photoTag: limitTagInput(action.tag), categoryEdited: true, isDirty: true };
    case 'RESET_CATEGORY':
      // Drop the manual override and go back to the fetched article's category.
      return { ...state, photoTag: state.autoCategory, categoryEdited: false, isDirty: true };
    case 'SET_FONT_SIZE':
      return { ...state, fontSize: clampFontSize(action.size), isDirty: true };
    case 'SET_SHOW_WHOLE_PHOTO':
      // Pan and zoom bounds differ between cover and contain; start the framing fresh.
      return { ...state, showWholePhoto: action.value, imageScale: 1, photoPosition: { x: 0, y: 0 }, isDirty: true };
    case 'SET_IMAGE_SCALE':
      return { ...state, imageScale: clampZoom(action.scale), isDirty: true };
    case 'SET_PHOTO_POSITION':
      return { ...state, photoPosition: action.position, isDirty: true };
    case 'SET_TITLE_POSITION':
      return { ...state, titlePosition: action.position, isDirty: true };
    case 'SET_QR_POSITION':
      return { ...state, qrPosition: action.position, isDirty: true };
    case 'SET_QR_VISIBLE':
      return { ...state, qrVisible: action.visible, isDirty: true };
    case 'SET_AD_VISIBLE':
      if (action.visible && !state.adImage) return state;
      return withAdMode(state, action.visible);
    case 'SET_AD_IMAGE':
      return { ...withAdMode(state, true), adImage: action.image, isDirty: true };
    case 'SET_LOCAL_IMAGE':
      return {
        ...state,
        image: { kind: 'local', src: action.src },
        imageScale: 1,
        photoPosition: { x: 0, y: 0 },
        loadStatus: 'ready',
        isDirty: true,
      };
    case 'RESTORE_REMOTE_IMAGE':
      return {
        ...state,
        image: { kind: action.kind, src: action.src },
        imageScale: 1,
        photoPosition: { x: 0, y: 0 },
        isDirty: true,
      };
    case 'SWITCH_TEMPLATE': {
      // Layer positions are template-specific; carrying them over misplaces layers.
      const template = activeTemplate(state, action.templateId);
      return {
        ...state,
        templateId: template.id,
        ...layoutDefaults(template),
        imageScale: 1,
        photoPosition: { x: 0, y: 0 },
        isDirty: true,
      };
    }
    case 'RESET_LAYOUT': {
      const template = activeTemplate(state);
      return {
        ...state,
        ...layoutDefaults(template),
        imageScale: 1,
        photoPosition: { x: 0, y: 0 },
        qrVisible: true,
        isDirty: true,
      };
    }
    case 'RESET_PHOTO':
      return { ...state, imageScale: 1, photoPosition: { x: 0, y: 0 }, isDirty: true };
    case 'RESET_TITLE': {
      const template = activeTemplate(state);
      return {
        ...state,
        titlePosition: layoutDefaults(template).titlePosition,
        fontSize: template.title.defaultFontSize,
        isDirty: true,
      };
    }
    case 'RESET_QR': {
      const template = activeTemplate(state);
      return {
        ...state,
        qrPosition: layoutDefaults(template).qrPosition,
        qrVisible: true,
        isDirty: true,
      };
    }
    case 'FULL_RESET': {
      // A reset keeps the chosen card type so a custom-mode user stays in custom mode.
      const fresh = createCardState(action.date);
      if (!action.templateId) return fresh;
      const template = getTemplate(action.templateId);
      return { ...fresh, templateId: template.id, language: template.language, ...layoutDefaults(template) };
    }
    default:
      return state;
  }
}
