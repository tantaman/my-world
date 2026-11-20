// A play-through in a real (headless) browser: boot the built game, fell a
// tree, buck and hew it, pick up a stone, dig, raise a small cabin, roof it,
// light a campfire in it, then reload and check all of it is still there;
// wade into a stream and be carried by it.
//
//   npm run smoke                  build, then play through
//   node test/smoke.mjs --report out.json --shots dir
//
// It drives the game the way a visitor does — keys, the use/alt buttons, the
// crosshair — and reads results through the console API (window.world), so it
// keeps working when the insides are rearranged. That is what it is for.

import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { preview } from 'vite';

// Playwright is not a dependency of the game. Where it isn't already on the
// machine: npm i -D playwright && npx playwright install chromium
let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.error('the play-through needs Playwright: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? null : process.argv[i + 1];
};
const reportFile = arg('report');
const shotDir = arg('shots');
if (shotDir) mkdirSync(shotDir, { recursive: true });
if (!existsSync(new URL('../dist/index.html', import.meta.url))) {
  console.error('no dist/: run `npm run build` first (or `npm run smoke`)');
  process.exit(2);
}

const QUERY = 'seed=20261119&time=13&animals=0&mute&q=low&view=2&lines=120';
const report = { steps: {} };
const problems = [];

const server = await preview({ preview: { port: 0, strictPort: false }, logLevel: 'silent' });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`error: ${e.message}`));

// ── Driving the game ────────────────────────────────────────────────────────

