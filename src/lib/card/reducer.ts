import { getTemplate } from '../../config/templates';
import { FALLBACK_IMAGE_SRC, initialCardState, type CardState } from './types';

export type CardAction =
  | Readonly<{ type: 'SET_SOURCE_URL'; url: string }>
  | Readonly<{ type: 'GENERATE_START' }>
  | Readonly<{
      type: 'GENERATE_SUCCESS';
      title: string;
      publicationDate: string;
      language: CardState['language'];
      imageSrc: string;
      imageKind: CardState['image']['kind'];
    }>
  | Readonly<{ type: 'GENERATE_ERROR' }>
  | Readonly<{ type: 'SET_TITLE'; title: string }>
  | Readonly<{ type: 'SET_DATE'; date: string }>
  | Readonly<{ type: 'SET_PHOTO_TAG'; tag: string }>
  | Readonly<{ type: 'SET_FONT_SIZE'; size: number }>
  | Readonly<{ type: 'SET_IMAGE_SCALE'; scale: number }>
  | Readonly<{ type: 'SET_PHOTO_POSITION'; position: CardState['photoPosition'] }>
  | Readonly<{ type: 'SET_TITLE_POSITION'; position: CardState['titlePosition'] }>
  | Readonly<{ type: 'SET_QR_POSITION'; position: CardState['qrPosition'] }>
  | Readonly<{ type: 'SET_QR_VISIBLE'; visible: boolean }>
  | Readonly<{ type: 'SET_LOCAL_IMAGE'; src: string }>
  | Readonly<{ type: 'RESTORE_REMOTE_IMAGE'; src: string; kind: CardState['image']['kind'] }>
  | Readonly<{ type: 'SWITCH_TEMPLATE'; templateId: string }>
  | Readonly<{ type: 'RESET_LAYOUT' }>
  | Readonly<{ type: 'RESET_PHOTO' }>
  | Readonly<{ type: 'RESET_TITLE' }>
  | Readonly<{ type: 'RESET_QR' }>
  | Readonly<{ type: 'FULL_RESET' }>;

export function clampFontSize(size: number): number {
  if (!Number.isFinite(size)) return 75;
  return Math.min(120, Math.max(30, Math.round(size)));
}

export function clampZoom(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(3, Math.max(1, scale));
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
        title: action.title,
        publicationDate: action.publicationDate,
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
    case 'SET_PHOTO_TAG':
      return { ...state, photoTag: action.tag, isDirty: true };
    case 'SET_FONT_SIZE':
      return { ...state, fontSize: clampFontSize(action.size), isDirty: true };
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
      const template = getTemplate(action.templateId);
      return { ...state, templateId: template.id, isDirty: true };
    }
    case 'RESET_LAYOUT': {
      const template = getTemplate(state.templateId);
      return {
        ...state,
        fontSize: template.title.defaultFontSize,
        imageScale: 1,
        photoPosition: { x: 0, y: 0 },
        titlePosition: { x: template.title.x, y: template.title.y },
        qrPosition: { x: template.qr.x, y: template.qr.y },
        qrVisible: true,
        isDirty: true,
      };
    }
    case 'RESET_PHOTO':
      return { ...state, imageScale: 1, photoPosition: { x: 0, y: 0 }, isDirty: true };
    case 'RESET_TITLE': {
      const template = getTemplate(state.templateId);
      return {
        ...state,
        titlePosition: { x: template.title.x, y: template.title.y },
        fontSize: template.title.defaultFontSize,
        isDirty: true,
      };
    }
    case 'RESET_QR': {
      const template = getTemplate(state.templateId);
      return {
        ...state,
        qrPosition: { x: template.qr.x, y: template.qr.y },
        qrVisible: true,
        isDirty: true,
      };
    }
    case 'FULL_RESET':
      return { ...initialCardState, image: { kind: 'fallback', src: FALLBACK_IMAGE_SRC } };
    default:
      return state;
  }
}
