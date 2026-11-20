import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // `npm run dev` serves the game; `npm run api` runs the save server
  // (the Worker in worker/) next to it.
  server: {
    host: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true } },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
