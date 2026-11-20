// Two people in one world, against a real save server.
//
//   npm run serve                  (in one terminal: the built site + the API, on :8787)
//   node test/together.mjs         (in another)
//   node test/together.mjs http://127.0.0.1:8787
//
// One visitor builds a little, puts the world on the server, and a second
// opens the link. Each then changes things and the other must see them; a
// reload must bring it all back; and something a *newer* game saved, which
// this one has never heard of, must survive being walked past.

import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.error('this needs Playwright: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const base = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const QUERY = 'seed=20261119&time=13&animals=0&mute&q=low&view=1&lines=90';
const problems = [];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

// A visitor: their own browser profile, so nothing is shared but the server.
async function visitor(name) {
  const context = await browser.newContext({ viewport: { width: 800, height: 500 } });
  const page = await context.newPage();
  page.on('console', (m) => {
    // a socket being closed under a page that is going away is not a problem
    if (m.type() === 'error' && !/WebSocket/.test(m.text())) problems.push(`${name}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`${name}: ${e.message}`));
  const open = async (query) => {
    await page.goto(`${base}/?${query}`);
    await page.waitForFunction(() => document.getElementById('loader')?.classList.contains('gone') && window.world, null, { timeout: 120000 });
    await page.evaluate(() => {
      world.pipeline.render = () => {}; // software GL is slow, and nobody is watching
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      window.until = async (fn, ms = 20000) => {
        const t0 = performance.now();
        while (performance.now() - t0 < ms) {
          if (fn()) return true;
          await frame();
        }
        return false;
      };
      // what this visitor sees of the world, in the words a save uses
      window.seen = () => {
        const b = world.builder;
        const forest = b.forest.serialize();
        // pieces come back from the server in the server's order, not the
        // order they were laid in: compare them as sets
        const sorted = (list) => list.map((piece) => JSON.stringify(piece)).sort();
        return {
          buildings: b.buildings.serialize().map((d) => ({ y0: d.y0, sill: d.sill, footings: sorted(d.footings), logs: sorted(d.logs), roofs: sorted(d.roofs) })),
          moved: b.terrain.map.size,
          stumps: forest.stumps.length,
          removed: Object.values(forest.removed).flat().length,
          marks: world.marks.list().map((m) => m.name).sort(),
          name: world.save.name,
        };
      };
    });
  };
  const until = (fn, arg, what) => page.evaluate(([f, a]) => window.until(() => new Function('a', `return (${f})(a)`)(a)), [fn.toString(), arg]).then((ok) => assert.ok(ok, what));
  return { name, page, context, open, until, seen: () => page.evaluate(() => window.seen()) };
}

const step = async (name, fn) => {
  const t0 = Date.now();
  await fn();
  console.log(`  ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
};

try {
  const ana = await visitor('ana');
  const ben = await visitor('ben');
  let id = '';
  let site = null;

  await step('ana builds a little, in a world of her own', async () => {
    await ana.open(`${QUERY}&creative&reset&clearbuild`);
    site = await ana.page.evaluate(() => {
      const p = world.player.pos;
      const B = world.builder.buildings;
      const x = Math.round(p.x) + 6;
      const z = Math.round(p.z) + 6;
      const ground = world.chunks.heightAt(x, z);
      for (const [dx, dz] of [[0, 0], [4, 0], [0, 3], [4, 3]]) B.addFooting(x + dx, z + dz, ground);
      const b = B.list[0];
      B.addLog(b, 'log', 'x', z, x, x + 4);
      B.addLog(b, 'log', 'x', z + 3, x, x + 4);
      world.builder.terrain.stroke({ x: p.x - 8, z: p.z - 8, mode: 'dig', dt: 0.5 });
      world.marks.add({ x: x + 2, z: z + 1.5, name: "ana's cabin" });
      world.marks.setTracked(world.marks.list()[0].id);
      return { x, z };
    });
    const s = await ana.seen();
    assert.equal(s.buildings[0].logs.length, 2);
    assert.ok(s.moved > 0);
  });

  await step('and puts it on the server', async () => {
    await ana.page.keyboard.press('KeyL');
    await ana.page.fill('[data-el="new-name"]', 'The clearing');
    await ana.page.click('[data-act="publish"]');
    await ana.until(() => !!world.save.id && world.save.connected, null, 'the world has an address and a socket');
    id = await ana.page.evaluate(() => world.save.id);
    assert.match(id, /^[0-9a-z]{4,32}$/);
    assert.match(ana.page.url(), new RegExp(`w=${id}`), 'the address bar has the link');
    await ana.page.keyboard.press('Escape');
  });

  await step('ben opens the link and walks into the same world', async () => {
    await ben.open(`${QUERY}&w=${id}`);
    assert.deepEqual(await ben.seen(), await ana.seen());
    assert.equal((await ben.seen()).name, 'The clearing');
    await ben.until(() => world.save.connected && world.peers.count === 1, null, 'ben can see someone else here');
    await ana.until(() => world.peers.count === 1, null, 'and so can ana');
    // (Ben starts from what the last visitor left — where they stood, what
    // they carried. The server keeps one such note per world, not per person.)
  });

  await step('what ana changes, ben sees', async () => {
    await ana.page.evaluate((s) => {
      const B = world.builder.buildings;
      const L = B.addLog(B.list[0], 'timber', 'z', s.x, s.z, s.z + 3);
      for (const n of [...L.below]) B.notch(B.list[0], L, n);
      const p = world.player.pos;
      world.builder.terrain.stroke({ x: p.x + 9, z: p.z - 9, mode: 'dig', dt: 0.5 });
      const tree = world.builder.forest.treeNear(p.x, p.z, 60);
      while (!world.builder.forest.chop(tree, p.x, p.z));
    }, site);
    const want = await ana.seen();
    await ben.until((w) => JSON.stringify(window.seen()) === JSON.stringify(w), want, 'ben has ana’s log, hole and stump');
  });

  await step('what ben changes, ana sees — and she is still tracking her mark', async () => {
    await ben.page.evaluate(() => {
      const p = world.player.pos;
      world.marks.add({ x: p.x, z: p.z, name: 'ben was here' });
      const B = world.builder.buildings;
      B.removeLog(B.list[0], B.list[0].logs.at(-1));
    });
    const want = await ben.seen();
    await ana.until((w) => JSON.stringify(window.seen()) === JSON.stringify(w), want, 'ana has ben’s mark, and the log is gone');
    const tracking = await ana.page.evaluate(() => world.marks.trackedMark()?.name);
    assert.equal(tracking, "ana's cabin", 'someone else adding a mark does not lose yours');
  });

  await step('a change to something already saved goes out too', async () => {
    // Renaming a mark, or cutting one more notch, changes an object the save
    // has already sent once. It must notice all the same.
    await ana.page.evaluate((s) => {
      const B = world.builder.buildings;
      const b = B.list[0];
      window.cross = B.addLog(b, 'log', 'z', s.x + 4, s.z, s.z + 3); // rides on both sills
    }, site);
    await ben.until(() => world.builder.buildings.list[0].logs.some((L) => L.axis === 'z' && !L.seated), null, 'ben sees the log riding high');
    await ana.page.waitForTimeout(600);
    await ana.page.evaluate((s) => {
      const B = world.builder.buildings;
      B.notch(B.list[0], window.cross, s.z); // one notch only
      const mark = world.marks.list().find((m) => m.name === "ana's cabin");
      world.marks.update(mark.id, { name: "ana's cabin, by the pond" });
    }, site);
    await ben.until(() => world.marks.list().some((m) => m.name === "ana's cabin, by the pond"), null, 'ben sees the new name');
    await ben.until(() => world.builder.buildings.list[0].logs.some((L) => L.axis === 'z' && L.notches.length === 1), null, 'and the notch');
    assert.equal(await ana.page.evaluate(() => world.marks.trackedMark()?.name), "ana's cabin, by the pond");
  });

  await step('a newer game saves something this one has never heard of', async () => {
    const res = await fetch(`${base}/api/worlds/${id}/ops`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ops: [{ r: '0,0', k: 'zz:campfire:3:4', v: [2.5, 1] }] }),
    });
    assert.ok(res.ok, `the server took it (${res.status})`);
    await ana.until(() => world.save.elements.get('0,0')?.has('zz:campfire:3:4'), null, 'ana hears of it');
    // ana carries on building; her next save must not sweep it away
    await ana.page.evaluate(() => world.marks.add({ x: 1, z: 1, name: 'after the campfire' }));
    await ben.until(() => world.marks.list().some((m) => m.name === 'after the campfire'), null, 'ben sees ana’s next change');
    await ana.page.evaluate(() => world.save.flush());
  });

  await step('ana comes back later: everything is as it was left', async () => {
    const before = await ana.seen();
    const where = await ana.page.evaluate(() => {
      world.player.spawn(world.player.pos.x + 7, world.player.pos.z - 5, 1);
      return { x: world.player.pos.x, z: world.player.pos.z };
    });
    // where you stand rides along with the next change
    await ana.page.evaluate(() => world.marks.update(world.marks.list()[0].id, { note: 'home' }));
    await ana.until(() => world.save.status === 'live' && !world.save.dirty && !world.save.pending.size && !world.save.visitorDirty, null, 'ana’s changes are all out');
    await ana.open(`${QUERY}&w=${id}`);
    assert.deepEqual(await ana.seen(), before);
    const back = await ana.page.evaluate(() => ({ x: world.player.pos.x, z: world.player.pos.z, unknown: world.save.elements.get('0,0')?.get('zz:campfire:3:4') }));
    assert.ok(Math.hypot(back.x - where.x, back.z - where.z) < 0.5, 'she is standing where she stopped');
    assert.deepEqual(back.unknown, [2.5, 1], 'and what the newer game saved is still on the server');
  });

  assert.deepEqual(problems, [], 'nothing went wrong in either page');
  console.log('\ntogether: all good');
} catch (err) {
  console.error(`\nFAILED: ${err.message}`);
  if (problems.length) console.error(problems.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
