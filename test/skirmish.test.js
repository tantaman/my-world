// Dry Wells: where the gate is (grown from the seed, and pinned, since it's
// a place on the map people track), that the town can be walked the way the
// bots mean to walk it, how you move in it, what the guns do, the rules of a
// round and what it pays, what happens when fighters meet, that the bots can
// play a whole match, and that a match can be shared: joined, handed on when
// its host leaves.

import test from 'node:test';
import assert from 'node:assert/strict';
import { growWorld, LANDS } from '../src/world/lands.js';
import { Dealers, clearOf as lotClear } from '../src/cars/dealers.js';
import { findGate as findHell } from '../src/hell/site.js';
import { findSite, candidates, pickSite, clearOf, HALF, SKIRT, REACH } from '../src/skirmish/site.js';
import { BOXES, NODES, LINKS, SPAWNS, SITES, MID_POSTS, BOUNDS, GALLERY, nodeById, floorAt, siteAt, route, walkBetween, nearestNode } from '../src/skirmish/town.js';
import { MOVE, makeBody, moveBody, free, heightOf, eyeOf } from '../src/skirmish/mover.js';
import { GUNS, GRENADES, SHOP, CASH, freshKit, quote, take, wound, spreadOf, shopping } from '../src/skirmish/arms.js';
import { Rounds, RULES, PAY } from '../src/skirmish/rounds.js';
import { Match, TEAM, ROSTER } from '../src/skirmish/match.js';
import { sees, wayTo, clearWalk } from '../src/skirmish/bots.js';
import { Session } from '../src/skirmish/net.js';
import { roadsWorld } from './helpers/roadsWorld.js';
import { matchesGolden } from './helpers/golden.js';

const SEED = 20261119;
const STEP = 1 / 60;
const RUN = { jump: false, crouch: false, walk: false, speed: MOVE.speed };

// ── The gate ────────────────────────────────────────────────────────────────

// The world as the game has it: the things the gate keeps clear of, made the
// way their features make them (index.ts).
const overlaps = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const HELL_KEEP = 40; // m (site.js)
function worldOf(land) {
  const w = roadsWorld(SEED, land);
  const dealers = new Dealers(w.gen, { towns: w.towns, roads: w.roads, keepOff: lotClear({ gen: w.gen, reaches: w.keepHike, clear: w.there.clear, lines: w.lines, towns: w.towns }), ready: w.there.ready });
  const hell = findHell(w.gen, w.keepHike);
  const hellBox = hell && [hell.x - HELL_KEEP, hell.z - HELL_KEEP, hell.x + HELL_KEEP, hell.z + HELL_KEEP];
  const keepOff = clearOf({ landforms: w.landforms, there: w.there, towns: w.towns, lines: w.lines, roads: w.roads, dealers, hell });
  return { ...w, dealers, hellBox, keepOff };
}

test('the gate is grown from the seed: the same every time, on flat dry ground, clear of what was there first', () => {
  for (const land of LANDS) {
    const w = worldOf(land);
    const { gen, start, there, towns, roads, lines, dealers, hellBox, keepOff } = w;
    // the game waits until everything that might be in the way has been
    // found, each by its own feature, a little at a time
    const ring = [start.x - REACH, start.z - REACH, start.x + REACH, start.z + REACH];
    for (let n = 0; !keepOff.ready(...ring); n++) {
      assert.ok(n < 20000, 'what might be in the way is all found in the end');
      for (const found of [w.towns, w.lines, w.pads, w.branches, w.airports, w.tracks, w.far, w.roads, w.dealers]) found.pump(2);
    }
    const site = findSite(gen, start, keepOff);
    assert.ok(site, `land ${land} has a gate`);
    assert.deepEqual(findSite(gen, start, keepOff), site, 'and the same one again');
    // (the game looks for the spots at once, and picks among them once what's in the way is known)
    const spots = candidates(gen, start);
    assert.deepEqual(pickSite(start, spots, keepOff), site);
    assert.ok(spots.length > 5, 'with others it could have been');
    const d = Math.hypot(site.x - start.x, site.z - start.z);
    assert.ok(d >= 120 && d <= 480, `a walk from the start (${d.toFixed(0)} m)`);
    assert.ok(d + Math.hypot(HALF.x, HALF.z) + SKIRT < REACH, 'within the reach that’s waited on');
    gen.height(site.x, site.z);
    assert.ok(gen.water.edge >= 14, 'out of the water');
    assert.ok(site.top > site.low && site.top - site.low < 2.6, `on ground that's flat enough (${(site.top - site.low).toFixed(2)} m)`);
    const b = site.box;
    assert.ok(!keepOff(b[0], b[1], b[2], b[3]), 'clear of everything it keeps clear of');
    // the launch sites, the stores, the airfields, the buildings, the hunt club, the tracks, the pier
    for (const s of there.clear(...b)) assert.ok(!overlaps(b, s.site ? s.site.box : s.box || [s.x - s.r, s.z - s.r, s.x + s.r, s.z + s.r]), `clear of ${s.site ? s.site.id : 'what was there first'}`);
    assert.equal(towns.within(...b).length, 0, 'the towns');
    assert.equal(dealers.within(...b).length, 0, 'their dealerships');
    assert.ok(!hellBox || !overlaps(b, hellBox), 'the gate under the hill');
    // no road over its slab, and no rail
    for (const way of [...roads.within(...b), ...lines.within(...b)]) {
      for (let i = 0; i < way.n; i++) assert.ok(way.x[i] < b[0] || way.x[i] > b[2] || way.z[i] < b[1] || way.z[i] > b[3], `${way.id} doesn’t run over it`);
    }
    // its front faces the start
    assert.ok(((start.x - site.x) * Math.sin(site.yaw) + (start.z - site.z) * Math.cos(site.yaw)) / d > 0.99, 'its front faces the way people come');
    assert.deepEqual(site.plan, [[-HALF.x, -HALF.z, HALF.x, HALF.z]]);
    assert.equal(site.cleared[0][2], HALF.x + SKIRT);
    // the place on the map people track is where it was
    const round = (v) => Math.round(v * 1000) / 1000;
    matchesGolden(land > 1 ? `skirmish-${SEED}-land${land}` : `skirmish-${SEED}`, { id: site.id, x: round(site.x), z: round(site.z), yaw: round(site.yaw), top: round(site.top) }, { tolerance: 1e-6 });
  }
});

