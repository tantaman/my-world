// Purgatory: come up the road out of the bottom of Hell onto the shore,
// before dawn; find the ground above you a wall at night, and sleep, and
// dream; climb the cleft at the foot by day; go up the gate's three steps,
// be marked with the seven P's, and in through the door; up the first stair,
// past its angel, who wipes one away; into the smoke of the third terrace;
// through the wall of fire to the top; leave and come back to where you
// were; and taste Lethe, then drink of Eunoë, and so out, to the stars.
//
// Needs nothing (if you didn't come up the road from Hell's part, it comes
// up it itself). Leaves: you on the hillside in front of the gate.

import assert from 'node:assert/strict';

// ms to let the hiker walk each stretch of a stair: drawn in software, the
// fire and the forest on the top go at a frame a second or so
const STRETCH = 30000;
// m from each point of a way up at which the hiker is at it, and turns for
// the next. Not much: a stair is cut into the bank, and a metre to one side
// of its foot the bank is a wall. (Turning a metre early cut that corner, and
// whether it caught on the bank depended on how long the frames were.)
const NEAR = 0.35;

// In the page: the points to walk up way w (plan.WAYS) by, as world { x, z }:
// in at its foot, along its way in, round its turn, and up its climb.
export function inPage() {
  T.wayUp = (w) => {
    const L = world.purgatory.land;
    const pts = [w.ra + 1, w.ra - 1, w.ra - w.lag / 2, w.ra - w.lag].map((r) => L.place(r, w.a0));
    for (let i = 1; i <= 10; i++) {
      const u = i / 10;
      pts.push(L.place(w.ra - w.lag - (w.ra - w.rb) * u, w.a0 - (w.a0 - w.a1) * u));
    }
    return pts;
  };
}

