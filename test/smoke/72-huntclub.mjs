// The hunt club: picked on the map, `go here` sets you down at the foot of
// its porch steps, facing them. Up the steps to the hatch, a click there and
// the steward hands you a shotgun, which goes in the rifle's slot. Out on
// the skeet field: station 1, a click calls "pull!", and a target is thrown;
// led just right it breaks, shot behind it's lost and thrown again (the
// option). The rest of the round shot from station to station, the card
// keeping score; the best kept, and the shotgun still yours after a reload.
// Then another club, out in the forest, picked from Routes: it stands when
// you get there, and that you've been is kept.
//
// Needs: nothing in particular (the first club is on the map from anywhere).
// Leaves: you at the foot of the first club's steps, a shotgun of your own
// (in the rifle's slot), and no round under way.

import assert from 'node:assert/strict';

// In the page: point the crosshair at a spot, from your eye.
export function inPage() {
  const w = window.world;
  T.aimAt = (p) => {
    const P = w.player.pos;
    const dx = P.x - p.x;
    const dy = P.y + w.player.eye - p.y;
    const dz = P.z - p.z;
    w.look(Math.atan2(dx, dz), Math.asin(dy / Math.hypot(dx, dy, dz)), 3);
  };
  // the next throw called for from the station it's due from, and in the air
  T.pull = async () => {
    const r = w.huntclub.range;
    await T.until(() => !w.builder.act, 10000);
    if (w.huntclub.range.stationAt(w.player.pos.x, w.player.pos.y, w.player.pos.z) !== r.next.station) {
      w.huntclub.toStation(r.next.station);
      await T.frames(4);
    }
    const said = T.prompt();
    await T.tap('use');
    const up = await T.until(() => r.throwing && r.throwing.launched, 20000);
    return { said, up };
  };
  // shoot target c, `behind` metres behind it as you see it go (0: led just right)
  T.shoot = async (c, behind = 0) => {
    await T.until(() => c.t > 0.45 && !w.builder.act, 10000);
    let p = w.huntclub.lead(c);
    if (behind) {
      const P = w.player.pos;
      const e = { x: P.x, y: P.y + w.player.eye, z: P.z };
      const l = Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z);
      const d = { x: (p.x - e.x) / l, y: (p.y - e.y) / l, z: (p.z - e.z) / l };
      const along = c.vx * d.x + c.vy * d.y + c.vz * d.z;
      const a = { x: c.vx - along * d.x, y: c.vy - along * d.y, z: c.vz - along * d.z };
      const m = Math.hypot(a.x, a.y, a.z);
      p = { x: p.x - (a.x / m) * behind, y: p.y - (a.y / m) * behind, z: p.z - (a.z / m) * behind };
    }
    T.aimAt(p);
    T.press('use', true);
    await T.frames(1);
    T.press('use', false);
    await T.frames(2);
    return c.dead;
  };
  T.thrown = () => T.until(() => !w.huntclub.range.throwing, 20000);
  T.card = () => {
    const el = document.getElementById('skeet');
    return { shown: !el.hidden, text: el.textContent, dead: el.querySelectorAll('.dead').length, lost: el.querySelectorAll('.lost').length };
  };
}

