import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'server',
  // Stateless app: no Astro sessions or image transforms, so the adapter must not
  // inject (and auto-provision) SESSION KV or IMAGES bindings on deploy.
  adapter: cloudflare({ imageService: 'passthrough' }),
  session: false,
  integrations: [react()],
  security: { checkOrigin: true },
});
