// Rafting: how a raft goes down a river (carried by the current, driven and
// turned by the paddles, kept off the banks, knocked off rocks, down a step,
// through a rapid's waves, and over when it's side-on in big water); and the
// rapids as places (found, named, graded, the next one down the river).

import test from 'node:test';
import assert from 'node:assert/strict';
import { Raft, RAFT, PADDLE, WAVE } from '../src/rafting/raft.js';
import { Rapids, classOf, AHEAD } from '../src/rafting/rapids.js';
import { SEATS, seatOf } from '../src/rafting/crew.js';
import { growWorld, NEWEST_LAND } from '../src/world/lands.js';
import { NO_WATER } from '../src/world/water.js';
import { matchesGolden } from './helpers/golden.js';
import * as THREE from 'three';

const DT = 1 / 30;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// A straight channel down +z, `half` m either side of x = 0, deepest in the
// middle. Its level falls `fall` per m between z = from and z = to (a
// rapid: fast and white), and the current runs `pool` m/s elsewhere.
function river({ half = 4, deep = 1.4, pool = 0.4, fast = 5, fall = 0.07, from = 30, to = 80, rocks = [] } = {}) {
  const levelAt = (z) => -fall * (Math.min(Math.max(z, from), to) - from);
  return {
    water(x, z, out) {
      if (Math.abs(x) > half + 1) return false;
      const t = Math.min(1, Math.abs(x) / half);
      const inRapid = z > from && z < to;
      out.level = levelAt(z);
      out.depth = deep * (1 - t * t) - (Math.abs(x) > half ? 0.3 : 0);
      out.flowX = 0;
      out.flowZ = out.depth > 0 ? (inRapid ? fast : pool) : 0;
      out.foam = inRapid ? 0.9 : 0;
      return true;
    },
    drain: () => null,
    hit(x, z, r, out) {
      for (const [rx, rz, rr] of rocks) {
        const d = Math.hypot(x - rx, z - rz);
        if (d >= rr + r || d < 1e-6) continue;
        out.nx = (x - rx) / d;
        out.nz = (z - rz) / d;
        out.depth = rr + r - d;
        out.what = 'a rock';
        return true;
      }
      return false;
    },
  };
}
// Still water everywhere: a lake with no way out.
const lake = {
  water(x, z, out) {
    out.level = 0;
    out.depth = 3;
    out.flowX = out.flowZ = out.foam = 0;
    return true;
  },
  drain: () => null,
  hit: () => false,
};

// A guide keeping it pointed down the current, paddling along at `fwd`.
const guide = (fwd) => {
  const c = { fwd, turn: 0 };
  return (r) => {
    const off = wrap(Math.atan2(r.flowX, r.flowZ) - r.yaw);
    c.turn = Math.max(-1, Math.min(1, off * 2.5 - r.spin * 0.8));
    return c;
  };
};
const run = (raft, secs, c = null, each = () => {}) => {
  for (let i = 0; i < secs / DT; i++) {
    raft.step(DT, typeof c === 'function' ? c(raft) : c);
    each(raft);
  }
};

test('the river carries it down at its own pace, and keeps it in the channel', () => {
  const raft = new Raft(river({ fall: 0, from: 1e9 }), 1);
  raft.launch(0, 0, 0);
  run(raft, 30);
  assert.ok(Math.abs(raft.speed - 0.4) < 0.05, `going ${raft.speed} m/s on a 0.4 m/s river`);
  assert.ok(raft.z > 9 && Math.abs(raft.x) < 0.5, `at ${raft.x}, ${raft.z}`);
  assert.ok(!raft.aground && !raft.flipped);
});

test('the paddles drive it along the way it points, and turn it', () => {
  const raft = new Raft(lake, 1);
  raft.launch(0, 0, Math.PI / 2); // pointing +x
  run(raft, 15, { fwd: 1, turn: 0 });
  assert.ok(Math.abs(raft.speed - PADDLE.speed[0]) < 0.15, `paddled at ${raft.speed} m/s`);
  assert.ok(raft.vx > 0.9 * raft.speed, 'along the way it points');
  const before = raft.yaw;
  run(raft, 1, { fwd: 0, turn: 1 });
  const turned = wrap(raft.yaw - before);
  assert.ok(turned > 0.2, `turned ${turned} rad to its left`);
  run(raft, 20, { fwd: -1, turn: 0 });
  assert.ok(raft.vx * Math.sin(raft.yaw) + raft.vz * Math.cos(raft.yaw) < -0.5, 'and back-paddled, it goes backwards');
  const hard = new Raft(lake, 1);
  hard.launch(0, 0, 0);
  run(hard, 15, { fwd: 1, hard: true });
  assert.ok(Math.abs(hard.speed - PADDLE.speed[1]) < 0.2, `paddling hard, ${hard.speed} m/s`);
});

test('the bank turns it back into the river: it slides along, and stays afloat', () => {
  const raft = new Raft(river({ fall: 0, from: 1e9, pool: 1 }), 1);
  raft.launch(1.5, 0, 0.9); // aimed at the left bank
  let least = Infinity;
  run(raft, 20, { fwd: 1 }, (r) => (least = Math.min(least, 4 - Math.abs(r.x))));
  assert.ok(least > 0.4, `its middle came within ${least.toFixed(2)} m of the bank`);
  assert.ok(raft.z > 10, 'and it went on down the river');
});

