// A play-through in a real (headless) browser: boot the built game and play
// it the way a visitor does, one part after another.
//
//   npm run smoke                  build, then play through
//   node test/smoke.mjs --report out.json --shots dir
//   node test/smoke.mjs --failures dir     a picture of each part that failed, as it left the game
//   node test/smoke.mjs build fires        only those parts
//
// It drives the game the way a visitor does — keys, the use/alt buttons, the
// crosshair — and reads results through the console API (window.world), so it
// keeps working when the insides are rearranged. That is what it is for.
//
// The parts are the files in test/smoke/, played in the order of their names
// (20-fires.mjs before 30-blueprints.mjs) in one browser, one after another.
// A feature's part is a file of its own, so adding to the play-through is
// adding a file, not editing this one or anyone else's:
//
//   // test/smoke/20-fires.mjs
//   export default async function ({ page, step, key, made }) {
//     await step('a campfire', async () => { ... return facts; });
//   }
//
// What a part is handed:
//   page           the Playwright page, with the game open in it
//   step(name, fn) one thing done and checked; what fn returns goes in the report
//   key(code)      press a key, and let the game see it
//   take(id)       take a tool in hand as a visitor does: its kit's number
//                  key, pressed again until it's the one ('roof', 'fire')
//   frames(n)      let n frames go by
//   open(extra)    load the game again, with more on the address (&creative, &reset)
//   shot(name)     a screenshot, when --shots was asked for; numbered as taken
//   state()        what has been changed about the world, the way a save sees it
//   made           what earlier parts left for later ones: made.cabin, from 10-build
// and in the page, T (below): standing and aiming, the buttons, what grows
// where. A part that wants more of those exports `inPage`, a function run in
// the page each time it loads, to add them to T.
//
// The play starts in a fresh world, and each part starts where the last one
// left off: what it needs of that, and what it leaves, is at the top of its
// file. Pick a new part's number by what it should follow (and note that
// 30-blueprints starts the world again from nothing). Two parts with one
// number play in name order.
//
// Naming parts plays only those, still in order, from a fresh world. One that
// builds on another's work wants that one named too: `build fires`.
//
// Every part is played, whatever happens to the ones before it, and the run
// ends by listing the parts that failed; it exits 1 if any did.

import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { preview } from 'vite';

// Playwright comes with `npm install`; its browser is a download of its own.
let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.error('the play-through needs Playwright: npm install && npx playwright install chromium');
  process.exit(2);
}

const FLAGS = ['report', 'shots', 'failures'];
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? null : process.argv[i + 1];
};
const reportFile = arg('report');
const shotDir = arg('shots');
const failDir = arg('failures') || shotDir;
// Anything else on the command line is the name of a part to play.
const asked = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !FLAGS.includes(all[i - 1]?.slice(2)));
for (const dir of [shotDir, failDir]) if (dir) mkdirSync(dir, { recursive: true });
if (!existsSync(new URL('../dist/index.html', import.meta.url))) {
  console.error('no dist/: run `npm run build` first (or `npm run smoke`)');
  process.exit(2);
}

// ── The parts ───────────────────────────────────────────────────────────────

const PARTS = new URL('./smoke/', import.meta.url);
let parts = [];
for (const file of readdirSync(PARTS).filter((f) => /^\d\d-.+\.mjs$/.test(f)).sort()) {
  const module = await import(new URL(file, PARTS));
  parts.push({ file, name: file.slice(3, -4), play: module.default, inPage: module.inPage });
}
const unknown = asked.filter((a) => !parts.some((p) => p.name === a));
if (unknown.length) {
  console.error(`no such part: ${unknown.join(', ')} (there are: ${parts.map((p) => p.name).join(', ')})`);
  process.exit(2);
}
// Every part's helpers go into the page, whichever parts are played.
const inPage = parts.filter((p) => p.inPage).map((p) => p.inPage);
if (asked.length) parts = parts.filter((p) => asked.includes(p.name));

const QUERY = 'seed=20261119&time=13&animals=0&mute&q=low&view=2&lines=120';
const report = { steps: {} };
const problems = [];

const server = await preview({ preview: { port: 0, strictPort: false }, logLevel: 'silent' });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
// One browser context for the whole play, so what the game saves (in the
// page's storage) outlives any one page of it (reopen()).
const context = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
const newPage = async () => {
  const p = await context.newPage();
  p.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  p.on('pageerror', (e) => problems.push(`error: ${e.message}`));
  return p;
};
let page = await newPage();

// ── Driving the game ────────────────────────────────────────────────────────

