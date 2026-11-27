// Purgatory: the island and its mountain, off to one side of Hell and
// lower, where the road out of the bottom of Hell comes up; laid out as the
// poem lays it out, climbed by its own ways and no others, by day; and the
// poem's words for each place, kept as they are. Where it is, is pinned:
// someone who left off on the mountain is saved standing there.

import test from 'node:test';
import assert from 'node:assert/strict';
import { growWorld, LANDS } from '../src/world/lands.js';
import { findGate } from '../src/hell/site.js';
import { HellLand } from '../src/hell/land.js';
import { MountLand, wrap, DOOR } from '../src/purgatory/land.js';
import { MountSpace } from '../src/purgatory/space.js';
import { placeOf } from '../src/purgatory/site.js';
import { R, H, AT, TERRACES, TOP, WIDE, BANK, WAYS, GAPS, GATE, CLEFT, VALLEY, BURROW, STREAM, LIQUID, WADE, DAY, EAST, REGIONS, TERRACE_IDS, regionAt, terraceAt } from '../src/purgatory/plan.js';
import { WORDS, ARRIVAL, ANGELS, DREAMS, SLEEP, SAID, VOICES } from '../src/purgatory/words.js';
import { strew, CELL } from '../src/purgatory/furnish.js';
import { mulberry32, hash2i } from '../src/noise.js';
import { Brow } from '../src/purgatory/brow.js';
import { Card } from '../src/core/card.js';
import { matchesGolden } from './helpers/golden.js';
import { earthAtFirst } from './helpers/earth.js';
import { HIKES } from '../src/world/hikes.js';
import { Landforms } from '../src/world/landforms.js';
// The real Earth under the world, as the game has it when it opens (world/earth.js).
const EARTH = await earthAtFirst();
// Hell's gate, as the game finds it: off wherever a real place reaches
// (hell/index.ts), so the island is where the game has it.
const landforms = new Landforms(HIKES);
const offReal = (x0, z0, x1, z1) => !!landforms.reaches(x0, z0, x1, z1);

const SEED = 20261119;
const gen = growWorld(SEED, [], 1, [], EARTH);
const hell = new HellLand({ seed: SEED, ...findGate(gen, offReal).hell });
const land = new MountLand({ seed: SEED, ...placeOf(hell) });
const space = new MountSpace(land);
const o = {};
// The land at a place on the island (heights from the sea).
const at = (r, th, full = false) => {
  const p = land.place(r, th);
  const s = land.sample(p.x, p.z, 0, o, full);
  return { ...s, h: s.h - land.top, liq: s.liq - land.top, x: p.x, z: p.z };
};
const STEEP = 1.05; // rise per metre the space lets you walk up (world/landSpace.js)

// ── Where it is ─────────────────────────────────────────────────────────────
for (const n of LANDS)
  for (const seed of [SEED, 42]) {
    test(`seed ${seed}, land ${n}: where Purgatory is`, () => {
      const g = seed === SEED && n === 1 ? gen : growWorld(seed, [], n, [], EARTH);
      const h = new HellLand({ seed, ...findGate(g, offReal).hell });
      const p = placeOf(h);
      // it never meets Hell, and lies lower than any of Hell
      assert.ok(Math.hypot(p.cx - h.cx, p.cz - h.cz) > h.reach + R.reach + 1000, 'well clear of Hell');
      assert.ok(p.top + new MountSpace(new MountLand({ seed, ...p })).lid - p.top < h.top - p.top, 'its sky lower than the top of Hell: far under any land');
      matchesGolden(n > 1 ? `purgatory-${seed}-land${n}` : `purgatory-${seed}`, p, { tolerance: 1e-6 });
    });
  }

