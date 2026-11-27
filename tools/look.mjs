#!/usr/bin/env node
// The game beside a photograph of the same place, to set its look against
// the real one: the camera stood where the photo was taken, at its hour,
// seeing as wide as it did, and numbers to say how far apart the two are.
//
//   npm run build                                  (it shoots the built game; or --dev)
//   npm run look -- mount-storm-king               a hike, from where its photo was taken
//   npm run look -- mount-storm-king:photo-0       from where another of its photos was
//   npm run look -- 120,-340,0.6,0.4               anywhere: x, z, which way (world.player.camYaw), pitch (radians, + is down)
//   npm run look -- start --pitch 0.4              where a fresh world starts you, looking down
//   npm run look -- mount-storm-king --pair photos     ours with and without a part (config.js, ?no=)
//   npm run look -- mount-storm-king --no skylight     ours without it
//
// Options: --time h (the hour; a hike's photo's own by default), --fov deg
// (how wide it sees, top to bottom; the photo's, from its lens, by default),
// --pitch rad, --size WxH (the photo's shape, 1440 wide, by default),
// --ref file, --out dir (out/look), --settle n (frames drawn before the
// shot, 3), --dev (Vite's dev server: no build).
//
// The photographs are yours: put each in reference/hikes/ as <hike>.jpg
// (the one the hike was imported from) or <hike>/photo-<k>.jpg, JPEG with
// its EXIF (a phone's own export keeps it). Where there is one, the shot is
// set beside it and it's measured as the abduction study measured its stills
// (see abduction/README.md on its branch): the brightness of the middle of
// the picture (the median, and the brightest percent), and the colour of its
// top, middle and bottom thirds, ours against theirs. And what the photo's
// exposure says of how bright it really was (EV at ISO 100: the camera chose
// it to make the middle of the picture mid grey).
//
// A hike's land is at a fifth of its real size (src/hikes/README.md), so the
// near ground won't line up with the photo; the far ridges, the sky, the
// light and the colours will. Compare those.
//
// In this repository's cloud container the browser draws in software:
// a still at full size takes a minute or more.

import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPhoto } from './hike/exif.js';

const ROOT = new URL('..', import.meta.url).pathname;
const { chromium } = createRequire(import.meta.url)('playwright');

// ── What was asked ──────────────────────────────────────────────────────────
const FLAGS = ['time', 'fov', 'pitch', 'size', 'ref', 'out', 'no', 'pair', 'settle'];
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? null : process.argv[i + 1];
};
const where = process.argv.slice(2).find((a, i, all) => !a.startsWith('--') && !FLAGS.includes(all[i - 1]?.slice(2)));
if (!where) {
  console.error('npm run look -- <hike>[:photo-<k>] | <x,z,yaw,pitch>   (see the top of tools/look.mjs)');
  process.exit(2);
}
const OUT = join(ROOT, arg('out') || 'out/look');
mkdirSync(OUT, { recursive: true });
const SEED = 20261119;
const HEIGHT_PX = 1080; // when it has no photo to take its shape from
const WIDTH_PX = 1440; // the shot is this wide
const SETTLE_FRAMES = Number(arg('settle') ?? 3); // drawn once everything is there, before the shot
const GAME_FOV = 55; // the game's own (render/index.ts), when there is no photo to say
const FULL_FRAME_DIAGONAL = 43.27; // mm: what a 35 mm equivalent focal length is measured against

// The place: a hike's photo, or a spot.
const coords = /^-?[\d.]+(,-?[\d.]+){2,3}$/.test(where) ? where.split(',').map(Number) : null;
const [hike, at = 'view'] = coords || where === 'start' ? [null] : where.split(':');
const name = coords ? `at-${where.replace(/,/g, '_')}` : hike ? `${hike}${at === 'view' ? '' : `-${at}`}` : where;

// The photograph, if there is one, and what its EXIF says.
const refFile = arg('ref') || (hike && join(ROOT, 'reference', 'hikes', at === 'view' ? `${hike}.jpg` : `${hike}/${at}.jpg`));
const ref = refFile && existsSync(refFile) ? readFileSync(refFile) : null;
let exif = null;
if (ref) {
  try {
    exif = readPhoto(ref);
  } catch {
    console.warn(`${refFile}: no EXIF, so no lens or exposure to go by`);
  }
}

