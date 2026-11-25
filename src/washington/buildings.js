// Washington's buildings, as big as they are and with the roofs the city's
// lidar survey traced for them (codec.js has them as a tile keeps them):
// each roof face laid as it was surveyed, every corner at its real height;
// the walls dropped from the edges of the roof to the ground, and the steps
// between a roof and a lower one beside it; and the walls of anything taller
// than a shed drawn as a front, its windows in rows storey over storey
// (build/surfaces.js, `facade`), lit here and there at night.
//
// What each is made of: by its name, for the landmarks (LOOKS); else by how
// tall and how big it is, as a row house, an office of stone, or a newer one
// banded in glass, in the colours Washington's are, picked by the building.
//
// buildBuildings(buildings, { ground, offset, names }) is a generator (a
// step every few dozen buildings) that returns { roofs, walls: Batch each,
// solids, obstacles, outlines }:
//   ground(x, z)  the height of the ground (tile metres; game heights)
//   offset        added to every height the tile keeps (the land's)
//   names         Map(building index → name), for LOOKS
// solids are the walls that stand on the ground, for world/solids.js (in
// tile metres: the caller moves them; each says it's a `wall`, for the
// camera to stay out of); obstacles, a disc round each building
// for a builder's tools; outlines, each roof face's outer ring in plan, for
// what's under a roof.

import * as THREE from 'three';
import { Batch } from './batch.js';
import { buildCapitol } from './capitol.js';
import { buildCathedral } from './cathedral.js';
import { buildFront, frontage, streetStyle } from './facades.js';
import { SURF, FACADE } from '../build/surfaces.js';

// What a landmark is made of: its walls, its roof, its kind of front.
const MARBLE = 0xe8e4da;
const LIMESTONE = 0xd2c8b4;
const SANDSTONE = 0xc8b49a;
const RED_SANDSTONE = 0x8a4a3a;
const GRANITE = 0xa8a49c;
const COPPER = 0x6e9c88;
const LEAD = 0x6a6c6e;
export const LOOKS = {
  'United States Capitol': { wall: MARBLE, roof: MARBLE, front: FACADE.stone },
  'Washington Monument': { wall: MARBLE, roof: MARBLE, front: null },
  'Lincoln Memorial': { wall: MARBLE, roof: MARBLE, front: null },
  'Thomas Jefferson Memorial': { wall: MARBLE, roof: MARBLE, front: null },
  'The White House': { wall: 0xf2f0ea, roof: LEAD, front: FACADE.stone },
  'Treasury Building': { wall: GRANITE, roof: LEAD, front: FACADE.stone },
  'Eisenhower Executive Office Building': { wall: GRANITE, roof: 0x4a5052, front: FACADE.stone },
  'Smithsonian Institution Building': { wall: RED_SANDSTONE, roof: 0x4e4a48, front: FACADE.stone },
  'Supreme Court': { wall: MARBLE, roof: LEAD, front: FACADE.stone },
  'Library of Congress': { wall: GRANITE, roof: COPPER, front: FACADE.stone },
  'National Archives': { wall: LIMESTONE, roof: COPPER, front: FACADE.stone },
  'National Gallery of Art': { wall: 0xd8b8a8, roof: LEAD, front: FACADE.stone },
  'National Museum of African American History and Culture': { wall: 0x8a5a32, roof: 0x5a4030, front: FACADE.glass },
  'Washington National Cathedral': { wall: 0xc7bda9, roof: 0x515256, front: null },
  'Union Station': { wall: 0xdcd6c8, roof: LEAD, front: FACADE.stone },
  'Old Post Office': { wall: 0xb4aa9c, roof: 0x4a4c4e, front: FACADE.stone },
};
// The rest, by kind: a row house's brick (and the odd painted one), an
// office's stone, a newer one's glass and concrete.
const ROW = [0x8a4232, 0x9a4a36, 0x7a3a2c, 0x8e5440, 0x6e3428, 0xa45a42, 0x82503c, 0xcab89a, 0xd8c8a0, 0xb8c4c0, 0xd4b0a0, 0xe0d8c4];
const STONE = [LIMESTONE, SANDSTONE, GRANITE, 0xbcb2a2, 0xa89c8a, 0xc4bcae, 0x9a8a78, 0xb09070];
const GLASS = [0x8a8e90, 0x9c9a94, 0x7c8286, 0xa8a49a, 0x6c7478];
const FLAT_ROOF = [0x4a4846, 0x5a5856, 0x3e3c3a, 0x8c8a86, 0x6a6662];
const PITCHED_ROOF = [0x4c5258, 0x5a4e48, 0x3e4246, 0x6a4038, 0x585a5c];

