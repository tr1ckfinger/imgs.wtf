// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  // Hide the floating dev toolbar pill in `astro dev` — gets in the way
  // when testing the lightbox / mobile gestures on a phone over LAN.
  devToolbar: { enabled: false },
  adapter: vercel({
    webAnalytics: { enabled: true }
  }),
});
