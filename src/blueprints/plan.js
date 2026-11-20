// Blueprints: a building written down so it can go up again somewhere else,
// and the plain arithmetic of putting one on the ground and working out what
// to do next. Nothing here touches the scene or the game. It is handed the
// buildings and the lie of the land and says what it sees, so all of it can
// be tested in Node (test/blueprints.test.js).
//
// ── What a blueprint is ─────────────────────────────────────────────────────
//
//   {
//     name: 'Small cabin',
//     footings: [[x, z], …],                         grid nodes
//     logs:     [[kind, axis, line, s0, s1, k], …],  lowest level first
//     roofs:    [[x0, z0, x1, z1], …],               the rooms that take a roof
//   }
//
// It is Buildings.serialize() less whatever depends on where it stands (the
// ground under each footing, the level of the footings, the eaves, which way
// a ridge runs) and less the notches, which are cut as each log goes on. Any
// corner will do as (0, 0). `k` is a log's level in half-courses (see
// build/constants.js): the first sill's axis takes the even levels and the
// other axis the odd ones, so a plan turned a quarter-turn stacks the same.
//
// Your own blueprints are kept in this browser in this layout (library.js);
// add fields if you must, but don't change these.

import { PIER, MAX_SPAN, MAX_LEVEL, HALF, ROOF, height } from '../build/constants.js';

const KINDS = ['log', 'timber'];
const MAX_NAME = 60;
const nodeXZ = (axis, line, n) => (axis === 'x' ? [n, line] : [line, n]);

// ── Checking a blueprint ────────────────────────────────────────────────────
// A blueprint is something somebody kept, typed or pasted: take only what
// makes sense, in fresh arrays. -> a blueprint, or null if nothing is left.
export function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const int = Number.isInteger;
  const list = (v) => (Array.isArray(v) ? v.filter(Array.isArray) : []);
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, MAX_NAME) : 'Untitled';
  const footings = [];
  const seen = new Set();
  for (const [x, z] of list(raw.footings)) {
    if (!int(x) || !int(z) || seen.has(`${x},${z}`)) continue;
    seen.add(`${x},${z}`);
    footings.push([x, z]);
  }
  const logs = list(raw.logs)
    .filter(([kind, axis, line, s0, s1, k]) => KINDS.includes(kind) && (axis === 'x' || axis === 'z') && int(line) && int(s0) && int(s1) && int(k))
    .filter(([, , , s0, s1, k]) => s1 > s0 && s1 - s0 <= MAX_SPAN && k >= 0 && k <= MAX_LEVEL)
    .map(([kind, axis, line, s0, s1, k]) => [kind, axis, line, s0, s1, k]);
  // lowest first; a stable sort keeps the order within a level
  logs.sort((a, b) => a[5] - b[5]);
  const roofs = list(raw.roofs)
    .filter(([x0, z0, x1, z1]) => [x0, z0, x1, z1].every(int) && x1 > x0 && z1 > z0)
    .map(([x0, z0, x1, z1]) => [x0, z0, x1, z1]);
  if (!footings.length) return null;
  return { name, footings, logs, roofs };
}

// The square of grid that the footings and the log ends cover.
export function bounds(plan) {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  const grow = (x, z) => {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  };
  for (const [x, z] of plan.footings) grow(x, z);
  for (const [, axis, line, s0, s1] of plan.logs) {
    grow(...nodeXZ(axis, line, s0));
    grow(...nodeXZ(axis, line, s1));
  }
  return { x0, z0, x1, z1 };
}

// What it takes to put up: { stone, log, timber } (metres of wood).
export function needs(plan) {
  const out = { stone: plan.footings.length * 2, log: 0, timber: 0 };
  for (const [kind, , , s0, s1] of plan.logs) out[kind] += s1 - s0;
  for (const [x0, z0, x1, z1] of plan.roofs) out.timber += Math.ceil((x1 - x0) * (z1 - z0) * ROOF.cost);
  return out;
}