test('the gate keeps off a road, a town, a dealership, the gate under the hill, and whatever else was there first', () => {
  const gen = growWorld(SEED);
  const start = gen.findSpawn(0, 0);
  const first = findSite(gen, start);
  const b = first.box;
  const at = { x: first.x, z: first.z };
  const way = (dx) => ({ id: 'way', n: 3, x: [at.x + dx, at.x + dx, at.x + dx], z: [at.z - 60, at.z, at.z + 60], box: [at.x + dx, at.z - 60, at.x + dx, at.z + 60] });
  const within = (things) => ({ within: (x0, z0, x1, z1) => things.filter((t) => overlaps(t.box, [x0, z0, x1, z1])) });
  const moved = (things, what) => {
    const keepOff = clearOf(things);
    const s = findSite(gen, start, keepOff);
    assert.ok(s && s.id !== first.id && !keepOff(...s.box), `${what}: somewhere else, clear of it`);
    return s;
  };
  moved({ roads: within([way(0)]) }, 'a road through it');
  moved({ roads: within([way(b[2] - at.x + 8)]) }, 'a road close by it');
  moved({ towns: within([{ box: [b[0] + 2, b[1] + 2, b[2] - 2, b[3] - 2] }]) }, 'a town');
  moved({ dealers: within([{ box: [b[0] + 2, b[1] + 2, b[2] - 2, b[3] - 2] }]) }, 'a dealership');
  moved({ hell: { x: at.x + 30, z: at.z } }, 'the gate under the hill');
  moved({ there: { clear: () => [{ x: at.x, z: at.z, r: 5 }] } }, 'something round, there first');
  moved({ there: { clear: (x0, z0, x1, z1) => (overlaps([x0, z0, x1, z1], b) ? [{ box: b }] : []) } }, 'something square');
  moved({ landforms: { reaches: (x0, z0, x1, z1) => overlaps([x0, z0, x1, z1], b) } }, 'a real place');
  // a road whose box crosses the square, but which runs well clear of it, is no bar
  const far = { id: 'far', n: 2, x: [at.x - 300, at.x - 300], z: [at.z - 300, at.z + 300], box: [at.x - 300, at.z - 300, at.x + 300, at.z + 300] };
  assert.equal(findSite(gen, start, clearOf({ roads: within([far]) })).id, first.id);
  // and with nothing in the way, there's nothing to wait for
  assert.equal(clearOf().ready, undefined);
});

// ── The town ────────────────────────────────────────────────────────────────

// Walk a body from one node towards another, as a bot does. -> where it got to.
function walk(from, to, seconds = 30) {
  const body = makeBody(from.x, from.y, from.z);
  for (let t = 0; t < seconds; t += STEP) {
    const dx = to.x - body.pos.x;
    const dz = to.z - body.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.3) break;
    moveBody(body, { x: dx / d, z: dz / d }, RUN, STEP, BOXES);
  }
  return body;
}

test('the town is closed in, and everything in it stands on something', () => {
  for (const b of BOXES) {
    assert.ok(b.x1 > b.x0 && b.y1 > b.y0 && b.z1 > b.z0, `a box has some size (${b.look})`);
    assert.ok(b.x0 >= BOUNDS.x0 - 2 && b.x1 <= BOUNDS.x1 + 2 && b.z0 >= BOUNDS.z0 - 2 && b.z1 <= BOUNDS.z1 + 2, 'inside the town');
  }
  // nobody walks out: a body pushed at each wall stays in
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const body = makeBody(0, 0, dz ? 0 : 35 * 0);
    body.pos.z = 34; // the Raiders' yard runs the width of the town
    if (dz) body.pos.x = dx;
    for (let t = 0; t < 30; t += STEP) moveBody(body, { x: dx, z: dz < 0 ? 0 : dz }, RUN, STEP, BOXES);
    assert.ok(body.pos.x > BOUNDS.x0 && body.pos.x < BOUNDS.x1 && body.pos.z > BOUNDS.z0 && body.pos.z < BOUNDS.z1, 'stopped by the town wall');
    assert.equal(body.pos.y, 0);
  }
});

test('every way the bots know can be walked, both ways', () => {
  for (const n of NODES) {
    assert.ok(Number.isFinite(n.y), `${n.id} has a floor under it`);
    assert.ok(free(BOXES, n.x, n.y, n.z), `${n.id} isn't inside something`);
  }
  for (const [a, b] of LINKS) {
    for (const [from, to] of [[a, b], [b, a]]) {
      const p = nodeById.get(from);
      const q = nodeById.get(to);
      const body = walk(p, q);
      assert.ok(Math.hypot(q.x - body.pos.x, q.z - body.pos.z) < 0.3 && Math.abs(body.pos.y - q.y) < 0.1, `${from} -> ${to} (stopped at ${body.pos.x.toFixed(1)}, ${body.pos.y.toFixed(1)}, ${body.pos.z.toFixed(1)})`);
    }
  }
  for (const n of NODES) assert.ok(n.id === 'ry-c' || route('ry-c', n.id), `${n.id} can be got to`);
  assert.equal(nodeById.get('a-gal').y, GALLERY, 'the gallery is up its steps');
});

test('each side comes in at home, the sites are where the charge can be set, and the Wardens get there first', () => {
  for (const side of ['attack', 'defend']) {
    assert.ok(SPAWNS[side].length >= TEAM, `room for all of the ${side}`);
    for (const s of SPAWNS[side]) assert.ok(free(BOXES, s.x, 0, s.z) && !siteAt(s.x, s.z), 'a clear spot, not at a site');
  }
  assert.deepEqual(SITES.map((s) => s.id), ['A', 'B']);
  for (const s of SITES) {
    for (const spot of s.spots) {
      assert.equal(siteAt(spot.x, spot.z), s, `a spot at ${s.id} is in ${s.id}`);
      assert.ok(free(BOXES, spot.x, floorAt(spot.x, spot.z, GALLERY + 0.1), spot.z), 'and clear');
    }
    for (const post of s.posts) assert.ok(free(BOXES, post.x, floorAt(post.x, post.z, GALLERY + 0.1), post.z), `a post at ${s.id} is clear`);
    assert.ok(s.posts.length >= TEAM, 'a post for everyone');
    const at = nearestNode((s.zone[0] + s.zone[2]) / 2, (s.zone[1] + s.zone[3]) / 2, 0).id;
    const raiders = walkBetween('ry-c', at);
    const wardens = walkBetween('wy-c', at);
    assert.ok(wardens < raiders - 15, `the Wardens are at ${s.id} first (${wardens.toFixed(0)} m against ${raiders.toFixed(0)} m)`);
  }
  for (const p of MID_POSTS) assert.ok(free(BOXES, p.x, 0, p.z));
});

// ── Moving ──────────────────────────────────────────────────────────────────

test('you run, walk at half that, and crouch lower and slower still', () => {
  const pace = (how) => {
    const body = makeBody(0, 0, 36);
    for (let t = 0; t < 2; t += STEP) moveBody(body, { x: 1, z: 0 }, { ...RUN, ...how }, STEP, BOXES);
    return { v: Math.hypot(body.vel.x, body.vel.z), body };
  };
  const run = pace({});
  assert.ok(Math.abs(run.v - MOVE.speed) < 0.05, `running at ${run.v.toFixed(2)} m/s`);
  assert.ok(Math.abs(pace({ walk: true }).v - MOVE.speed * MOVE.walk) < 0.05);
  const low = pace({ crouch: true });
  assert.ok(Math.abs(low.v - MOVE.speed * MOVE.duck) < 0.05);
  assert.equal(low.body.crouch, 1);
  assert.ok(heightOf(low.body) < 1.3 && eyeOf(low.body) < 1.1, 'down behind a crate');
  assert.ok(Math.abs(pace({ speed: GUNS.longrifle.pace }).v - GUNS.longrifle.pace) < 0.05, 'and at the pace of what’s in hand');
  // and you stop in a step or two
  for (let t = 0; t < 0.5; t += STEP) moveBody(run.body, { x: 0, z: 0 }, RUN, STEP, BOXES);
  assert.equal(Math.hypot(run.body.vel.x, run.body.vel.z), 0);
});

