// The Metro (src/metro/): Washington's, life size. What's checked here: that
// how high the rails run is worked out as it says (never steeper than the
// grade, never over a ceiling or under a floor that can be had, the highest
// winning where both can't); that what the importer wrote is the six lines,
// their stations in life-size Washington each with its entrances, and
// services that stop at the same stations both ways; that every tunnel keeps
// under the ground and every platform is level and beside its track; that
// two tracks side by side leave room for trains to pass; that the trains
// keep to the clock, standing at every station on the way and never jumping
// along the track, and the boards say when they come; that a platform is a
// place to stand, with its edges for walls, its vault overhead, and a
// train's tunnel open air, and no daylight but its own lamps down there;
// and that the stations, the track, the entrances and the trains are built,
// with the vault's faces looking in.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fall, rise, solveProfile, GRADE } from '../tools/metro/profile.js';
import SYSTEM from '../src/metro/system.js';
import { METRO } from '../src/metro/metro.js';
import { Network, readSystem, pointAt, onLevel, fromLevel, TUNNEL, TUBE, PLATFORM_UP } from '../src/metro/network.js';
import { Timetable, arrivals, DWELL, TRAIN_LEN, HEADWAY, ARRIVING } from '../src/metro/timetable.js';
import { MetroSpace } from '../src/metro/space.js';
import * as look from '../src/metro/look.js';
import { inflate } from '../src/world/earth.js';
import { HIKES } from '../src/world/hikes.js';
import { loadHike } from '../src/world/landforms.js';
import { growWorld } from '../src/world/lands.js';

const city = HIKES.find((h) => h.id === METRO.place);
const sys = await readSystem(SYSTEM, inflate);
// the network in the world, its heights over the land's own base (offset 0)
const net = new Network(sys, { at: city.at, offset: 0, metro: METRO });

// ── How high the rails run ───────────────────────────────────────────────────

// a straight line of n points, 10 m apart
const line = (n) => Array.from({ length: n }, (_, i) => [...(i > 0 ? [[i - 1, 10]] : []), ...(i < n - 1 ? [[i + 1, 10]] : [])]);

test('the highest and lowest the rail can be never change faster than the grade', () => {
  const adj = line(50);
  const c = new Array(50).fill(Infinity);
  c[20] = 0;
  const hi = fall(adj, c);
  assert.equal(hi[20], 0);
  assert.ok(Math.abs(hi[25] - 50 * GRADE) < 1e-9, 'climbing away from a ceiling at the grade');
  const f = new Array(50).fill(-Infinity);
  f[10] = 5;
  const lo = rise(adj, f);
  assert.ok(Math.abs(lo[0] - (5 - 100 * GRADE)) < 1e-9, 'and down from a floor');
});

test('a tunnel is kept under its ceiling, a platform level, and the floor gives way where the two clash', () => {
  const n = 60;
  const adj = line(n);
  const f = new Array(n).fill(-Infinity);
  const c = new Array(n).fill(Infinity);
  const w = new Array(n).fill(0);
  const pinned = new Array(n).fill(false);
  // a tunnel for the first half, under ground at 0 with 6 m over the rail; then the ground, at 0
  for (let i = 0; i < 30; i++) {
    c[i] = -6;
    w[i] = -15;
  }
  for (let i = 30; i < n; i++) f[i] = w[i] = 0.5;
  // a platform in the tunnel, at -15
  for (let i = 5; i < 12; i++) {
    f[i] = c[i] = w[i] = -15;
    pinned[i] = true;
  }
  const { h, conflicts } = solveProfile(adj, { f, c, w, pinned });
  for (let i = 0; i < 30; i++) assert.ok(h[i] <= c[i] + 1e-6, `point ${i} keeps under the ground (${h[i].toFixed(2)})`);
  for (let i = 5; i < 12; i++) assert.equal(h[i], -15, 'the platform is level');
  for (let i = 1; i < n; i++) assert.ok(Math.abs(h[i] - h[i - 1]) <= 10 * GRADE * 1.25, `no steeper than the grade at ${i}`);
  assert.ok(conflicts.length > 0 && conflicts.every((i) => i >= 30), 'out of the portal, the track can’t be on the ground at once');
  assert.ok(h[n - 1] > h[30], 'it climbs out after');
});

// ── What the importer wrote ──────────────────────────────────────────────────