// ── Putting one on the ground ───────────────────────────────────────────────
// The plan turned `rot` quarter-turns about its middle, with its middle on
// the node (x, z): every piece in world grid coordinates.
//
// -> { name, footings: [{ x, z }], logs: [{ kind, axis, line, s0, s1, k }],
//      roofs: [{ x0, z0, x1, z1 }], rect: { x0, z0, x1, z1 } }
export function place(plan, x, z, rot = 0) {
  const B = bounds(plan);
  const px = Math.floor((B.x0 + B.x1) / 2);
  const pz = Math.floor((B.z0 + B.z1) / 2);
  const r = ((rot % 4) + 4) % 4;
  // a quarter-turn: (u, v) -> (-v, u)
  const at = (u, v) => {
    let a = u - px;
    let c = v - pz;
    for (let i = 0; i < r; i++) [a, c] = [-c, a];
    return [x + a, z + c];
  };
  const footings = plan.footings.map(([u, v]) => {
    const [fx, fz] = at(u, v);
    return { x: fx, z: fz };
  });
  const logs = plan.logs.map(([kind, axis, line, s0, s1, k]) => {
    const [ax, az] = at(...nodeXZ(axis, line, s0));
    const [bx, bz] = at(...nodeXZ(axis, line, s1));
    return az === bz ? { kind, axis: 'x', line: az, s0: Math.min(ax, bx), s1: Math.max(ax, bx), k } : { kind, axis: 'z', line: ax, s0: Math.min(az, bz), s1: Math.max(az, bz), k };
  });
  const roofs = plan.roofs.map(([u0, v0, u1, v1]) => {
    const [ax, az] = at(u0, v0);
    const [bx, bz] = at(u1, v1);
    return { x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz) };
  });
  const placed = { name: plan.name, footings, logs, roofs };
  placed.rect = bounds({ footings: footings.map((f) => [f.x, f.z]), logs: logs.map((L) => [L.kind, L.axis, L.line, L.s0, L.s1, L.k]) });
  return placed;
}

// ── Taking a building down on paper ─────────────────────────────────────────
// One building as Buildings.serialize() spells it -> a blueprint of it, with
// its lowest corner at (0, 0). The order the logs went up in is kept: it is
// always one they can go up in again, since nothing can be taken out from
// under a log that rests on it.
export function capture(building, name) {
  const footings = (building.footings || []).map(([x, z]) => [x, z]);
  const logs = (building.logs || []).map(([kind, axis, line, s0, s1, k]) => [kind, axis, line, s0, s1, k]);
  const roofs = (building.roofs || []).map(([x0, z0, x1, z1]) => [x0, z0, x1, z1]);
  const B = bounds({ footings, logs });
  const ox = B.x0;
  const oz = B.z0;
  return normalize({
    name,
    footings: footings.map(([x, z]) => [x - ox, z - oz]),
    logs: logs.map(([kind, axis, line, s0, s1, k]) => (axis === 'x' ? [kind, axis, line - oz, s0 - ox, s1 - ox, k] : [kind, axis, line - ox, s0 - oz, s1 - oz, k])),
    roofs: roofs.map(([x0, z0, x1, z1]) => [x0 - ox, z0 - oz, x1 - ox, z1 - oz]),
  });
}

// ── Which building is the site's ────────────────────────────────────────────
// list: Buildings.list. -> { b, clash }
//   b      the building already standing on the plan's footings, if any
//   clash  another building close enough that new footings would join it
//          instead (Buildings.buildingFor joins anything within joinRadius)
export function findBuilding(placed, list, joinRadius) {
  const onPlan = (B) => placed.footings.some((p) => [...B.footings.values()].some((f) => f.x === p.x && f.z === p.z));
  const b = list.find(onPlan) || null;
  for (const B of list) {
    if (B === b) continue;
    for (const f of B.footings.values()) {
      if (placed.footings.some((p) => Math.hypot(f.x - p.x, f.z - p.z) < joinRadius)) return { b, clash: B };
    }
  }
  return { b, clash: null };
}

