#!/usr/bin/env node
// Fetches the photographs of real surfaces the game asks for (CC0 scans,
// from Poly Haven) into public/photos/<id>/, to be committed with the code
// that uses them.
//
//   npm run photos              fetch what src/ asks for and is missing
//   npm run photos -- --list    only say what it would fetch
//
// What is asked for is found by reading src/ for photo('id', …) calls
// (src/render/photos.ts), so there is no list to keep: use a photo in code,
// run this, commit public/photos/<id>/. For each, at 1k: the colour
// (diff.jpg), the normal in OpenGL's convention (nor_gl.jpg), and the packed
// ambient occlusion, roughness and metalness (arm.jpg).
//
// They are CC0: no one's permission is needed and no credit is owed, though
// public/photos/README.md says whose they are. Uses curl, so a proxy set in
// the environment is used.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'public', 'photos');
const RES = '1k';
// Poly Haven's name for each map, and ours.
const MAPS = { diff: 'Diffuse', nor_gl: 'nor_gl', arm: 'arm' };

const files = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(js|ts)$/.test(n) ? [p] : [];
  });

const wanted = new Set();
for (const f of files(SRC)) {
  // (photos.ts's own comments show how to call it, with a made-up id or two)
  if (f.endsWith('photos.ts')) continue;
  for (const m of readFileSync(f, 'utf8').matchAll(/\bphoto\(\s*'([a-z0-9_]+)'/g)) wanted.add(m[1]);
}

const listOnly = process.argv.includes('--list');
const curl = (args) => execFileSync('curl', ['-fsS', '-m', '300', '-A', 'my-world-photos', ...args], { maxBuffer: 1 << 26 });
let fetched = 0;
const credits = [];
for (const id of [...wanted].sort()) {
  const dir = join(OUT, id);
  const missing = Object.keys(MAPS).filter((m) => !existsSync(join(dir, `${m}.jpg`)));
  if (listOnly) {
    if (missing.length) console.log('would fetch', id, missing.join(' '));
    continue;
  }
  const info = JSON.parse(curl([`https://api.polyhaven.com/info/${id}`]).toString());
  credits.push({ id, name: info.name, authors: Object.keys(info.authors || {}), metres: (info.dimensions || []).map((mm) => Math.round(mm) / 1000) });
  if (!missing.length) continue;
  mkdirSync(dir, { recursive: true });
  const urls = JSON.parse(curl([`https://api.polyhaven.com/files/${id}`]).toString());
  for (const m of missing) {
    const url = urls[MAPS[m]]?.[RES]?.jpg?.url;
    if (!url) {
      console.warn(`${id}: no ${MAPS[m]} at ${RES}`);
      continue;
    }
    curl(['-o', join(dir, `${m}.jpg`), url]);
    fetched++;
  }
  console.log('fetched', id);
}

if (!listOnly) {
  const lines = credits.map((c) => `| \`${c.id}\` | ${c.name} | ${c.authors.join(', ')} | ${c.metres.join(' × ')} m | https://polyhaven.com/a/${c.id} |`);
  writeFileSync(
    join(OUT, 'README.md'),
    `# Photographs of real surfaces\n\nScans of real surfaces, from [Poly Haven](https://polyhaven.com), all CC0\n(public domain). Fetched by \`npm run photos\` (tools/photos.mjs) for the\nphoto('id') calls in src/; how they are used is in src/render/photos.ts.\nThis list is written by the same tool.\n\n| id | name | by | covers | |\n|---|---|---|---|---|\n${lines.join('\n')}\n`,
  );
  console.log(`${wanted.size} photos asked for in src/, ${fetched} files fetched into ${OUT}`);
}