export default async function ({ page, step, open, shot }) {
  await step('up the road out of Hell', async () => {
    const up = await page.evaluate(async () => {
      const { purgatory, player } = world;
      if (!purgatory.inside) await purgatory.arrive();
      await T.until(() => purgatory.inside && !world.hell.passing, 60000);
      await T.frames(30);
      const out = {};
      const space = player.spaces.at(player.pos.x, player.pos.z, player.pos.y + 0.05, out);
      return {
        region: purgatory.region,
        space: space && space.id,
        floor: out.floor - player.pos.y,
        covered: world.game.covered,
        inScene: player.character.root.parent === purgatory.scene,
        sky: world.sky.dome.parent === purgatory.scene,
        hours: purgatory.hours,
        night: purgatory.night,
        been: purgatory.here.r > 2300,
        drawn: purgatory.view.terrain.stats.drawn,
      };
    });
    assert.equal(up.space, 'purgatory', 'on the island');
    assert.ok(Math.abs(up.floor) < 0.1, 'standing on it');
    assert.equal(up.region, 'plain', 'on the plain, by the burrow');
    assert.ok(up.covered && up.inScene && up.sky, "the forest isn't drawn; the hiker and the sky are");
    assert.ok(up.hours > 4.5 && up.hours < 6.5 && up.night, `before dawn (${up.hours.toFixed(2)})`);
    assert.ok(up.drawn > 50, 'the land is drawn round you');
    await shot('purgatory-shore');
    return up;
  });

  await step('the poem read aloud, in Hell’s own voice', async () => {
    const aloud = await page.evaluate(async () => {
      const { purgatory, hell } = world;
      // the one reader reads both books (hell.reader, core/reader.ts)
      const shared = purgatory.card.reader === hell.reader;
      purgatory.go(1500, -0.1); // the long hillside of Ante-Purgatory
      const read = await T.until(() => hell.reader.lines[0] === 'Ante-Purgatory', 30000);
      return { shared, read, lines: hell.reader.lines, region: purgatory.region, card: purgatory.card.showing };
    });
    assert.ok(aloud.shared, 'the mountain is read in the same voice as the Inferno below it');
    assert.equal(aloud.region, 'slope');
    assert.ok(aloud.read, 'the slope’s words come up to be read');
    assert.match(aloud.lines.at(-1), /Singing the Miserere verse by verse/, 'the poem’s own lines last');
    assert.equal(aloud.card, 'Ante-Purgatory', 'and they are on the screen as they are read');
    return aloud;
  });

  await step('the law of the mountain, and sleep', async () => {
    const night = await page.evaluate(async () => {
      const { purgatory, player } = world;
      const L = purgatory.land;
      // on the long slope, at night: up it as far as you were, and no further
      purgatory.hours = 10;
      purgatory.go(1700, 0.8);
      await T.frames(10);
      purgatory.hours = 21;
      await T.frames(10);
      const from = player.pos.y;
      const upHill = L.place(1500, 0.8);
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      player.steer = { x: upHill.x, z: upHill.z };
      await wait(8000);
      player.steer = null;
      const climbed = player.pos.y - from;
      // by day it can be climbed
      purgatory.hours = 9;
      await T.frames(5);
      const start = player.pos.y;
      const above = L.place(1640, 0.8);
      player.steer = { x: above.x, z: above.z, run: true };
      const reached = await T.until(() => Math.hypot(player.pos.x - above.x, player.pos.z - above.z) < 2, 60000);
      player.steer = null;
      const byDay = player.pos.y - start;
      const rise = L.height(above.x, above.z) - start; // (how much higher it is up there)
      // and at night, standing still, sleep comes, and a dream
      purgatory.hours = 23;
      await T.frames(5);
      const slept = await T.until(() => purgatory.passing, 20000);
      const card = await T.until(() => purgatory.card.showing === 'The Eagle', 10000);
      const woke = await T.until(() => !purgatory.passing, 30000);
      return { climbed, byDay, rise, reached, slept, card, woke, hours: purgatory.hours, night: purgatory.night };
    });
    assert.ok(night.climbed < 2.2, `at night, no higher than at sunset (${night.climbed.toFixed(2)} m)`);
    assert.ok(night.reached && night.rise > 5 && night.byDay > night.rise - 1, `by day, up the slope (${night.byDay.toFixed(1)} m)`);
    assert.ok(night.slept && night.card && night.woke, 'slept, dreamed of the eagle, and woke');
    assert.ok(!night.night && night.hours > 5.5 && night.hours < 9, `in the morning (${night.hours.toFixed(2)})`);
    return night;
  });

  await step('up the cleft at the foot', async () => {
    const cleft = await page.evaluate(async () => {
      const { purgatory, player } = world;
      const L = purgatory.land;
      purgatory.hours = 10;
      purgatory.go(2012, -0.035);
      await T.frames(10);
      const from = player.pos.y;
      const top = L.place(1916, -0.035);
      player.steer = { x: top.x, z: top.z, run: true };
      const got = await T.until(() => Math.hypot(player.pos.x - top.x, player.pos.z - top.z) < 1.5, 90000);
      player.steer = null;
      return { got, up: player.pos.y - from, region: purgatory.region };
    });
    assert.ok(cleft.got && cleft.up > 40, `up through the rifted rock (${cleft.up.toFixed(0)} m)`);
    assert.equal(cleft.region, 'terrace');
    return cleft;
  });

  await step('the gate, and the seven P’s', async () => {
    const gate = await page.evaluate(async () => {
      const { purgatory, player } = world;
      const L = purgatory.land;
      purgatory.hours = 10;
      const shut = { shut: L.shut };
      purgatory.go(968, -0.38);
      await T.frames(10);
      const step = L.place(955.4, -0.38);
      player.steer = { x: step.x, z: step.z };
      const marked = await T.until(() => purgatory.marked, 60000);
      player.steer = null;
      const brow = document.querySelectorAll('#purgatory-brow span:not(.gone)').length;
      // and in at the door, where it was shut
      const inside = L.place(951, -0.38);
      player.steer = { x: inside.x, z: inside.z };
      const went = await T.until(() => Math.hypot(player.pos.x - inside.x, player.pos.z - inside.z) < 1.2, 60000);
      player.steer = null;
      const way = L.wayAt(purgatory.here.r, purgatory.here.th);
      return { ...shut, marked, brow, open: !L.shut, went, way: way && way.k };
    });
    assert.ok(gate.shut, 'the door was shut');
    assert.ok(gate.marked && gate.brow === 7, 'up the three steps, and marked with seven P’s');
    assert.ok(gate.open && gate.went && gate.way === 0, "and in, to the needle's eye");
    await shot('purgatory-gate');
    return gate;
  });

  await step('up the first stair, and a P gone', async () => {
    const stair = await page.evaluate(async ([STRETCH, NEAR]) => {
      const { purgatory, player } = world;
      purgatory.hours = 10;
      purgatory.stair(1);
      await T.frames(10);
      const from = player.pos.y;
      const region = purgatory.region;
      // in at its foot, past the angel, and up its climb to its head
      const w = purgatory.ways[1];
      for (const p of T.wayUp(w)) {
        if (purgatory.region === 'envy') break;
        purgatory.hours = 10; // (kept at midday, whatever the clock does: nobody climbs at night)
        player.steer = { x: p.x, z: p.z, run: true };
        await T.until(() => Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < NEAR, STRETCH);
      }
      player.steer = null;
      await T.frames(10);
      return { region0: region, wiped: purgatory.wiped, up: player.pos.y - from, region: purgatory.region, brow: document.querySelectorAll('#purgatory-brow span:not(.gone)').length };
    }, [STRETCH, NEAR]);
    assert.equal(stair.region0, 'pride', 'on the first terrace');
    assert.ok(stair.wiped === 1 && stair.brow === 6, 'the angel wiped a P away');
    assert.ok(stair.up > 40 && stair.region === 'envy', `up to the second terrace (${stair.up.toFixed(0)} m)`);
    return stair;
  });

  await step('the smoke', async () => {
    const smoke = await page.evaluate(async () => {
      const { purgatory } = world;
      purgatory.hours = 11;
      purgatory.stair(3);
      const h = purgatory.here;
      purgatory.go(h.r, h.th + 120 / h.r);
      await T.frames(240);
      return { region: purgatory.region, smoke: purgatory.air.smoke };
    });
    assert.equal(smoke.region, 'wrath');
    assert.ok(smoke.smoke > 0.8, `the smoke closes round you (${smoke.smoke.toFixed(2)})`);
    await shot('purgatory-smoke');
    return smoke;
  });

  await step('through the fire to the top', async () => {
    const fire = await page.evaluate(async ([STRETCH, NEAR]) => {
      const { purgatory, player } = world;
      purgatory.hours = 11;
      // (as if the angels below had wiped theirs: the last P is the fire's to take)
      if (!purgatory.marked) purgatory.mark();
      for (let k = purgatory.wiped; k < 6; k++) purgatory.wipe(k);
      purgatory.stair(7);
      await T.frames(10);
      const w = purgatory.ways[7];
      let burned = 0;
      for (const p of T.wayUp(w)) {
        if (purgatory.region === 'eden') break;
        purgatory.hours = 11;
        player.steer = { x: p.x, z: p.z, run: true };
        await T.until(() => {
          burned = Math.max(burned, parseFloat(document.getElementById('purgatory-fire').style.opacity || 0));
          return Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < NEAR;
        }, STRETCH);
      }
      player.steer = null;
      await T.frames(10);
      return { burned, wiped: purgatory.wiped, region: purgatory.region };
    }, [STRETCH, NEAR]);
    assert.ok(fire.burned > 0.3, 'through the fire');
    assert.equal(fire.wiped, 7, 'the last P gone');
    assert.equal(fire.region, 'eden', 'and up into the forest on the top');
    await shot('purgatory-eden');
    return fire;
  });

  await step('leave, and come back to where you were', async () => {
    await page.evaluate(() => new Promise((r) => setTimeout(r, 2500))); // where you stand is noted every 2 s
    await open();
    const back = await page.evaluate(async () => {
      await T.frames(20);
      const { purgatory, player } = world;
      return { inside: purgatory.inside, region: purgatory.region, space: player.space && player.space.id, view: !!purgatory.view, wiped: purgatory.wiped };
    });
    assert.ok(back.inside && back.space === 'purgatory' && back.view, 'still on the mountain, and it is drawn');
    assert.equal(back.region, 'eden');
    assert.equal(back.wiped, 7);
    return back;
  });

  await step('Lethe, then Eunoë, and out to the stars', async () => {
    const end = await page.evaluate(async () => {
      const { purgatory, player, game } = world;
      const at = (what) => purgatory.at(what);
      const pack = () => game.commands.list.find((c) => c.id === 'drink');
      // Eunoë first: it works not, unless Lethe is tasted first
      const e = at('eunoe');
      purgatory.stand(e.x, e.z);
      await T.frames(20);
      const notYet = pack().now();
      await purgatory.drink();
      const first = purgatory.done;
      const l = at('lethe');
      purgatory.stand(l.x, l.z);
      await T.frames(20);
      const atLethe = pack().now();
      await purgatory.drink();
      purgatory.stand(e.x, e.z);
      await T.frames(20);
      pack().run();
      const out = await T.until(() => !purgatory.inside && !purgatory.passing, 30000);
      await T.frames(20);
      const g = world.hell.gate;
      return {
        notYet,
        first,
        atLethe,
        lethe: purgatory.lethe,
        out,
        done: purgatory.done,
        far: Math.hypot(player.pos.x - g.x, player.pos.z - g.z),
        covered: game.covered,
        card: document.getElementById('purgatory-card').textContent,
      };
    });
    assert.equal(end.atLethe, 'drink', 'standing in Lethe, to drink is at hand');
    assert.ok(end.notYet === 'drink' && !end.first, 'Eunoë works not before Lethe');
    assert.ok(end.lethe && end.out && end.done, 'drank of both, and went up');
    assert.ok(end.far < 20 && !end.covered, `back on the hillside before the gate (${end.far.toFixed(0)} m)`);
    assert.match(end.card, /mount unto the stars/);
    return end;
  });
}