// ── The ground ──────────────────────────────────────────────────────────────
// How the land suits the footings. ground(x, z) -> height. y0: the level the
// footings come up to, if a building already set it; otherwise the first
// footing sets it (a pier of PIER.first), so pick the first footing that
// lets the most of the others reach that level.
//
// -> { y0, first: { x, z } , ok, footings: [{ x, z, ground, pier, ok, reason }] }
export function survey(placed, ground, y0 = null) {
  const fs = placed.footings.map(({ x, z }) => ({ x, z, ground: ground(x, z) }));
  let first = null;
  if (y0 === null) {
    let best = null;
    for (const f of fs) {
      const y = f.ground + PIER.first;
      let fit = 0;
      let off = 0;
      for (const g of fs) {
        const p = y - g.ground;
        if (p >= PIER.min && p <= PIER.max) fit++;
        off += Math.abs(p - PIER.first);
      }
      if (!best || fit > best.fit || (fit === best.fit && off < best.off - 1e-9)) best = { y, fit, off, f };
    }
    y0 = best.y;
    first = { x: best.f.x, z: best.f.z };
  }
  let ok = true;
  for (const f of fs) {
    f.pier = y0 - f.ground;
    f.ok = f.pier >= PIER.min && f.pier <= PIER.max;
    f.reason = f.pier < PIER.min ? `the ground is ${cm(PIER.min - f.pier)} too high: dig it down` : f.pier > PIER.max ? `the ground is ${cm(f.pier - PIER.max)} too low: fill it in` : null;
    ok = ok && f.ok;
  }
  return { y0, first, ok, footings: fs };
}

const cm = (m) => `${Math.max(1, Math.round(m * 100))} cm`;

// ── What to do next ─────────────────────────────────────────────────────────
// Everything in the plan that isn't standing yet, in an order the rules
// allow. b: the site's building (live, from Buildings.list) or null. near:
// { x, z }, where you are, to pick the closest of equally good jobs. first:
// the footing to start with when there is no building yet (survey().first).
//
// -> { type: 'notch', b, L, n, x, z, k }   cut a notch in a log that rides high
//    { type: 'footing', x, z }
//    { type: 'log', kind, axis, line, s0, s1, k, x, z }   x, z: its middle
//    { type: 'roof', x0, z0, x1, z1, x, z }               x, z: the room's middle
//    { type: 'done' }
//
// Notches come first: nothing can rest on a log until it is notched in.
// Then the footings, then the logs a level at a time, then the roofs.
export function nextJob(placed, b, near = { x: 0, z: 0 }, first = null) {
  const closest = (list) => {
    let best = null;
    let bd = Infinity;
    for (const j of list) {
      const d = Math.hypot(j.x - near.x, j.z - near.z);
      if (d < bd - 1e-9) {
        bd = d;
        best = j;
      }
    }
    return best;
  };

  if (b) {
    const notches = [];
    for (const L of b.logs) {
      if (L.seated || !L.below) continue;
      for (const n of L.below) {
        if (L.notches.includes(n)) continue;
        const P = b.logs.find((Q) => Q.axis !== L.axis && Q.k === L.k - 1 && Q.line === n && Q.s0 <= L.line && L.line <= Q.s1);
        if (P && !P.seated) continue; // that one first
        const [x, z] = nodeXZ(L.axis, L.line, n);
        notches.push({ type: 'notch', b, L, n, x, z, k: L.k });
      }
    }
    if (notches.length) {
      const k = Math.min(...notches.map((j) => j.k));
      return closest(notches.filter((j) => j.k === k));
    }
  }

  const left = remaining(placed, b);
  if (left.footings.length) {
    if (!b && first && left.footings.some((f) => f.x === first.x && f.z === first.z)) return { type: 'footing', x: first.x, z: first.z };
    const f = closest(left.footings);
    return { type: 'footing', x: f.x, z: f.z };
  }

  if (left.logs.length) {
    const k = Math.min(...left.logs.map((L) => L.k));
    const at = left.logs.filter((L) => L.k === k).map((L) => {
      const [x, z] = nodeXZ(L.axis, L.line, (L.s0 + L.s1) / 2);
      return { type: 'log', kind: L.kind, axis: L.axis, line: L.line, s0: L.s0, s1: L.s1, k: L.k, x, z };
    });
    return closest(at);
  }

  if (left.roofs.length) return closest(left.roofs.map((r) => ({ type: 'roof', ...r, x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 })));

  return { type: 'done' };
}

