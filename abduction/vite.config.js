// The remake's own page, served apart from the game: `npm run abduction`.
// It shares the repository's node_modules (three, vite) and nothing else.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  // Its own public/: the photo-scanned textures tools/assets.mjs fetches (public/tex/).
  publicDir: 'public',
  server: { host: true, port: 5174, fs: { allow: ['..'] } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
});
