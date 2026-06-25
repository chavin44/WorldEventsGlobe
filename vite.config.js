import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves this project site from /WorldEventsGlobe/, so assets
  // must be referenced relative to that subpath, not the domain root.
  base: '/WorldEventsGlobe/',
  server: {
    port: 5180,
    host: true,
  },
});
