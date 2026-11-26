// What a frame costs (PLAN.md section 8): holds the take at the commonest
// moment (the forecourt, 17 s) and the worst (the beam, 55 s), at 1440x1080
// and 2048x1536, and reports frame time, time on the card where WebGPU can
// say, draw calls and triangles.
//
//   node abduction/tools/bench.mjs --gpu      on this machine's card, in a visible browser (the real answer)
//   node abduction/tools/bench.mjs            headless, through SwiftShader: counts only, the times mean nothing
//
// Name the machine beside the numbers when writing them into README.md.
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startPage, ROOT } from './browser.mjs';

const args = process.argv.slice(2);
const gpu = args.includes('--gpu');
const FRAMES = gpu ? 240 : 6;
const MOMENTS = [['forecourt', 17], ['beam', 55]];
const SIZES = [[1440, 1080], [2048, 1536]];

async function open(width, height) {
  if (!gpu) return startPage({ width, height });
  const { createServer } = await import('vite');
  const server = await createServer({ configFile: join(ROOT, 'vite.config.js'), root: ROOT, server: { port: 0 }, logLevel: 'error' });
  await server.listen();
  const base = `http://localhost:${server.httpServer.address().port}/`;
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  return { base, page, errors: [], close: async () => { await browser.close(); await server.close(); } };
}

for (const [width, height] of SIZES) {
  const { base, page, close } = await open(width, height);
  for (const [name, t] of MOMENTS) {
    await page.goto(`${base}?t=${t}&mute&stats${gpu ? '' : '&webgl'}`, { waitUntil: 'commit', timeout: 600000 });
    await page.waitForFunction((n) => (window.__frames?.() ?? 0) > n, FRAMES, { timeout: 900000, polling: 500 });
    const r = await page.evaluate(() => window.__bench());
    console.log(`${width}x${height}  ${name.padEnd(10)} ${r.backend.padEnd(7)} ${r.frameMs.toFixed(1)} ms a frame (${(1000 / r.frameMs).toFixed(0)} fps)` +
      `${r.gpuMs ? `, ${r.gpuMs.toFixed(1)} ms on the card` : ''}  ${r.drawCalls} draws  ${(r.triangles / 1e6).toFixed(2)}M triangles  canvas ${r.size}`);
  }
  await close();
}