// What of the plan isn't standing yet: { footings, logs, roofs }, each a
// list of the placed pieces still to go up.
export function remaining(placed, b) {
  if (!b) return { footings: placed.footings, logs: placed.logs, roofs: placed.roofs };
  const fs = [...b.footings.values()];
  return {
    footings: placed.footings.filter((f) => !fs.some((g) => g.x === f.x && g.z === f.z)),
    logs: placed.logs.filter((P) => !b.logs.some((L) => L.axis === P.axis && L.line === P.line && L.s0 === P.s0 && L.s1 === P.s1 && L.k === P.k)),
    roofs: placed.roofs.filter((r) => !b.roofs.some((q) => q.x0 === r.x0 && q.z0 === r.z0 && q.x1 === r.x1 && q.z1 === r.z1)),
  };
}

// How far along it is: { done, total } pieces (footings, logs and roofs).
export function progress(placed, b) {
  const total = placed.footings.length + placed.logs.length + placed.roofs.length;
  const left = remaining(placed, b);
  return { done: total - left.footings.length - left.logs.length - left.roofs.length, total };
}

// Where the top of the walls of a room will be, above the footings: for
// drawing a roof that isn't there yet.
export function eaveOf(placed, room) {
  let top = 0;
  for (const L of placed.logs) {
    const onX = L.axis === 'x' && (L.line === room.z0 || L.line === room.z1) && L.s1 > room.x0 && L.s0 < room.x1;
    const onZ = L.axis === 'z' && (L.line === room.x0 || L.line === room.x1) && L.s1 > room.z0 && L.s0 < room.z1;
    if (onX || onZ) top = Math.max(top, L.k * HALF + height(L.kind));
  }
  return top;
}

// ── Getting about the site ──────────────────────────────────────────────────
// Rectangles are { x0, z0, x1, z1 }; grow() pushes each side out by m.
export const grow = (r, m) => ({ x0: r.x0 - m, z0: r.z0 - m, x1: r.x1 + m, z1: r.z1 + m });
export const inside = (p, r) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1;

// Where to stand to work on the spot (x, z): outside the footprint grown by
// `margin`, as close to the work as can be, and of two equally close places
// the one nearer `from`.
export function standAt(x, z, rect, margin, from) {
  const R = grow(rect, margin);
  if (!inside({ x, z }, R)) return { x, z };
  const spots = [
    { x: R.x0, z },
    { x: R.x1, z },
    { x, z: R.z0 },
    { x, z: R.z1 },
  ].map((s) => ({ ...s, d: Math.hypot(s.x - x, s.z - z), e: Math.hypot(s.x - from.x, s.z - from.z) }));
  const least = Math.min(...spots.map((s) => s.d));
  const best = spots.filter((s) => s.d < least + 0.5).sort((a, b) => a.e - b.e)[0];
  return { x: best.x, z: best.z };
}

// A way from `from` to `to` that keeps out of the rectangle: straight there
// if nothing is in the way, otherwise round its corners, the short way.
// -> waypoints, ending at `to`.
export function route(from, to, rect) {
  if (inside(from, rect) || inside(to, rect) || !crosses(from, to, rect)) return [to];
  const e = 0.05;
  const nodes = [from, { x: rect.x0 - e, z: rect.z0 - e }, { x: rect.x1 + e, z: rect.z0 - e }, { x: rect.x1 + e, z: rect.z1 + e }, { x: rect.x0 - e, z: rect.z1 + e }, to];
  // Dijkstra over six nodes
  const n = nodes.length;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  dist[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity || u === n - 1) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v] || crosses(nodes[u], nodes[v], rect)) continue;
      const d = dist[u] + Math.hypot(nodes[v].x - nodes[u].x, nodes[v].z - nodes[u].z);
      if (d < dist[v]) {
        dist[v] = d;
        prev[v] = u;
      }
    }
  }
  if (prev[n - 1] < 0) return [to];
  const path = [];
  for (let v = n - 1; v > 0; v = prev[v]) path.unshift(nodes[v]);
  return path;
}

// Does the segment a→b pass through the inside of the rectangle?
export function crosses(a, b, r) {
  const e = 1e-6;
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const [p, q] of [
    [-dx, a.x - (r.x0 + e)],
    [dx, r.x1 - e - a.x],
    [-dz, a.z - (r.z0 + e)],
    [dz, r.z1 - e - a.z],
  ]) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 >= t1) return false;
  }
  return t1 - t0 > 1e-9;
}
