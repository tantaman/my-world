// What tools/shoot.mjs and tools/capture.mjs share: a Vite server for the
// page, and headless Chromium with WebGPU on.
//
// Chromium here has WebGPU only with these switches (PLAN.md section 8): it
// is then SwiftShader, a software renderer. Seconds a frame; never judge
// speed from it.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

export const WEBGPU_ARGS = [
  '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader',
  '--use-webgpu-adapter=swiftshader', '--ignore-gpu-blocklist',
];

export async function startPage({ width = 1440, height = 1080 } = {}) {
  const server = await createServer({
    configFile: new URL('../vite.config.js', import.meta.url).pathname,
    root: ROOT,
    // No hot reload: an edit while stills are being drawn must not reload the page under them.
    server: { port: 0, host: '127.0.0.1', hmr: false, watch: null },
    logLevel: 'error',
  });
  await server.listen();
  const address = server.httpServer.address();
  const base = `http://127.0.0.1:${address.port}/`;
  const browser = await chromium.launch({ args: WEBGPU_ARGS });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return {
    base,
    page,
    errors,
    async close() {
      await browser.close();
      await server.close();
    },
  };
}
