import { defineConfig } from 'vite';

// GitHub Pages serves a project site under /<repo>/. `base` must match the repo
// name so asset URLs resolve (KTD1). Override with a custom domain later by
// setting BASE_PATH=/ at build time (see README custom-domain cutover).
const base = process.env.BASE_PATH ?? '/caribbean-grid/';

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
