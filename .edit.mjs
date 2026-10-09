import { readFileSync, writeFileSync } from 'node:fs';
let f, s;
const rep = (a, b) => { if (!s.includes(a)) throw new Error(f + ' missing: ' + a.slice(0, 70)); s = s.replace(a, b); };
f = 'src/components/editor/PhotocardEditor.tsx'; s = readFileSync(f, 'utf8');
rep("  imageUrl?: string;\n};", "  imageUrl?: string;\n  /** Set when the article has photos the server could not serve (no signing secret). */\n  imageNotice?: 'signing-unconfigured';\n};");
rep("      if (!data.imageUrl) {", "      if (data.imageNotice === 'signing-unconfigured') {\n        announce('warning', S.status.readySigningOff);\n      } else if (!data.imageUrl) {");
writeFileSync(f, s);
f = 'src/lib/i18n/strings.ts'; s = readFileSync(f, 'utf8');
rep("    readyDemo: 'Card ready — no image found, so we’re using the demo photo.',",
    "    readyDemo: 'Card ready — no image found, so we’re using the demo photo.',\n    readySigningOff:\n      'Card ready with the demo photo — the article has a photo, but the server isn’t set up to serve it (IMAGE_TOKEN_SECRET is missing).',");
writeFileSync(f, s);