// ── The browser and the game ────────────────────────────────────────────────
async function serve() {
  const vite = await import('vite');
  if (process.argv.includes('--dev')) {
    const s = await vite.createServer({ root: ROOT, server: { port: 0 }, logLevel: 'silent' });
    await s.listen();
    return { url: s.resolvedUrls.local[0], close: () => s.close() };
  }
  if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
    console.error('no dist/: run `npm run build` first (or --dev)');
    process.exit(2);
  }
  const s = await vite.preview({ root: ROOT, preview: { port: 0, strictPort: false }, logLevel: 'silent' });
  return { url: s.resolvedUrls.local[0], close: () => s.httpServer.close() };
}

const server = await serve();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

// The photo's shape, from the photo (decoded by the browser, which knows JPEG).
async function sizeOf(bytes) {
  const page = await browser.newPage();
  const size = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/jpeg;base64,${b64}`;
    await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  }, bytes.toString('base64'));
  await page.close();
  return size;
}
let [W, H] = [WIDTH_PX, HEIGHT_PX];
if (arg('size')) [W, H] = arg('size').split('x').map(Number);
else if (ref) {
  const [w, h] = await sizeOf(ref);
  H = Math.round((WIDTH_PX * h) / w);
}
// How wide it sees, top to bottom: the photo's lens, if it says.
const fovFrom35 = (f35) => {
  const diag = Math.hypot(W, H);
  return (2 * Math.atan((FULL_FRAME_DIAGONAL * (H / diag)) / (2 * f35)) * 180) / Math.PI;
};
const FOV = arg('fov') ? Number(arg('fov')) : exif?.focal35 ? fovFrom35(exif.focal35) : GAME_FOV;

async function shoot(no) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  const query = [`seed=${SEED}`, 'animals=0', 'mute', no && `no=${no}`, arg('time') && `time=${arg('time')}`].filter(Boolean).join('&');
  await page.goto(`${server.url}?${query}`);
  await page.waitForFunction(() => document.getElementById('loader')?.classList.contains('gone') && window.world, null, { timeout: 300000 });
  const view = await page.evaluate(
    async ({ hike, at, coords, time, pitch, fov }) => {
      const w = window.world;
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      if (hike) await w.hikes.go(hike, at);
      else if (coords) {
        // (yaw is the camera's, as world.player.camYaw)
        const [x, z, yaw, p = 0] = coords;
        w.player.spawn(x, z, yaw - Math.PI, yaw);
        w.player.camPitch = p;
      }
      // from the hiker's own eyes, as a photo is taken
      w.player.firstPerson = true;
      if (time !== null) w.sky.hours = Number(time);
      if (pitch !== null) w.player.camPitch = Number(pitch);
      // how wide it sees, held each frame after the hiker's eye has set its own
      const cam = w.game.camera;
      w.game.addSystem({
        name: 'look',
        phase: 'world',
        update() {
          cam.fov = fov;
          cam.updateProjectionMatrix();
        },
      });
      while (!w.game.chunks.isFullyLoaded()) await frame();
      return { x: w.player.pos.x, y: w.player.pos.y, z: w.player.pos.z, yaw: w.player.camYaw, pitch: w.player.camPitch, hours: w.sky.hours };
    },
    { hike, at, coords, time: arg('time'), pitch: arg('pitch'), fov: FOV },
  );
  // everything fetched (the photographs of surfaces among it), then the eye
  // let straight to where it would settle, and a few frames drawn
  await page.waitForLoadState('networkidle');
  await page.evaluate(async (n) => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    for (let i = 0; i < n; i++) {
      window.world.game.pipeline.adaptFresh = true;
      await frame();
    }
  }, SETTLE_FRAMES);
  // the picture alone: the HUD, the crosshair and every panel hidden
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } #app, #app canvas { visibility: visible !important; }' });
  const png = await page.screenshot({ timeout: 0 });
  await page.close();
  if (problems.length) console.warn(`  in the page${no ? ` (no ${no})` : ''}:\n    ${problems.join('\n    ')}`);
  return { png, view };
}

// ── Measuring ───────────────────────────────────────────────────────────────
// In a page of its own: the pictures side by side, and the numbers.
async function measure(pictures, labels) {
  const page = await browser.newPage();
  const result = await page.evaluate(
    async ({ pics, labels, W, H }) => {
      const load = async (src) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        return img;
      };
      const imgs = await Promise.all(pics.map(load));
      // each drawn at the shot's size, to be measured alike
      const stats = imgs.map((img) => {
        const c = new OffscreenCanvas(W, H);
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0, W, H);
        const d = g.getImageData(0, 0, W, H).data;
        const luma = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        // the middle of the picture: the middle half each way
        const mid = [];
        for (let y = Math.floor(H / 4); y < (3 * H) / 4; y += 2) for (let x = Math.floor(W / 4); x < (3 * W) / 4; x += 2) mid.push(luma((y * W + x) * 4));
        mid.sort((a, b) => a - b);
        const thirds = [0, 1, 2].map((k) => {
          const s = [0, 0, 0];
          let n = 0;
          for (let y = Math.floor((k * H) / 3); y < ((k + 1) * H) / 3; y += 2)
            for (let x = 0; x < W; x += 2) {
              const i = (y * W + x) * 4;
              s[0] += d[i];
              s[1] += d[i + 1];
              s[2] += d[i + 2];
              n++;
            }
          return s.map((v) => Math.round(v / n));
        });
        return { median: Math.round(mid[mid.length >> 1]), p99: Math.round(mid[Math.floor(mid.length * 0.99)]), thirds };
      });
      // side by side, labelled
      const pad = 8;
      const c = new OffscreenCanvas(W * imgs.length + pad * (imgs.length - 1), H + 28);
      const g = c.getContext('2d');
      g.fillStyle = '#111';
      g.fillRect(0, 0, c.width, c.height);
      g.font = '16px sans-serif';
      imgs.forEach((img, k) => {
        g.drawImage(img, k * (W + pad), 28, W, H);
        g.fillStyle = '#ddd';
        g.fillText(labels[k], k * (W + pad) + 6, 19);
      });
      const blob = await c.convertToBlob({ type: 'image/png' });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { stats, sheet: btoa(s) };
    },
    { pics: pictures, labels, W, H },
  );
  await page.close();
  return result;
}

const dataUrl = (bytes, type) => `data:${type};base64,${bytes.toString('base64')}`;

// ── Go ──────────────────────────────────────────────────────────────────────
try {
  const pair = arg('pair');
  const no = arg('no');
  console.log(`${name}: ${W}×${H}, ${FOV.toFixed(1)}° top to bottom${ref ? `, beside ${refFile}` : ''}`);
  const shots = [];
  const ours = await shoot(no);
  shots.push({ label: no ? `ours, without ${no}` : 'ours', png: ours.png });
  if (pair) {
    const without = await shoot([no, pair].filter(Boolean).join(','));
    shots.push({ label: `ours, without ${pair}`, png: without.png });
  }
  const v = ours.view;
  console.log(`  stood at ${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)}, looking ${v.yaw.toFixed(3)} rad, pitch ${v.pitch.toFixed(3)}, at ${v.hours.toFixed(2)} h`);
  const tag = [name, no && `no-${no}`, pair && `pair-${pair}`].filter(Boolean).join('.');
  for (const [k, s] of shots.entries()) writeFileSync(join(OUT, `${tag}.${k}.png`), s.png);

  const pics = shots.map((s) => dataUrl(s.png, 'image/png'));
  const labels = shots.map((s) => s.label);
  if (ref) {
    pics.push(dataUrl(ref, 'image/jpeg'));
    labels.push(`the photograph${exif?.taken ? `, ${exif.taken}` : ''}`);
  }
  const { stats, sheet } = await measure(pics, labels);
  const sheetFile = join(OUT, `${tag}.png`);
  writeFileSync(sheetFile, Buffer.from(sheet, 'base64'));

  // the numbers, one column a picture
  const col = (s) => s.padStart(18);
  console.log(`\n  ${''.padEnd(26)}${labels.map((l) => col(l.split(',')[0] + (l.includes('without') ? ' −' + l.split('without ')[1] : ''))).join('')}`);
  console.log(`  ${'middle, median (0-255)'.padEnd(26)}${stats.map((s) => col(String(s.median))).join('')}`);
  console.log(`  ${'middle, brightest 1%'.padEnd(26)}${stats.map((s) => col(String(s.p99))).join('')}`);
  for (const [k, third] of ['top third, RGB', 'middle third, RGB', 'bottom third, RGB'].entries()) {
    console.log(`  ${third.padEnd(26)}${stats.map((s) => col(s.thirds[k].join(' '))).join('')}`);
  }
  if (exif?.exposure) {
    const { seconds, fNumber, iso } = exif.exposure;
    const ev100 = Math.log2((fNumber * fNumber) / seconds) - Math.log2(iso / 100);
    console.log(`\n  the photograph: 1/${Math.round(1 / seconds)} s at f/${fNumber}, ISO ${iso}: EV ${ev100.toFixed(1)} at ISO 100`);
  }
  console.log(`\n  ${sheetFile}`);
} finally {
  await browser.close();
  await server.close();
}
