// Draws our stills at the same times as the original's, in headless
// Chromium, into out/stills/<name>.png (PLAN.md section 8).
//
//   node abduction/tools/shoot.mjs                    all 19 at 1440x1080
//   node abduction/tools/shoot.mjs 01 04 13           only those
//   node abduction/tools/shoot.mjs --scale 0.5        draw smaller, faster
//   node abduction/tools/shoot.mjs --q raw            extra URL parameters (here ?raw)
//
// Always through the WebGL 2 backend (?webgl): headless Chromium's WebGPU
// here loses its device as soon as it draws to a canvas.
//
// Then tools/compare.mjs sets each beside the original.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { STILLS } from '../src/stills.js';
import { startPage, ROOT } from './browser.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return d;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const scale = opt('scale', '1');
const extra = opt('q', '');
const outName = opt('out', 'stills');
const wanted = args.length ? STILLS.filter(([n]) => args.some((a) => n.startsWith(a) || n.includes(a))) : STILLS;

const OUT = join(ROOT, 'out', outName);
mkdirSync(OUT, { recursive: true });

const { base, page, errors, close } = await startPage();
try {
  for (const [name] of wanted) {
    const started = Date.now();
    const q = new URLSearchParams({ still: name, scale, mute: '', webgl: '' });
    for (const kv of extra.split('&').filter(Boolean)) {
      const [k, v = ''] = kv.split('=');
      q.set(k, v);
    }
    await page.goto(`${base}?${q.toString().replace(/=(&|$)/g, '$1')}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000, polling: 250 });
    await page.waitForTimeout(150);
    await page.locator('#stage').screenshot({ path: join(OUT, `${name}.png`), timeout: 300000 });
    console.log(`${name}  ${((Date.now() - started) / 1000).toFixed(1)} s`);
    if (errors.length) {
      for (const e of errors.splice(0)) console.log('   ', e.slice(0, 400));
    }
  }
} finally {
  await close();
}