test('the road comes up on the side of the island the sun rises on', async () => {
  // (EAST is the sky's sunrise, written down so where the island is doesn't
  // hang on how the sky is drawn: if the sky's sun moves, this says so)
  const { Sky } = await import('../src/world/sky.js').catch(() => ({}));
  if (!Sky) return; // (the sky needs a browser's three; its sun path is plain maths)
  const v = Sky.prototype.computeSunDir.call(null, DAY.rise, {
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    },
    normalize() {
      return this;
    },
  });
  assert.ok(Math.abs(wrap(Math.atan2(v.z, v.x) - EAST)) < 0.02, `the sun comes up at ${Math.atan2(v.z, v.x).toFixed(3)}`);
});

// ── The plan ────────────────────────────────────────────────────────────────
test('seven terraces, each a human body three times told wide, one above the other', () => {
  assert.equal(TERRACES.length, 7);
  assert.ok(Math.abs(WIDE - 3 * 1.75) < 0.2);
  for (let i = 1; i < 7; i++) {
    assert.equal(TERRACES[i].h - TERRACES[i - 1].h, BANK);
    assert.ok(TERRACES[i].r < TERRACES[i - 1].r - WIDE, 'each further in than the last, "its arc more suddenly curved"');
  }
  assert.ok(TOP.h > TERRACES[6].h && TOP.r < TERRACES[6].r - WIDE);
  assert.deepEqual(TERRACE_IDS, ['pride', 'envy', 'wrath', 'sloth', 'avarice', 'gluttony', 'lust']);
});

test('the ways up go one after another, always round to the right', () => {
  assert.equal(WAYS.length, 8, "the needle's eye, and a stair from each terrace");
  assert.equal(WAYS[0].a0, AT.gate, "the needle's eye starts at the gate");
  for (let k = 0; k < WAYS.length; k++) {
    const w = WAYS[k];
    assert.ok(w.a1 < w.a0, `way ${k} climbs to the right`);
    assert.ok(w.h1 > w.h0 && w.ra > w.rb);
    if (k > 0) {
      assert.equal(w.h0, WAYS[k - 1].h1, `way ${k} starts on the floor the last came up to`);
      assert.ok(Math.abs(WAYS[k - 1].a1 - GAPS[k - 1] - w.a0) < 1e-9, `and further round to the right (${GAPS[k - 1]} rad)`);
    }
  }
  assert.ok(AT.cleft < AT.burrow && AT.valley < AT.cleft && AT.gate < AT.valley, 'below the gate too');
});

test('which terrace and which region a place is in', () => {
  assert.equal(terraceAt(H.ledge), -1);
  for (let i = 0; i < 7; i++) assert.equal(terraceAt(TERRACES[i].h + 0.5), i);
  assert.equal(terraceAt(TERRACES[2].h + BANK - 4), 2, 'on a stair, still the terrace you climbed from');
  assert.equal(terraceAt(TOP.h + 1), 7);
  assert.equal(regionAt(R.shore + 20, 0, 0), 'shore');
  assert.equal(regionAt(2200, 0, 9), 'plain');
  assert.equal(regionAt(1950, 0, H.terrace), 'terrace');
  assert.equal(regionAt(1600, 0.5, 140), 'slope');
  assert.equal(regionAt(VALLEY.r, AT.valley, 200), 'valley');
  assert.equal(regionAt(970, 0, H.ledge), 'ledge');
  assert.equal(regionAt(TERRACES[2].r - 2, 0, TERRACES[2].h), 'wrath');
  assert.equal(regionAt(100, 0, TOP.h + 3), 'eden');
  for (const id of Object.keys(REGIONS)) assert.ok(WORDS[id], `the poem has words for ${id}`);
});

