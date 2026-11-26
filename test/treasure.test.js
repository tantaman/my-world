// Buried treasure: where a hoard is buried and how the map says to find it,
// counting paces, what a spade turns up, a hunt played from the old place
// to the open chest, what you've dug up and how it's kept, and the map.

import test from 'node:test';
import assert from 'node:assert/strict';
import { planHunt, doorOf, digAt, way, stepOf, looking, offCourse, Pacer, validateFinds, listFinds, PACE, WAYS, LEGS, MARKS, TRINKETS, FIND, CLOSE, NEAR, AT_MARK, KEPT } from '../src/treasure/hunt.js';
import { Hunt, DIG_TIME, LINGER } from '../src/treasure/run.js';
import { survey, directions, niceStep } from '../src/treasure/chart.js';
import * as look from '../src/treasure/look.js';
import * as pictures from '../src/treasure/pictures.js';
import { parse } from '../src/pack/picture.js';
import { mulberry32 } from '../src/noise.js';
import { growWorld } from '../src/world/lands.js';
import { Sites } from '../src/landmarks/sites.js';
import { onPlan } from '../src/world/frame.js';
import { earthAtFirst } from './helpers/earth.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const START = { id: 'well:0:0', name: 'Old Yates well', x: 100, z: -40 };
const anywhere = { starts: [START], ok: () => true };

test('north is -z, and the points go round clockwise from it', () => {
  assert.equal(way(0, -1), 'north');
  assert.equal(way(1, 0), 'east');
  assert.equal(way(0, 1), 'south');
  assert.equal(way(-1, -1), 'north-west');
  for (const w of WAYS) {
    const s = stepOf(w);
    assert.ok(near(Math.hypot(s.x, s.z), 1));
    assert.equal(way(s.x, s.z), w, `a step ${w} goes ${w}`);
  }
  // the camera looks along -sin, -cos of its yaw: north at 0, and you walk where it looks
  assert.equal(looking(0), 'north');
  assert.equal(looking(Math.PI), 'south');
  assert.equal(looking(-Math.PI / 2), 'east');
  for (const [i, w] of WAYS.entries()) {
    const cam = -(i * Math.PI) / 4;
    assert.equal(looking(cam), w);
    assert.ok(near(offCourse(cam, w), 0, 1e-9), `dead on ${w}`);
    assert.ok(offCourse(cam - 0.1, w) > 0.09, `turned clockwise of ${w}: to the right of it`);
    assert.ok(offCourse(cam + 0.1, w) < -0.09, `and the other way, to the left`);
  }
  assert.throws(() => stepOf('up'));
});

test('a hunt goes from the old place in two legs, on their bearings, to the spot', () => {
  for (let seed = 1; seed < 60; seed++) {
    const plan = planHunt({ ...anywhere, rnd: mulberry32(seed) });
    assert.ok(plan, 'somewhere there is room for one');
    assert.deepEqual(plan.start, START);
    assert.match(plan.name, /^the [A-Z][a-z]+ hoard$/);
    assert.ok(!plan.name.includes('Yates'), "not named for the family it starts at");
    const [a, b] = plan.legs;
    assert.equal(a.from.name, 'Old Yates well');
    assert.ok(a.paces >= LEGS[0][0] && a.paces <= LEGS[0][1]);
    assert.ok(b.paces >= LEGS[1][0] && b.paces <= LEGS[1][1]);
    assert.ok(MARKS[a.to.mark], 'the first leg ends at a mark');
    assert.equal(b.from.name, MARKS[a.to.mark].the, 'and the second goes on from it');
    assert.equal(b.to.mark, undefined, 'the second ends at nothing to see');
    // paced out true, each leg ends where the next begins, and the last on the spot
    for (const leg of plan.legs) {
      const s = stepOf(leg.way);
      assert.ok(near(leg.from.x + s.x * leg.paces * PACE, leg.to.x, 1e-9));
      assert.ok(near(leg.from.z + s.z * leg.paces * PACE, leg.to.z, 1e-9));
    }
    assert.ok(near(b.from.x, a.to.x) && near(b.from.z, a.to.z));
    assert.ok(near(b.to.x, plan.x) && near(b.to.z, plan.z));
    // it turns, never back the way it came, and ends a good way from the start
    const turn = (WAYS.indexOf(b.way) - WAYS.indexOf(a.way) + 8) % 8;
    assert.ok(turn !== 0 && turn !== 4, `${a.way} then ${b.way}`);
    assert.ok(Math.hypot(plan.x - START.x, plan.z - START.z) >= 20);
    assert.ok(plan.coins >= 40 && plan.coins <= 300 && Number.isInteger(plan.coins));
    assert.ok(TRINKETS.includes(plan.trinket));
  }
  // the same throw of the dice, the same hunt
  assert.deepEqual(planHunt({ ...anywhere, rnd: mulberry32(7) }), planHunt({ ...anywhere, rnd: mulberry32(7) }));
});