test('a jump clears a low crate, not a tall one; a step is walked up', () => {
  // the low crate in the well court: x 2.6..4.2, z 9.5..11.1, 0.9 high
  const hop = (jump) => {
    const body = makeBody(0.5, 0, 10.3);
    let top = 0;
    for (let t = 0; t < 2; t += STEP) {
      moveBody(body, { x: 1, z: 0 }, { ...RUN, jump: jump && t > 0.2 && t < 0.3 }, STEP, BOXES);
      top = Math.max(top, body.pos.y);
    }
    return { body, top };
  };
  assert.ok(hop(false).body.pos.x < 2.6 - MOVE.half + 0.01, 'walking into it stops you');
  const over = hop(true);
  assert.ok(over.top > 0.9 && over.top < 1.3, `a jump is about a metre (${over.top.toFixed(2)} m)`);
  assert.ok(over.body.pos.x > 2.6, 'and gets you onto it');
  // the tall one by the Wardens' yard: x -12..-10.4, z -32..-30.4, 1.8 high
  const body = makeBody(-14, 0, -31.2);
  for (let t = 0; t < 2; t += STEP) moveBody(body, { x: 1, z: 0 }, { ...RUN, jump: true }, STEP, BOXES);
  assert.ok(body.pos.x < -12, 'no getting onto a tall one');
  // the Granary's stone floor, 0.45 m up
  const up = makeBody(27, 0, -18);
  for (let t = 0; t < 1.5; t += STEP) moveBody(up, { x: 1, z: 0 }, RUN, STEP, BOXES);
  assert.ok(up.pos.x > 30 && Math.abs(up.pos.y - 0.45) < 1e-6 && up.grounded, 'walked up onto');
  // under the undercroft's roof there's room to stand; a crouch stays down under something lower
  assert.ok(free(BOXES, -23, 0, 4, MOVE.height));
});

// ── The guns ────────────────────────────────────────────────────────────────

test('what a shot does: the head, a vest, a helmet, the distance', () => {
  const rifle = GUNS.rifle;
  assert.ok(wound(rifle, 'head', 5, 0, false).health >= 100, 'a rifle round to the head is the end of it');
  assert.ok(wound(rifle, 'head', 5, 100, true).health >= 100, '...helmet or no');
  const body = wound(rifle, 'body', 5, 0, false).health;
  assert.ok(body > 25 && body < 40, 'three or four to the body');
  const vested = wound(rifle, 'body', 5, 100, false);
  assert.ok(vested.health < body && vested.armor > 0, 'a vest takes some of it, and wears');
  assert.equal(wound(rifle, 'legs', 5, 100, true).health, wound(rifle, 'legs', 5, 0, false).health, 'nothing covers the legs');
  assert.ok(wound(rifle, 'legs', 5, 0, false).health < body);
  assert.ok(wound(GUNS.sidearm, 'head', 5, 100, true).health < 100, 'a helmet stops a pistol round');
  assert.ok(wound(GUNS.sidearm, 'head', 5, 100, false).health > 100, '...and without one it doesn’t');
  assert.ok(wound(GUNS.smg, 'body', 40, 0, false).health < wound(GUNS.smg, 'body', 2, 0, false).health * 0.5, 'an SMG is for close to');
  assert.ok(wound(GUNS.longrifle, 'body', 60, 100, false).health >= 100, 'the long rifle, anywhere above the legs');
  assert.ok(wound(GUNS.shotgun, 'body', 3, 0, false).health * GUNS.shotgun.pellets > 100);
});

test('a shot strays more on the run and in the air, less crouched and through a sight', () => {
  const g = GUNS.rifle;
  const still = spreadOf(g, {});
  assert.ok(spreadOf(g, { pace: 1 }) > still * 5, 'running throws it');
  assert.ok(spreadOf(g, { pace: 0.5 }) < still * 4, 'a walk hardly does');
  assert.ok(spreadOf(g, { air: true }) > spreadOf(g, { pace: 1 }));
  assert.ok(spreadOf(g, { ducked: true }) < still);
  assert.ok(spreadOf(g, { bloom: g.most }) > still * 5, 'holding the trigger down opens it up');
  assert.ok(spreadOf(GUNS.longrifle, { sighted: true }) < spreadOf(GUNS.longrifle, {}) / 20);
});

test('the shop: what can be bought, by whom, for how much', () => {
  for (const item of SHOP) assert.ok(GUNS[item] || GRENADES[item] || ['vest', 'helmet', 'kit'].includes(item), item);
  const kit = freshKit();
  assert.deepEqual(quote(kit, CASH.start, 'attack', 'rifle'), { price: 2700, no: 'not enough money' });
  assert.deepEqual(quote(kit, 5000, 'attack', 'rifle'), { price: 2700 });
  assert.equal(take(kit, 'rifle'), 'rifle');
  assert.equal(kit.main, 'rifle');
  assert.equal(quote(kit, 5000, 'attack', 'rifle').no, 'you have one');
  assert.deepEqual(quote(kit, 5000, 'attack', 'smg'), { price: 1250 }, 'one main gun at a time: another takes its place');
  assert.equal(quote(kit, 5000, 'attack', 'kit').no, 'Wardens only');
  assert.deepEqual(quote(kit, 5000, 'defend', 'kit'), { price: 400 });
  assert.deepEqual(quote(kit, 5000, 'attack', 'helmet'), { price: 1000 });
  take(kit, 'vest');
  assert.deepEqual(quote(kit, 5000, 'attack', 'helmet'), { price: 350 }, 'a helmet for a vest you have');
  take(kit, 'helmet');
  assert.ok(kit.armor === 100 && kit.helmet);
  assert.equal(quote(kit, 5000, 'attack', 'vest').no, 'you have one');
  take(kit, 'smoke');
  assert.equal(quote(kit, 5000, 'attack', 'smoke').no, 'you have one');
  assert.equal(quote(kit, 5000, 'attack', 'sidearm').no, 'you have one');
  assert.equal(quote(kit, 5000, 'attack', 'tank').no, 'no such thing');
  // a bot never spends what it hasn't got, and with money buys a rifle
  for (const cash of [0, 800, 2000, 3000, 4200, 9000, 16000]) {
    for (const side of ['attack', 'defend']) {
      const k = freshKit();
      let left = cash;
      const list = shopping(k, cash, side, 0.6);
      for (const item of list) {
        const q = quote(k, left, side, item);
        assert.ok(!q.no, `${item} with $${left} of $${cash}: ${q.no}`);
        left -= q.price;
        take(k, item);
      }
      if (cash >= 4200) assert.ok(k.main === 'rifle' && k.armor === 100, `a rifle and a vest with $${cash}`);
    }
  }
});

// ── The rules ───────────────────────────────────────────────────────────────

const FULL = { attack: TEAM, defend: TEAM };
// A match's rounds, with what it said.
function rounds() {
  const R = new Rounds();
  const said = [];
  for (const kind of ['round', 'live', 'won', 'half', 'ended', 'match']) R.on(kind, (e) => said.push([kind, e]));
  R.begin();
  return { R, said, last: (kind) => said.filter((s) => s[0] === kind).at(-1)?.[1] };
}
const tick = (R, seconds, alive = FULL) => {
  for (let t = 0; t < seconds; t += 0.1) R.update(0.1, alive);
};

