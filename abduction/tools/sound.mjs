// Renders our sound for the whole take offline, in headless Chromium, through
// the same graph the page plays (src/audio/mix.js's renderTake: an
// OfflineAudioContext driven by the same timeline and listener path), into
// out/audio-ours.wav; then sets it beside the original with tools/sound.py
// (numbers on the terminal, pictures in out/sound/).
//
//   node abduction/tools/sound.mjs                 render, then compare
//   node abduction/tools/sound.mjs --no-compare    render only
//   node abduction/tools/sound.mjs --mix /out/sound/before/mix.js --out out/audio-before.wav --tag before
//
// Needs python3 with numpy and matplotlib for the comparison, and
// reference/audio.wav (node abduction/tools/reference.mjs).
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { startPage, ROOT } from './browser.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1]; };
const out = join(ROOT, opt('out', 'out/audio-ours.wav'));
const mix = opt('mix', null);
const tag = opt('tag', 'ours');

const { base, page, errors, close } = await startPage({ width: 320, height: 240 });
try {
  await page.goto(`${base}tools/sound.html${mix ? `?mix=${encodeURIComponent(mix)}` : ''}`);
  // Ready, or broken: either way, no waiting out the timeout.
  let watch;
  await Promise.race([
    page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 }),
    new Promise((_, fail) => {
      watch = setInterval(() => { if (errors.some((e) => e.startsWith('pageerror'))) fail(new Error(errors.join('\n'))); }, 200);
    }),
  ]).finally(() => clearInterval(watch));
  const { wav, ms, peak } = await page.evaluate(() => window.__render());
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(wav, 'base64'));
  console.log(`${out}: rendered in ${(ms / 1000).toFixed(1)} s, peak ${(20 * Math.log10(peak + 1e-9)).toFixed(1)} dBFS`);
  for (const e of errors) console.log('   ', e.slice(0, 400));
} finally {
  await close();
}

if (!args.includes('--no-compare')) {
  const ref = join(ROOT, 'reference', 'audio.wav');
  if (!existsSync(ref)) console.log('no reference/audio.wav: node abduction/tools/reference.mjs');
  else execFileSync('python3', [join(ROOT, 'tools', 'sound.py'), 'compare', ref, out, tag], { stdio: 'inherit' });
}
