// Two people in one world, against a real save server.
//
//   npm run serve                  (in one terminal: the built site + the API, on :8787)
//   node test/together.mjs         (in another)
//   node test/together.mjs http://127.0.0.1:8787
//
// One visitor builds a little and puts the world on the server, picking a
// name and a password; a second opens the link and must pick their own before
// walking in. Each then changes things and the other must see them (a
// campfire one lights, the other puts out); a reload must bring it all back;
// something a *newer* game saved, which this one has never heard of, must
// survive being walked past; and the second, signing in from another
// browser, must come back as himself — where *he* left off. And they talk:
// over the radio from anywhere, aloud only from close by; each sees what
// the other is riding; and one climbs into the other's raft as crew.

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

// A microphone that beeps, and sound that may start without a click.
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});

// A visitor: their own browser profile, so nothing is shared but the server.
async function visitor(name) {
  const context = await browser.newContext({ viewport: { width: 800, height: 500 }, permissions: ['microphone'] });
  const page = await context.newPage();
  page.on('console', (m) => {
    // A socket being closed under a page that is going away is not a problem,
    // and nor is the server saying who it lets in: the browser logs a 401
    // (who are you?), 403 (wrong password) or 409 (name taken) itself.
    if (m.type() === 'error' && !/WebSocket|status of 40[139]/.test(m.text())) problems.push(`${name}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`${name}: ${e.message}`));
  const go = (query) => page.goto(`${base}/?${query}`);
  // The door asks who you are (src/save/signIn.js). Answer it.
  const door = async (who, password, { back = false } = {}) => {
    await page.waitForSelector('#door:not([hidden]) [data-el="go"]:not([disabled])', { timeout: 60000 });
    const asking = await page.$eval('#door [data-el="go"]', (b) => b.textContent);
    if ((asking === 'sign in') !== back) await page.click('#door [data-act="switch"]');
    await page.fill('#door [data-el="name"]', who);
    await page.fill('#door [data-el="password"]', password);
    await page.click('#door [data-el="go"]');
  };
  const doorSays = (re) =>
    page.waitForFunction((src) => new RegExp(src).test(document.querySelector('#door [data-el="problem"]')?.textContent || ''), re.source, { timeout: 20000 });
  // In the world, or asked who you are at the door: whichever comes first.
  // (A door with its button held down is still hearing back about the last answer.)
  const ready = async ({ expectDoor = false } = {}) => {
    const where = await page.waitForFunction(
      () =>
        document.querySelector('#door:not([hidden]) [data-el="go"]:not([disabled])')
          ? 'door'
          : document.getElementById('loader')?.classList.contains('gone') && window.world
            ? 'in'
            : false,
      null,
      { timeout: 120000 },
    );
    const at = await where.jsonValue();
    if (expectDoor) return assert.equal(at, 'door', 'asked who they are');
    assert.equal(at, 'in', `${name} walked straight in`);
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
          fires: sorted(world.fires.serialize()),
          moved: b.terrain.map.size,
          stumps: forest.stumps.length,
          removed: Object.values(forest.removed).flat().length,
          marks: world.marks.list().map((m) => m.name).sort(),
          name: world.save.name,
        };
      };
    });
  };
  // Open the game; if it asks who you are, answer as `as`: [name, password, { back }].
  const open = async (query, as = null) => {
    await go(query);
    if (as) await door(...as);
    await ready();
  };
  const until = (fn, arg, what) => page.evaluate(([f, a]) => window.until(() => new Function('a', `return (${f})(a)`)(a)), [fn.toString(), arg]).then((ok) => assert.ok(ok, what));
  const at = () => page.evaluate(() => ({ x: world.player.pos.x, z: world.player.pos.z }));
  const settled = () => until(() => world.save.status === 'live' && !world.save.dirty && !world.save.pending.size && !world.save.visitorDirty, null, `${name}’s changes are all out`);
  return { name, page, context, go, door, doorSays, ready, open, until, at, settled, seen: () => page.evaluate(() => window.seen()) };
}

const far = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

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
  let anaAt = null;

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
    // and wanders off from the start, so where she stands is hers alone
    anaAt = await ana.page.evaluate(() => {
      world.player.spawn(world.player.pos.x + 14, world.player.pos.z - 11, 0.5);
      return { x: world.player.pos.x, z: world.player.pos.z };
    });
    const s = await ana.seen();
    assert.equal(s.buildings[0].logs.length, 2);
    assert.ok(s.moved > 0);
  });

  await step('and puts it on the server, as herself', async () => {
    await ana.page.keyboard.press('KeyL');
    await ana.page.fill('[data-el="new-name"]', 'The clearing');
    await ana.page.fill('[data-el="you"]', 'ana');
    await ana.page.fill('[data-el="pass"]', 'pine-and-birch');
    await ana.page.click('[data-act="publish"]');
    await ana.until(() => !!world.save.id && world.save.connected, null, 'the world has an address and a socket');
    id = await ana.page.evaluate(() => world.save.id);
    assert.match(id, /^[0-9a-z]{4,32}$/);
    assert.match(ana.page.url(), new RegExp(`w=${id}`), 'the address bar has the link');
    assert.equal(await ana.page.evaluate(() => world.save.you), 'ana');
    await ana.page.keyboard.press('Escape');
  });

  await step('nobody gets in without a name', async () => {
    const opened = await fetch(`${base}/api/worlds/${id}`);
    assert.equal(opened.status, 401, 'opening the world');
    assert.equal((await opened.json()).world, 'The clearing', 'though it says which world it is');
    const sent = await fetch(`${base}/api/worlds/${id}/ops`, { method: 'POST', body: JSON.stringify({ ops: [{ r: '0,0', k: 't:0:0', v: [9, 1] }] }) });
    assert.equal(sent.status, 401, 'changing it');
  });

  await step('ben opens the link, and is asked who he is', async () => {
    await ben.go(`${QUERY}&w=${id}`);
    await ben.ready({ expectDoor: true });
    assert.equal(await ben.page.$eval('#door [data-el="world"]', (e) => e.textContent), 'The clearing');
    await ben.door('ben', '123');
    await ben.doorSays(/at least 6 characters/);
    await ben.door('ANA', 'something-long');
    await ben.doorSays(/already goes by ANA/);
    await ben.door('ben', 'ben-was-here');
    await ben.ready();
    assert.equal(await ben.page.evaluate(() => world.save.you), 'ben');
  });

  await step('and walks into the same world — at the start, not where ana is', async () => {
    assert.deepEqual(await ben.seen(), await ana.seen());
    // grown from the same seed, on the land the server says the world is on
    const grown = (v) => v.page.evaluate(() => ({ seed: world.gen.seed, land: world.gen.land, held: world.save.elements.get('*')?.get('land') ?? 1 }));
    const [a, b] = [await grown(ana), await grown(ben)];
    assert.deepEqual(b, a, 'the same seed and land');
    assert.equal(b.held, b.land, 'the land the server holds is the one grown');
    assert.equal((await ben.seen()).name, 'The clearing');
    assert.ok(far(await ben.at(), anaAt) > 10, 'what is ana’s is not handed to ben');
    await ben.until(() => world.save.connected && world.peers.list().some((p) => p.name === 'ana'), null, 'ben can see ana here, by name');
    await ana.until(() => world.peers.list().some((p) => p.name === 'ben'), null, 'and ana can see ben');
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

  await step('a fire ana lights, ben sees burning — and puts out', async () => {
    await ana.page.evaluate((s) => {
      const F = world.fires;
      const x = s.x - 3;
      const z = s.z - 3;
      const f = F.add(x, z, world.chunks.heightAt(x, z));
      F.lay(f, 1);
      F.light(f);
    }, site);
    await ben.until(() => {
      const f = world.fires.list.values().next().value;
      return !!f && world.fires.state(f).state === 'burning';
    }, null, 'ben sees it burning');
    await ben.page.evaluate(() => world.fires.douse(world.fires.list.values().next().value));
    await ana.until(() => {
      const f = world.fires.list.values().next().value;
      return world.fires.state(f).state === 'laid' && f.ash === 2;
    }, null, 'ana sees it put out, with wood left to light again');
    assert.deepEqual(await ana.seen(), await ben.seen());
  });

  await step('ben sees ana on her horse, and up in the air on her eagle', async () => {
    // Each finds and tames their own; what you ride is shown to everyone.
    const anaRides = (w) => {
      const p = world.peers.list().find((q) => q.name === 'ana');
      const peer = p && world.peers.get(p.id);
      if (!peer || !peer.character.seated) return false;
      const lift = peer.character.root.position.y - world.chunks.heightAt(peer.pos.x, peer.pos.z);
      return w === 'high' ? lift > 8 : lift > 0.5;
    };
    await ana.page.evaluate(() => {
      world.mounts.tame('horse');
      world.mounts.ride('horse');
    });
    await ben.until(anaRides, 'low', 'ben sees ana sitting up on something');
    await ana.page.evaluate(() => {
      world.mounts.tame('eagle');
      world.mounts.ride('eagle');
    });
    await ana.page.keyboard.down('Space');
    await ana.until(() => world.player.flying && world.player.height > 15, null, 'ana takes off');
    await ana.page.keyboard.up('Space');
    await ben.until(anaRides, 'high', 'ben sees her up in the air');
    await ana.page.evaluate(() => world.mounts.getOff());
    await ben.until(() => {
      const p = world.peers.list().find((q) => q.name === 'ana');
      return p && !world.peers.get(p.id).character.seated;
    }, null, 'and back on her own two feet');
    assert.deepEqual(await ben.page.evaluate(() => world.mounts.list().filter((m) => m.tame).length), 0, 'ana’s mounts are hers, not ben’s');
  });

  await step('ben climbs into ana’s raft as crew, and his paddling drives it along', async () => {
    // a rapid near the start, and the put-in above it
    const r = await ana.page.evaluate(async () => {
      const r = world.rafting.nearest(0, 0, 1500);
      await world.teleport(r.putIn.x, r.putIn.z);
      world.rafting.putInAt(r.putIn.x, r.putIn.z);
      world.rafting.hold({ fwd: 0, turn: 0 });
      return r;
    });
    assert.ok(await ana.page.evaluate(() => world.rafting.state()?.aboard), 'ana is in her raft');
    await ben.page.evaluate(async (r) => {
      await world.teleport(r.putIn.x, r.putIn.z);
    }, r);
    await ben.until(() => world.rafting.crew.rafts().some((x) => x.aboard), null, 'ben sees ana’s raft on the river');
    // beside it, he climbs in from the pack
    await ben.until(() => {
      const raft = world.rafting.crew.rafts()[0];
      const p = world.player.pos;
      p.x = raft.x + 2.5;
      p.z = raft.z;
      return !!world.rafting.crew.joinable();
    }, null, 'there is a seat free beside ben');
    await ben.page.evaluate(() => world.pack.do('raft'));
    await ben.until(() => !!world.rafting.crew.aboard && world.player.character.seated, null, 'ben sits in it');
    await ana.until(() => {
      const p = world.peers.list().find((q) => q.name === 'ben');
      const peer = p && world.peers.get(p.id);
      const s = world.rafting.state();
      return peer && peer.character.seated && Math.hypot(peer.character.root.position.x - s.x, peer.character.root.position.z - s.z) < 2.5;
    }, null, 'ana sees ben sitting in her raft');
    const drift = await ana.page.evaluate(() => world.rafting.state().speed);
    await ben.page.keyboard.down('KeyW');
    await ana.until(() => world.rafting.crew.paddling() > 0, null, 'ana hears ben paddling');
    await ana.until((d) => world.rafting.state().speed > d + 0.25, drift, 'and her raft goes faster for it');
    await ben.page.keyboard.up('KeyW');
    await ana.page.evaluate(() => {
      world.rafting.hold(null);
      world.rafting.out();
      if (world.rafting.aboard) world.rafting.out();
    });
    await ben.until(() => !world.rafting.crew.aboard && !world.player.character.seated, null, 'when ana gets out, ben is out too');
  });

  await step('ana and ben talk: on the radio from anywhere, aloud only close by', async () => {
    for (const v of [ana, ben]) {
      await v.page.evaluate(() => world.sound.setEnabled(true)); // the play-through is muted
      await v.until(() => world.sound.running, null, `${v.name} can hear`);
    }
    await ben.until(() => world.voice.list().some((p) => p.name === 'ana' && p.line === 'connected'), null, 'a line between them');
    const hears = (fn, what) => ben.until((src) => world.voice.list().some((p) => p.name === 'ana' && new Function('p', `return (${src})(p)`)(p)), fn.toString(), what);

    await ana.page.bringToFront();
    await ana.page.keyboard.down('KeyX');
    await hears((p) => p.mode === 'radio' && p.heard.radio > 0.5 && p.level > 0.05, 'ben hears ana on the radio');
    assert.equal(await ana.page.evaluate(() => world.player.character.raised), 'radio', 'ana has the radio up');
    assert.equal(await ben.page.evaluate(() => world.peers.get(world.voice.list()[0].id).character.raised), 'radio', 'and ben sees her with it up');
    assert.match(await ben.page.evaluate(() => document.getElementById('voice').textContent), /ana.*radio/, 'and who is on the air');
    await ana.page.keyboard.up('KeyX');
    await hears((p) => p.mode === '' && p.heard.radio < 0.05, 'and the radio goes quiet when she lets go');

    const anaWas = await ana.at();
    const aloudFrom = async (d, what, fn) => {
      const b = await ben.at();
      await ana.page.evaluate(([x, z]) => world.teleport(x, z, 0), [b.x + d, b.z]);
      await ana.page.keyboard.down('KeyC');
      await hears(fn, what);
      await ana.page.keyboard.up('KeyC');
      await hears((p) => p.mode === '', 'and stops');
    };
    await aloudFrom(4, 'ben hears ana talking beside him', (p) => p.mode === 'aloud' && p.heard.aloud > 0.5 && p.heard.radio < 0.05);
    await aloudFrom(120, 'but not from the far side of the hill', (p) => p.mode === 'aloud' && p.heard.aloud < 0.01);
    await ana.page.evaluate(([x, z]) => world.teleport(x, z, 0), [anaWas.x, anaWas.z]);
    for (const v of [ana, ben]) await v.page.evaluate(() => world.sound.setEnabled(false));
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
    // sent from ana's page, so it goes as her
    const status = await ana.page.evaluate(async (id) => {
      const res = await fetch(`/api/worlds/${id}/ops`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ops: [{ r: '0,0', k: 'zz:campfire:3:4', v: [2.5, 1] }] }),
      });
      return res.status;
    }, id);
    assert.equal(status, 200, 'the server took it');
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
    await ana.settled();
    await ana.open(`${QUERY}&w=${id}`); // this browser remembers her: no door
    assert.deepEqual(await ana.seen(), before);
    const back = await ana.page.evaluate(() => ({ x: world.player.pos.x, z: world.player.pos.z, unknown: world.save.elements.get('0,0')?.get('zz:campfire:3:4') }));
    assert.ok(Math.hypot(back.x - where.x, back.z - where.z) < 0.5, 'she is standing where she stopped');
    assert.deepEqual(back.unknown, [2.5, 1], 'and what the newer game saved is still on the server');
    anaAt = where;
  });

  let benAt = null;
  let elsewhere = null;
  await step('ben comes back from another browser, signs in, and is where he left off', async () => {
    benAt = await ben.page.evaluate(() => {
      world.player.spawn(world.player.pos.x - 9, world.player.pos.z + 6, 2);
      return { x: world.player.pos.x, z: world.player.pos.z };
    });
    await ben.page.evaluate(() => world.marks.add({ x: 3, z: 3, name: 'ben’s second mark' }));
    await ben.settled();
    assert.ok(far(benAt, anaAt) > 5, 'somewhere else from ana');

    elsewhere = await visitor('ben, elsewhere');
    await elsewhere.go(`${QUERY}&w=${id}`);
    await elsewhere.ready({ expectDoor: true });
    await elsewhere.door('ben', 'birch-and-pine', { back: true });
    await elsewhere.doorSays(/isn't ben's password/);
    await elsewhere.door('carl', 'ben-was-here', { back: true });
    await elsewhere.doorSays(/nobody here goes by carl/);
    await elsewhere.door('Ben', 'ben-was-here', { back: true });
    await elsewhere.ready();
    assert.equal(await elsewhere.page.evaluate(() => world.save.you), 'ben');
    assert.ok(far(await elsewhere.at(), benAt) < 0.5, 'he is standing where he stopped');
    assert.deepEqual(await elsewhere.seen(), await ben.seen(), 'in the same world');
  });

  await step('and signs out there: the next person is asked who they are', async () => {
    await elsewhere.page.keyboard.press('KeyL');
    await Promise.all([elsewhere.page.waitForEvent('load'), elsewhere.page.click('[data-act="signout"]')]);
    await elsewhere.ready({ expectDoor: true });
    await elsewhere.context.close();
    // the browser he came in on first is still signed in
    await ben.open(`${QUERY}&w=${id}`);
    assert.ok(far(await ben.at(), benAt) < 0.5, 'and he is still where he stopped');
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
