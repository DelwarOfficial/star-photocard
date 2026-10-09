import { defaultTemplate, type Language, type Point } from '../../config/templates';

export type ImageKind = 'fallback' | 'remote' | 'local';

export type CardState = Readonly<{
  sourceUrl: string;
  /** Canonical URL of the last successfully fetched article; the QR encodes this, never raw input. */
  articleUrl: string;
  title: string;
  publicationDate: string;
  language: Language;
  templateId: string;
  image: Readonly<{ kind: ImageKind; src: string }>;
  photoTag: string;
  fontSize: number;
  imageScale: number;
  photoPosition: Point;
  titlePosition: Point;
  qrPosition: Point;
  qrVisible: boolean;
  loadStatus: 'idle' | 'loading' | 'ready' | 'error';
  isDirty: boolean;
}>;

export const FALLBACK_IMAGE_SRC = '/photos/default-news.jpg';

export const initialCardState: CardState = {
  sourceUrl: '',
  articleUrl: '',
  title: '',
  publicationDate: '',
  language: defaultTemplate.language,
  templateId: defaultTemplate.id,
  image: { kind: 'fallback', src: FALLBACK_IMAGE_SRC },
  photoTag: '',
  fontSize: defaultTemplate.title.defaultFontSize,
  imageScale: 1,
  photoPosition: { x: 0, y: 0 },
  titlePosition: { x: defaultTemplate.title.x, y: defaultTemplate.title.y },
  qrPosition: { x: defaultTemplate.qr.x, y: defaultTemplate.qr.y },
  qrVisible: true,
  loadStatus: 'idle',
  isDirty: false,
};

/** Backwards-compatible aliases used by the first editor slice. */
export type LegacyCardStatus = CardState['loadStatus'];