// ── The land ────────────────────────────────────────────────────────────────
test('an island in the sea, rising to the foot of the mountain', () => {
  assert.ok(Math.abs(at(R.shore, 1).h) < 0.6, 'the shore is at the sea');
  assert.ok(at(R.shore + 30, 2).liq === 0 && at(R.shore + 30, 2).kind === LIQUID.sea);
  assert.ok(at(R.reach, 2).liq - at(R.reach, 2).h > WADE * 10, 'out past the reach, the sea is far too deep to wade');
  assert.ok(at(2200, 2).h > H.plain && at(2200, 2).h < H.foot + 4, 'the plain');
  assert.ok(at(R.brow - 20, 2).h > H.terrace - 3, 'the terrace above the cliff at the foot');
  assert.ok(Math.abs(at(R.ledge - 20, 1).h - H.ledge) < 1, 'the ledge before the gate');
  for (let i = 0; i < 7; i++) assert.ok(Math.abs(at(TERRACES[i].r - WIDE / 2, 2.5).h - TERRACES[i].h) < 0.2, `terrace ${i + 1} is level`);
  assert.ok(at(0, 0).h > TOP.h && at(0, 0).h < TOP.h + TOP.rise + 1, 'the top');
});

// How steep the ground is along a path of [r, th] points (rise per metre, at worst).
function steepest(path) {
  let worst = 0;
  for (let i = 1; i < path.length; i++) {
    const a = at(...path[i - 1]);
    const b = at(...path[i]);
    const run = Math.hypot(a.x - b.x, a.z - b.z);
    if (run > 1e-6) worst = Math.max(worst, Math.abs(b.h - a.h) / run);
  }
  return worst;
}
const line = (r0, th0, r1, th1, n = 200) => Array.from({ length: n + 1 }, (_, i) => [r0 + ((r1 - r0) * i) / n, th0 + ((th1 - th0) * i) / n]);

test('the cliff at the foot is climbed only by its cleft', () => {
  const up = line(R.foot + 8, AT.cleft, CLEFT.r1 - 6, AT.cleft);
  assert.ok(steepest(up) < STEEP, `up the cleft, ${steepest(up).toFixed(2)} at worst`);
  assert.ok(at(CLEFT.r1 - 4, AT.cleft).h > H.terrace - 1, 'to the terrace above');
  const beside = line(R.foot + 8, AT.cleft + 0.03, CLEFT.r1 - 6, AT.cleft + 0.03);
  assert.ok(steepest(beside) > STEEP * 2, 'but not beside it');
  // and its sides are walls
  const mid = (R.foot + CLEFT.r1) / 2;
  assert.ok(at(mid, AT.cleft + (CLEFT.half + 2) / mid).h - at(mid, AT.cleft).h > 8, 'with rock on either hand');
});

test('up the cleft, wherever the island lies', () => {
  // The land's lumps lie where the land lies, so they meet the cleft's floor
  // differently wherever the island is (and it is where Hell's gate puts it).
  const STEP = 0.25; // m between heights asked
  const rnd = mulberry32(11);
  for (let k = 0; k < 40; k++) {
    const dx = (rnd() - 0.5) * 8000;
    const dz = (rnd() - 0.5) * 8000;
    const L = new MountLand({ seed: SEED, ...placeOf(hell), cx: land.cx + dx, cz: land.cz + dz });
    let last = null;
    for (let r = R.foot + 8; r > CLEFT.r1 - 6; r -= STEP) {
      const p = L.place(r, AT.cleft);
      const h = L.height(p.x, p.z);
      if (last !== null) assert.ok(Math.abs(h - last) / STEP < STEEP, `up the cleft, ${r.toFixed(1)} m out, with the island ${dx.toFixed(0)}, ${dz.toFixed(0)} m off`);
      last = h;
    }
  }
});

