// Sets each of our stills (out/stills/) beside the original's
// (reference/stills/), and prints the numbers that catch exposure and colour
// drifting (PLAN.md section 8): median and 99th percentile brightness of the
// middle of the frame, and the colour at each named point of PLAN.md
// section 11, ours against theirs.
//
//   node abduction/tools/compare.mjs            every still we have drawn
//   node abduction/tools/compare.mjs 01 04      only those
//   node abduction/tools/compare.mjs --dir raw  compare out/raw/ instead, into out/compare-raw/
//
// Writes out/compare/<name>.jpg: theirs (left) | ours (right), and a
// half-and-half blend below.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { STILLS } from '../src/stills.js';
import { ROOT } from './browser.mjs';

const W = 1440;
const H = 1080;

// PLAN.md section 11: [still, what, x, y, colour] at 1440x1080.
export const SAMPLES = [
  ['01-establishing', 'sky overhead', 720, 150, '#2d2b33'],
  ['01-establishing', 'sky low toward the lamps', 1330, 430, '#54443c'],
  ['01-establishing', 'fog at the horizon', 900, 585, '#444146'],
  ['01-establishing', 'street-lamp head', 1278, 323, '#8e7c6f'],
  ['01-establishing', 'wall under the door lamp', 135, 585, '#564d2b'],
  ['01-establishing', 'canopy tube', 690, 440, '#a3a29d'],
  ['01-establishing', 'wet forecourt, unlit', 400, 950, '#161412'],
  ['01-establishing', 'lamp streak in a puddle', 1060, 715, '#a7927e'],
  ['01-establishing', 'canopy underside', 800, 430, '#34322d'],
  ['02-lightning-sign', 'cloud lit by the bolt', 600, 160, '#818594'],
  ['02-lightning-sign', 'wet ground under the bolt', 640, 900, '#a3a3af'],
  ['02-lightning-sign', 'sky far from the bolt', 1300, 200, '#1e1c24'],
  ['10-pasture', 'fog at the tree line', 700, 545, '#2c292d'],
  ['10-pasture', 'tree crown', 880, 430, '#141009'],
  ['10-pasture', 'verge dirt', 600, 760, '#1e1916'],
  ['10-pasture', 'lit fog under a lamp', 330, 360, '#8c735f'],
  ['10-pasture', 'road', 700, 640, '#181518'],
  ['15-cow-rising', 'beam', 720, 600, '#6e7279'],
  ['15-cow-rising', 'ring under the saucer', 720, 455, '#c5c9cf'],
  ['15-cow-rising', 'sky beside the saucer', 300, 300, '#443939'],
  ['15-cow-rising', 'ground under the beam', 720, 830, '#727a71'],
  ['08-interior', 'back wall of the shop', 520, 520, '#27150f'],
  ['08-interior', 'pendant lamp', 805, 455, '#a47048'],
  ['08-interior', 'counter top', 450, 700, '#9a744a'],
  ['09-under-canopy', 'ceiling', 520, 240, '#25241e'],
  ['09-under-canopy', 'van, white', 200, 600, '#79654d'],
  ['09-under-canopy', 'pump, white', 1040, 560, '#545441'],
  ['09-under-canopy', 'column foot, green', 1150, 790, '#222f24'],
  ['05-car', 'headlight', 965, 580, '#dbd6d0'],
];

// PLAN.md section 11's brightness table, for stills between whole seconds.
export const BRIGHTNESS = { '01-establishing': [33, 139] };

function rgb(file) {
  return execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
}

function stats(buf) {
  // The middle of the frame: the central half in each direction.
  const lum = [];
  for (let y = H / 4; y < (3 * H) / 4; y += 2) {
    for (let x = W / 4; x < (3 * W) / 4; x += 2) {
      const i = (y * W + x) * 3;
      lum.push(0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]);
    }
  }
  lum.sort((a, b) => a - b);
  return { median: lum[lum.length >> 1], p99: lum[Math.floor(lum.length * 0.99)] };
}

function patch(buf, cx, cy) {
  const s = [0, 0, 0];
  let n = 0;
  for (let y = cy - 4; y <= cy + 4; y++) {
    for (let x = cx - 4; x <= cx + 4; x++) {
      const i = (y * W + x) * 3;
      s[0] += buf[i]; s[1] += buf[i + 1]; s[2] += buf[i + 2]; n++;
    }
  }
  return s.map((v) => Math.round(v / n));
}
const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

const args = process.argv.slice(2);
const di = args.indexOf('--dir');
const dir = di >= 0 ? args.splice(di, 2)[1] : 'stills';
const OURS = join(ROOT, 'out', dir);
const OUT = join(ROOT, 'out', dir === 'stills' ? 'compare' : `compare-${dir}`);
mkdirSync(OUT, { recursive: true });

for (const [name] of STILLS) {
  if (args.length && !args.some((a) => name.startsWith(a) || name.includes(a))) continue;
  const ours = join(OURS, `${name}.png`);
  const theirs = join(ROOT, 'reference', 'stills', `${name}.jpg`);
  if (!existsSync(ours) || !existsSync(theirs)) continue;
  const a = rgb(theirs);
  const b = rgb(ours);
  const sa = stats(a);
  const sb = stats(b);
  console.log(`${name.padEnd(22)} median ${String(Math.round(sb.median)).padStart(3)} (theirs ${Math.round(sa.median)})   p99 ${String(Math.round(sb.p99)).padStart(3)} (theirs ${Math.round(sa.p99)})`);
  for (const [still, what, x, y, want] of SAMPLES) {
    if (still !== name) continue;
    console.log(`    ${what.padEnd(28)} ours ${hex(patch(b, x, y))}  theirs ${hex(patch(a, x, y))}  (plan ${want})`);
  }
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', theirs, '-i', ours, '-filter_complex',
    `[0]scale=720:540[a];[1]scale=720:540[b];[a][b]hstack[top];[0]scale=720:540[c];[1]scale=720:540[d];[c][d]blend=all_mode=average[bl];[bl]pad=1440:540:360:0[bot];[top][bot]vstack`,
    '-q:v', '3', join(OUT, `${name}.jpg`)]);
}