test('a hunt is only planned where the mark can stand, the chest be buried, and the way be walked', () => {
  // nowhere: none
  assert.equal(planHunt({ starts: [START], ok: () => false, rnd: mulberry32(1) }), null);
  assert.equal(planHunt({ starts: [], ok: () => true, rnd: mulberry32(1) }), null);
  // a lake to the north of the line z = -60: neither the mark nor the spot is in it, nor the way through it
  const dry = (x, z) => z > -60;
  for (let seed = 1; seed < 40; seed++) {
    const plan = planHunt({ starts: [START], ok: dry, walkable: dry, rnd: mulberry32(seed) });
    if (!plan) continue;
    for (const p of [plan.legs[0].to, plan]) assert.ok(dry(p.x, p.z));
    for (const leg of plan.legs) for (let k = 0; k <= 1; k += 0.05) assert.ok(dry(leg.from.x + (leg.to.x - leg.from.x) * k, leg.from.z + (leg.to.z - leg.from.z) * k + 1e-9) || k === 0);
  }
  // the first old place with no room round it is passed over for the next
  const crowded = { id: 'cabin:9:9', name: 'Pellerin cabin', x: 5000, z: 5000 };
  const plan = planHunt({ starts: [crowded, START], ok: (x) => x < 1000, rnd: mulberry32(3) });
  assert.equal(plan.start.name, 'Old Yates well');
});

test('a map starts before the door of an old place, out from its front', () => {
  // a cabin facing +z: its door is out past the front of its plan
  const site = { x: 10, z: 20, yaw: 0, plan: [[-3.6, -2.6, 3.6, 4.4]], box: [0, 10, 20, 30] };
  const d = doorOf(site);
  assert.ok(near(d.x, 10) && near(d.z, 20 + 4.4 + 1.6));
  assert.ok(!onPlan(site, d.x, d.z, 0.5), 'not on it');
  // turned to face the east
  const east = doorOf({ ...site, yaw: Math.PI / 2 });
  assert.ok(near(east.x, 10 + 6) && near(east.z, 20));
  assert.equal(doorOf({ ...site, plan: [] }), null);
});

test('a spade turns up the chest on the spot, loose earth close by, and roots elsewhere', () => {
  const plan = { x: 0, z: 0 };
  assert.ok(digAt(plan, 0, 0).found);
  assert.ok(digAt(plan, FIND * 0.99, 0).found);
  const close = digAt(plan, 0, FIND + 1);
  assert.ok(!close.found && /loose/.test(close.word));
  const nearby = digAt(plan, CLOSE + 1, 0);
  assert.ok(!nearby.found && /not far off/.test(nearby.word));
  const far = digAt(plan, NEAR + 1, 0);
  assert.equal(far.word, 'nothing but roots and stones');
  assert.ok(near(far.d, NEAR + 1));
});

test('paces are counted from standing at the mark, as walked, on foot', () => {
  const p = new Pacer();
  p.from({ x: 0, z: 0 });
  p.step(20, 0, true);
  assert.equal(p.paces, null, 'not before you have stood at it');
  p.step(0, 0.2, true);
  assert.equal(p.paces, 0, 'standing at it');
  // straight out north, a metre at a time: counted from the mark itself, not
  // from where you stepped out of reach of it
  for (let z = -1; z >= -30; z--) p.step(0, z, true);
  const out = p.paces;
  assert.equal(out, Math.round(30 / PACE), `${out} paces for 30 m`);
  // near it, it's how far off you stand
  const q = new Pacer();
  q.from({ x: 0, z: 0 });
  q.step(AT_MARK * 0.9, 0, true);
  assert.equal(q.paces, Math.round((AT_MARK * 0.9) / PACE));
  // a wander off and back costs you: walked, not as the crow flies
  for (let x = 1; x <= 10; x++) p.step(x, -30, true);
  for (let x = 9; x >= 0; x--) p.step(x, -30, true);
  assert.ok(p.paces > out + 20 / PACE - 2);
  // carried, or set down somewhere, isn't walking
  const before = p.paces;
  for (let z = -31; z >= -40; z--) p.step(0, z, false);
  p.step(0, -200, true);
  assert.equal(p.paces, before);
  // back at the mark, it starts again
  p.step(0.1, 0.1, true);
  assert.equal(p.paces, 0);
  // and a new mark has to be stood at
  p.from({ x: 50, z: 50 });
  assert.equal(p.paces, null);
});