async function open(extra = '') {
  await page.goto(`${base}?${QUERY}${extra}`);
  await page.waitForFunction(() => document.getElementById('loader')?.classList.contains('gone') && window.world, null, { timeout: 120000 });
  await page.evaluate(installHelpers);
  await frames(5);
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
  T.tool = () => [...document.querySelectorAll('#hotbar .slot')].findIndex((b) => b.getAttribute('aria-pressed') === 'true') + 1;
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
const state = () => page.evaluate(() => T.state());
const shot = async (name) => {
  if (!shotDir) return;
  await page.evaluate(() => T.picture(true));
  await frames(3);
  await page.screenshot({ path: `${shotDir}/${name}.png` });
  await page.evaluate(() => T.picture(false));
};
const step = async (name, fn) => {
  const t0 = Date.now();
  const facts = await fn();
  report.steps[name] = facts;
  console.log(`  ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  return facts;
};

// ── The play-through ────────────────────────────────────────────────────────

try {
  console.log('gathering');
  await open('&reset&clearbuild');

  await step('boot', async () => {
    const f = await page.evaluate(() => ({
      tools: [...document.querySelectorAll('#hotbar .slot')].map((b) => b.querySelector('.long').textContent),
      helpRows: document.querySelectorAll('#help .row').length,
      inventory: document.getElementById('inv').textContent,
      coords: document.getElementById('coords').textContent,
      chunks: world.stats().chunks,
      plants: world.stats().instances,
      spawn: [Math.round(world.player.pos.x), Math.round(world.player.pos.z)],
    }));
    assert.ok(f.tools.length >= 7, 'the tool bar is there');
    assert.ok(f.chunks > 0 && f.plants > 0, 'the forest streamed in');
    await shot('1-boot');
    return f;
  });

  const tree = await step('fell a tree', async () => {
    const t = await page.evaluate(async () => {
      const p = world.player.pos;
      const tree = T.trees(p.x, p.z, 60).find((t) => t.s > 0.7 && T.trees(t.x, t.z, 3).length === 1);
      const back = 1.5 + tree.s * 0.4;
      const ux = (p.x - tree.x) / tree.d;
      const uz = (p.z - tree.z) / tree.d;
      await T.standAndAim(tree.x + ux * back, tree.z + uz * back, tree.x, tree.y + 1, tree.z);
      return tree;
    });
    await key('Digit2');
    assert.equal(await page.evaluate(() => T.tool()), 2, 'the axe is in hand');
    const prompt = await page.evaluate(() => T.prompt());
    assert.match(prompt, /chop the/, `aiming at the tree (prompt: "${prompt}")`);
    const fell = await page.evaluate(() => T.hold('use', () => world.builder.forest.felled.size > 0 && !world.builder.forest.falling, 90000));
    assert.ok(fell, 'the tree came down');
    await shot('2-felled');
    const s = await state();
    assert.equal(s.stumps.length, 1);
    assert.equal(s.removed.length, 1);
    return { kind: t.kind, at: [t.x, t.z], prompt, ...s };
  });

  await step('limb and buck it', async () => {
    const ok = await page.evaluate(async () => {
      const F = world.builder.forest;
      const f = [...F.felled.values()][0];
      const d = F.axisOf(f);
      const along = Math.min(3, F.reach(f) * 0.3);
      const gx = f.x + d.x * along;
      const gz = f.z + d.z * along;
      // stand beside the trunk, not on it
      await T.standAndAim(gx - d.z * 1.7, gz + d.x * 1.7, gx, world.chunks.heightAt(gx, gz), gz);
      return T.hold('use', () => F.felled.size === 0, 120000);
    });
    assert.ok(ok, 'the trunk is all bucked');
    const s = await state();
    assert.ok(s.inv.log > 0, 'logs in hand');
    return { inv: s.inv, felled: s.felled };
  });

  await step('hew timbers', async () => {
    const before = (await state()).inv;
    const ok = await page.evaluate(() => T.hold('alt', () => world.builder.inv.timber >= 1.5, 30000));
    assert.ok(ok, 'timber hewn');
    await frames(60); // let the swing in hand finish
    const inv = (await state()).inv;
    assert.ok(Math.abs(inv.log + inv.timber - before.log - before.timber) < 1e-6, 'a metre of log makes a metre of timber');
    return { wood: inv.log + inv.timber };
  });

  await step('pick up a stone', async () => {
    await key('Digit1');
    const rock = await page.evaluate(async () => {
      const p = world.player.pos;
      const rock = T.plants(p.x, p.z, 80, ['rock']).find((r) => r.s <= 0.75 && T.trees(r.x, r.z, 1.5).length === 0);
      await T.aimGround(rock.x, rock.z, 2.2, p);
      return rock;
    });
    const prompt = await page.evaluate(() => T.prompt());
    assert.match(prompt, /pick up/, `aiming at the stone (prompt: "${prompt}")`);
    await page.evaluate(() => T.tap('use'));
    assert.ok(await page.evaluate(() => T.until(() => world.builder.inv.stone > 0, 10000)), 'a stone in hand');
    const s = await state();
    return { at: [rock.x, rock.z], stone: s.inv.stone, removed: s.removed };
  });

  await step('dig, fill and stake', async () => {
    await key('Digit3');
    await page.evaluate(async () => {
      const p = world.player.pos;
      // open ground a few steps off
      let spot = null;
      for (let r = 6; r < 40 && !spot; r += 3) {
        for (let a = 0; a < 6.28 && !spot; a += 0.5) {
          const x = p.x + Math.sin(a) * r;
          const z = p.z + Math.cos(a) * r;
          if (T.plants(x, z, 5, ['pine', 'broad', 'birch', 'rock']).length === 0) spot = { x, z };
        }
      }
      await T.aimGround(spot.x, spot.z, 3);
    });
    const prompt = await page.evaluate(() => T.prompt());
    assert.match(prompt, /dig/, `aiming at the ground (prompt: "${prompt}")`);
    assert.ok(await page.evaluate(() => T.hold('use', () => world.builder.inv.soil > 0.2, 20000)), 'soil dug');
    const dug = await state();
    assert.ok(dug.moved > 0, 'the ground moved');
    assert.ok(await page.evaluate((had) => T.hold('alt', () => world.builder.inv.soil < had - 0.05, 20000), dug.inv.soil), 'soil filled back');
    await key('KeyG');
    const s = await state();
    assert.ok(s.datum, 'a grade stake is set');
    await shot('3-dug');
    return { movedSome: s.moved > 0, staked: !!s.datum, prompt };
  });

  const gathered = await state();
  await page.evaluate(() => T.frames(120)); // the local copy is written a moment after a change
  await step('gathering is remembered', async () => {
    await open();
    const s = await state();
    assert.deepEqual({ ...s, moved: 0, datum: 0 }, { ...gathered, moved: 0, datum: 0 });
    assert.equal(s.moved, gathered.moved);
    assert.deepEqual(s.datum, gathered.datum);
    return { same: true, tree: tree.kind };
  });

  console.log('building');
  await open('&reset&clearbuild&creative');

  const site = await step('find a level site', async () => {
    const s = await page.evaluate(() => {
      const p = world.player.pos;
      const H = (x, z) => world.chunks.heightAt(x, z);
      const wet = { level: 0, depth: 0, flowX: 0, flowZ: 0, foam: 0 };
      const x0 = Math.round(p.x);
      const z0 = Math.round(p.z);
      for (let r = 2; r < 70; r++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const x = x0 + dx;
            const z = z0 + dz;
            const hs = [H(x, z), H(x + 4, z), H(x, z + 3), H(x + 4, z + 3)];
            if (Math.max(...hs) - Math.min(...hs) > 0.08) continue;
            if (T.plants(x + 2, z + 1.5, 6, ['pine', 'broad', 'birch', 'rock']).length) continue;
            if (world.chunks.waterAt(x + 2, z + 1.5, wet) && wet.depth > -0.5) continue;
            return { x, z };
          }
        }
      }
      return null;
    });
    assert.ok(s, 'somewhere level to build');
    return s;
  });
  const corners = [[0, 0], [4, 0], [0, 3], [4, 3]].map(([dx, dz]) => [site.x + dx, site.z + dz]);
  const middle = { x: site.x + 2, z: site.z + 1.5 };

  await step('set four footings', async () => {
    await key('Digit4');
    const prompts = [];
    for (const [x, z] of corners) {
      await page.evaluate(([gx, gz, m]) => T.aimGround(gx, gz, 2.6, m), [x, z, middle]);
      prompts.push(await page.evaluate(() => T.prompt()));
      const n = await page.evaluate(() => (world.builder.buildings.list[0] ? world.builder.buildings.list[0].footings.size : 0));
      const ok = await page.evaluate((had) => T.hold('use', () => (world.builder.buildings.list[0] ? world.builder.buildings.list[0].footings.size : 0) > had, 15000), n);
      assert.ok(ok, `a footing at ${x},${z} (prompt: "${prompts.at(-1)}")`);
    }
    const s = await state();
    assert.equal(s.buildings.length, 1);
    assert.equal(s.buildings[0].footings.length, 4);
    return { prompts: prompts.map((p) => p.replace(/\d+ cm/, 'N cm')), footings: s.buildings[0].footings.map(([x, z]) => [x, z]) };
  });

  // Lay a log between two nodes with the wall tool, by hand.
  const lay = async (a, b) => {
    const count = () => page.evaluate(() => world.builder.buildings.list[0].logs.length);
    const had = await count();
    await page.evaluate(([gx, gz, m]) => T.aimGround(gx, gz, 2.6, m), [a[0], a[1], middle]);
    await page.evaluate(() => T.tap('use'));
    await page.evaluate(([gx, gz, m]) => T.aimGround(gx, gz, 2.6, m), [b[0], b[1], middle]);
    const prompt = await page.evaluate(() => T.prompt());
    await page.evaluate(() => T.tap('use'));
    await page.evaluate(() => T.tap('alt')); // done with this wall
    assert.equal(await count(), had + 1, `a log from ${a} to ${b} (prompt: "${prompt}")`);
    return prompt;
  };

  await step('lay the first course', async () => {
    await key('Digit5');
    const prompts = [];
    prompts.push(await lay(corners[0], corners[1]));
    prompts.push(await lay(corners[2], corners[3]));
    prompts.push(await lay(corners[0], corners[2]));
    prompts.push(await lay(corners[1], corners[3]));
    const s = await state();
    await shot('4-first-course');
    return { prompts, logs: s.buildings[0].logs };
  });

  await step('cut the notches', async () => {
    await key('Digit2');
    const loose = () => page.evaluate(() => world.builder.buildings.list[0].logs.filter((L) => !L.seated).length);
    assert.equal(await loose(), 2, 'the two crossing logs ride high');
    const prompts = [];
    for (const [x, z] of corners) {
      await page.evaluate(([gx, gz, m]) => T.standAndAim(m.x, m.z, gx, world.builder.buildings.list[0].y0 + 0.3, gz), [x, z, middle]);
      prompts.push(await page.evaluate(() => T.prompt()));
      const cut = () => world.builder.buildings.list[0].logs.reduce((n, L) => n + L.notches.length, 0);
      const had = await page.evaluate(cut);
      const ok = await page.evaluate(([fn, n]) => T.hold('use', () => new Function(`return (${fn})()`)() > n, 15000), [cut.toString(), had]);
      assert.ok(ok, `a notch at ${x},${z} (prompt: "${prompts.at(-1)}")`);
    }
    assert.equal(await loose(), 0, 'everything is notched in');
    return { prompts, logs: (await state()).buildings[0].logs };
  });

  await step('raise the walls and roof it', async () => {
    // The rest of the walls go up through the same rules the tools use; laying
    // twenty more logs by crosshair would only test the crosshair again.
    await page.evaluate(([c]) => {
      const B = world.builder.buildings;
      const b = B.list[0];
      const walls = [['x', c[0][1], c[0][0], c[1][0]], ['x', c[2][1], c[2][0], c[3][0]], ['z', c[0][0], c[0][1], c[2][1]], ['z', c[1][0], c[1][1], c[3][1]]];
      for (let course = 1; course < 6; course++) {
        for (const [axis, line, s0, s1] of walls) {
          const L = B.addLog(b, 'log', axis, line, s0, s1);
          for (const n of [...L.below]) B.notch(b, L, n);
        }
      }
    }, [corners]);
    await key('Digit7');
    await page.evaluate((m) => T.aimGround(m.x, m.z, 1.2), middle);
    const prompt = await page.evaluate(() => T.prompt());
    assert.match(prompt, /raise the roof/, `aiming into the room (prompt: "${prompt}")`);
    await page.evaluate(() => T.tap('use'));
    const s = await state();
    assert.equal(s.buildings[0].roofs.length, 1, 'the roof is on');
    await page.evaluate((m) => T.standAndAim(m.x - 9, m.z - 7, m.x, world.builder.buildings.list[0].y0 + 1.5, m.z), middle);
    await frames(20);
    await shot('5-cabin');
    return { prompt, logs: s.buildings[0].logs.length, roofs: s.buildings[0].roofs };
  });

  await step('walls keep you out', async () => {
    return page.evaluate(async (m) => {
      // walk at the wall from outside: you should end up stopped against it
      await world.teleport(m.x, m.z - 5, 0);
      world.look(Math.PI, 0.4, 4);
      const down = (type) => dispatchEvent(new KeyboardEvent(type, { code: 'KeyW', bubbles: true }));
      down('keydown');
      await T.frames(150);
      down('keyup');
      await T.frames(10);
      const z = world.player.pos.z;
      return { stoppedOutside: z < m.z - 1.5 && z > m.z - 5 };
    }, middle).then((f) => {
      assert.ok(f.stoppedOutside, 'the wall stopped you');
      return f;
    });
  });

  const built = await state();
  await page.evaluate(() => T.frames(120));
  await step('the cabin is remembered', async () => {
    await open('&creative');
    const s = await state();
    assert.deepEqual(s.buildings, built.buildings);
    return { same: true };
  });

  await step('take the roof down', async () => {
    await key('Digit7');
    await page.evaluate((m) => T.standAndAim(m.x - 9, m.z - 7, m.x - 0.8, world.builder.buildings.list[0].y0 + 2.6, m.z - 1), middle);
    const prompt = await page.evaluate(() => T.prompt());
    assert.match(prompt, /take the roof down/, `aiming at the roof (prompt: "${prompt}")`);
    await page.evaluate(() => T.tap('alt'));
    const s = await state();
    assert.equal(s.buildings[0].roofs.length, 0);
    return { prompt };
  });

  await step('a campfire', async () => {
    // In the cabin, now it has no roof: a fire wants open sky.
    const node = { x: site.x + 2, z: site.z + 1 };
    const aim = () => page.evaluate((n) => T.aimGround(n.x, n.z, 1.2), node);
    const fire = () => page.evaluate(() => {
      const f = world.fires.list.values().next().value;
      return f ? { state: world.fires.state(f).state, wood: f.wood, ash: f.ash } : null;
    });
    // ...and for the swing that did it to finish (a click mid-swing goes
    // nowhere), and a few frames more for the prompt to catch up
    const until = async (fn, arg) => {
      const ok = await page.evaluate(([f, a]) => T.until(() => new Function('a', `return (${f})(a)`)(a) && !world.builder.act, 20000), [fn.toString(), arg]);
      await frames(3);
      return ok;
    };
    const prompts = {};
    await key('Digit8');
    assert.equal(await page.evaluate(() => world.builder.tool), 'fire', '8 is the campfire');
    await aim();
    prompts.ring = await page.evaluate(() => T.prompt());
    assert.match(prompts.ring, /clear a fire pit/, `aiming at open ground (prompt: "${prompts.ring}")`);
    assert.ok(await page.evaluate(() => T.hold('use', () => world.fires.list.size === 1, 20000)), 'a ring of stones');
    await frames(3);
    assert.deepEqual(await fire(), { state: 'ring', wood: 0, ash: 0 });

    prompts.lay = await page.evaluate(() => T.prompt());
    assert.match(prompts.lay, /lay a fire/, `aiming at the ring (prompt: "${prompts.lay}")`);
    await page.evaluate(() => T.tap('use'));
    assert.ok(await until(() => world.fires.serialize()[0][3] === 1), 'wood laid in it');
    prompts.light = await page.evaluate(() => T.prompt());
    assert.match(prompts.light, /light it/, `(prompt: "${prompts.light}")`);
    await page.evaluate(() => T.tap('use'));
    assert.ok(await until(() => world.fires.serialize()[0][4] > 0), 'it is lit');
    assert.equal((await fire()).state, 'burning');
    await frames(30);
    prompts.feed = await page.evaluate(() => T.prompt());
    assert.match(prompts.feed, /put on more wood/, `(prompt: "${prompts.feed}")`);
    await page.evaluate(() => T.tap('use'));
    assert.ok(await until(() => world.fires.serialize()[0][3] === 1.5), 'more wood on it');
    const lit = await page.evaluate(() => ({ light: world.fires.lights[0].intensity, heard: world.fires.heard.length, solid: world.solids.owners.has(world.fires.list.values().next().value) }));
    assert.ok(lit.light > 0 && lit.heard === 1, 'it lights the room and can be heard');
    assert.ok(lit.solid, 'and you walk round it');
    await shot('8-campfire');

    // no roof over a fire
    await key('Digit7');
    await page.evaluate((m) => T.aimGround(m.x, m.z, 1.2), middle);
    prompts.roof = await page.evaluate(() => T.prompt());
    assert.match(prompts.roof, /fire ring in this room and no chimney/, `the roof goes round it (prompt: "${prompts.roof}")`);
    await page.evaluate(() => T.tap('use'));
    assert.equal(await page.evaluate(() => world.builder.buildings.list[0].roofs.length), 0, 'no roof went up');

    await key('Digit8');
    await aim();
    await page.evaluate(() => T.tap('alt'));
    assert.ok(await until(() => world.fires.serialize()[0][4] === 0), 'put out');
    const out = await fire();
    assert.equal(out.state, 'laid', 'what had not burned is left to light again');
    assert.equal(out.ash, 2);

    const kept = await page.evaluate(() => world.fires.serialize());
    await page.evaluate(() => T.frames(120));
    await open('&creative');
    assert.deepEqual(await page.evaluate(() => world.fires.serialize()), kept, 'the fire is remembered');

    await key('Digit8');
    await aim();
    prompts.take = await page.evaluate(() => T.prompt());
    assert.match(prompts.take, /take it apart/, `(prompt: "${prompts.take}")`);
    await page.evaluate(() => T.tap('alt'));
    assert.ok(await until(() => world.fires.list.size === 0), 'the ring is taken apart');
    await key('Digit7');
    await page.evaluate((m) => T.aimGround(m.x, m.z, 1.2), middle);
    prompts.roofAgain = await page.evaluate(() => T.prompt());
    assert.match(prompts.roofAgain, /raise the roof/, `and the room can be roofed again (prompt: "${prompts.roofAgain}")`);
    return { prompts: Object.fromEntries(Object.entries(prompts).map(([k, v]) => [k, v.replace(/\d+ min/, 'N min')])), kept: kept.map(([x, z, y, wood, lit, ash]) => [x - site.x, z - site.z, wood, lit, ash]) };
  });

  console.log('around the edges');
  await step('map and save panels', async () => {
    const hidden = (id) => page.evaluate((i) => document.getElementById(i).getAttribute('aria-hidden'), id);
    await key('KeyM');
    await frames(30);
    assert.equal(await hidden('map'), 'false', 'M opens the map');
    const drawn = await page.evaluate(() => {
      const c = document.getElementById('map-canvas');
      const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < px.length; i += 4000) if (px[i] > 0) n++;
      return n;
    });
    assert.ok(drawn > 10, 'the map is drawn');
    await shot('6-map');
    await key('Escape');
    assert.equal(await hidden('map'), 'true', 'Esc closes it');
    await key('KeyL');
    assert.equal(await hidden('share'), 'false', 'L opens the save panel');
    await key('Escape');
    assert.equal(await hidden('share'), 'true', 'and Esc closes it');
    await key('KeyH');
    const help = await page.evaluate(() => document.getElementById('help').classList.contains('open'));
    assert.ok(help, 'H opens help');
    await key('KeyH');
    return { drawn: drawn > 10 };
  });

  await step('look settings', async () => {
    const before = await page.evaluate(() => ({ soft: world.pipeline.softness, on: world.pipeline.enabled, hours: world.sky.hours }));
    await key('Equal');
    await key('KeyP');
    const after = await page.evaluate(() => ({ soft: world.pipeline.softness, on: world.pipeline.enabled }));
    assert.ok(after.soft > before.soft, '= softens the pixels');
    assert.equal(after.on, !before.on, 'P turns the pixel art off');
    await key('KeyP');
    await key('Minus');
    await page.keyboard.down('Period');
    await frames(30);
    await page.keyboard.up('Period');
    const hours = await page.evaluate(() => world.sky.hours);
    assert.ok(hours > before.hours, '. moves the day on');
    return { ok: true };
  });

  await step('leave a mark', async () => {
    await key('KeyM');
    await frames(20);
    const box = await page.locator('#map-canvas').boundingBox();
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
    await frames(5);
    await page.keyboard.type('the level spot');
    await page.keyboard.press('Enter');
    await frames(5);
    const made = await page.evaluate(() => world.marks.list().map((m) => m.name));
    assert.deepEqual(made, ['the level spot'], 'a click on the map leaves a mark, and it takes a name');
    await page.evaluate(() => {
      const m = world.marks.list()[0];
      world.marks.setTracked(m.id);
    });
    await key('Escape');
    await frames(5);
    const hud = await page.evaluate(() => document.getElementById('track').textContent);
    assert.match(hud, /the level spot/, 'the HUD points the way to a tracked mark');
    await page.evaluate(() => T.frames(120));
    await open('&creative');
    const kept = await page.evaluate(() => ({ names: world.marks.list().map((m) => m.name), tracked: !!world.marks.trackedMark() }));
    assert.deepEqual(kept, { names: ['the level spot'], tracked: true }, 'and it is still there after a reload');
    return kept;
  });

  await step('sound', async () => {
    // The play-through runs muted; turn sound on here and make some.
    const heard = await page.evaluate(async () => {
      const s = world.sound;
      s.setEnabled(true);
      const up = await T.until(() => s.running, 5000);
      if (!up) return { running: false };
      const p = world.player.pos;
      await T.frames(10);
      for (const kind of ['chop', 'thud', 'crash', 'deny']) s.sfx(kind, { size: 0.5 });
      for (const kind of ['snort', 'howl', 'song', 'rattle']) s.call(kind, p.x + 5, p.y, p.z + 5);
      for (const ground of ['dirt', 'grass', 'litter', 'water']) s.footstep(ground, 0.5);
      await T.frames(90);
      const out = { running: true, buses: [...s.buses.keys()].sort(), layers: s.layers.map((l) => l.name) };
      s.setEnabled(false);
      return out;
    });
    // no audio device, no audio: that is the machine's business, not the game's
    if (!heard.running) console.log('    (no audio here: skipped)');
    else assert.deepEqual(heard.buses, ['ambience', 'effects', 'wildlife'], 'everything goes out through a bus');
    return heard;
  });

  await step('wade a stream', async () => {
    // Find running water you can stand in, near where we are, and stand in it.
    const spot = await page.evaluate(() => {
      const { gen, player } = world;
      const w = gen.water;
      let best = null;
      for (let r = 0; r < 320 && !best; r += 3) {
        for (let a = 0; a < 6.28; a += 3 / Math.max(3, r)) {
          const x = player.pos.x + Math.cos(a) * r;
          const z = player.pos.z + Math.sin(a) * r;
          const h = gen.height(x, z);
          const speed = Math.hypot(w.flowX, w.flowZ);
          const depth = w.level - h;
          if (w.region && w.edge < -0.6 && speed > 0.6 && depth > 0.45 && depth < 1) {
            best = { x, z, fx: w.flowX / speed, fz: w.flowZ / speed, depth };
            break;
          }
        }
      }
      return best;
    });
    assert.ok(spot, 'there is a stream to wade within reach');
    const got = await page.evaluate(async (s) => {
      await world.teleport(s.x, s.z, Math.atan2(-s.fx, -s.fz));
      const p = world.player;
      const x0 = p.pos.x;
      const z0 = p.pos.z;
      await T.frames(40);
      const carried = (p.pos.x - x0) * s.fx + (p.pos.z - z0) * s.fz;
      const water = world.chunks.waterAround(p.pos.x, p.pos.z, 45, { sources: [] });
      return { wade: p.wade, current: Math.hypot(p.current.x, p.current.z), carried, sources: water.count };
    }, spot);
    assert.ok(got.wade > 0.2, `standing in the water (${got.wade.toFixed(2)} m)`);
    assert.ok(got.carried > 0.01, `the current carries you downstream (${got.carried.toFixed(3)} m)`);
    assert.ok(got.sources >= 1, 'the stream can be heard');
    // and running upstream through it throws water about
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    const thrown = await page.evaluate(async () => {
      let most = 0;
      for (let i = 0; i < 60; i++) {
        await T.frames(1);
        most = Math.max(most, world.splashes.live);
      }
      return most;
    });
    await shot('9-wading');
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ShiftLeft');
    assert.ok(thrown > 0, 'running through water splashes');
    return { ...got, depth: spot.depth, thrown };
  });

  await step('wildlife on request', async () => {
    const said = await page.evaluate(() => world.wildlife.spawn('fox', { here: true }));
    await frames(30);
    assert.deepEqual(await page.evaluate(() => world.wildlife.list().map((a) => a.kind)), ['fox']);
    assert.match(said, /fox/);
    await shot('7-fox');
    // and one of everything, to see that each kind of animal turns up and gets on with it
    const about = await page.evaluate(async () => {
      world.wildlife.clear();
      const kinds = Object.keys(world.wildlife.species);
      kinds.forEach((kind, i) => world.wildlife.spawn(kind, { here: true, angle: (i / kinds.length) * 6.28, dist: 8 + (i % 4) * 4 }));
      await T.frames(120);
      const seen = new Set(world.wildlife.list().map((a) => a.kind));
      world.wildlife.clear();
      return { asked: kinds.length, missing: kinds.filter((k) => !seen.has(k)) };
    });
    assert.deepEqual(about.missing, [], 'every species spawns');
    return about;
  });

  await step('something new plugs in', async () => {
    // What a feature would do from its install function, done here by hand:
    // a tool, something for it to save, and a layer of sound. Nothing in the
    // game was written with these in mind.
    const had = await page.evaluate(() => document.querySelectorAll('#hotbar .slot').length);
    const n = had + 1;
    const f = await page.evaluate(async () => {
      const flags = [];
      world.builder.register({
        id: 'flag',
        label: 'flag',
        short: 'flag',
        target: (b) => (b.ground ? { ok: true, prompt: '<b>click</b> plant a flag' } : null),
        work(b, t, io) {
          if (io.useTap && t) flags.push([Math.round(b.ground.p.x), Math.round(b.ground.p.z)]);
          if (io.useTap && t) world.save.touch();
          return false;
        },
      });
      world.save.register({ id: 'flags', scope: 'yours', collect: () => flags, restore: (data) => flags.push(...data) });
      let heard = 0;
      world.sound.addLayer({ name: 'flags', build() {}, update: () => heard++ });
      await T.frames(3);
      return { slots: document.querySelectorAll('#hotbar .slot').length, hint: document.getElementById('hint-tools').textContent };
    });
    assert.equal(f.slots, n, 'it is on the tool bar');
    assert.equal(f.hint, `1–${n}`);
    await key(`Digit${n}`);
    assert.equal(await page.evaluate(() => T.tool()), n, 'the next number key picks it');
    await page.evaluate((m) => T.aimGround(m.x - 6, m.z - 6, 3), middle);
    assert.equal(await page.evaluate(() => T.prompt()), 'click plant a flag', 'its prompt shows');
    await page.evaluate(() => T.tap('use'));
    await page.evaluate(() => T.frames(140)); // long enough for the change to be written down
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('my-world:build:20261119')).flags);
    assert.equal(kept.length, 1, 'and what it made is in the save');
    await key('KeyH');
    const help = await page.evaluate(() => [...document.querySelectorAll('#help .row kbd')].map((k) => k.textContent));
    await key('KeyH');
    assert.ok(help.includes(`1 – ${n}`), 'the help panel counts it too');
    return { ...f, kept: kept.length };
  });

  assert.deepEqual(problems, [], 'nothing went wrong in the page');
  console.log('\nplayed through: all good');
} catch (err) {
  console.error(`\nFAILED: ${err.message}`);
  if (problems.length) console.error(problems.join('\n'));
  await shot('failure');
  process.exitCode = 1;
} finally {
  report.problems = problems;
  if (reportFile) writeFileSync(reportFile, `${JSON.stringify(report, null, 1)}\n`);
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