test('the gate: three steps, a threshold, a door', () => {
  const r = R.cliff + GATE.tread * 2.5;
  assert.ok(Math.abs(at(r, AT.gate).h - H.ledge - GATE.rise) < 0.01, 'the first step');
  assert.ok(Math.abs(at(R.cliff + 0.3, AT.gate).h - H.ledge - GATE.rise * 3) < 0.01, 'the third');
  assert.ok(steepest(line(R.cliff + GATE.tread * 3 + 2, AT.gate, R.cliff + 0.1, AT.gate)) < STEEP, 'and they can be walked up');
  const step = at(R.cliff + 0.5, AT.gate, true);
  assert.ok(step.cr > 0.3 && step.cg < 0.1, 'porphyry, red as blood');
  const door = R.cliff - DOOR.at;
  land.shut = true;
  assert.ok(land.barrier(door, AT.gate) > 2, 'shut');
  assert.equal(land.barrier(door, AT.gate + 0.05), 0, 'and only across the way in');
  land.shut = false;
  assert.equal(land.barrier(door, AT.gate), 0, 'open, for whoever is marked');
});

test('each way up is a slot in its bank, walkable, with rock on both hands', () => {
  for (let k = 0; k < WAYS.length; k++) {
    const w = WAYS[k];
    const dr = w.ra - w.rb;
    // in, level, and then up the climb to its head
    const path = [...line(w.ra + 1.5, w.a0, w.ra - w.lag, w.a0, 30)];
    for (let i = 0; i <= 200; i++) {
      const u = i / 200;
      const wave = w.wave ? w.wave * Math.sin(Math.PI * w.waves * u) * (1 - smooth(0.6, 0.85, u)) * smooth(0, 0.12, u) : 0;
      path.push([w.ra - w.lag - dr * u + wave, w.a0 - (w.a0 - w.a1) * u]);
    }
    assert.ok(steepest(path) < STEEP, `way ${k}: ${steepest(path).toFixed(2)} at worst`);
    const end = path[path.length - 1];
    assert.ok(Math.abs(at(...end).h - w.h1) < 0.3, `way ${k} comes out on the floor above`);
    // the walls, along the middle of the climb
    for (let i = 30 + 40; i <= 30 + 160; i += 10) {
      const [r, th] = path[i];
      const t = at(r, th).h;
      // (just past the edge of its cut: where whoever is in it meets rock)
      assert.ok(at(r - w.half - 0.9, th).h - t > 2, `way ${k}: the inner wall at ${i - 30}`);
      assert.ok(at(r + w.half + 0.9, th).h - t > 0.8, `way ${k}: the outer wall at ${i - 30}`);
    }
    // and nowhere else up its bank
    const r = w.ra - dr / 2;
    assert.ok(Math.abs(land.wayAt(r, w.a0 + 0.2) ?? -1) === 1 || land.wayAt(r, w.a0 + 0.2) === null, 'not off to the side');
  }
});
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

test('the stream on the top: Lethe one way from the spring, Eunoë the other, both to be waded', () => {
  const S = land.streamAt;
  let last = Infinity;
  for (let along = S.spring - 20; along > S.ends[0] + 10; along -= 40) {
    const p = land.streamPoint(along, {});
    const s = land.sample(p.x, p.z, 0, o, false);
    const st = land.stream(Math.hypot(p.x - land.cx, p.z - land.cz), Math.atan2(p.z - land.cz, p.x - land.cx) - land.turn, {});
    assert.equal(st.kind, LIQUID.lethe, `Lethe, ${along} m along`);
    assert.ok(st.level <= last + 1e-9, 'running down from the spring');
    last = st.level;
    assert.ok(s.liq - land.top <= TOP.h + TOP.rise + 1);
  }
  const lethe = land.streamPoint(-40, {});
  const eunoe = land.streamPoint(S.spring + 60, {});
  // (where its line is, give or take its wandering: the deepest within a few m)
  const deepest = (p) => {
    let d = 0;
    for (let k = -10; k <= 10; k += 0.25) {
      const x = p.x + S.ex * k * Math.cos(land.turn) - S.ez * k * Math.sin(land.turn);
      const z = p.z + S.ex * k * Math.sin(land.turn) + S.ez * k * Math.cos(land.turn);
      d = Math.max(d, space.depth(x, z));
    }
    return d;
  };
  for (const [name, p] of [
    ['Lethe', lethe],
    ['Eunoë', eunoe],
  ]) {
    const d = deepest(p);
    assert.ok(d > 0.4 && d < WADE, `${name} is knee deep (${d.toFixed(2)} m)`);
  }
});