test('a round: the freeze, then the clock, and the Wardens win if it runs out', () => {
  const { R, last } = rounds();
  assert.deepEqual([R.round, R.phase, R.buying], [1, 'freeze', true]);
  tick(R, RULES.freeze + 0.2);
  assert.equal(R.phase, 'live');
  assert.ok(R.buying, 'still time to buy');
  tick(R, RULES.buy + 0.5);
  assert.ok(!R.buying);
  tick(R, RULES.round - RULES.buy);
  assert.equal(R.phase, 'over');
  const won = last('won');
  assert.deepEqual([won.side, won.why, won.team], ['defend', 'time', 1]);
  assert.deepEqual(R.score, [0, 1]);
  assert.equal(won.pay.defend, PAY.win);
  assert.ok(won.pay.keepNothing, 'Raiders who sat it out alive are paid nothing');
  tick(R, RULES.after + 0.2);
  assert.deepEqual([R.round, R.phase], [2, 'freeze']);
});

test('a round is won by the last ones standing, the charge going off, or its fuse being pulled', () => {
  let { R, last } = rounds();
  tick(R, RULES.freeze + 0.2);
  R.update(0.1, { attack: 3, defend: 0 });
  assert.deepEqual([last('won').side, last('won').why], ['attack', 'eliminated']);

  ({ R, last } = rounds());
  tick(R, RULES.freeze + 0.2);
  R.update(0.1, { attack: 0, defend: 2 });
  assert.deepEqual([last('won').side, last('won').why], ['defend', 'eliminated']);

  // set: the fuse is the clock, and the Raiders being down no longer ends it
  ({ R, last } = rounds());
  tick(R, RULES.freeze + 5);
  assert.ok(R.plant());
  assert.deepEqual([R.phase, Math.round(R.left)], ['planted', RULES.fuse]);
  R.update(0.1, { attack: 0, defend: 2 });
  assert.equal(R.phase, 'planted');
  tick(R, RULES.fuse, { attack: 0, defend: 2 });
  assert.deepEqual([last('won').side, last('won').why, last('won').pay.attack], ['attack', 'exploded', PAY.charge]);

  ({ R, last } = rounds());
  tick(R, RULES.freeze + 5);
  assert.ok(!R.defuse(), 'nothing to pull yet');
  R.plant();
  assert.ok(R.defuse());
  assert.deepEqual([last('won').side, last('won').why, last('won').pay.defend], ['defend', 'defused', PAY.charge]);
  assert.equal(last('won').pay.attack, PAY.loss + PAY.again + PAY.planted, 'the Raiders are paid for having set it');
  assert.ok(!R.plant(), 'and it can’t be set once the round is over');
});

test('losing pays more each time, the sides change at half time, and thirteen takes the match', () => {
  const { R, said, last } = rounds();
  const play = (side) => {
    tick(R, RULES.freeze + 0.2);
    R.update(0.1, side === 'attack' ? { attack: 1, defend: 0 } : { attack: 0, defend: 1 });
    const won = last('won');
    tick(R, RULES.after + 0.2);
    return won;
  };
  // the Raiders (team 0) win round after round: the Wardens' losses pay more each time
  const losses = [];
  for (let i = 0; i < 6; i++) losses.push(play('attack').pay.defend);
  assert.deepEqual(losses, [1900, 2400, 2900, 3400, 3400, 3400]);
  // a win takes one off the count
  assert.equal(play('defend').pay.attack, PAY.loss, 'a first loss after a run of wins');
  assert.equal(play('attack').pay.defend, PAY.loss + PAY.again * 4);
  for (let i = 0; i < 4; i++) play('attack');
  assert.deepEqual(R.score, [11, 1]);
  // half time: team 1 attacks now
  assert.equal(said.filter((s) => s[0] === 'half').length, 1);
  assert.deepEqual([R.round, R.attackers, R.sideOf(0), R.sideOf(1)], [13, 1, 'defend', 'attack']);
  assert.equal(play('attack').team, 1, 'the side that wins is the team now on it');
  play('defend');
  assert.equal(R.phase, 'freeze');
  play('defend');
  assert.deepEqual(R.score, [13, 2]);
  assert.equal(R.phase, 'ended');
  assert.deepEqual(last('ended'), { winner: 0 });
  // and after a while, another
  tick(R, RULES.ended + 0.2);
  assert.deepEqual([R.round, R.phase, R.score, R.attackers], [1, 'freeze', [0, 0], 0]);
  assert.ok(said.some((s) => s[0] === 'match'));
});

test('twelve all is a draw', () => {
  const { R, last } = rounds();
  for (let i = 0; i < 24; i++) {
    tick(R, RULES.freeze + 0.2);
    // each team wins all its rounds as Raiders
    R.update(0.1, { attack: 1, defend: 0 });
    tick(R, RULES.after + 0.2);
  }
  assert.deepEqual(R.score, [12, 12]);
  assert.deepEqual(last('ended'), { winner: null });
});

// ── A match ─────────────────────────────────────────────────────────────────

// A match with you in it and the bots stood still, the freeze over.
function quietMatch(seed = 5) {
  const m = new Match({ seed, me: { id: 'me', name: 'Me' } });
  const me = m.join('me', 'Me');
  for (const f of m.fighters) if (f.bot) f.bot.think = () => ({ wish: { x: 0, z: 0 } });
  while (m.rounds.phase === 'freeze') m.update(STEP);
  const said = [];
  for (const kind of ['shot', 'hurt', 'kill', 'planted', 'defused', 'boom', 'won', 'picked', 'dropped', 'bought', 'refused', 'burst']) m.on(kind, (e) => said.push([kind, e]));
  return { m, me, said, foes: m.fighters.filter((f) => f.team !== me.team), mates: m.fighters.filter((f) => f.team === me.team && f !== me) };
}
const put = (f, x, z, yaw = 0, y = 0) => {
  Object.assign(f.body.pos, { x, y, z });
  f.yaw = yaw;
  f.pitch = 0;
  f.body.vel.x = f.body.vel.z = 0;
};
const idle = (extra = {}) => ({ move: { x: 0, y: 0 }, turn: { yaw: 0, pitch: 0 }, ...extra });

test('there are five a side, bots all, and whoever walks in takes one over', () => {
  const m = new Match({ seed: 3, me: { id: 'a', name: 'Ada' } });
  assert.equal(m.fighters.length, TEAM * 2);
  assert.ok(m.fighters.every((f) => f.bot && !f.owner));
  assert.equal(m.mine, null);
  const a = m.join('a', 'Ada');
  assert.deepEqual([a.name, a.owner, a.bot], ['Ada', 'a', null]);
  assert.equal(m.mine, a);
  assert.equal(m.join('a', 'Ada'), a, 'once');
  const b = m.join('b', 'Bo');
  assert.notEqual(b.team, a.team, 'the next goes to the other side');
  const c = m.join('c', 'Cy');
  assert.equal(m.fighters.filter((f) => f.owner).length, 3);
  assert.equal(m.fighters.filter((f) => f.bot).length, 7);
  // they keep what the bot had: its place, its money, its score
  assert.equal(c.cash, CASH.start);
  m.leave('b');
  assert.deepEqual([b.owner, b.name, !!b.bot], [null, ROSTER[b.id].name, true], 'and the bot has it back');
  // a full house: the eleventh has nowhere to go
  for (let i = 0; i < 8; i++) assert.ok(m.join(`p${i}`, `P${i}`));
  assert.equal(m.join('late', 'Late'), null);
});