test('a rock knocks it away and spins it', () => {
  const raft = new Raft(river({ fall: 0, from: 1e9, pool: 2, rocks: [[0.6, 12, 0.8]] }), 1);
  raft.launch(0, 0, 0);
  const bumps = [];
  raft.on('bump', (v, what) => bumps.push([v, what]));
  let spun = 0;
  run(raft, 12, null, (r) => (spun = Math.max(spun, Math.abs(r.spin))));
  assert.ok(bumps.length >= 1 && bumps[0][1] === 'a rock', 'knocked against the rock');
  assert.ok(spun > 0.1, `spun at most ${spun} rad/s`);
  assert.ok(raft.z > 14, 'and carried on past it');
});

test('down a rapid it goes fast, and the bow climbs and plunges through the waves', () => {
  const raft = new Raft(river(), 1);
  raft.launch(0, 20, 0);
  const seen = { wave: 0 };
  raft.on('wave', () => seen.wave++);
  let fastest = 0;
  let pitched = 0;
  run(raft, 40, guide(0.6), (r) => {
    if (r.z > 40 && r.z < 80) {
      fastest = Math.max(fastest, r.speed);
      pitched = Math.max(pitched, Math.abs(r.pitch));
    }
  });
  assert.ok(raft.z > 80, 'all the way down it');
  assert.ok(fastest > 4, `at ${fastest} m/s`);
  assert.ok(seen.wave > 10, `through ${seen.wave} waves`);
  assert.ok(pitched > 0.05, `pitched ${pitched} rad`);
  assert.ok(!raft.flipped, 'kept straight down it, it stays right way up');
});

test('side-on in big water it goes over, often; straight, never; and it can be righted', () => {
  let side = 0;
  let straight = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const a = new Raft(river({ fast: 5.5 }), seed);
    a.launch(0, 28, Math.PI / 2);
    run(a, 20, null, (r) => {
      // held side-on, as if nobody were steering
      r.yaw = Math.PI / 2;
      r.spin = 0;
    });
    if (a.flipped) side++;
    const b = new Raft(river({ fast: 5.5 }), seed);
    b.launch(0, 28, 0);
    run(b, 20, null, (r) => {
      r.yaw = 0;
      r.spin = 0;
    });
    if (b.flipped) straight++;
  }
  assert.ok(side >= 8, `side-on, over ${side} times in 12`);
  assert.equal(straight, 0, `straight, over ${straight} times in 12`);
  const raft = new Raft(river({ fast: 5.5 }), 3);
  raft.launch(0, 28, Math.PI / 2);
  const flips = [];
  raft.on('flip', () => flips.push(raft.t));
  run(raft, 20, null, (r) => (r.yaw = Math.PI / 2));
  assert.equal(flips.length, 1, 'goes over once');
  run(raft, 3);
  assert.ok(Math.abs(Math.abs(raft.roll) - Math.PI) < 0.4, `upside down, rolled ${raft.roll}`);
  raft.right();
  run(raft, 3);
  assert.ok(!raft.flipped && Math.abs(raft.roll) < 0.3, `righted, rolled ${raft.roll}`);
});

test('over a step it drops, and is told so', () => {
  const step = {
    water(x, z, out) {
      out.level = z < 10 ? 0 : -0.7;
      out.depth = 1.2;
      out.flowX = 0;
      out.flowZ = 1.5;
      out.foam = 0;
      return true;
    },
    drain: () => null,
    hit: () => false,
  };
  const raft = new Raft(step, 1);
  raft.launch(0, 0, 0);
  const drops = [];
  raft.on('drop', (h) => drops.push(h));
  let lowest = 0;
  run(raft, 15, null, (r) => (lowest = Math.min(lowest, r.y)));
  assert.equal(drops.length, 1, 'dropped once');
  assert.ok(drops[0] > 0.5, `by ${drops[0]} m`);
  assert.ok(Math.abs(raft.y + 0.7) < 0.1 && lowest > -0.7 - 0.2, `down to ${raft.y}, never below ${lowest}`);
});

test('the paddles do nothing while it is upside down', () => {
  const raft = new Raft(lake, 1);
  raft.launch(0, 0, 0);
  raft.flipped = true;
  run(raft, 5, { fwd: 1, turn: 1 });
  assert.ok(raft.speed < 0.05 && Math.abs(raft.spin) < 0.05);
});

test('a wave rises and falls with the level, a crest every WAVE.drop m of fall', () => {
  const raft = new Raft(river(), 1);
  raft.launch(0, 50, 0);
  raft.step(DT, null);
  const P = raft.at;
  for (const p of P) assert.ok(Math.abs(p.surf - p.level) <= WAVE.height + 1e-9);
});