// ── The space ───────────────────────────────────────────────────────────────
test('the space: you are in it on the island, and up to the sky', () => {
  const p = land.place(2200, 0.4);
  const s = land.sample(p.x, p.z, 0, o, false);
  const out = {};
  assert.ok(space.inside(p.x, p.z, s.h + 0.5, out) && Math.abs(out.floor - s.h) < 1e-6);
  assert.ok(space.inside(p.x, p.z, s.h + 400, out), 'and in the air over it');
  const far = land.place(R.reach + 200, 0);
  assert.ok(!space.inside(far.x, far.z, land.top, out), 'but not out at sea, past its reach');
});

test('the law of the mountain: after sunset, down and round, but not up', () => {
  // on the slope, facing up it
  const r = 1500;
  const th = 0.9;
  const p = land.place(r, th);
  const h = land.height(p.x, p.z);
  const up = land.place(r - 6, th);
  const ux = (up.x - p.x) / 6;
  const uz = (up.z - p.z) / 6;
  const ahead = (x, z) => {
    const w = space.walls(x, z, {}, land.height(x, z));
    return w.d < 1 && w.nx * ux + w.nz * uz < -0.5;
  };
  space.ceiling = Infinity;
  assert.ok(!ahead(p.x, p.z), 'by day, the slope is walked up');
  space.ceiling = h + DAY.slack;
  // a little way up is allowed; past it, a wall
  let x = p.x;
  let z = p.z;
  let stopped = false;
  for (let i = 0; i < 80 && !stopped; i++) {
    stopped = ahead(x, z);
    x += ux * 0.25;
    z += uz * 0.25;
  }
  assert.ok(stopped, 'by night, the ground above is a wall');
  assert.ok(land.height(x, z) < h + DAY.slack + 1, 'once you are as high as you were at sunset');
  const down = land.place(r + 3, th);
  const w = space.walls(down.x, down.z, {}, land.height(down.x, down.z));
  assert.ok(!(w.d < 1 && w.nx * -ux + w.nz * -uz < -0.5), 'downhill is open');
  space.ceiling = Infinity;
});

// ── What is on it ───────────────────────────────────────────────────────────
test('what is strewn: the same every time, and where the poem has it', () => {
  const kinds = (r, th) => {
    const p = land.place(r, th);
    const i = Math.floor(p.x / CELL);
    const j = Math.floor(p.z / CELL);
    const out = [];
    strew(land, 0, i * CELL, j * CELL, 12345 + i * 7 + j, (kind, x, y, z, yaw, scale, more) => out.push({ kind, x, y, z, more }));
    return out;
  };
  const a = kinds(R.shore, 0.3);
  assert.deepEqual(a, kinds(R.shore, 0.3), 'the same every time');
  assert.ok(
    a.some((k) => k.kind.startsWith('rushes')),
    'rushes on the shore',
  );
  const valley = kinds(VALLEY.r, AT.valley);
  assert.ok(valley.filter((k) => k.kind.startsWith('flowers')).length > 20, 'flowers in the valley');
  const avarice = kinds(TERRACES[4].r - 2, 1.2);
  assert.ok(
    avarice.some((k) => k.kind === 'prone'),
    'the avaricious, face down',
  );
  const top = kinds(300, 1.0);
  assert.ok(
    top.some((k) => k.kind === 'broad' || k.kind === 'birch'),
    'the forest on the top',
  );
  for (const k of [...avarice, ...top]) {
    const r = Math.hypot(k.x - land.cx, k.z - land.cz);
    const th = wrap(Math.atan2(k.z - land.cz, k.x - land.cx) - land.turn);
    if (k.kind !== 'flame') assert.equal(land.wayAt(r, th), null, `nothing stands in a way up (${k.kind})`);
  }
});