test('a shot hits what it is aimed at: the other side, not your own, not through a wall', () => {
  const { m, me, said, foes, mates } = quietMatch();
  // face to face in the Raiders' yard, ten metres apart
  put(me, 0, 34, Math.PI / 2); // facing −x
  put(foes[0], -10, 34, -Math.PI / 2);
  put(mates[0], -5, 34);
  me.ammo.sidearm.mag = 12;
  // your own side, in the way, is shot through and unhurt (nobody is hit by their own)
  m.update(STEP, idle({ fired: true }));
  const shot = said.find((s) => s[0] === 'shot')[1];
  assert.equal(shot.by, me.id);
  assert.deepEqual(shot.rays[0].hit, [foes[0].id, 'head'], 'level with the eye is the head');
  assert.equal(mates[0].hp, 100);
  assert.equal(foes[0].hp, 0, 'a sidearm to a bare head');
  assert.deepEqual(said.find((s) => s[0] === 'kill')[1], { id: foes[0].id, by: me.id, how: 'sidearm', head: true });
  assert.equal(me.kills, 1);
  assert.equal(me.cash, CASH.start + GUNS.sidearm.reward);
  assert.equal(me.ammo.sidearm.mag, 11);
  // a wall between: the shot stops at it
  put(me, 0, 34, 0); // facing north: the block between the two streets is 6 m off
  put(foes[1], 0, 10, Math.PI);
  for (let t = 0; t < 0.3; t += STEP) m.update(STEP, idle());
  said.length = 0;
  m.update(STEP, idle({ fired: true }));
  const stopped = said.find((s) => s[0] === 'shot')[1].rays[0];
  assert.equal(stopped.hit, null);
  assert.ok(Math.abs(stopped.to[2] - 28) < 0.3 && stopped.n, 'at the wall, six metres on');
  assert.equal(foes[1].hp, 100);
  // an empty gun clicks, and reloads
  me.ammo.sidearm.mag = 0;
  for (let t = 0; t < 0.3; t += STEP) m.update(STEP, idle());
  m.update(STEP, idle({ fired: true }));
  assert.ok(me.reloading > 0);
  for (let t = 0; t < GUNS.sidearm.reload + 0.1; t += STEP) m.update(STEP, idle());
  assert.deepEqual(me.ammo.sidearm, { mag: 12, spare: 24 });
});

test('the body, a vest, the legs; and a knife from behind', () => {
  const { m, me, foes } = quietMatch();
  put(me, 0, 34, Math.PI / 2);
  put(foes[0], -6, 34, -Math.PI / 2);
  foes[0].kit.armor = 100;
  me.pitch = -0.08; // the chest
  m.update(STEP, idle({ fired: true }));
  assert.ok(foes[0].hp < 100 && foes[0].hp > 80 && foes[0].kit.armor < 100, `a vest takes the worst of a pistol round (${foes[0].hp}, vest ${foes[0].kit.armor})`);
  for (let t = 0; t < 0.4; t += STEP) m.update(STEP, idle());
  me.pitch = -0.24; // the legs
  const before = foes[0].hp;
  m.update(STEP, idle({ fired: true }));
  assert.ok(before - foes[0].hp >= 18 && before - foes[0].hp <= 22, 'and nothing covers the legs');
  // the knife: close, and from behind
  put(foes[1], -1.2, 34, Math.PI / 2); // its back to you
  put(foes[0], 20, 34);
  me.pitch = 0;
  m.update(STEP, idle({ pick: 'knife' }));
  for (let t = 0; t < 0.7; t += STEP) m.update(STEP, idle());
  m.update(STEP, idle({ fired: true }));
  assert.equal(foes[1].alive, false, 'from behind, a knife is the end of it');
  assert.equal(me.cash, CASH.start + GUNS.knife.reward);
});

test('the charge: set at a site, pulled by a Warden (faster with a kit), or it goes off', () => {
  const { m, me, said, foes } = quietMatch();
  assert.equal(m.sideOf(me), 'attack', 'the first in is a Raider');
  // you carry it
  for (const f of m.fighters) f.charge = false;
  me.charge = true;
  Object.assign(m.charge, { state: 'carried', by: me.id });
  // not here: the well court is no site
  put(me, 0, -6);
  for (let t = 0; t < RULES.plant + 0.5; t += STEP) m.update(STEP, idle({ use: true }));
  assert.equal(m.charge.state, 'carried');
  // at the Granary: hold it down for as long as it takes; let go and you start again
  put(me, 32, -21.5, 0, 0.45);
  for (let t = 0; t < RULES.plant - 0.5; t += STEP) m.update(STEP, idle({ use: true }));
  assert.ok(me.planting > 2 && me.held === 'charge');
  m.update(STEP, idle());
  assert.equal(me.planting, 0);
  for (let t = 0; t < RULES.plant + 0.1; t += STEP) m.update(STEP, idle({ use: true }));
  assert.deepEqual([m.charge.state, m.charge.site, m.rounds.phase], ['planted', 'A', 'planted']);
  assert.ok(!me.charge && me.held !== 'charge');
  assert.equal(me.cash, CASH.start + PAY.plant);
  assert.deepEqual(said.find((s) => s[0] === 'planted')[1], { id: me.id, site: 'A', at: [32, 0.45, -21.5] });
  // a Warden at it, pulling: ten seconds bare-handed
  const warden = foes[0];
  put(me, 0, 34);
  put(warden, 32.8, -21.5, 0, 0.45);
  warden.bot.think = () => ({ wish: { x: 0, z: 0 }, use: true });
  for (let t = 0; t < RULES.defuse - 1; t += STEP) m.update(STEP, idle());
  assert.ok(warden.defusing > RULES.defuse - 1.2 && m.charge.state === 'planted');
  for (let t = 0; t < 1.2; t += STEP) m.update(STEP, idle());
  assert.equal(m.charge.state, 'defused');
  assert.deepEqual(said.findLast((s) => s[0] === 'won')[1], { side: 'defend', team: warden.team, why: 'defused' });
  assert.equal(warden.cash, CASH.start + PAY.defuse + PAY.charge);
});