async function open(extra = '') {
  await page.goto(`${base}?${QUERY}${extra}`);
  await page.waitForFunction(() => document.getElementById('loader')?.classList.contains('gone') && window.world, null, { timeout: 120000 });
  await page.evaluate(installHelpers);
  for (const more of inPage) await page.evaluate(more);
  await frames(5);
}

// The game opened again after a part has failed. What it left may be too
// busy to go anywhere (drawing its picture in software GL, the first time
// anything is drawn, can take minutes on a slow machine), so if the page
// won't, it's closed and the game opened in a new one: what was saved is
// kept in the context either way.
async function reopen() {
  try {
    await open();
  } catch {
    await page.close().catch(() => {});
    page = await newPage();
    await open();
  }
}

// Helpers that live in the page. Everything here goes through window.world.
function installHelpers() {
  const w = window.world;
  const T = {};
  const TREES = ['pine', 'broad', 'birch'];
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  T.frames = async (n) => {
    for (let i = 0; i < n; i++) await frame();
  };
  T.until = async (fn, ms = 60000) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      if (fn()) return true;
      await frame();
    }
    return false;
  };
  // Set down somewhere new (`go here` on the map, a teleport), and the ground
  // round you in: until it is, the teleport isn't done, and once it is it
  // sets you down again where it put you, wherever you've gone since (and the
  // map says where you are, over whatever else is on the screen by then).
  // -> whether it came in
  T.settled = async (ms = 60000) => {
    const ok = await T.until(() => w.chunks.isFullyLoaded(), ms);
    await T.frames(10);
    return ok;
  };
  // Stand at (px, pz) and put the crosshair on (gx, gy, gz).
  T.standAndAim = async (px, pz, gx, gy, gz) => {
    const yaw = Math.atan2(gx - px, gz - pz);
    await w.teleport(px, pz, yaw);
    const p = w.player.pos;
    const dx = p.x - gx;
    const dy = p.y + 1.45 - gy;
    const dz = p.z - gz;
    w.look(Math.atan2(dx, dz), Math.asin(dy / Math.hypot(dx, dy, dz)), 3);
    await T.frames(12);
  };
  // Stand `back` metres from a spot on the ground, on the side toward `from`.
  T.aimGround = async (gx, gz, back = 3, from = null) => {
    let ax = from ? from.x - gx : 0.6;
    let az = from ? from.z - gz : 0.8;
    const l = Math.hypot(ax, az) || 1;
    ax /= l;
    az /= l;
    await T.standAndAim(gx + ax * back, gz + az * back, gx, w.chunks.heightAt(gx, gz), gz);
  };
  T.press = (which, down) => {
    const el = document.getElementById(which === 'alt' ? 'act-alt' : 'act-use');
    el.dispatchEvent(new PointerEvent(down ? 'pointerdown' : 'pointerup', { bubbles: true, cancelable: true }));
  };
  T.tap = async (which) => {
    T.press(which, true);
    await T.frames(3);
    T.press(which, false);
    await T.frames(3);
  };
  // Hold a button until fn() is true. -> whether it got there.
  T.hold = async (which, fn, ms = 60000) => {
    T.press(which, true);
    const ok = await T.until(fn, ms);
    T.press(which, false);
    await T.frames(4);
    return ok;
  };
  // Software GL draws this forest at about 4 frames a second, and the game
  // slows time down rather than take big steps. So the play-through runs with
  // the picture off, and turns it on for screenshots.
  const draw = w.pipeline.render.bind(w.pipeline);
  T.picture = (on) => {
    w.pipeline.render = on ? draw : () => {};
  };
  T.picture(false);
  T.plants = (x, z, r, kinds) => {
    const out = [];
    w.chunks.forEachPlant(x, z, r, kinds, (ch, kind, k, px, py, pz, s) => out.push({ kind, x: px, y: py, z: pz, s, d: Math.hypot(px - x, pz - z) }));
    return out.sort((a, b) => a.d - b.d);
  };
  T.trees = (x, z, r) => T.plants(x, z, r, TREES);
  T.prompt = () => document.getElementById('prompt').textContent;
  T.tool = () => w.builder.tool; // the id of the tool in hand
  T.slot = () => [...document.querySelectorAll('#hotbar .slot')].findIndex((b) => b.getAttribute('aria-pressed') === 'true') + 1; // and its slot on the bar
  // What has been changed about the world, the way a save sees it.
  T.state = () => {
    const b = w.builder;
    const round = (v) => Math.round(v * 1000) / 1000;
    const forest = b.forest.serialize();
    return {
      inv: Object.fromEntries(Object.entries(b.inv).map(([k, v]) => [k, round(v)])),
      datum: b.datum ? [round(b.datum.x), round(b.datum.z)] : null,
      moved: b.terrain.map.size,
      removed: Object.values(forest.removed).flat().sort(),
      stumps: forest.stumps.map((s) => `${s.kind}@${round(s.x)},${round(s.z)}`).sort(),
      felled: forest.felled.map((f) => `${f.kind}@${round(f.x)},${round(f.z)}:${f.state}:${f.left}`).sort(),
      buildings: b.buildings.serialize(),
    };
  };
  window.T = T;
}