// ── A hunt played through ───────────────────────────────────────────────────
// A flat world, a hiker that goes where it's put, and what the hunt does to it.
function fakeWorld() {
  const scene = { added: new Set(), add: (...o) => o.forEach((x) => scene.added.add(x)), remove: (o) => scene.added.delete(o) };
  const solids = { owners: new Map(), set: (o, l) => solids.owners.set(o, l), clear: (o) => solids.owners.delete(o) };
  const character = {
    tool: null,
    action: null,
    setTool: (t) => (character.tool = t),
    play: (kind) => (character.action = { kind, loop: true }),
    stop: () => (character.action = null),
  };
  const player = { pos: { x: 0, y: 0, z: 0 }, yaw: 0, camYaw: 0, rides: { free: true }, swimming: false, grounded: true, space: null, character, busy: 0 };
  const w = { scene, solids, player, said: [], sounds: [], got: [] };
  Object.assign(w, {
    ground: () => 0,
    say: (m) => w.said.push(m),
    sfx: (k) => w.sounds.push(k),
    key: (word) => 'F',
    look: () => look,
    found: (h) => w.got.push(h),
  });
  return w;
}
// Walk from where you are to (x, z), a step a frame; then turn to face the way.
function walk(hunt, w, x, z, step = 0.5) {
  const p = w.player.pos;
  const d = Math.hypot(x - p.x, z - p.z);
  const n = Math.max(1, Math.ceil(d / step));
  const x0 = p.x;
  const z0 = p.z;
  for (let i = 1; i <= n; i++) {
    p.x = x0 + ((x - x0) * i) / n;
    p.z = z0 + ((z - z0) * i) / n;
    hunt.update(1 / 30);
  }
}
const hold = (hunt, seconds, dt = 1 / 30) => {
  let r = null;
  for (let t = 0; t < seconds; t += dt) {
    hunt.dig(dt);
    r = hunt.update(dt) || r;
  }
  return r;
};

