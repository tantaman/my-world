// Fetches the photo-scanned surfaces the page asks for (CC0, Poly Haven)
// into public/tex/<id>/<res>/, which is not committed.
//
//   node abduction/tools/assets.mjs          fetch what src/ asks for and is missing
//   node abduction/tools/assets.mjs --list   only say what it would fetch
//
// What is asked for is found by reading src/ for pbr('id') and
// pbr('id', { res: '2k' }) (src/materials/textures.js), so there is no list
// to keep: use a texture in code, then run this. For each: the colour
// (diff.jpg), the normal in OpenGL's convention (nor_gl.jpg) and Poly Haven's
// packed AO/roughness/metalness (arm.jpg). And skyPanorama('id'): a sky (below).
// Uses curl, so a proxy set in the environment is used; ffmpeg for the sky.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './browser.mjs';

const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'public', 'tex');
const MAPS = { diff: 'Diffuse', nor_gl: 'nor_gl', arm: 'arm' };

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    // (textures.js itself only shows how to call it.)
    return statSync(p).isDirectory() ? files(p) : /\.(js|ts)$/.test(n) && n !== 'textures.js' ? [p] : [];
  });
}

const wanted = new Set();
for (const f of files(SRC)) {
  for (const m of readFileSync(f, 'utf8').matchAll(/pbr\(\s*'([a-z0-9_]+)'(?:\s*,\s*\{[^}]*res:\s*'(\dk)')?/g)) {
    wanted.add(`${m[1]}/${m[2] ?? '1k'}`);
  }
}

// Sky panoramas (skyPanorama('id') in src/materials/textures.js): Poly Haven's
// tonemapped JPG of an HDRI, cut to its upper half (zenith to horizon) and
// scaled to SKY_SIZE, into public/tex/sky/<id>.jpg.
const SKY_SIZE = '4096:1024';
const skies = new Set();
for (const f of files(SRC)) {
  for (const m of readFileSync(f, 'utf8').matchAll(/skyPanorama\(\s*'([a-z0-9_]+)'/g)) skies.add(m[1]);
}

const curl = (args) => execFileSync('curl', ['-fsS', '-m', '300', '-A', 'abduction-assets', ...args], { maxBuffer: 1 << 26 });
for (const id of skies) {
  const out = join(OUT, 'sky', `${id}.jpg`);
  if (existsSync(out)) continue;
  if (process.argv.includes('--list')) { console.log('would fetch sky', id); continue; }
  mkdirSync(join(OUT, 'sky'), { recursive: true });
  const info = JSON.parse(curl([`https://api.polyhaven.com/files/${id}`]).toString());
  const full = join(OUT, 'sky', `${id}-full.jpg`);
  curl(['-o', full, info.tonemapped.url]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', full, '-vf', `crop=iw:ih/2:0:0,scale=${SKY_SIZE}:flags=lanczos`, '-q:v', '3', out]);
  unlinkSync(full);
  console.log('fetched sky', id);
}
let fetched = 0;
for (const key of [...wanted].sort()) {
  const [id, res] = key.split('/');
  const dir = join(OUT, id, res);
  const missing = Object.keys(MAPS).filter((m) => !existsSync(join(dir, `${m}.jpg`)));
  if (!missing.length) continue;
  if (process.argv.includes('--list')) { console.log('would fetch', key, missing.join(' ')); continue; }
  mkdirSync(dir, { recursive: true });
  const info = JSON.parse(curl([`https://api.polyhaven.com/files/${id}`]).toString());
  for (const m of missing) {
    const url = info[MAPS[m]]?.[res]?.jpg?.url;
    if (!url) { console.warn(`${id}: no ${MAPS[m]} at ${res}`); continue; }
    curl(['-o', join(dir, `${m}.jpg`), url]);
    fetched++;
  }
  console.log('fetched', key);
}
console.log(`${wanted.size} textures asked for in src/, ${fetched} files fetched into ${OUT}`);
