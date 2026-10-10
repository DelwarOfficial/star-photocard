import { defaultTemplate, type Language, type Point, type TemplateDefinition } from '../../config/templates';
import { todayBanglaDate } from '../text/dates';

export type ImageKind = 'fallback' | 'remote' | 'local';

/** Uploaded ad creative: a browser-only object URL plus its intrinsic size (for the fit math). */
export type AdImage = Readonly<{ src: string; width: number; height: number }>;

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
  categoryEdited: boolean;
  /** Category from the last fetched article; "Use the article's category" restores it. */
  autoCategory: string;
  /** Photo-credit tag text; empty = no tag. */
  photoCredit: string;
  /** "Show whole photo (no crop)": forces `contain` regardless of the template's fit. */
  showWholePhoto: boolean;
  fontSize: number;
  imageScale: number;
  photoPosition: Point;
  titlePosition: Point;
  qrPosition: Point;
  qrVisible: boolean;
  /** Ad mode: ad artwork + creative strip. Only ever true while adImage is set. */
  adVisible: boolean;
  adImage: AdImage | null;
  loadStatus: 'idle' | 'loading' | 'ready' | 'error';
  isDirty: boolean;
}>;

/** Demo photo used until an article photo or upload replaces it (the article photo always wins). */
export const FALLBACK_IMAGE_SRC = '/photos/Star-news-file-image.webp';

/** Per-template layer defaults (title box, font size, QR spot). */
export function layoutDefaults(template: TemplateDefinition): Pick<CardState, 'fontSize' | 'titlePosition' | 'qrPosition'> {
  return {
    fontSize: template.title.defaultFontSize,
    titlePosition: { x: template.title.x, y: template.title.y },
    qrPosition: template.qr ? { x: template.qr.x, y: template.qr.y } : { x: 0, y: 0 },
  };
}

/** A fresh card; the date defaults to today's Bengali date (auto-date) and stays editable. */
export function createCardState(publicationDate: string = todayBanglaDate()): CardState {
  return { ...baseCardState, publicationDate };
}

const baseCardState: CardState = {
  sourceUrl: '',
  articleUrl: '',
  title: '',
  publicationDate: '',
  language: defaultTemplate.language,
  templateId: defaultTemplate.id,
  image: { kind: 'fallback', src: FALLBACK_IMAGE_SRC },
  photoTag: '',
  categoryEdited: false,
  autoCategory: '',
  photoCredit: '',
  showWholePhoto: false,
  imageScale: 1,
  photoPosition: { x: 0, y: 0 },
  ...layoutDefaults(defaultTemplate),
  qrVisible: true,
  adVisible: false,
  adImage: null,
  loadStatus: 'idle',
  isDirty: false,
};

/**
 * Convenience default for tests and reducers. Do NOT use it for server rendering:
 * on Cloudflare Workers module-scope code runs with Date.now() === 0, so this
 * constant's date is 1970 there. Components call createCardState() at render time.
 */
export const initialCardState: CardState = createCardState();