export default async function ({ page, step, key, frames, open, shot }) {
  const prompt = () => page.evaluate(() => T.prompt());
  const toast = () => page.evaluate(() => document.getElementById('toast').textContent);

  let site = null;
  await step('to the hunt club, from the map', async () => {
    site = await page.evaluate(async () => {
      // found a moment after the world opens, once the airfields have been
      await T.until(() => world.huntclub.home, 60000);
      const s = world.huntclub.home;
      return s && { id: s.id, name: s.name, door: s.door };
    });
    assert.ok(site, 'there is a hunt club');
    assert.equal(await page.evaluate(() => world.builder.slotOf('shotgun')), null, "you don't start with a shotgun");
    await key('KeyM');
    await page.evaluate((s) => {
      world.map.centerOn(s.door.x, s.door.z);
      world.map.selectPlace(s.id);
    }, site);
    await frames(5);
    assert.equal(await page.evaluate(() => document.getElementById('place-name').textContent), site.name, 'it is on the map, by name');
    await page.evaluate(() => document.querySelector('#place-card [data-act="place-go"]').click());
    const there = await page.evaluate((s) => T.until(() => Math.hypot(world.player.pos.x - s.door.x, world.player.pos.z - s.door.z) < 1, 60000), site);
    assert.ok(there, 'go here sets you down at the foot of its steps');
    assert.ok(await page.evaluate((s) => Math.cos(world.player.yaw - s.door.yaw), site) > 0.99, 'facing them');
    assert.ok(await page.evaluate((s) => T.until(() => world.huntclub.ready && world.huntclub.site.id === s.id, 60000), site), 'the club stands there');
    // and the ground round it in: until it is, `go here` isn't done, and once
    // it is it sets you down at the foot of the steps again and says where you
    // are, over whatever the steward has said by then
    const settled = await page.evaluate(async () => {
      const ok = await T.until(() => world.chunks.isFullyLoaded(), 60000);
      await T.frames(10);
      return ok;
    });
    assert.ok(settled, 'the ground round it in');
    await shot('the hunt club');
    return { site: site.id, name: site.name };
  });

  await step('a shotgun from the steward', async () => {
    // straight up the steps onto the porch
    const deck = await page.evaluate(() => world.huntclub.lay.deck);
    await page.keyboard.down('KeyW');
    const up = await page.evaluate((d) => T.until(() => world.player.pos.y > d - 0.05, 20000), deck);
    await page.keyboard.up('KeyW');
    assert.ok(up, 'up the steps onto the porch');
    // and along to the hatch
    await page.evaluate(() => world.huntclub.toCounter());
    await frames(8);
    assert.equal(await prompt(), 'F ask the steward for a shotgun');
    const hello = await toast();
    assert.match(hello, new RegExp(`^${await page.evaluate(() => world.huntclub.steward)}: “`), `the steward says hello (${hello})`);
    await shot('the hatch');
    await key('KeyF');
    const got = await page.evaluate(() => ({ owned: world.huntclub.owned, tool: T.tool(), slot: world.builder.slotOf('shotgun'), rifle: world.builder.slotOf('rifle'), kit: world.builder.kits.find((k) => k.tools.some((t) => t.id === 'shotgun')).label }));
    assert.deepEqual(got, { owned: true, tool: 'shotgun', slot: got.rifle, rifle: got.rifle, kit: 'guns' }, "it's yours, in hand, in the rifle's slot");
    assert.match(await toast(), /over-and-under/);
    // its key changes between the two
    await key(`Digit${got.slot % 10}`);
    assert.equal(await page.evaluate(() => T.tool()), 'rifle');
    await key(`Digit${got.slot % 10}`);
    assert.equal(await page.evaluate(() => T.tool()), 'shotgun');
    return got;
  });

  await step('station 1: dead, lost, and the option', async () => {
    await page.evaluate(() => world.huntclub.toStation(3));
    await frames(4);
    assert.equal(await prompt(), 'this is station 3 · a round starts at station 1');
    await page.evaluate(() => world.huntclub.toStation(1));
    await frames(4);
    const r = await page.evaluate(async () => {
      const range = world.huntclub.range;
      const out = {};
      // the high house: called for, loaded with one, thrown, led, broken
      const call = await T.pull();
      out.call = call;
      out.loaded = world.huntclub.shotgun.shells;
      await T.tap('alt'); // mounted (and it stays so: right-click again lowers it)
      out.high = await T.shoot(range.throwing.clays[0]);
      await T.frames(4);
      out.highSaid = document.getElementById('toast').textContent;
      out.card = T.card();
      await T.thrown();
      // the low house: shot behind, lost, and the coach says so
      const low = await T.pull();
      out.lowCall = low.said;
      out.low = await T.shoot(range.throwing.clays[0], 1.6);
      out.lowSaid = document.getElementById('toast').textContent;
      await T.thrown();
      await T.frames(2);
      out.next = range.next;
      out.prompt = T.prompt();
      // the option: the low house again
      await T.pull();
      out.option = await T.shoot(range.throwing.clays[0]);
      await T.thrown();
      // the double: two shells
      const pair = await T.pull();
      out.pairCall = pair.said;
      out.pairShells = world.huntclub.shotgun.shells;
      for (const c of [...range.throwing.clays]) out[`pair${c.house}`] = await T.shoot(c);
      await T.thrown();
      await T.tap('alt');
      out.after = range.card();
      return out;
    });
    assert.ok(r.call.up, 'thrown');
    assert.match(r.call.said, /station 1 · high house · click call pull: a round of skeet, 25 targets/);
    assert.equal(r.loaded, 1, 'one shell for a single');
    assert.equal(r.high, true, 'led just right: broken');
    assert.match(r.highSaid, /^dead · 1 of 1/);
    assert.ok(r.card.shown && r.card.dead === 1, 'the card has it');
    assert.match(r.lowCall, /low house/);
    assert.equal(r.low, false, 'shot behind it: lost');
    assert.match(r.lowSaid, /^lost · behind it · 1 of 2/);
    assert.deepEqual(r.next, { station: 1, kind: 'L', option: true });
    assert.match(r.prompt, /low house again, your option/);
    assert.equal(r.option, true, 'the option broken');
    assert.match(r.pairCall, /a double/);
    assert.equal(r.pairShells, 2, 'two shells for a double');
    assert.deepEqual([r.pairH, r.pairL], [true, true], 'a pair');
    assert.deepEqual({ score: r.after.score, shot: r.after.shot, next: r.after.next.station }, { score: 4, shot: 5, next: 2 });
    await shot('the skeet card');
    return { said: [r.highSaid, r.lowSaid] };
  });

  await step('the rest of the round, from station to station', async () => {
    const r = await page.evaluate(async () => {
      const range = world.huntclub.range;
      const stations = [];
      let guided = 0;
      await T.tap('alt');
      for (let k = 0; k < 30 && range.round; k++) {
        // walked off the station: an arrow over the next, and the HUD says where
        const next = range.next.station;
        if (!stations.includes(next)) {
          world.huntclub.toStation(next === 8 ? 4 : next + 1);
          await T.frames(4);
          if (world.huntclub.range.stationAt(world.player.pos.x, world.player.pos.y, world.player.pos.z) !== next && document.getElementById('track').textContent.includes(`station ${next}`)) guided++;
          stations.push(next);
        }
        await T.pull();
        for (const c of [...range.throwing.clays]) await T.shoot(c);
        await T.thrown();
      }
      await T.tap('alt');
      await T.frames(6);
      return { stations, guided, card: T.card(), best: world.huntclub.best, rounds: world.huntclub.rounds, round: !!range.round };
    });
    assert.deepEqual(r.stations, [2, 3, 4, 5, 6, 7, 8]);
    assert.equal(r.guided, 7, 'the HUD led to each station');
    assert.equal(r.round, false, 'the round is over');
    assert.equal(r.best, 24, 'one lost, 24 of 25');
    assert.equal(r.rounds, 1);
    assert.ok(r.card.shown && /24 of 25/.test(r.card.text) && /round over/.test(r.card.text), `the card says so (${r.card.text})`);
    await shot('round over');
    return r;
  });

  await step('the shotgun and the best round are kept', async () => {
    await page.evaluate(() => T.frames(140)); // long enough for it to be written down
    const { been, ...kept } = await page.evaluate(() => JSON.parse(localStorage.getItem(world.save.local.keyFor('marks'))).huntclub);
    assert.deepEqual(kept, { gun: true, best: 24, rounds: 1, visited: true });
    assert.ok(Array.isArray(been), 'and the other clubs you have been to');
    await open();
    const after = await page.evaluate(() => ({ owned: world.huntclub.owned, best: world.huntclub.best, slot: world.builder.slotOf('shotgun'), rifle: world.builder.slotOf('rifle') }));
    assert.deepEqual(after, { owned: true, best: 24, slot: after.rifle, rifle: after.rifle }, 'still yours after a reload, in its slot');
    return after;
  });

  await step('another club, out in the forest, from Routes', async () => {
    await key('KeyM');
    await page.click('[data-tab="routes"]');
    await page.click('.route-lists button[data-list="hunt clubs"]');
    // the first club nearest, and the rest further out, as they're found
    const first = page.locator('.route-options button[data-destination^="huntclub:"]').first();
    await first.waitFor();
    const home = await page.evaluate(() => world.huntclub.home.id);
    assert.equal(await first.getAttribute('data-destination'), home, 'the first club is the nearest');
    const row = page.locator('.route-options button[data-destination^="huntclub:far:"]').first();
    await row.waitFor({ timeout: 60000 });
    const id = await row.getAttribute('data-destination');
    const far = await page.evaluate((id) => {
      const s = world.huntclub.clubs.byId(id);
      return { id: s.id, name: s.name, door: s.door, home: world.huntclub.home.name };
    }, id);
    assert.notEqual(far.name, far.home, 'by a name of its own');
    await page.click('[data-tab="places"]');
    await page.evaluate((s) => {
      world.map.centerOn(s.door.x, s.door.z);
      world.map.selectPlace(s.id);
    }, far);
    await frames(5);
    assert.equal(await page.evaluate(() => document.getElementById('place-name').textContent), far.name, 'it is on the map, by name');
    await page.evaluate(() => document.querySelector('#place-card [data-act="place-go"]').click());
    const there = await page.evaluate((s) => T.until(() => Math.hypot(world.player.pos.x - s.door.x, world.player.pos.z - s.door.z) < 1, 60000), far);
    assert.ok(there, 'go here sets you down at the foot of its steps');
    assert.ok(await page.evaluate((s) => T.until(() => world.huntclub.ready && world.huntclub.site.id === s.id, 60000), far), 'and it stands there, in place of the first');
    assert.match(await toast(), new RegExp(far.name), 'with its name');
    await shot('a hunt club out in the forest');
    await page.evaluate(() => T.frames(140)); // long enough for it to be written down
    const been = await page.evaluate(() => JSON.parse(localStorage.getItem(world.save.local.keyFor('marks'))).huntclub.been);
    assert.ok(been.includes(far.id), 'that you have been there is kept');
    assert.equal(await page.evaluate((id) => world.map.places.get(id).visited, far.id), true, 'and shown on the map');
    // back to the first
    await page.evaluate(() => world.huntclub.go(world.huntclub.home.id));
    assert.ok(await page.evaluate(() => T.until(() => world.huntclub.ready && world.huntclub.site === world.huntclub.home, 60000)), 'the first club stands again when you are back');
    return { id: far.id, name: far.name };
  });
}
