// The remake's own page, served apart from the game: `npm run abduction`.
// It shares the repository's node_modules (three, vite) and nothing else.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  // Not the game's public/ folder: this page has no static assets of its own.
  publicDir: false,
  server: { host: true, port: 5174, fs: { allow: ['..'] } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
});