test('the seats are on the tubes, and go round with it', () => {
  const r = { x: 10, y: 2, z: -5, yaw: Math.PI / 2, pitch: 0, roll: 0 };
  const v = new THREE.Vector3();
  for (const s of SEATS.places) {
    assert.ok(Math.abs(Math.abs(s.a) - (RAFT.beam / 2 - RAFT.tube)) < 1e-9);
    seatOf(r, s, 0.2, v);
    // pointing +x: its left is -z, forward +x
    assert.ok(Math.abs(v.x - (r.x + s.f)) < 1e-6 && Math.abs(v.z - (r.z - s.a)) < 1e-6, `seat at ${v.x}, ${v.z}`);
    assert.ok(v.y > r.y + 0.19);
  }
  assert.equal(new Set(SEATS.places.map((s) => `${s.a},${s.f}`)).size, SEATS.places.length);
});

// ── The rapids, as places ───────────────────────────────────────────────────

test('harder the steeper it falls, and the more water there is', () => {
  for (const acc of [24, 60, 160]) {
    let last = 0;
    for (let g = 0.005; g < 0.15; g += 0.005) {
      const c = classOf(g, acc);
      assert.ok(c >= last && c >= 1 && c <= 6);
      last = c;
    }
  }
  assert.ok(classOf(0.05, 160) >= classOf(0.05, 24));
  assert.equal(classOf(0.01, 24), 1);
  assert.equal(classOf(0.2, 160), 6);
});

const SEED = 20261119;
const gen = growWorld(SEED, [], NEWEST_LAND);
const rapids = new Rapids(gen.water, SEED);
const near = rapids.within(-1500, -1500, 1500, 1500);

test('the rapids near the start are found, named, graded, and found again by id', () => {
  assert.ok(near.length >= 4, `only ${near.length} rapids`);
  for (const r of near) {
    assert.match(r.id, /^rapid:-?\d+,-?\d+$/);
    assert.ok(r.name.length > 3);
    assert.ok(r.cls >= 1 && r.cls <= 6);
    assert.ok(r.len >= 12 && r.drop >= 0.44);
    assert.ok(Math.hypot(r.foot.x - r.lip.x, r.foot.z - r.lip.z) <= r.len + 1e-6);
    const again = rapids.get(r.id);
    assert.equal(again, r);
  }
  assert.equal(rapids.get('rapid:nope'), null);
  // the same, worked out afresh
  const fresh = new Rapids(growWorld(SEED, [], NEWEST_LAND).water, SEED);
  for (const r of near.slice(0, 4)) assert.equal(fresh.get(r.id).name, r.name);
});

test('the next rapid down the river: above it, in it, and past it', () => {
  const r = near.find((r) => r.cls >= 2 && r.s0 > 12);
  assert.ok(r, 'a rapid with room above it');
  const at = (s) => {
    const S = r.seg.s;
    let q = 0;
    while (q < r.seg.count - 1 && S[q + 1] < s) q++;
    const t = (s - S[q]) / (S[q + 1] - S[q]);
    return [r.seg.pts[q * 2] + (r.seg.pts[q * 2 + 2] - r.seg.pts[q * 2]) * t, r.seg.pts[q * 2 + 1] + (r.seg.pts[q * 2 + 3] - r.seg.pts[q * 2 + 1]) * t];
  };
  const above = rapids.on(...at(r.s0 - 10));
  assert.equal(above.rapid.id, r.id);
  assert.ok(Math.abs(above.along + 10) < 1.5, `10 m above its lip, ${above.along}`);
  const inIt = rapids.on(...at((r.s0 + r.s1) / 2));
  assert.equal(inIt.rapid.id, r.id);
  assert.ok(Math.abs(inIt.along - r.len / 2) < 1.5);
  const past = rapids.on(...at(r.s1 + 2));
  assert.ok(!past || past.rapid.id !== r.id || past.along > r.len);
  assert.ok(AHEAD >= 200);
});

test('the nearest rapid to run is an easy-to-middling one if there is one near', () => {
  const r = rapids.nearest(0, 0, { reach: 1500 });
  assert.ok(r && r.cls >= 2 && r.cls <= 4, `the nearest is Class ${r && r.cls}`);
  const any = rapids.nearest(0, 0, { reach: 1500, least: 2, most: 5 });
  assert.ok(Math.hypot(any.lip.x, any.lip.z) <= Math.hypot(r.lip.x, r.lip.z));
});

test('the rapids are where they were (the ones people have run are saved by id)', () => {
  const list = near
    .map((r) => ({ id: r.id, name: r.name, cls: r.cls, len: Math.round(r.len * 10) / 10, drop: r.drop, lip: [Math.round(r.lip.x * 10) / 10, Math.round(r.lip.z * 10) / 10] }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  matchesGolden(`rapids-${SEED}`, list, { tolerance: 1e-6 });
});

test('the water is a raft’s to float on wherever a rapid is', () => {
  // every rapid is deep enough and wide enough down its middle
  for (const r of near) {
    gen.height(r.x, r.z);
    const w = gen.water;
    assert.ok(w.region && w.level !== NO_WATER, `no water at ${r.id}`);
    assert.ok(w.level - gen.height(r.x, r.z) >= RAFT.draft || r.seg.w0 < RAFT.beam, `too shallow at ${r.id}`);
  }
});