test('nothing stands in the cleft at the foot, wherever the island lies', () => {
  // A square's things fall where its seed says (world/strewn.js seeds it by
  // where it is), so where the island lies says what lands in the cleft:
  // strewn as the game strews it, here and with the island moved about.
  const BIGGEST = 2; // m round: no boulder is bigger
  const rnd = mulberry32(7);
  for (let k = 0; k < 60; k++) {
    const L = k === 0 ? land : new MountLand({ seed: SEED, ...placeOf(hell), cx: land.cx + (rnd() - 0.5) * 8000, cz: land.cz + (rnd() - 0.5) * 8000 });
    const cells = new Set();
    for (let r = R.foot + 12; r > CLEFT.r1 - 12; r -= 8)
      for (const aside of [-8, 8]) {
        const p = L.place(r, AT.cleft + aside / r);
        cells.add(`${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`);
      }
    for (const c of cells) {
      const [i, j] = c.split(',').map(Number);
      strew(L, 0, i * CELL, j * CELL, hash2i(i, j, L.seed), (kind, x, y, z) => {
        const q = L.polar(x, z, 0, {});
        const across = Math.abs(q.th - AT.cleft) * q.r;
        const inIt = q.r < R.foot + 4 && q.r > CLEFT.r1 - 8 && across < CLEFT.half + BIGGEST;
        assert.ok(!inIt, `a ${kind} in the way up the cleft (${q.r.toFixed(1)} m out, ${across.toFixed(1)} m aside)`);
      });
    }
  }
});

// ── The words ───────────────────────────────────────────────────────────────
test("the poem's words, as Longfellow has them", () => {
  for (const words of [...Object.values(WORDS), ARRIVAL, ...ANGELS, ...DREAMS, SLEEP, ...Object.values(SAID)]) {
    assert.ok(words.canto && /^[IVXL]+$/.test(words.canto), 'each says where in the poem');
    assert.ok(words.lines.length > 0 && words.lines.every((l) => typeof l === 'string' && l.length > 0 && l === l.trim()));
  }
  assert.equal(ANGELS.length, 7, 'an angel at each stair');
  assert.equal(DREAMS.length, 3, "the poem's three dreams");
  assert.equal(SAID.end.lines.at(-1), 'Pure and disposed to mount unto the stars.', 'and its last line');
  matchesGolden('purgatory-words', { WORDS, ARRIVAL, ANGELS, DREAMS, SLEEP, SAID, VOICES });
});

test('the P’s and the card work without a page', () => {
  const brow = new Brow(null);
  brow.show(7, true);
  assert.equal(brow.left, 7);
  brow.show(0);
  assert.equal(brow.on, false);
  const card = new Card({ id: 'test', book: 'Purgatorio', doc: null });
  card.show(WORDS.shore);
  assert.equal(card.showing, '');
});

test('the burrow: a mouth in a knoll, open to the sea', () => {
  const mouth = at(BURROW.r + 4, AT.burrow).h;
  const knoll = at(BURROW.r + 2, AT.burrow + 6 / BURROW.r).h;
  assert.ok(knoll - mouth > 3, 'the knoll stands either side of its mouth');
  assert.ok(at(BURROW.r - 4, AT.burrow).h - mouth > 3, 'and behind its back');
  assert.ok(Math.abs(at(BURROW.r + 10, AT.burrow).h - at(BURROW.r + 1, AT.burrow).h) < 1.5, 'its floor is the plain');
  assert.ok(STREAM.half > 0);
});

test("the mountain's day: you come up before dawn, and wake after it", () => {
  const night = (h) => h >= DAY.set || h < DAY.rise;
  assert.ok(night(DAY.arrive), 'night still, coming up the road');
  assert.ok(!night(DAY.wake) && !night(DAY.lucia), 'but day, waking');
  assert.ok(DAY.rise - DAY.arrive < 1.5, 'and not long till dawn');
});