test('a hunt played through: pace it out, find the mark, dig, open the chest', () => {
  const plan = planHunt({ ...anywhere, rnd: mulberry32(11) });
  const w = fakeWorld();
  Object.assign(w.player.pos, { x: plan.start.x + 6, z: plan.start.z });
  const hunt = new Hunt(plan, w);
  hunt.update(1 / 30);
  // the mark on the way and the turned earth are put out at once
  assert.equal(w.scene.added.size, 2);
  assert.equal(hunt.left(), null, 'no hurry');
  assert.match(hunt.objective(), new RegExp(`^from Old Yates well, ${plan.legs[0].paces} paces ${plan.legs[0].way}, to ${MARKS[plan.legs[0].to.mark].a}$`));
  assert.match(hunt.note(), /^stand at Old Yates well/);
  assert.deepEqual(hunt.guide(), { x: plan.start.x, z: plan.start.z, label: 'Old Yates well' }, 'pointed to where to start counting');
  // at the well, counting
  walk(hunt, w, plan.start.x, plan.start.z);
  assert.equal(hunt.guide(), null, 'counting: the rest is the map’s to say');
  const [a, b] = plan.legs;
  w.player.yaw = Math.atan2(stepOf(a.way).x, stepOf(a.way).z);
  const dead = -(WAYS.indexOf(a.way) * Math.PI) / 4;
  w.player.camYaw = dead;
  walk(hunt, w, (plan.start.x + a.to.x) / 2, (plan.start.z + a.to.z) / 2);
  assert.match(hunt.note(), new RegExp(`^\\d+ of ${a.paces} paces · ${a.way}, dead on$`));
  // looking a little off it: which way to bear; well off it: which way you look
  w.player.camYaw = dead - 0.3;
  assert.match(hunt.note(), new RegExp(`· ${a.way}: bear left$`));
  w.player.camYaw = dead + 0.3;
  assert.match(hunt.note(), new RegExp(`· ${a.way}: bear right$`));
  w.player.camYaw = dead + Math.PI;
  assert.match(hunt.note(), new RegExp(`· facing ${WAYS[(WAYS.indexOf(a.way) + 4) % 8]}$`));
  w.player.camYaw = dead;
  // at the mark: the second leg, counted from it
  walk(hunt, w, a.to.x, a.to.z);
  assert.equal(hunt.stage, 1);
  assert.ok(w.said.some((m) => m.startsWith(`${MARKS[a.to.mark].the} · from here, ${b.paces} paces ${b.way}`)));
  assert.match(hunt.objective(), /, and dig$/);
  // wandered far off: pointed back to it
  walk(hunt, w, a.to.x + 200, a.to.z, 3);
  assert.match(hunt.note(), /wandered off/);
  assert.equal(hunt.guide().label, MARKS[a.to.mark].the);
  walk(hunt, w, a.to.x, a.to.z, 3);
  // a hole somewhere else first: nothing in it, and it stays dug
  const s = stepOf(b.way);
  w.player.yaw = Math.atan2(s.x, s.z);
  walk(hunt, w, a.to.x + s.x * 2, a.to.z + s.z * 2);
  assert.equal(hold(hunt, DIG_TIME + 0.2), null);
  assert.equal(hunt.stage, 1);
  assert.equal(w.said.at(-1), 'nothing but roots and stones');
  assert.equal(w.scene.added.size, 3, 'a hole');
  assert.ok(w.sounds.includes('dig'));
  // let go part way: it's begun again next time
  hold(hunt, DIG_TIME * 0.5);
  assert.ok(hunt.digging);
  assert.equal(w.player.character.tool, 'shovel', 'the spade in hand');
  assert.ok(w.player.busy > 0);
  hunt.update(1 / 30);
  assert.equal(hunt.digging, null, 'let go of the key: the spade is put away');
  assert.equal(w.player.character.tool, null);
  assert.equal(w.player.busy, 0);
  // on to the spot (stopping just short, the hole dug in front of you)
  walk(hunt, w, plan.x - s.x * 0.8, plan.z - s.z * 0.8);
  assert.match(hunt.note(), /hold F to dig/);
  hold(hunt, DIG_TIME + 0.2);
  assert.equal(hunt.stage, 'found');
  assert.ok(w.sounds.includes('treasure-strike'));
  assert.equal(hunt.objective(), 'open the chest');
  assert.match(hunt.cue().html, /open the chest/);
  // not while it's out of reach
  w.player.pos.x += 10;
  assert.equal(hunt.open(), false);
  w.player.pos.x -= 10;
  assert.equal(hunt.open(), true);
  assert.ok(w.sounds.includes('treasure-open'));
  assert.deepEqual(w.got, [{ name: plan.name, coins: plan.coins, trinket: plan.trinket }]);
  const r = hunt.update(1 / 30);
  assert.deepEqual(r, { won: `${plan.name}: ${plan.coins} gold coins and ${plan.trinket}` });
  // it lingers, open
  assert.equal(hunt.linger, LINGER);
  for (let i = 0; i < 60; i++) assert.equal(hunt.after(1 / 30), true);
  assert.ok(near(hunt.chest.lid.rotation.x, look.OPEN, 1e-6), 'the lid thrown back');
  // and then nothing of it is left
  hunt.dispose();
  assert.equal(w.scene.added.size, 0);
  assert.equal(w.solids.owners.size, 0);
});

test('no digging but on your own two feet, on the ground', () => {
  const plan = planHunt({ ...anywhere, rnd: mulberry32(2) });
  const w = fakeWorld();
  const hunt = new Hunt(plan, w);
  assert.ok(hunt.canDig());
  for (const [what, set, back] of [
    ['carried', () => (w.player.rides.free = false), () => (w.player.rides.free = true)],
    ['swimming', () => (w.player.swimming = true), () => (w.player.swimming = false)],
    ['in the air', () => (w.player.grounded = false), () => (w.player.grounded = true)],
    ['under the ground', () => (w.player.space = {}), () => (w.player.space = null)],
  ]) {
    set();
    assert.ok(!hunt.canDig(), what);
    assert.equal(hold(hunt, DIG_TIME + 0.2), null);
    assert.equal(hunt.holes.length, 0, `no hole dug ${what}`);
    back();
  }
  w.player.rides.free = false;
  assert.equal(hunt.note(), 'on foot, to count your paces');
});

