// Draws every frame of the take at a fixed step and makes a video of them
// (PLAN.md milestone 10): out/capture.mp4.
//
//   node abduction/tools/capture.mjs                       60 fps, 1440x1080
//   node abduction/tools/capture.mjs --fps 10 --scale 0.3  a quick draft
//   node abduction/tools/capture.mjs --from 45 --to 65     part of it
//   node abduction/tools/capture.mjs --gpu                 a visible browser on the machine's own
//                                                          card, through WebGPU (for the final run)
//
// Headless here it goes through SwiftShader (seconds a frame), so the whole
// take at 60 fps is a job for a machine with a graphics card (--gpu). The
// sound is not in it: the page makes it live.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startPage, ROOT } from './browser.mjs';
import { LENGTH } from '../src/timeline.js';

const args = process.argv.slice(2);
const opt = (name, d) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? d : args[i + 1];
};
const fps = +opt('fps', 60);
const scale = opt('scale', '1');
const from = +opt('from', 0);
const to = +opt('to', LENGTH);
const gpu = args.includes('--gpu');
const out = join(ROOT, 'out', opt('out', 'capture.mp4'));
mkdirSync(join(ROOT, 'out'), { recursive: true });

let page;
let close;
let base;
if (gpu) {
  // A visible browser on the real card.
  const { createServer } = await import('vite');
  const server = await createServer({ configFile: join(ROOT, 'vite.config.js'), root: ROOT, server: { port: 0 }, logLevel: 'error' });
  await server.listen();
  base = `http://localhost:${server.httpServer.address().port}/`;
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
  page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1 });
  close = async () => { await browser.close(); await server.close(); };
} else {
  ({ base, page, close } = await startPage());
}

const q = `capture&mute&scale=${scale}${gpu ? '' : '&webgl'}`;
await page.goto(`${base}?${q}`, { waitUntil: 'commit' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000, polling: 250 });

const ffmpeg = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', out], { stdio: ['pipe', 'inherit', 'inherit'] });

const frames = Math.round((to - from) * fps);
const started = Date.now();
for (let i = 0; i < frames; i++) {
  const t = from + i / fps;
  await page.evaluate((tt) => window.__drawAt(tt), t);
  const png = await page.locator('#stage').screenshot({ timeout: 600000 });
  if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
  if (i % 10 === 0) {
    const each = (Date.now() - started) / (i + 1) / 1000;
    console.log(`frame ${i + 1}/${frames}  t ${t.toFixed(2)}  ${each.toFixed(2)} s a frame`);
  }
}
ffmpeg.stdin.end();
await new Promise((r) => ffmpeg.on('close', r));
await close();
console.log(`wrote ${out}`);