// A front starts at walls this tall (m) over the ground: lower is a shed's
// or a garage's, plain.
const FRONT_FROM = 4.5;
// A row house is under this tall (m) and this big (m² of roof); an office
// over it is glass this often.
const ROW_UNDER = { tall: 15, big: 450 };
const GLASSY = 0.3;
const SINK = 0.6; // m a wall goes on down below the lowest ground under it
const WALL_R = 0.25; // m, how thick a wall is to bump into
const STEP = 0.3; // m: a smaller step between two faces of a roof is no wall
const Q = 4; // corners within 1/Q m are the same corner, for the walls
const PER_STEP = 40; // buildings built between one step and the next

const hash = (n) => {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const _c = new THREE.Color();

// Survey duplicates cause two walls to fight for the same pixels. Preserve
// the entry with a name so a landmark keeps its authored appearance.
function uniqueBuildings(buildings, names) {
  const groups = new Map();
  const unique = [];
  for (const [k, b] of buildings.entries()) {
    const { pts, faces } = b;
    const key = `${pts.length}:${faces.length}:${pts[0]}:${pts[1]}:${pts.at(-3)}:${pts.at(-2)}`;
    let group = groups.get(key);
    if (!group) groups.set(key, (group = []));
    const match = group.find((i) => {
      const a = buildings[unique[i]];
      return pts.every((p, j) => p === a.pts[j]) && faces.every((f, j) => f.length === a.faces[j].length &&
        f.every((r, l) => r.length === a.faces[j][l].length && r.every((p, m) => p === a.faces[j][l][m])));
    });
    if (match === undefined) {
      group.push(unique.length);
      unique.push(k);
    } else if (names.get(k) && !names.get(unique[match])) unique[match] = k;
  }
  return unique;
}

export function* buildBuildings(buildings, { ground, offset, names = new Map(), seed = 0, detail = true, street = (x, z) => false, cityCorner = [0, 0] }) {
  const roofs = new Batch(detail ? 1 << 14 : 1 << 11);
  const walls = new Batch(detail ? 1 << 15 : 1 << 12);
  const solids = [];
  const obstacles = [];
  const outlines = [];
  let built = 0;
  for (const k of uniqueBuildings(buildings, names)) {
    if (++built % PER_STEP === 0) yield;
    const b = buildings[k];
    const P = b.pts;
    const np = P.length / 3;
    const X = (i) => P[i * 3];
    const Z = (i) => P[i * 3 + 1];
    const Y = (i) => P[i * 3 + 2] + offset;
    // its footprint, how high it stands and how big it is
    let [cx, cz, top] = [0, 0, -Infinity];
    let peak = 0;
    for (let i = 0; i < np; i++) {
      cx += X(i) / np;
      cz += Z(i) / np;
      if (Y(i) > top) {
        top = Y(i);
        peak = i;
      }
    }
    let r = 0;
    for (let i = 0; i < np; i++) r = Math.max(r, Math.hypot(X(i) - cx, Z(i) - cz));
    let roofArea = 0;
    for (const f of b.faces) roofArea += Math.abs(ringArea(f[0], X, Z));
    const foot = ground(cx, cz);
    const tall = top - foot;
    // what it's made of
    const name = names.get(k);
    const h = hash(seed * 7919 + k);
    const look = (name && LOOKS[name]) || lookOf(tall, roofArea, b.roof, h);
    const front = tall > FRONT_FROM ? look.front : null;
    const mode = detail && streetStyle(name, front, cityCorner[0] + cx, cityCorner[1] + cz, tall, roofArea);
    let entrance = null;
    const wallSurf = front === null ? SURF.stone : SURF.facade + front;
    const wallCol = _c.set(look.wall).clone();
    const roofCol = _c.set(look.roof).clone();
    const roofSurf = look.roof === MARBLE ? SURF.concrete : b.roof === 'flat' || b.roof === 'default' ? SURF.asphalt : b.roof === 'dome' ? SURF.steel : SURF.slate;
    const capitol = name === 'United States Capitol' ? { x: X(peak), z: Z(peak), base: top - 43.5, ground, detail } : null;
    const cathedral = name === 'Washington National Cathedral';
    const annex = top - 66.3; // Above this, the modeled Gothic exterior takes over.
    const onDome = (i) => Math.hypot(X(i) - capitol.x, Z(i) - capitol.z) < 30;
    const faces = capitol ? b.faces.filter(([outer]) => !outer.every((i) => Y(i) > capitol.base + 6)) : b.faces;
    // The original roof meets the model's plinth. Mixed roof faces can
    // still have a corner in the surveyed drum, so trim those corners too.
    const roofY = capitol ? (i) => onDome(i) ? Math.min(Y(i), capitol.base) : Y(i) : Y;

    // ── the roof, a face at a time
    if (detail) for (const [outer] of b.faces) outlines.push(outer.map((i) => [X(i), Z(i)]));
    for (const face of faces) {
      if (cathedral && face[0].some((i) => Y(i) > annex)) continue;
      roofFace(roofs, face, X, roofY, Z, roofCol, roofSurf, 0.92 + hash(k * 31 + face.length) * 0.14);
    }
    if (capitol) buildCapitol(roofs, capitol);
    if (cathedral) {
      let [x, z, n] = [0, 0, 0];
      for (let i = 0; i < np; i++) {
        if (Y(i) < top - 0.35) continue;
        x += X(i);
        z += Z(i);
        n++;
      }
      buildCathedral(roofs, { x: x / n, z: z / n, top, ground, detail });
    }

    // ── the walls: each edge only one face has, down to the ground; each
    // edge two faces share at different heights, the step between them
    const edges = new Map();
    for (const face of faces) {
      for (const ring of face) {
        const side = mode ? Math.sign(ringArea(ring, X, Z)) * (ring === face[0] ? 1 : -1) : 0;
        for (let e = 0; e < ring.length; e++) {
          const a = ring[e];
          const c = ring[(e + 1) % ring.length];
          const ka = Math.round(X(a) * Q) * 65536 + Math.round(Z(a) * Q);
          const kc = Math.round(X(c) * Q) * 65536 + Math.round(Z(c) * Q);
          if (ka === kc) continue;
          const key = ka < kc ? `${ka}|${kc}` : `${kc}|${ka}`;
          // (each kept running the same way, so the ends line up)
          const pair = ka < kc ? [a, c, side] : [c, a, -side];
          const list = edges.get(key);
          if (list) list.push(pair);
          else edges.set(key, [pair]);
        }
      }
    }
    for (const list of edges.values()) {
      const [a, c, side] = list[0];
      const [ax, az, bx, bz] = [X(a), Z(a), X(c), Z(c)];
      const len = Math.hypot(bx - ax, bz - az);
      let tops;
      let bottoms;
      if (list.length === 1) {
        tops = [roofY(a), roofY(c)];
        let lo = Math.min(ground(ax, az), ground(bx, bz));
        if (detail) for (let t = 0.25; t < 1; t += 0.25) lo = Math.min(lo, ground(ax + (bx - ax) * t, az + (bz - az) * t));
        bottoms = [lo - SINK, lo - SINK];
        if (detail) solids.push({ ax, az, bx, bz, r: WALL_R, bottom: lo - 1, topA: tops[0], topB: tops[1], wall: true });
      } else {
        tops = [Math.max(...list.map((p) => roofY(p[0]))), Math.max(...list.map((p) => roofY(p[1])))];
        bottoms = [Math.min(...list.map((p) => roofY(p[0]))), Math.min(...list.map((p) => roofY(p[1])))];
        if (tops[0] - bottoms[0] < STEP && tops[1] - bottoms[1] < STEP) continue;
      }
      if (tops[0] <= bottoms[0] && tops[1] <= bottoms[1]) continue;
      if (cathedral && Math.max(...tops) > annex) continue;
      if (mode && side && list.length === 1) {
        const edge = frontage([ax, az], [bx, bz], side, tops, street, mode);
        if (edge && (!entrance || edge.score < entrance.score)) entrance = edge;
      }
      // Fit whole window bays between the corners. Short jogs and roof
      // steps are solid masonry, and the bays align vertically around the building.
      const bay = front === FACADE.row ? 2.4 : front === FACADE.glass ? 1.6 : 2.9;
      const hasWindows = front !== null && len > bay * 0.64 && list.length === 1;
      const u = hasWindows ? Math.max(1, Math.round(len / bay)) * bay : len;
      const tone = !detail && hasWindows ? 0.85 : 1;
      walls.quad([ax, bottoms[0], az], [bx, bottoms[1], bz], [bx, tops[1], bz], [ax, tops[0], az], wallCol.r * tone, wallCol.g * tone, wallCol.b * tone,
        hasWindows ? wallSurf : SURF.stone, [0, bottoms[0] - foot, u, bottoms[1] - foot, u, tops[1] - foot, 0, tops[0] - foot]);
    }
    if (entrance) buildFront(walls, entrance, { mode, ground, foot, wall: wallCol, variant: h, street, solids });
    if (detail) obstacles.push({ x: cx, z: cz, r, what: name || 'a building in Washington' });
  }
  return { roofs, walls, solids, obstacles, outlines };
}

// What a building with no name of its own is made of, by how tall and big
// it is: { wall, roof, front }.
function lookOf(tall, area, roof, h) {
  const pick = (list, v) => list[Math.floor(v * list.length) % list.length];
  const pitched = roof !== 'flat' && roof !== 'default';
  const roofCol = pitched ? pick(PITCHED_ROOF, h * 13.1 % 1) : pick(FLAT_ROOF, h * 17.3 % 1);
  if (tall < ROW_UNDER.tall && area < ROW_UNDER.big) return { wall: pick(ROW, h), roof: roofCol, front: FACADE.row };
  if (h < GLASSY && tall >= ROW_UNDER.tall) return { wall: pick(GLASS, h * 7.7 % 1), roof: roofCol, front: FACADE.glass };
  return { wall: pick(STONE, h * 5.3 % 1), roof: roofCol, front: FACADE.stone };
}

// Twice the signed area of a ring of indices, in plan.
function ringArea(ring, X, Z) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += X(ring[j]) * Z(ring[i]) - X(ring[i]) * Z(ring[j]);
  return a / 2;
}

