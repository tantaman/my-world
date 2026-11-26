// Builds the page to be shown to others: Vite's mode "publish", which puts
// our own words on the signs and the overlay (src/words.js) and caps the
// picture's size, into abduction/dist/. Then writes dist/page.html, the same
// page without its <html>, <head> and <body> wrapper, for hosts that wrap a
// page themselves (an Artifact on claude.ai), and lists the files that go
// with it.
//
//   node abduction/tools/publish.mjs      (npm run abduction:publish)
import { build } from 'vite';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './browser.mjs';

const DIST = join(ROOT, 'dist');
await build({ configFile: join(ROOT, 'vite.config.js'), root: ROOT, mode: 'publish', logLevel: 'warn' });

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
writeFileSync(join(DIST, 'page.html'), `${head.trim()}\n${body.trim()}\n`);

const assets = readdirSync(join(DIST, 'assets'));
console.log(`built ${DIST}: index.html, page.html, and ${assets.map((a) => `assets/${a}`).join(', ')}`);