test('a kit halves the pulling; too late, and it takes everyone near with it', () => {
  const { m, me, said, foes, mates } = quietMatch();
  for (const f of m.fighters) f.charge = false;
  me.charge = true;
  Object.assign(m.charge, { state: 'carried', by: me.id });
  put(me, -34, -23.5);
  for (let t = 0; t < RULES.plant + 0.1; t += STEP) m.update(STEP, idle({ fire: true, pick: 'charge' }));
  assert.deepEqual([m.charge.state, m.charge.site], ['planted', 'B'], 'the trigger sets it too, with the charge in hand');
  const warden = foes[0];
  warden.kit.kit = true;
  put(warden, -34.8, -23.5);
  warden.bot.think = () => ({ wish: { x: 0, z: 0 }, use: true });
  for (let t = 0; t < RULES.kitDefuse - 1; t += STEP) m.update(STEP, idle());
  assert.equal(m.charge.state, 'planted');
  // it walks off: all to do again; and the fuse runs out
  warden.bot.think = () => ({ wish: { x: 0, z: 0 } });
  m.update(STEP, idle());
  assert.equal(warden.defusing, 0);
  put(mates[0], 20, 34);
  m.rounds.left = 0.2;
  for (let t = 0; t < 0.5; t += STEP) m.update(STEP, idle());
  assert.equal(m.charge.state, 'blown');
  assert.deepEqual(said.findLast((s) => s[0] === 'won')[1].why, 'exploded');
  assert.ok(said.some((s) => s[0] === 'boom'));
  assert.equal(warden.alive, false, 'standing over it');
  assert.equal(me.alive, false, '...whichever side you’re on');
  assert.equal(mates[0].alive, true, 'the far side of town is far enough');
});

test('whoever carries the charge and falls drops it, and the next Raider by picks it up', () => {
  const { m, me, said, foes, mates } = quietMatch();
  for (const f of m.fighters) f.charge = false;
  const carrier = mates[0];
  carrier.charge = true;
  Object.assign(m.charge, { state: 'carried', by: carrier.id });
  put(carrier, 0, 34, Math.PI / 2);
  put(me, 12, 34);
  put(foes[0], -8, 34, -Math.PI / 2);
  foes[0].bot.think = () => ({ wish: { x: 0, z: 0 }, fired: true });
  m.update(STEP, idle());
  assert.equal(carrier.alive, false);
  assert.deepEqual([m.charge.state, m.charge.x, m.charge.z], ['dropped', 0, 34]);
  foes[0].bot.think = () => ({ wish: { x: 0, z: 0 } });
  // a Warden walking over it leaves it where it is
  put(foes[1], 0.2, 34);
  m.update(STEP, idle());
  assert.equal(m.charge.state, 'dropped');
  put(foes[1], 30, 34);
  put(me, 0.5, 34);
  m.update(STEP, idle());
  assert.deepEqual([m.charge.state, m.charge.by, me.charge], ['carried', me.id, true]);
  assert.ok(said.some((s) => s[0] === 'picked' && s[1].id === me.id));
  // G puts it down a step ahead, and it isn't picked straight back up
  m.update(STEP, idle({ drop: true }));
  assert.ok(m.charge.state === 'dropped' && !me.charge);
  m.update(STEP, idle());
  assert.equal(m.charge.state, 'dropped');
});

test('buying is done at home, while the round is young', () => {
  const m = new Match({ seed: 9, me: { id: 'me', name: 'Me' } });
  const me = m.join('me', 'Me');
  for (const f of m.fighters) if (f.bot) f.bot.think = () => ({ wish: { x: 0, z: 0 } });
  const said = [];
  m.on('refused', (e) => said.push(e));
  me.cash = 6000;
  m.update(STEP, idle({ buy: 'rifle' }));
  assert.deepEqual([me.kit.main, me.cash, me.held], ['rifle', 3300, 'main']);
  assert.deepEqual(me.ammo.rifle, { mag: 30, spare: 90 });
  m.update(STEP, idle({ buy: 'rifle' }));
  assert.deepEqual(said.at(-1), { id: me.id, item: 'rifle', why: 'you have one' });
  // nobody moves in the freeze
  const at = { ...me.body.pos };
  for (let t = 0; t < 1; t += STEP) m.update(STEP, idle({ move: { x: 0, y: 1 } }));
  assert.deepEqual(me.body.pos, at);
  while (m.rounds.phase === 'freeze') m.update(STEP);
  // away from home, no
  for (let t = 0; t < 1; t += STEP) m.update(STEP, idle({ move: { x: 0, y: 1 } }));
  assert.ok(me.body.pos.z < at.z - 3 && m.atHome(me), 'a few steps from where you came in is still home');
  put(me, 0, 0);
  assert.ok(!m.atHome(me));
  m.update(STEP, idle({ buy: 'vest' }));
  assert.equal(said.at(-1).why, 'only at home');
  // nor once the round is under way
  put(me, 0, 38);
  m.rounds.time = RULES.buy + 1;
  m.update(STEP, idle({ buy: 'vest' }));
  assert.equal(said.at(-1).why, 'the time to buy is over');
  assert.equal(me.kit.armor, 0);
});

test('what you had when you fell is gone; what you lived with, you keep', () => {
  const { m, me, foes, mates } = quietMatch();
  me.kit.main = 'rifle';
  me.ammo.rifle = { mag: 3, spare: 0 };
  mates[0].kit.main = 'smg';
  mates[0].alive = false;
  mates[0].hp = 0;
  for (const f of foes) m._kill(f, me, 'rifle', false);
  m.update(STEP, idle());
  assert.equal(m.rounds.phase, 'over');
  const cash = me.cash;
  assert.equal(cash, CASH.start + 5 * GUNS.rifle.reward + PAY.win);
  while (m.rounds.phase !== 'freeze') m.update(STEP, idle());
  assert.equal(m.rounds.round, 2);
  assert.deepEqual([me.kit.main, me.ammo.rifle], ['rifle', { mag: 30, spare: 90 }], 'kept, and filled');
  assert.deepEqual([mates[0].kit.main, mates[0].alive, mates[0].hp], [null, true, 100], 'lost with whoever fell');
  assert.ok(m.fighters.every((f) => f.alive && f.hp === 100));
  assert.ok(m.fighters.filter((f) => m.sideOf(f) === 'attack').filter((f) => f.charge).length === 1, 'one Raider has the charge');
  for (const f of m.fighters) assert.ok(m.atHome(f), 'everyone at home');
});

test('grenades: a frag hurts, a flash blinds whoever is looking, smoke hides', () => {
  const { m, me, said, foes } = quietMatch();
  put(me, 0, 34, Math.PI / 2); // facing −x, down the yard
  for (const f of foes) put(f, 30, -36);
  me.kit.frag = me.kit.flash = me.kit.smoke = 1;
  // throw one, and stand someone by where it has got to just before it goes
  const lob = (kind, stand) => {
    m.update(STEP, idle({ pick: 'nade' }));
    assert.equal(me.held, kind);
    for (let t = 0; t < 0.7; t += STEP) m.update(STEP, idle());
    m.update(STEP, idle({ fired: true }));
    assert.deepEqual([me.kit[kind], m.nades.length, me.held], [0, 1, 'side'], 'thrown, and back to a gun');
    for (let t = 0; t < GRENADES[kind].fuse - 0.1; t += STEP) m.update(STEP, idle());
    const at = { ...m.nades[0].p };
    stand(at);
    for (let t = 0; t < 0.2; t += STEP) m.update(STEP, idle());
    assert.equal(m.nades.length, 0);
    return at;
  };
  const frag = lob('frag', (at) => put(foes[0], at.x - 2, at.z));
  assert.ok(frag.x < -8 && frag.x > -26 && Math.abs(frag.z - 34) < 1 && frag.y < 0.3, `it flies, bounces and rolls on down the yard (${frag.x.toFixed(1)})`);
  assert.equal(said.find((s) => s[0] === 'burst')[1].kind, 'frag');
  assert.ok(foes[0].hp < 60, `and hurts whoever is by it (${foes[0].hp})`);
  assert.equal(me.hp, 100, 'not from here');
  // the flash: one of them is looking at it, the other has their back to it
  lob('flash', (at) => {
    put(foes[1], at.x + 6, at.z, Math.PI / 2); // facing −x, at it
    put(foes[2], at.x - 6, at.z, Math.PI / 2); // facing −x, away from it
  });
  assert.ok(foes[1].blind > 1.2, `looking at it (${foes[1].blind.toFixed(2)} s)`);
  assert.ok(foes[2].blind < foes[1].blind * 0.5, 'looking away');
  // smoke between you: a bot can't see through it
  put(foes[3], -11, 34, -Math.PI / 2); // facing you
  assert.ok(sees(m, foes[3], me) !== null);
  m.smokes.push({ x: -5.5, y: 1.4, z: 34, r: GRENADES.smoke.reach, left: 10 });
  assert.equal(sees(m, foes[3], me), null);
  m.smokes.length = 0;
  // ...nor behind itself, nor through a wall
  put(foes[4], -11, 36, Math.PI / 2);
  assert.equal(sees(m, foes[4], me), null, 'its back is turned');
  put(foes[3], 0, 10, 0);
  assert.equal(sees(m, foes[3], me), null);
});