// One face of a roof, [outer, ...holes] (indices), cut into triangles that
// face up, its grain running along the roof's fall (so a pitched one's
// slates run in courses along the eaves).
function roofFace(batch, face, X, Y, Z, col, surf, tone) {
  const [outer, ...holes] = face;
  let tris;
  if (!holes.length && outer.length === 3) tris = [[0, 1, 2]];
  else {
    const contour = outer.map((i) => new THREE.Vector2(X(i), Z(i)));
    const hs = holes.map((r) => r.map((i) => new THREE.Vector2(X(i), Z(i))));
    try {
      tris = THREE.ShapeUtils.triangulateShape(contour, hs);
    } catch {
      return;
    }
  }
  const all = holes.length ? [...outer, ...holes.flat()] : outer;
  // the face's plane: its normal from its first good triangle
  let n = null;
  for (const [a, b, c] of tris) {
    const [i, j, k] = [all[a], all[b], all[c]];
    const e = [X(j) - X(i), Y(j) - Y(i), Z(j) - Z(i)];
    const f = [X(k) - X(i), Y(k) - Y(i), Z(k) - Z(i)];
    const m = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]];
    const l = Math.hypot(...m);
    if (l > 1e-6) {
      n = m.map((v) => v / l);
      if (n[1] < 0) n = n.map((v) => -v);
      break;
    }
  }
  if (!n) return;
  // its fall, in plan: courses run across it
  const fl = Math.hypot(n[0], n[2]);
  const [gx, gz] = fl > 0.05 ? [n[0] / fl, n[2] / fl] : [1, 0];
  const [r, g, b] = [col.r * tone, col.g * tone, col.b * tone];
  for (const [a, bb, c] of tris) {
    const ids = [all[a], all[bb], all[c]];
    // (wound so it faces up)
    const [i, j, k] = ids;
    const e = [X(j) - X(i), Y(j) - Y(i), Z(j) - Z(i)];
    const f = [X(k) - X(i), Y(k) - Y(i), Z(k) - Z(i)];
    const up = e[2] * f[0] - e[0] * f[2];
    const order = up >= 0 ? ids : [i, k, j];
    const v0 = batch.n;
    for (const p of order) batch.vertex(X(p), Y(p), Z(p), n[0], n[1], n[2], r, g, b, surf, X(p) * -gz + Z(p) * gx, X(p) * gx + Z(p) * gz);
    batch.tri(v0, v0 + 1, v0 + 2);
  }
}
