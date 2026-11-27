// How far our camera is turned from the original's, at any times: draws our
// frame headless, takes the original's at the same moment, and finds the
// shift that best lays one on the other (edges against edges, over the middle
// of the frame, the overlay's words masked out). The shift, through the
// lens's focal length at that moment, is the yaw and pitch to add to
// camera/path.js's LOOK there. For keying the motion between the stills,
// where tools/survey.mjs has no marks.
//
//   node abduction/tools/align.mjs 2 3 4.5 7          those times
//   node abduction/tools/align.mjs --from 0 --to 12 --step 0.5
//   node abduction/tools/align.mjs --reuse ...         use frames already drawn
//
// It sees only a turn: where the camera stands is for the survey. A frame
// whose best match is weak (score under about 0.3) says little.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startPage, ROOT } from './browser.mjs';
import { LENS, drawnFov } from '../src/post/pipeline.js';
import { FOV, LOOK } from '../src/camera/path.js';

// The frames are compared this small (pixels), and shifted this far either
// way (pixels at that size).
const W = 240;
const H = 180;
const REACH = 36;
// The overlay's words: corners of the frame left out, as fractions of it.
const HUD = [[0, 0, 0.3, 0.12], [0.72, 0, 1, 0.12], [0, 0.85, 0.22, 1], [0.82, 0.85, 1, 1]];

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (n) => { const i = args.indexOf(`--${n}`); if (i < 0) return false; args.splice(i, 1); return true; };
const reuse = flag('reuse');
const from = opt('from', null);
const to = opt('to', null);
const step = +opt('step', 0.5);
const times = from != null ? Array.from({ length: Math.floor((+to - +from) / step + 1e-6) + 1 }, (_, i) => +(+from + i * step).toFixed(3)) : args.map(Number);
if (!times.length) { console.error('usage: align.mjs [--reuse] t ... | --from a --to b [--step s]'); process.exit(1); }

const OUT = join(ROOT, 'out', 'align');
mkdirSync(OUT, { recursive: true });
const VIDEO = [join(ROOT, 'reference', 'video.mp4'), join(ROOT, 'reference', 'video-full.mp4')].find(existsSync);

// A frame as W x H grey levels, 0 to 1.
function grey(input, seek) {
  const pre = seek != null ? ['-ss', String(seek)] : [];
  const buf = execFileSync('ffmpeg', ['-v', 'error', ...pre, '-i', input, '-frames:v', '1', '-vf', `scale=${W}:${H}:flags=area,format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 });
  return Float32Array.from(buf, (v) => v / 255);
}

// Edges: the gradient's size, after a little smoothing, as a picture.
function edges(g) {
  const out = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx = g[i + 1] - g[i - 1] + 0.5 * (g[i + 1 - W] - g[i - 1 - W] + g[i + 1 + W] - g[i - 1 + W]);
      const gy = g[i + W] - g[i - W] + 0.5 * (g[i + W + 1] - g[i - W + 1] + g[i + W - 1] - g[i - W - 1]);
      out[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  // Each picture's edges scaled to its own spread, so a brighter picture does not win.
  let s = 0;
  for (const v of out) s += v;
  const mean = s / out.length;
  return out.map((v) => Math.min(v / (mean * 4 + 1e-6), 1.5));
}

// Where the frames are compared: not the overlay's words, nor the lens's dark corners.
const MASK = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    MASK[y * W + x] = !HUD.some(([a, b, c, d]) => u >= a && u < c && v >= b && v < d) && Math.hypot((u - 0.5) * 4 / 3, v - 0.5) < 0.62 ? 1 : 0;
  }
}
const inside = (x, y) => MASK[y * W + x] === 1;

// The shift (sx, sy), ours to theirs, with the best normalised correlation.
function bestShift(ours, theirs) {
  let best = { score: -1, sx: 0, sy: 0 };
  for (let sy = -REACH; sy <= REACH; sy++) {
    for (let sx = -REACH; sx <= REACH; sx++) {
      let ab = 0, aa = 0, bb = 0, sa = 0, sb = 0, n = 0;
      for (let y = 2; y < H - 2; y += 1) {
        const yo = y - sy;
        if (yo < 2 || yo >= H - 2) continue;
        for (let x = 2; x < W - 2; x += 1) {
          const xo = x - sx;
          if (xo < 2 || xo >= W - 2 || !inside(x, y) || !inside(xo, yo)) continue;
          const a = theirs[y * W + x], b = ours[yo * W + xo];
          ab += a * b; aa += a * a; bb += b * b; sa += a; sb += b; n++;
        }
      }
      if (n < W * H * 0.25) continue;
      const cov = ab / n - (sa / n) * (sb / n);
      const score = cov / Math.sqrt((aa / n - (sa / n) ** 2) * (bb / n - (sb / n) ** 2) + 1e-12);
      if (score > best.score) best = { score, sx, sy };
    }
  }
  return best;
}

let page = null;
let close = async () => {};
let base = '';
if (!reuse) ({ base, page, close } = await startPage({ width: 1440, height: 1080 }));
const _l = [0, 0];
try {
  console.log('    t   score     dx     dy   (px at 1440)   yaw +   pitch +   ->  yaw   pitch');
  for (const t of times) {
    const file = join(OUT, `ours-${t}.png`);
    if (!reuse || !existsSync(file)) {
      await page.goto(`${base}?t=${t}&mute&webgl&shot`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000, polling: 100 });
      await page.waitForTimeout(100);
      await page.locator('#stage').screenshot({ path: file, timeout: 300000 });
    }
    const ours = edges(grey(file));
    const theirs = edges(grey(VIDEO, t));
    const b = bestShift(ours, theirs);
    // Pixels at 1440 to degrees, through the middle of the lens.
    const k = 1440 / W;
    const fov = drawnFov(FOV.sample(t, [0])[0]);
    const focal = 540 / (LENS.zoom * Math.tan((fov * Math.PI) / 360));
    const dyaw = (-(b.sx * k) / focal) * (180 / Math.PI);
    const dpitch = ((b.sy * k) / focal) * (180 / Math.PI);
    LOOK.sample(t, _l);
    console.log(`${String(t).padStart(6)}  ${b.score.toFixed(2)}  ${String(b.sx * k).padStart(5)}  ${String(b.sy * k).padStart(5)}               ${dyaw.toFixed(1).padStart(6)}   ${dpitch.toFixed(1).padStart(6)}    ${(_l[0] + dyaw).toFixed(1).padStart(6)} ${(_l[1] + dpitch).toFixed(1).padStart(6)}`);
  }
} finally {
  await close();
}
