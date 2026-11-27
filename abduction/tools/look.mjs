// Draws the page at any URL parameters, headless, into out/look/<name>.png:
// for looking at one thing up close, or at a moment that is not a still.
//
//   node abduction/tools/look.mjs van "t=17&cam=10,1.6,0,150,-5,50"
//   node abduction/tools/look.mjs a "t=30" b "t=31&raw"       several at once
//   node abduction/tools/look.mjs --pair beam "t=55.4"        and the original's frame
//                                                             beside it (needs reference/)
//
// ?cam=x,y,z,yaw,pitch,fov holds the camera (src/params.js). --size 960x720
// draws smaller. With --pair, writes <name>-pair.jpg: theirs (left) | ours, and
// the two blended half and half below.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startPage, ROOT } from './browser.mjs';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(`--${n}`); if (i < 0) return false; args.splice(i, 1); return true; };
const opt = (n, d) => { const i = args.indexOf(`--${n}`); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const pair = flag('pair');
const [width, height] = opt('size', '1440x1080').split('x').map(Number);
const OUT = join(ROOT, 'out', 'look');
mkdirSync(OUT, { recursive: true });

const shots = [];
for (let i = 0; i + 1 < args.length; i += 2) shots.push([args[i], args[i + 1]]);
if (!shots.length) { console.error('usage: look.mjs [--pair] [--size WxH] name "query" [name "query" ...]'); process.exit(1); }

const { base, page, errors, close } = await startPage({ width, height });
try {
  for (const [name, query] of shots) {
    const q = new URLSearchParams(query);
    if (!q.has('t') && !q.has('still')) q.set('t', '0');
    // ?shot: stop after a few frames and say so (main.js).
    for (const k of ['mute', 'webgl', 'shot']) q.set(k, '');
    const started = Date.now();
    await page.goto(`${base}?${q.toString().replace(/=(&|$)/g, '$1')}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000, polling: 100 });
    await page.waitForTimeout(100);
    const file = join(OUT, `${name}.png`);
    await page.locator('#stage').screenshot({ path: file, timeout: 300000 });
    console.log(`${file}  ${((Date.now() - started) / 1000).toFixed(1)} s`);
    if (errors.length) for (const e of errors.splice(0)) console.log('   ', e.slice(0, 400));
    if (pair && q.has('t')) {
      const t = q.get('t');
      const video = [join(ROOT, 'reference', 'video-full.mp4'), join(ROOT, 'reference', 'video.mp4')].find(existsSync);
      if (!video) { console.log('    no reference video: node abduction/tools/reference.mjs'); continue; }
      // Theirs | ours, and the two half and half below (as tools/compare.mjs).
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', t, '-i', video, '-i', file, '-filter_complex',
        '[0]scale=720:540,split[a][c];[1]scale=720:540,split[b][d];[a][b]hstack[top];' +
        '[c][d]blend=all_mode=average[bl];[bl]pad=1440:540:360:0[bot];[top][bot]vstack', '-frames:v', '1', '-q:v', '3',
        join(OUT, `${name}-pair.jpg`)]);
      console.log(`    ${join(OUT, `${name}-pair.jpg`)}`);
    }
  }
} finally {
  await close();
}
