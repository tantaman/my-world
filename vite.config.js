import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // `npm run dev` serves the game; `npm run api` runs the save server
  // (the Worker in worker/) next to it.
  server: {
    host: true,
    // The game's modules made ready as the server starts, rather than one
    // at a time as the first page to open asks for them.
    warmup: { clientFiles: ['./src/main.js'] },
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true } },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