// ── The bots ────────────────────────────────────────────────────────────────

test('a bot finds its way: round the corners, cutting them where it can see past', () => {
  // from the Raiders' yard to the Cistern: there is a way, and each leg of it can be walked
  const from = { x: 0, y: 0, z: 36 };
  const to = SITES[1].spots[0];
  const way = [...wayTo(from, to), to];
  assert.ok(way.length > 3, 'by way of several corners');
  let at = from;
  for (const next of way) {
    assert.ok(clearWalk(at, next), `clear from ${at.x.toFixed(0)},${at.z.toFixed(0)} to ${next.x.toFixed(0)},${next.z.toFixed(0)}`);
    at = { x: next.x, z: next.z, y: floorAt(next.x, next.z, GALLERY + 0.1) };
  }
  // somewhere in plain reach is walked straight to
  assert.deepEqual(wayTo({ x: 0, y: 0, z: 36 }, { x: 5, z: 33 }), []);
  assert.ok(!clearWalk({ x: 0, y: 0, z: 30 }, { x: 0, z: 10 }), 'not through a block of buildings');
});

test('the bots play a whole match: both sides win rounds, the charge is set and pulled, and nobody leaves town', () => {
  const m = new Match({ seed: 11 });
  const tally = { attack: 0, defend: 0, planted: 0, defused: 0, exploded: 0, kills: 0 };
  m.on('won', (e) => {
    tally[e.side]++;
    if (e.why === 'defused') tally.defused++;
    if (e.why === 'exploded') tally.exploded++;
  });
  m.on('planted', () => tally.planted++);
  m.on('kill', () => tally.kills++);
  let ended = null;
  m.on('ended', (e) => (ended = e));
  let frames = 0;
  while (!ended && frames < 60 * 60 * 60) {
    m.update(STEP);
    frames++;
    if (frames % 30) continue;
    for (const f of m.fighters) {
      const p = f.body.pos;
      assert.ok(Number.isFinite(p.x + p.y + p.z + f.yaw + f.pitch), `${f.name} is somewhere`);
      assert.ok(p.x > BOUNDS.x0 && p.x < BOUNDS.x1 && p.z > BOUNDS.z0 && p.z < BOUNDS.z1 && p.y >= 0 && p.y < 4, `${f.name} is in town (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`);
      assert.ok(f.cash >= 0 && f.cash <= CASH.most);
    }
  }
  assert.ok(ended, 'the match ends');
  const rounds = tally.attack + tally.defend;
  assert.ok(rounds >= RULES.win && rounds <= RULES.half * 2, `${rounds} rounds`);
  assert.equal(Math.max(...m.rounds.score) >= RULES.win || rounds === RULES.half * 2, true);
  assert.ok(tally.attack >= 3 && tally.defend >= 3, `both sides win some (${tally.attack} : ${tally.defend})`);
  assert.ok(tally.planted >= 5, `the charge is set (${tally.planted} times)`);
  assert.ok(tally.kills > rounds * 3, 'and it comes to a fight');
  assert.ok(m.fighters.some((f) => f.kit.main), 'the money buys guns');
});

// ── Together ────────────────────────────────────────────────────────────────

// People in one world: what each says reaches the others a moment later.
function together(lag = 0.06) {
  const t = { now: 0, wire: [], people: new Map(), inputs: new Map() };
  t.person = (id, name) => {
    const s = new Session({
      say: (body, to = null) => {
        t.wire.push({ at: t.now + lag, from: id, to, body: JSON.parse(JSON.stringify(body)) });
        return true;
      },
      who: () => ({ id, name }),
      others: () => t.people.size - 1,
    });
    t.people.set(id, s);
    return s;
  };
  t.run = (seconds) => {
    for (let k = 0; k < seconds / STEP; k++) {
      t.now += STEP;
      for (let i = 0; i < t.wire.length; ) {
        const msg = t.wire[i];
        if (msg.at > t.now) {
          i++;
          continue;
        }
        t.wire.splice(i, 1);
        for (const [id, s] of t.people) if (id !== msg.from && (!msg.to || msg.to === id)) s.hear(msg.from, t.people.get(msg.from)?.me.name || msg.from, msg.body);
      }
      for (const [id, s] of t.people) s.update(STEP, t.inputs.get(id) || null);
    }
  };
  return t;
}