test('what you dig up is kept, checked, and listed in your pack', () => {
  assert.deepEqual(validateFinds(null), { coins: 0, hoards: [] });
  assert.deepEqual(validateFinds([1, 2]), { coins: 0, hoards: [] });
  const raw = { coins: 300, hoards: [['the Pike hoard', 120, 'a gold ring'], ['the Marsh hoard', 180, 'a gold ring'], ['bad', -1, 'x'], ['x'.repeat(99), 3, 'y'], 'junk'] };
  const finds = validateFinds(raw);
  assert.equal(finds.coins, 300);
  assert.equal(finds.hoards.length, 2);
  // a count that went missing is made up from the hoards
  assert.equal(validateFinds({ hoards: raw.hoards }).coins, 300);
  // only the last few dozen hoards
  const many = validateFinds({ coins: 1, hoards: Array.from({ length: KEPT + 10 }, (_, i) => [`the hoard ${i}`, 1, 'a gold ring']) });
  assert.equal(many.hoards.length, KEPT);
  assert.equal(many.hoards[0][0], 'the hoard 10');
  assert.deepEqual(listFinds(validateFinds(null)), []);
  assert.deepEqual(listFinds(finds), [
    { label: 'gold coins', note: '300 · from 2 hoards' },
    { label: 'a gold ring', note: '2 of them' },
  ]);
  for (const art of Object.values(pictures)) assert.doesNotThrow(() => parse(art));
});

test('the map: the country round the way, and what it says to do', () => {
  const plan = planHunt({ ...anywhere, rnd: mulberry32(5) });
  // a lake to the east of x = 160, and a hill rising to the north
  const s = survey(plan, { ground: (x, z) => -z * 0.1, depth: (x) => x - 160, trees: () => [[100, -40, 'pine']] });
  const N = s.n + 1;
  assert.equal(s.h.length, N * N);
  assert.ok(s.size >= 120);
  for (const p of [plan.start, plan.legs[0].to, plan]) assert.ok(p.x > s.x0 && p.x < s.x0 + s.size && p.z > s.z0 && p.z < s.z0 + s.size, 'everything on it');
  const i = Math.round(((170 - s.x0) / s.size) * s.n);
  assert.ok(s.x0 + s.size < 160 || s.wet[i] > 0, 'the lake is wet');
  assert.deepEqual(s.trees, [[100, -40, 'pine']]);
  // land that hasn't come is drawn flat and dry, not thrown
  const blank = survey(plan, { ground: () => { throw new Error('not yet'); }, depth: () => 1 });
  assert.ok(blank.h.every((y) => y === 0) && blank.wet.every((d) => d === -1));
  const [a, b] = plan.legs;
  assert.deepEqual(directions(plan), [`Begin at Old Yates well.`, `Thence ${a.paces} paces ${a.way}, to ${MARKS[a.to.mark].a}.`, `From ${MARKS[a.to.mark].the}, ${b.paces} paces ${b.way}, and dig.`]);
  assert.deepEqual([0.8, 1.2, 3, 4, 9, 30].map(niceStep), [1, 1, 2, 5, 10, 20]);
});

test('on the seed’s own land, the old places round the start have hunts to start', async () => {
  const gen = growWorld(20261119, [], 1, [], await earthAtFirst());
  const sites = new Sites(gen);
  const depth = (x, z) => {
    const h = gen.height(x, z);
    return gen.water.region ? gen.water.level - h : -Infinity;
  };
  const steep = (x, z) => Math.hypot(gen.height(x + 2, z) - gen.height(x - 2, z), gen.height(x, z + 2) - gen.height(x, z - 2)) / 4;
  const all = sites.within(-1500, -1500, 1500, 1500).filter((s) => ['cabin', 'ruin', 'hunting', 'camp', 'well'].includes(s.kind));
  assert.ok(all.length > 3);
  const ok = (x, z) => depth(x, z) < -0.4 && steep(x, z) < 0.45 && !all.some((s) => onPlan(s, x, z, 1));
  let planned = 0;
  for (const s of all) {
    const door = doorOf(s);
    const plan = planHunt({ starts: [{ id: s.id, name: s.name, ...door }], ok, walkable: (x, z) => depth(x, z) < 0.5, rnd: mulberry32(planned + 1) });
    if (!plan) continue;
    planned++;
    assert.ok(ok(plan.x, plan.z) && ok(plan.legs[0].to.x, plan.legs[0].to.z));
  }
  assert.ok(planned >= all.length * 0.6, `${planned} of ${all.length} old places have room for a hunt round them`);
});