test('all six lines, and their stations in life-size Washington, each with an entrance', () => {
  assert.deepEqual(METRO.lines.map((l) => l.id), ['red', 'orange', 'blue', 'silver', 'green', 'yellow']);
  for (const l of METRO.lines) assert.match(l.colour, /^#[0-9a-f]{6}$/, `${l.name} has its colour`);
  assert.ok(METRO.stations.length >= 60, `${METRO.stations.length} stations`);
  const ids = new Set();
  for (const st of METRO.stations) {
    assert.ok(!ids.has(st.id), `${st.id} once`);
    ids.add(st.id);
    assert.ok(st.entrances.length >= 1, `${st.name} has an entrance`);
    assert.ok(st.lines.length >= 1, `${st.name} has a line`);
    for (const [x, z] of st.entrances) assert.ok(Math.hypot(x, z) < city.radius, `${st.name}'s entrance is in life-size Washington`);
  }
  for (const id of ['metro-center', 'gallery-place-chinatown', 'lenfant-plaza', 'union-station', 'dupont-circle', 'rosslyn', 'pentagon', 'fort-totten', 'navy-yard-ballpark', 'anacostia', 'branch-ave']) assert.ok(ids.has(id), `${id} is there`);
  for (const l of METRO.lines) assert.ok(METRO.stations.some((st) => st.lines.includes(l.id)), `the ${l.name} stops somewhere`);
  // where lines cross, a level for each, one under the other
  for (const id of ['metro-center', 'gallery-place-chinatown', 'lenfant-plaza']) {
    const st = net.station(id);
    assert.equal(st.levels.length, 2, `${st.name} has two levels`);
    const [a, b] = st.levels;
    assert.ok(Math.abs(a.rail - b.rail) >= 9.9, `${st.name}'s are a level apart (${Math.abs(a.rail - b.rail).toFixed(1)} m)`);
  }
});

test('every service stops at the same stations each way, and runs on track that joins up', () => {
  for (const p of net.patterns) {
    const [a, b] = p.ways;
    const names = (r) => r.stops.map((s) => s.level.station.id);
    assert.ok(a.stops.length >= 10, `${p.line.name} ${a.from}–${a.to} stops at ${a.stops.length}`);
    assert.deepEqual(names(a), [...names(b)].reverse(), `${p.line.name} ${a.from}–${a.to}: the same stations both ways`);
    for (const r of p.ways) {
      for (let i = 1; i < r.n; i++) assert.ok(Math.hypot(r.x[i] - r.x[i - 1], r.z[i] - r.z[i - 1]) < 40, `${r.from}→${r.to}: no gap in its track at ${i}`);
      for (let k = 1; k < r.stops.length; k++) assert.ok(r.stops[k].s - r.stops[k - 1].s > 300, `${r.from}→${r.to}: its stops in order`);
    }
  }
});

test('the tunnels keep under the ground, the track over it is on it, and no climb is steeper than Metro’s', async () => {
  const zoo = HIKES.find((h) => h.id === 'national-zoo');
  const gen = growWorld(20261119, [], 1, await Promise.all([loadHike(city), loadHike(zoo)]));
  const L = gen.landforms.find((l) => l.id === city.id);
  const ground = (x, z) => gen.height(x, z) - L.offset;
  let tunnel = 0;
  let steep = 0;
  let edges = 0;
  for (const t of net.tracks) {
    for (let i = 0; i + 1 < t.n; i++) {
      const d = t.s[i + 1] - t.s[i];
      edges++;
      if (d > 3 && Math.abs(t.y[i + 1] - t.y[i]) / d > 0.05) steep++;
      if (t.kind[i] !== TUNNEL || (i > 0 && t.kind[i - 1] !== TUNNEL)) continue;
      tunnel++;
      assert.ok(t.y[i] + TUBE.top <= ground(t.x[i], t.z[i]) + 0.1, `track ${t.k}, point ${i}: the tube is under the ground`);
    }
  }
  assert.ok(tunnel > 3000, `${tunnel} points of tunnel`);
  assert.ok(steep / edges < 0.002, `${steep} of ${edges} stretches steeper than 5 %`);
  // and under a station the vault, with earth over it too
  for (const Lv of net.levels) {
    if (Lv.what !== 'tunnel') continue;
    assert.ok(Lv.rail + TUBE.vault <= ground(Lv.x, Lv.z) + 0.1, `${Lv.station.name}'s vault is under the street`);
  }
});

test('each platform is beside its track, along the whole of it, and level with the cars’ floor', () => {
  for (const L of net.levels) {
    const p0 = L.platforms[0];
    assert.ok(p0 && p0.a1 - p0.a0 > 120, `${L.station.name}: a platform for a train (${p0 && (p0.a1 - p0.a0).toFixed(0)} m)`);
    assert.equal(L.floor, L.rail + PLATFORM_UP);
    for (const r of net.routes) {
      const stop = r.stops.find((s) => s.level === L);
      if (!stop) continue;
      // along the train's length at the stop, the track is beside a platform, at the rail's height
      for (let s = stop.s - TRAIN_LEN / 2 + 5; s < stop.s + TRAIN_LEN / 2 - 5; s += 10) {
        const p = pointAt(r, s);
        const o = onLevel(L, p.x, p.z);
        assert.ok(Math.abs(p.y - L.rail) < 0.05, `${L.station.name}: level along the platform (${(p.y - L.rail).toFixed(2)} m)`);
        assert.ok(L.platforms.some((q) => Math.min(Math.abs(o.c - q.c0), Math.abs(o.c - q.c1)) < 1.8 && o.a > q.a0 - 6 && o.a < q.a1 + 6), `${L.station.name}: the track at ${o.a.toFixed(0)} m is beside a platform`);
      }
    }
  }
});

test('two tracks side by side are far enough apart for trains to pass', () => {
  // a car is 3.1 m wide: middle to middle, at a station, never less than 4 m
  for (const L of net.levels) {
    const t = [...L.tracks].sort((a, b) => a - b);
    for (let k = 1; k < t.length; k++) assert.ok(t[k] - t[k - 1] >= 4, `${L.station.name}: its tracks ${(t[k] - t[k - 1]).toFixed(1)} m apart`);
  }
  // and anywhere along the line, but where two meet at a switch
  const pts = [];
  for (const t of net.tracks) {
    for (let i = 0; i < t.n; i++) {
      const [a, b] = [Math.max(0, i - 1), Math.min(t.n - 1, i + 1)];
      const l = Math.hypot(t.x[b] - t.x[a], t.z[b] - t.z[a]) || 1;
      pts.push({ k: t.k, s: t.s[i], x: t.x[i], y: t.y[i], z: t.z[i], dx: (t.x[b] - t.x[a]) / l, dz: (t.z[b] - t.z[a]) / l });
    }
  }
  const grid = new Map();
  for (const p of pts) {
    const key = `${Math.floor(p.x / 8)},${Math.floor(p.z / 8)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(p);
  }
  let beside = 0;
  let close = 0;
  for (const p of pts) {
    let best = Infinity;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const q of grid.get(`${Math.floor(p.x / 8) + i},${Math.floor(p.z / 8) + j}`) || []) {
          if ((q.k === p.k && Math.abs(q.s - p.s) < 200) || Math.abs(q.y - p.y) > 4 || Math.abs(p.dx * q.dx + p.dz * q.dz) < 0.97) continue;
          if (Math.abs((q.x - p.x) * p.dx + (q.z - p.z) * p.dz) > 7) continue;
          best = Math.min(best, Math.abs((q.x - p.x) * -p.dz + (q.z - p.z) * p.dx));
        }
      }
    }
    if (best < 6) beside++;
    if (best < 3.5) close++;
  }
  assert.ok(beside > 5000, `${beside} points with a track beside them`);
  assert.ok(close / beside < 0.015, `${close} of them too near it (at switches)`);
});

// ── The trains ───────────────────────────────────────────────────────────────

test('the trains keep to the clock: on along the track, and standing at every station', () => {
  for (const p of net.patterns) {
    const tt = new Timetable(p, 0.3);
    assert.ok(tt.trains >= 2 && Math.abs(tt.period / tt.trains - HEADWAY) < HEADWAY * 0.3, `${p.line.name}: ${tt.trains} trains`);
    const stood = [new Set(), new Set()];
    let prev = null;
    for (let t = 0; t < tt.period; t += 0.5) {
      const w = tt.where(1, t);
      if (w.way >= 0 && w.at >= 0) stood[w.way].add(w.at);
      if (prev && w.way === prev.way && w.way >= 0) assert.ok(w.s - prev.s >= -1e-6 && w.s - prev.s < 15, `${p.line.name}: on, never back or a jump (${prev.s.toFixed(1)} → ${w.s.toFixed(1)})`);
      prev = { ...w };
    }
    for (const w of [0, 1]) assert.equal(stood[w].size, p.ways[w].stops.length, `${p.line.name}: stands at every station`);
    // and the next train due at a station is the one that stands there
    const L = p.ways[0].stops[3].level;
    const due = tt.due(L, 1000)[0];
    const there = tt.where(due.train, 1000 + due.wait + 1);
    assert.equal(p.ways[0].stops[there.at]?.level, L, 'the train due is the one that comes');
    assert.ok(there.leaves <= DWELL, 'standing its while');
  }
});

test('the boards say when the next trains come, soonest first: boarding, arriving, then minutes', () => {
  const tables = net.patterns.map((p, k) => new Timetable(p, (k * 0.618034) % 1));
  const L = net.station('metro-center').levels.find((l) => l.lines.includes('red'));
  let boarding = false;
  for (let t = 0; t < 1200; t += 7) {
    const rows = arrivals(tables, L, t);
    assert.ok(rows.length >= 2 && rows.length <= 3, 'a few rows');
    for (let k = 1; k < rows.length; k++) assert.ok(rows[k].wait >= rows[k - 1].wait, 'soonest first');
    for (const r of rows) {
      assert.equal(r.line, 'red', 'only the trains that stop at this level');
      assert.ok(['Glenmont', 'Shady Grove'].includes(r.to), `going to ${r.to}`);
      if (r.wait < 1) {
        assert.equal(r.min, 'BRD');
        boarding = true;
      } else if (r.wait < ARRIVING) assert.equal(r.min, 'ARR');
      else assert.equal(r.min, Math.max(1, Math.round(r.wait / 60)));
    }
  }
  assert.ok(boarding, 'and sometimes a train standing there');
});

// ── Being in it ──────────────────────────────────────────────────────────────

test('a platform is somewhere to stand, its edges walls; over the track and down the tunnels is air', () => {
  const space = new MetroSpace(net);
  const out = { floor: 0, roof: 0 };
  const wall = { d: 0, nx: 0, nz: 0 };
  const L = net.station('metro-center').levels.find((l) => l.lines.includes('red'));
  const p = L.platforms[0];
  const on = fromLevel(L, (p.a0 + p.a1) / 2, (p.c0 + p.c1) / 2);
  assert.ok(space.inside(on.x, on.z, L.floor, out), 'on the platform');
  assert.equal(out.floor, L.floor);
  assert.ok(out.roof > L.floor + 5, 'the vault high over it');
  assert.ok(space.air(on.x, L.floor + 2, on.z, 0.3), 'air over it');
  assert.ok(!space.inside(on.x, on.z, L.floor + 30, out), 'not up on the street');
  // over the track: a wall to someone on foot, and the way out of it is to the platform
  const track = fromLevel(L, (p.a0 + p.a1) / 2, L.tracks.reduce((a, t) => (Math.abs(t - (p.c0 + p.c1) / 2) < Math.abs(a - (p.c0 + p.c1) / 2) ? t : a)));
  space.walls(track.x, track.z, wall, L.floor);
  assert.ok(wall.d < 0, 'over the track is in the walls');
  const toward = { x: on.x - track.x, z: on.z - track.z };
  assert.ok(wall.nx * toward.x + wall.nz * toward.z > 0, 'the way out is back to the platform');
  space.walls(on.x, on.z, wall, L.floor);
  assert.ok(wall.d > 0.5, 'the middle of the platform is clear');
  // a tunnel between stations
  const r = net.routes.find((r) => r.line.id === 'red');
  const k = r.stops.findIndex((s) => s.level === L);
  const mid = pointAt(r, (r.stops[k].s + r.stops[k + 1].s) / 2);
  assert.equal(mid.kind, TUNNEL);
  assert.ok(space.inside(mid.x, mid.z, mid.y + 1.2, out), 'in the tunnel');
  assert.ok(space.air(mid.x, mid.y + 2.5, mid.z, 0.3), 'its air');
  assert.ok(!space.air(mid.x, mid.y + TUBE.top + 1, mid.z, 0), 'and over it, the earth');
  assert.ok(space.light(on.x, on.z) < 0.1 && space.light(mid.x, mid.z) < 0.1, 'no daylight under the street');
  assert.ok(space.lamps(on.x, on.z) >= 0.5, 'but lit by its own lamps: no headlamp');
  // an entrance's well, down from the street
  const well = { x: on.x + 400, z: on.z, dx: 1, dz: 0, half: 1.8, run: 12, g0: 20, depth: 6.6, open: 0.45 };
  space.addWell(well);
  assert.ok(space.inside(well.x + 0.2, well.z, 20, out) && Math.abs(out.floor - 20) < 0.2, 'its top is level with the street');
  assert.ok(space.inside(well.x + 6, well.z, 17, out) && Math.abs(out.floor - 16.7) < 0.01, 'half way down');
  assert.ok(!space.inside(well.x + 10, well.z, 20, out), 'over its roofed end is the street');
  assert.ok(space.light(well.x + 1, well.z) === 1 && space.light(well.x + 11.5, well.z) < 0.5, 'daylight at its top, less under its roof');
  space.removeWell(well);
  assert.ok(!space.inside(well.x + 6, well.z, 17, out), 'gone with its entrance');
});

// ── What it looks like ───────────────────────────────────────────────────────

test('stations, track, entrances and trains are built, the vault looking in', () => {
  const space = new MetroSpace(net);
  const mats = look.makeMaterials(net.lines);
  const ground = () => 40;
  const finite = (o) => {
    let n = 0;
    o.traverse((m) => {
      if (!m.isMesh) return;
      const a = m.geometry.attributes.position.array;
      for (let i = 0; i < a.length; i++) assert.ok(Number.isFinite(a[i]), 'no NaN in it');
      // (built round itself, not a long way out)
      for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i]) < 2000, 'measured from near it');
      n += a.length / 3;
    });
    return n;
  };
  const st = net.station('dupont-circle');
  const L = st.levels[0];
  const room = space.roomOf(L);
  const b = look.buildLevel(L, room, { ground, mats });
  assert.ok(b.under, 'under the street');
  assert.ok(finite(b.group) > 20000, 'a vault of coffers');
  assert.ok(b.spots.length >= 1, 'escalators up from its platforms');
  // the vault's shell: its faces look into the room
  const shell = b.group.children.find((m) => m.material === mats.vault);
  const pos = shell.geometry.attributes.position;
  const nor = shell.geometry.attributes.normal;
  const mid = new THREE.Vector3();
  const middle = fromLevel(L, (L.a0 + L.a1) / 2, room.mid);
  let inward = 0;
  let total = 0;
  for (let i = 0; i < pos.count; i += 97) {
    const p = new THREE.Vector3().fromBufferAttribute(pos, i).add(shell.position);
    const n = new THREE.Vector3().fromBufferAttribute(nor, i);
    const a = onLevel(L, p.x, p.z).a;
    // (toward the line along the middle of the room, at the platform's height)
    const c = fromLevel(L, a, room.mid);
    mid.set(c.x, L.floor + 2, c.z).sub(p);
    total++;
    if (n.dot(mid) > 0) inward++;
  }
  void middle;
  assert.ok(inward / total > 0.97, `the vault looks inward (${inward} of ${total})`);
  const over = net.station('rhode-island-avenue').levels[0];
  assert.ok(!look.buildLevel(over, space.roomOf(over), { ground, mats }).under, 'over the street, open');
  for (const e of st.entrances.slice(0, 2)) assert.ok(finite(look.buildEntrance(e, st, { ground, mats, under: true })) > 200, 'an entrance, its pylon and its well');
  // a piece of each kind of track
  let kinds = new Set();
  for (const t of net.tracks.slice(0, 6)) {
    for (const [s0, s1] of look.piecesOf(t).slice(0, 30)) {
      const p = look.buildPiece(t, s0, s1, { ground, outside: () => 1, mats });
      if (p.over) kinds.add('over') && finite(p.over);
      if (p.under) kinds.add('under') && finite(p.under);
    }
  }
  assert.deepEqual([...kinds].sort(), ['over', 'under']);
  const kit = new look.TrainKit(mats);
  const train = new look.MetroTrain(kit);
  const r = net.routes[0];
  train.place(r, r.stops[2].s + TRAIN_LEN / 2);
  assert.equal(train.cars.filter((c) => c.group.visible).length, 6, 'all six cars on the track');
  const seat = {};
  train.seat(2, 5, seat);
  const car = train.cars[2].group.position;
  assert.ok(Math.hypot(seat.x - car.x, seat.z - car.z) < 12 && seat.y > car.y + 1, 'a seat in the car, over its floor');
  const doors = train.doors(2);
  assert.equal(doors.length, 6, 'three pairs of doors a side');
});