test('what a guest is told is how things stand with the host; and nonsense isn\'t believed', () => {
  const host = new Match({ seed: 4, me: { id: 'h', name: 'Hal' } });
  host.join('h', 'Hal');
  const gil = host.join('g', 'Gil');
  gil.to = null;
  for (let t = 0; t < RULES.freeze + 3; t += STEP) host.update(STEP);
  const guest = new Match({ me: { id: 'g', name: 'Gil' }, host: false });
  const heard = [];
  for (const kind of ['round', 'live', 'bought', 'kill']) guest.on(kind, (e) => heard.push([kind, e]));
  const told = JSON.parse(JSON.stringify(host.snapshot())); // as it comes down the wire
  guest.apply(told);
  assert.equal(guest.mine.id, gil.id, 'which place is yours');
  assert.deepEqual([guest.rounds.round, guest.rounds.phase, guest.rounds.score, guest.rounds.attackers], [host.rounds.round, 'live', host.rounds.score, host.rounds.attackers]);
  for (const f of host.fighters) {
    const g = guest.fighters[f.id];
    assert.deepEqual([g.name, g.owner, g.hp, g.alive, g.cash, g.kit, g.charge, g.held], [f.name, f.owner, f.hp, f.alive, f.cash, f.kit, f.charge, f.held], f.name);
    assert.ok(Math.hypot(g.body.pos.x - f.body.pos.x, g.body.pos.y - f.body.pos.y, g.body.pos.z - f.body.pos.z) < 0.02, `${f.name} is where the host has them`);
  }
  assert.deepEqual(guest.charge.state, host.charge.state);
  assert.ok(heard.some((h) => h[0] === 'round') && heard.some((h) => h[0] === 'live') && heard.some((h) => h[0] === 'bought'), 'and what happened on the way');
  assert.deepEqual(host.snapshot().e, [], 'said once');
  // something that isn't a match, or has things in it that can't be
  for (const junk of [null, 7, {}, { f: 'no', r: [] }]) guest.apply(junk);
  const bad = JSON.parse(JSON.stringify(host.snapshot()));
  bad.f[0][10] = '<img src=x>';
  bad.f[0][9] = 'bazooka';
  bad.f[0][3] = 'east';
  bad.f[0][1] = { toString: 1 };
  bad.r[1] = 'party';
  bad.c = ['carried', 99, 0, 0, 0, 'C', 0];
  bad.g = 'grenades';
  bad.e = [['kill', { id: 99, by: 0 }], ['fireworks', {}], ['kill', { id: 1, by: -1, how: 'frag', head: false }], 'kill'];
  heard.length = 0;
  guest.apply(bad);
  const odd = guest.fighters[0];
  assert.deepEqual([odd.kit.main, odd.held, guest.rounds.phase, guest.charge.state, guest.charge.site, guest.nades], [null, 'knife', 'freeze', 'none', null, []]);
  assert.ok(Number.isFinite(odd.body.pos.x) && typeof odd.name === 'string');
  assert.deepEqual(heard, [['kill', { id: 1, by: -1, how: 'frag', head: false }]], 'only what could have happened is passed on');
  // and a guest's own say-so is checked by the host the same way
  for (const junk of [null, 'hi', { t: 'me' }, { t: 'me', p: ['a'], a: [] }, { t: 'shot', gun: 'bazooka' }, { t: 'shot', gun: 'rifle', from: [0, 0, 0], rays: [{ to: [1, 1, 1], hit: [0, 'head'] }] }, { t: 'throw', kind: 'frag', p: [0, 0, 0], v: [0, 0, 0] }, { t: 'buy', item: 42 }]) host.hear('g', junk);
  assert.ok(host.fighters.every((f) => f.alive && f.hp === 100), 'a gun you don\'t have fires nothing');
  assert.equal(host.nades.length, 0, 'nor is a grenade you don\'t have thrown');
  assert.ok(Number.isFinite(gil.body.pos.x));
});

test('alone you run the match yourself; whoever walks in after is your guest, and takes a bot’s place', () => {
  const t = together();
  const a = t.person('a', 'Ada');
  a.enter();
  assert.equal(a.state, 'host', 'at once: there’s nobody to hear from');
  assert.equal(a.match.mine.name, 'Ada');
  t.run(1);
  const b = t.person('b', 'Bo');
  b.enter();
  t.run(2.5);
  assert.deepEqual([b.state, b.hostId], ['guest', 'a']);
  const onHost = a.match.fighters.find((f) => f.owner === 'b');
  const mine = b.match.mine;
  assert.ok(onHost && mine && mine.id === onHost.id, 'the host gave the guest a place, and the guest knows which');
  assert.notEqual(onHost.team, a.match.mine.team, 'on the other side');
  assert.deepEqual([mine.name, b.match.fighters.filter((f) => f.owner).length], ['Bo', 2]);
  assert.equal(b.match.rounds.round, a.match.rounds.round);
  assert.equal(a.inside.size, 1, 'and someone at the gate can see who’s in');

  // the guest walks, and the host sees them go
  while (a.match.rounds.phase === 'freeze') t.run(0.5);
  const before = { ...onHost.body.pos };
  t.inputs.set('b', idle({ move: { x: 0, y: 1 } }));
  t.run(1.5);
  t.inputs.delete('b');
  t.run(0.5);
  assert.ok(Math.hypot(onHost.body.pos.x - before.x, onHost.body.pos.z - before.z) > 3, 'the host sees the guest walk');
  assert.ok(Math.hypot(onHost.body.pos.x - mine.body.pos.x, onHost.body.pos.z - mine.body.pos.z) < 0.6, 'to where the guest is');

  // the guest shoots someone as the guest sees them, and it counts
  for (const f of a.match.fighters) if (f.bot) f.bot.think = () => ({ wish: { x: 0, z: 0 } });
  const victim = a.match.fighters.find((f) => f.team !== mine.team && f.bot && f.alive);
  a.match._place(victim, 0, 0, 36, 0);
  t.run(0.3);
  put(mine, 0, 30, Math.PI);
  t.run(0.4);
  t.inputs.set('b', idle({ fired: true }));
  t.run(STEP);
  t.inputs.delete('b');
  t.run(0.5);
  assert.equal(victim.alive, false, 'on the host');
  assert.equal(b.match.fighters[victim.id].alive, false, 'and the guest is told so');
  assert.equal(b.match.mine.kills, 1);

  // the guest leaves: the bot has its place back
  b.leave();
  t.people.delete('b');
  t.run(0.5);
  assert.equal(a.match.fighters.filter((f) => f.owner).length, 1);
  assert.ok(a.match.fighters[mine.id].bot);
});

test('when the host walks out, whoever has been in longest takes the match on', () => {
  const t = together();
  const a = t.person('a', 'Ada');
  a.enter();
  t.run(1);
  const b = t.person('b', 'Bo');
  b.enter();
  t.run(2);
  const c = t.person('c', 'Cy');
  c.enter();
  t.run(2);
  assert.deepEqual([b.state, c.state, a.match.fighters.filter((f) => f.owner).length], ['guest', 'guest', 3]);
  while (a.match.rounds.phase === 'freeze') t.run(0.5);
  t.run(1);
  const was = { round: a.match.rounds.round, score: [...a.match.rounds.score], phase: a.match.rounds.phase };
  a.leave();
  t.people.delete('a');
  t.run(1.5);
  assert.deepEqual([b.state, c.state, c.hostId], ['host', 'guest', 'b']);
  assert.deepEqual({ round: b.match.rounds.round, score: b.match.rounds.score, phase: b.match.rounds.phase }, was, 'the same match');
  assert.equal(b.match.fighters.filter((f) => f.owner).length, 2, 'the old host’s place is a bot’s');
  assert.ok(b.match.fighters.every((f) => f.owner || f.bot), 'and every place without a person has a bot');
  // it goes on, for both of them
  const left = c.match.rounds.left;
  t.run(2);
  assert.ok(c.match.rounds.left < left || c.match.rounds.phase !== was.phase, 'the clock still runs for the guest');
  // someone who drops without a word is taken to have left
  t.people.delete('c');
  t.run(9);
  assert.equal(b.match.fighters.filter((f) => f.owner).length, 1);
});

test('two who start a match at the same moment end up in one', () => {
  const t = together(0.2);
  t.person('x', 'X'); // someone else in the world, not in the town
  const a = t.person('a', 'Ada');
  const b = t.person('b', 'Bo');
  a.enter();
  b.enter();
  assert.deepEqual([a.state, b.state], ['joining', 'joining'], 'each waits to hear of a match');
  t.run(4);
  const states = [a.state, b.state].sort();
  assert.deepEqual(states, ['guest', 'host']);
  const [host, guest] = a.state === 'host' ? [a, b] : [b, a];
  assert.equal(guest.hostId, host.me.id);
  assert.equal(host.match.fighters.filter((f) => f.owner).length, 2);
  assert.ok(guest.match.mine, 'and the guest has a place in it');
});