const frames = (n) => page.evaluate((k) => T.frames(k), n);
const key = async (code) => {
  await page.keyboard.press(code);
  await frames(3);
};
const take = async (id) => {
  for (let i = 0; i < 9; i++) {
    const { now, slot } = await page.evaluate((t) => ({ now: world.builder.tool, slot: world.builder.slotOf(t) }), id);
    if (now === id) return;
    if (!slot || slot > 10) throw new Error(`there is no key for the ${id}`);
    await key(`Digit${slot % 10}`);
  }
  throw new Error(`couldn't take the ${id} in hand`);
};
const state = () => page.evaluate(() => T.state());
let shots = 0;
const shot = async (name, numbered = true) => {
  if (!shotDir) return;
  await page.evaluate(() => T.picture(true));
  await frames(3);
  await page.screenshot({ path: `${shotDir}/${numbered ? `${String(++shots).padStart(2, '0')}-` : ''}${name}.png` });
  await page.evaluate(() => T.picture(false));
};
// The game as a part that failed left it, where --failures (or --shots) says.
// Given up on after SHOT_WAIT ms: the page may be too busy to draw it.
const SHOT_WAIT = 60000;
const failureShot = async (part) => {
  if (!failDir) return;
  let late;
  const shoot = async () => {
    await page.evaluate(() => T.picture(true));
    await frames(3);
    await page.screenshot({ path: `${failDir}/failure-${part}.png` });
    await page.evaluate(() => T.picture(false));
  };
  try {
    await Promise.race([shoot(), new Promise((_, no) => (late = setTimeout(() => no(new Error('no picture: the page is too busy')), SHOT_WAIT)))]);
  } finally {
    clearTimeout(late);
  }
};
const step = async (name, fn) => {
  if (name in report.steps) throw new Error(`two steps are called "${name}"`);
  const t0 = Date.now();
  const facts = await fn();
  report.steps[name] = facts;
  console.log(`  ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  return facts;
};

// ── The play-through ────────────────────────────────────────────────────────

// What parts leave for later ones. Asking for what nobody has left says so,
// rather than failing somewhere further on.
const made = new Proxy(
  {},
  {
    get(left, what) {
      if (!(what in left)) throw new Error(`a part wants made.${String(what)}, which no part played before it has left: name the part that leaves it too`);
      return left[what];
    },
  },
);
// A part that fails doesn't end the play: the rest are played too, so one run
// says everything that is broken, not just the first of it. The page is
// opened again first, so the next part starts from a game that works, with
// what was built and saved still there and whatever the failed part was in
// the middle of gone. (A later part that needed what the failed one would
// have left fails as well, and says so.)
const failed = []; // [{ part, message }]
try {
  await open('&reset&clearbuild');
  for (const part of parts) {
    console.log(part.name);
    const seen = problems.length;
    try {
      await part.play({ page, step, key, take, frames, open, shot, state, made });
      if (problems.length > seen) throw new Error(`something went wrong in the page:\n${problems.slice(seen).join('\n')}`);
    } catch (err) {
      failed.push({ part: part.name, message: err.message });
      console.error(`  FAILED: ${err.message}`);
      await failureShot(part.name).catch(() => {});
      if (part !== parts.at(-1)) await reopen();
    }
  }
  const played = asked.length ? ` (${parts.map((p) => p.name).join(', ')})` : '';
  if (!failed.length) console.log(`\nplayed through${played}: all good`);
  else {
    console.error(`\nFAILED: ${failed.length} of ${parts.length} parts${played}`);
    for (const f of failed) console.error(`  ${f.part}: ${f.message.split('\n')[0]}`);
    process.exitCode = 1;
  }
} catch (err) {
  // the game wouldn't open at all, or wouldn't open again
  console.error(`\nFAILED: ${err.message}`);
  if (problems.length) console.error(problems.join('\n'));
  process.exitCode = 1;
} finally {
  report.problems = problems;
  report.failed = failed;
  if (reportFile) writeFileSync(reportFile, `${JSON.stringify(report, null, 1)}\n`);
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
