/**
 * Every user-facing UI string lives here, so a language change is a one-file edit.
 * The UI chrome is English (`UI_LANG`); card content (headlines, dates, pill and
 * credit text) stays Bengali and is not part of this file.
 */
export const UI_LANG = 'en';

export type LayerKey = 'photo' | 'title' | 'qr';

export const S = {
  page: {
    title: 'Star News Photocard Generator',
    description: 'Turn Star News articles into branded photocards for social media.',
  },
  header: {
    title: 'Photocard Generator',
    subhead: (w: number, h: number) => `Star News · ${w} × ${h} PNG · Article and custom cards`,
    reset: 'Reset',
    resetHint: 'Start over (R)',
    state: {
      needsPhoto: 'Needs a photo',
      fetching: 'Fetching…',
      ready: 'Ready to export',
      needsHeadline: 'Needs a headline',
    },
  },
  sections: {
    controls: 'Photocard controls',
    type: { title: 'Card type', hint: 'Pick a layout for this story.' },
    content: { title: 'Content', hint: 'Headline, date and labels — all editable.' },
    layout: { title: 'Layout', hint: 'Fine-tune the photo, headline and QR.' },
    export: { title: 'Export', hint: 'Grab the finished 1600 × 2000 PNG.' },
    preview: 'Photocard preview',
  },
  picker: {
    label: 'Template',
  },
  empty: {
    title: 'Your card will appear here',
    body: 'Paste a Star News link and hit Generate — or pick a custom card and start typing.',
  },
  shortcuts: {
    label: 'Keyboard shortcuts',
    generate: 'Generate',
    download: 'Download',
    reset: 'Reset',
    nudge: 'Nudge layer',
  },
  modes: {
    article: { label: 'Article cards', hint: 'From a Star News link', badge: 'Article' },
    custom: { label: 'Custom cards', hint: 'Write it yourself', badge: 'Custom' },
  },
  templates: {
    'common-card': 'Photo on top',
    'common-card-bottom': 'Photo at bottom',
    'special-card-top': 'Full photo, headline on top',
    'special-card-bottom': 'Full photo, headline at bottom',
    'just-in': 'Just In',
    'breaking-news': 'Breaking News',
  } as Record<string, string>,
  url: {
    label: 'Star News article link',
    help: 'We’ll grab the headline, photo and category. You can edit everything afterwards.',
    generate: 'Generate',
    fetching: 'Fetching…',
    cancel: 'Cancel',
    errors: {
      empty: 'Paste a Star News article link to get started.',
      invalid: 'That doesn’t look like a valid link. Try something like https://starnews.com.bd/…',
      insecure: 'Please use a secure https link without a username or password.',
      host: 'Only Star News links (starnews.com.bd) work here.',
    },
  },
  upload: {
    required: 'Photo (required · JPG, PNG, WebP or GIF, up to 8 MB)',
    replace: 'Use your own photo (optional · JPG, PNG, WebP or GIF, up to 8 MB)',
    needed: 'Add a photo to enable export.',
    loaded: 'Your photo stays in this browser — it’s never uploaded.',
    restore: 'Use the article photo again',
    source: {
      label: 'Photo source:',
      local: 'your file (this browser only)',
      remote: 'article photo',
      fallback: 'demo photo',
    },
  },
  headline: {
    label: 'Headline',
    placeholder: 'Type the headline (in Bengali)',
    stats: (words: number, size: number) => `${words} ${words === 1 ? 'word' : 'words'} · auto size ${size}px`,
    helpHighlight:
      'Wrap words in *asterisks* to make them yellow. If you don’t, part of the headline is highlighted for you. Line breaks are kept.',
    helpPlain: 'This card doesn’t use a highlight colour. Line breaks are kept.',
  },
  date: {
    label: 'Date',
    today: 'Today',
    help: 'Today’s date is filled in for you — change it if you need to.',
  },
  category: {
    label: 'Category (yellow label)',
    placeholder: 'e.g. রাজনীতি',
    help: (used: number, max: number) => `Filled in from the article when we can find it. ${used}/${max} characters — leave it empty for no label.`,
  },
  credit: {
    label: 'Photo tag',
    none: 'No tag',
    custom: 'Custom…',
    help: 'A small label in the corner of the photo.',
    customLabel: 'Your tag',
    customPlaceholder: 'e.g. ছবি: সংগৃহীত',
    count: (used: number, max: number) => `${used}/${max} characters — leave it empty for no tag.`,
  },
  zoom: {
    label: (zoom: string, min: number, max: number) => `Photo zoom: ${zoom}× (${min}–${max})`,
    out: 'Zoom photo out',
    in: 'Zoom photo in',
    help: 'Zoom in, then drag the photo on the card (or use the arrows below) to move it.',
  },
  fontSize: {
    label: (size: number) => `Headline size: ${size}px (30–120)`,
    value: 'Headline size value',
    presets: 'Suggested headline sizes',
  },
  layers: {
    names: { photo: 'photo', title: 'headline', qr: 'QR code' } as Record<LayerKey, string>,
    position: { photo: 'Photo position', title: 'Headline position', qr: 'QR position' } as Record<LayerKey, string>,
    move: (name: string, dir: string) => `Move ${name} ${dir}`,
    choose: 'Layer to move',
    positionsLabel: 'Layer positions',
    short: { photo: 'Photo', title: 'Headline', qr: 'QR' } as Record<LayerKey, string>,
    padLabel: (name: string) => `Move the ${name}`,
    reset: { photo: 'Reset photo', title: 'Reset headline', qr: 'Reset QR' } as Record<LayerKey, string>,
    help: 'Click a direction (Shift = 10 px), use the arrow keys, or drag on the preview.',
    preview: { photo: 'Photo layer', title: 'Headline layer', qr: 'QR code layer' } as Record<LayerKey, string>,
    previewHint: (label: string) => `${label}. Use the arrow keys to nudge it.`,
  },
  qr: {
    toggleArticle: 'Show QR code (links to the article this card came from)',
    toggleCustom: 'Show QR code (links to starnews.com.bd)',
    altArticle: 'QR code linking to the article',
    altCustom: 'QR code linking to starnews.com.bd',
  },
  layoutReset: 'Reset layout to the template defaults',
  export: {
    download: 'Download PNG',
    downloading: 'Exporting…',
    copy: 'Copy PNG',
    copying: 'Copying…',
    copyTitle: 'Copy the PNG to your clipboard',
    copyUnsupportedTitle: 'Copying needs HTTPS and clipboard support — Download always works',
    needsPhoto: 'Add a photo for this card to enable export.',
    copyUnsupportedNote: 'Copying needs a secure browser with image clipboard support. Download always works.',
    previewScale: (w: number, h: number, scale: string) => `${w} × ${h} PNG · preview at ${scale}×`,
  },
  status: {
    initial: 'Pick a card type, then fill in the details. Today’s date is added for you.',
    fetching: 'Fetching the article… You can cancel without losing your work.',
    loadFailed: 'We couldn’t load that article.',
    readyDemo: 'Card ready — no image found, so we’re using the demo photo.',
    ready: 'Card ready — copy or download it.',
    cancelled: 'Stopped fetching. Your card is just as you left it.',
    badFile: 'Please choose a JPG, PNG, WebP or GIF file.',
    tooBig: 'That photo is over 8 MB — please pick a smaller one.',
    localLoaded: 'Photo added. It stays in this browser and is never uploaded.',
    noArticlePhoto: 'There’s no article photo yet — generate a card first.',
    restored: 'Article photo is back, with zoom and position reset.',
    confirmReset: 'Start over? Your current card will be cleared.',
    reset: 'All cleared — today’s date is filled in again.',
    downloaded: (w: number, h: number) => `PNG downloaded at exactly ${w} × ${h}.`,
    copyUnsupported: 'Copying needs a secure (HTTPS) browser with clipboard support. Use Download PNG instead.',
    copied: 'Copied! Paste the PNG wherever you need it.',
    copyBlocked: 'Couldn’t copy — Download PNG still works.',
    exportPhoto:
      'We couldn’t load the card photo (article photo links expire after 10 minutes). Click Generate again or use your own photo, then try again.',
    exportTemplate: 'We couldn’t load the template artwork. Pick another template or reload the page.',
    exportFailed: (action: 'download' | 'copy') => `Export didn’t work. Check the photo and try to ${action} again.`,
  },
  /** Messages returned by /api/article; shown as-is in the status line. */
  api: {
    invalidUrl: 'Please paste a valid, secure (https) article link.',
    invalidHost: 'Only Star News article links work here.',
    invalidRequest: 'Please paste a valid article link.',
    redirectRejected: 'That link redirects somewhere we can’t follow.',
    tooLarge: 'That article page is too large to load.',
    notHtml: 'That link didn’t return an article page.',
    loadFailed: 'We couldn’t load that article.',
    missingTitle: 'We couldn’t find a headline on that page.',
    empty: 'That article page came back empty.',
    rateLimited: 'Too many requests — give it a moment and try again.',
    timeout: 'The article took too long to load. Try again?',
  },
} as const;
