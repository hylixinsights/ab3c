import { defineConfig } from 'astro/config';
import { eventPreview } from './scripts/event-preview.mjs';

export default defineConfig({
  site: 'https://ab3c.org',
  output: 'static',
  trailingSlash: 'always',
  build: { assets: 'ab3c-assets', format: 'directory' },
  devToolbar: { enabled: false },
  vite: {
    plugins: [eventPreview()]
  }
});
