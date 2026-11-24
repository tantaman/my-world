// The zoo's buildings, as big as they are and with the roofs they really
// have (site.js has them moved onto the real place; tools/zoo/plan.js says
// where they come from). Each roof face is laid as it was surveyed, every
// corner at its real height; the walls come down from its edges to the
// ground, with a row of windows along any long enough to have them; and
// what each is made of is by its name (LOOKS), or else a brick or a render
// of the neighbourhood's, by the building.
//
// buildBuildings(site, ground, out) fills out with { roofs, walls, glass,
// mesh: Mesher each, solids, obstacles }, a few buildings at a time (it's a
// generator: each step is a few milliseconds of it): mesh is the open steel
// net of an aviary (the Great Flight Exhibit's dome); solids, the walls, for
// world/solids.js; obstacles, discs a builder's tool goes round.

import * as THREE from 'three';
import { Mesher } from '../build/geometry.js';
import { SURF, UPRIGHT } from '../build/surfaces.js';
import { inside, area } from '../core/rings.js';

// What a building is made of, by its name: its walls, its roof (null: as the
// survey says, flat or pitched) and how much of its walls are glass.
//   wall, roof: [colour, surface]; glazed: 0..1 of a wall's height in windows
const BRICK = [0x8a4a36, SURF.stone];
const STONE = [0xb8a888, SURF.stone];
const RENDER = [0xcdc3ad, SURF.clay];
const CONCRETE = [0x9c968c, SURF.clay];
const TIMBER = [0x7a5a3a, SURF.wood];
const FLAT = [0x4a4846, SURF.clay];
const TILE = [0x9a4a30, SURF.shingle];
const SLATE = [0x4c5258, SURF.slate];
const COPPER = [0x5f8a78, SURF.tin];
const GLASS = [0x8ea4ae, SURF.glass];
export const LOOKS = {
  'Reptile Discovery Center': { wall: [0xc09a6c, SURF.stone], roof: TILE },
  'Small Mammal House': { wall: BRICK, roof: SLATE },
  'Bird House': { wall: BRICK, roof: SLATE },
  'Great Ape House': { wall: [0x8c6a52, SURF.stone] },
  'Elephant Community Center': { wall: [0x9a7a5c, SURF.stone], roof: COPPER, glazed: 0.35 },
  'Think Tank': { wall: [0x7a6a5c, SURF.clay], glazed: 0.5 },
  Amazonia: { wall: CONCRETE, roof: GLASS, glazed: 0.6 },
  'Panda House': { wall: [0xa48e74, SURF.clay] },
  'Sloth Bear Viewing': { wall: TIMBER },
  'Conservation Pavilion': { wall: TIMBER, roof: TIN() },
  'National Zoo Visitor Center and Offices': { wall: BRICK, glazed: 0.3 },
  'Mane Grill': { wall: RENDER, glazed: 0.4 },
  'Zoo Market & Cafe': { wall: RENDER, glazed: 0.4 },
  "Ben & Jerry's": { wall: [0xd8d0b8, SURF.paint], glazed: 0.3 },
  'Great Flight Exhibit': { aviary: true },
};
function TIN() {
  return [0x6a6e70, SURF.tin];
}
// The neighbourhood's own, for a building without a name of its own:
// picked by the building.
const WALLS = [BRICK, [0x9a5a40, SURF.stone], [0x7a3e30, SURF.stone], STONE, RENDER, CONCRETE, [0xa88e70, SURF.stone]];

// Windows: how wide each is and how far apart, how high the sill and the
// head over the bottom of the wall, and how long and tall a wall must be to
// have them (m).
const WIN = { w: 1.3, gap: 3.2, sill: 1.0, head: 2.6, wall: 3, tall: 3.2 };
const WALL_R = 0.25; // m, how thick a wall is to bump into
const SINK = 0.6; // m a wall goes on down below the lowest ground under it
const _c = new THREE.Color();

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const PER_STEP = 12; // buildings built between one step and the next
export function* buildBuildings(site, ground, out = {}) {
  const roofs = new Mesher();
  const walls = new Mesher();
  const glass = new Mesher();
  const mesh = new Mesher();
  const solids = [];
  const obstacles = [];
  Object.assign(out, { roofs, walls, glass, mesh, solids, obstacles });
  for (const [k, b] of site.buildings.entries()) {
    if (k % PER_STEP === PER_STEP - 1) yield;
    const look = LOOKS[b.name] || {};
    const pitched = b.roof !== 'flat' && b.roof !== 'default';
    const wall = look.wall || WALLS[hash(`${b.name}:${k}`) % WALLS.length];
    const roof = look.roof || (pitched ? SLATE : FLAT);
    const aviary = !!look.aviary;
    // A building only OpenStreetMap has stands on the ground under it.
    let lift = 0;
    if (b.h) {
      let lo = Infinity;
      for (const [x, z] of b.faces[0][0]) lo = Math.min(lo, ground(x, z));
      lift = lo + b.h - site.offset;
    }
    // ── its roof, a face at a time
    const target = aviary ? mesh : roofs;
    const roofCol = _c.set(roof[0]).clone();
    for (const face of b.faces) {
      const [outer, ...holes] = face.map((r) => (b.h ? r.map(([x, z, y]) => [x, z, y + lift]) : r));
      const ccw = area(outer) > 0;
      const contour = outer.map(([x, z]) => new THREE.Vector2(x, z));
      const hole = holes.map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)));
      const all = [...outer, ...holes.flat()];
      let tris;
      try {
        tris = THREE.ShapeUtils.triangulateShape(contour, hole);
      } catch {
        tris = [];
      }
      const pts = [];
      for (const [a, c, d] of tris) {
        // (wound so each faces up)
        const order = ccw ? [a, d, c] : [a, c, d];
        for (const i of order) pts.push(new THREE.Vector3(all[i][0], all[i][2], all[i][1]));
      }
      const tone = 0.92 + ((hash(`${k}:${pts.length}`) % 100) / 100) * 0.12;
      target.tris(pts, () => _c.copy(roofCol).multiplyScalar(tone), aviary ? SURF.iron : roof[1]);
      // and its underside, seen from beneath an open roof
      if (b.open) {
        const under = [];
        for (let i = 0; i < pts.length; i += 3) under.push(pts[i], pts[i + 2], pts[i + 1]);
        target.tris(
          under.map((p) => p.clone().setY(p.y - 0.15)),
          () => _c.set(0x6a625a),
          SURF.wood,
        );
      }
    }
    // ── its walls
    const wallCol = new THREE.Color(wall[0]);
    for (const [ax, az, at, bx, bz, bt, ab, bb] of b.walls) {
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.05) continue;
      const tops = b.h ? [at + lift, bt + lift] : [at, bt];
      let bottoms;
      if (ab === null) {
        let lo = Math.min(ground(ax, az), ground(bx, bz), ground((ax + bx) / 2, (az + bz) / 2));
        for (let t = 0.25; t < 1; t += 0.25) lo = Math.min(lo, ground(ax + (bx - ax) * t, az + (bz - az) * t));
        bottoms = [lo - SINK, lo - SINK];
      } else bottoms = b.h ? [ab + lift, bb + lift] : [ab, bb];
      if (tops[0] <= bottoms[0] && tops[1] <= bottoms[1]) continue;
      const quad = [new THREE.Vector3(ax, bottoms[0], az), new THREE.Vector3(bx, bottoms[1], bz), new THREE.Vector3(bx, tops[1], bz), new THREE.Vector3(ax, tops[0], az)];
      const into = aviary ? mesh : walls;
      into.tris([quad[0], quad[1], quad[2], quad[0], quad[2], quad[3]], (p) => _c.copy(wallCol).multiplyScalar(p.y < Math.min(...tops) - 0.4 ? 1 : 0.86), aviary ? SURF.iron | UPRIGHT : wall[1] | UPRIGHT);
      if (!aviary && ab === null) {
        solids.push({ ax, az, bx, bz, r: WALL_R, bottom: bottoms[0] - 1, topA: tops[0], topB: tops[1] });
        windows(glass, site, b, [ax, az, bx, bz], tops, look.glazed, ground);
      }
    }
    // a disc round it, for the builder's tools to go round
    let [cx, cz, n] = [0, 0, 0];
    let r = 0;
    for (const f of b.faces)
      for (const [x, z] of f[0]) {
        cx += x;
        cz += z;
        n++;
      }
    cx /= n || 1;
    cz /= n || 1;
    for (const f of b.faces) for (const [x, z] of f[0]) r = Math.max(r, Math.hypot(x - cx, z - cz));
    obstacles.push({ x: cx, z: cz, r, what: b.name || 'a building at the zoo' });
  }
  return out;
}

// Windows along a wall: dark glass set into it on its outside, a row of them
// (or, `glazed`, a band of glass that much of its height), if it's long and
// tall enough.
function windows(glass, site, b, [ax, az, bx, bz], tops, glazed, ground) {
  const len = Math.hypot(bx - ax, bz - az);
  const lo = Math.min(...tops);
  const ux = (bx - ax) / len;
  const uz = (bz - az) / len;
  // which side is out: off its middle, not under its own roof
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;
  const underRoof = (x, z) => b.faces.some((f) => inside(f[0], x, z));
  let [nx, nz] = [uz, -ux];
  if (underRoof(mx + nx * 0.4, mz + nz * 0.4)) [nx, nz] = [-nx, -nz];
  if (underRoof(mx + nx * 0.4, mz + nz * 0.4)) return;
  const out = 0.04; // m proud of the wall
  const col = _c.set(0x2c3a42).clone();
  if (glazed) {
    // a band, the length of the wall
    const g0 = Math.max(ground(ax, az), ground(bx, bz));
    const y0 = g0 + 0.5;
    const y1 = Math.min(lo - 0.3, y0 + (lo - g0) * glazed + 1.5);
    if (y1 - y0 < 1 || len < 1.5) return;
    const p = (t, y) => new THREE.Vector3(ax + ux * t + nx * out, y, az + uz * t + nz * out);
    const q = [p(0.3, y0), p(len - 0.3, y0), p(len - 0.3, y1), p(0.3, y1)];
    glass.tris([q[0], q[1], q[2], q[0], q[2], q[3]], () => col, SURF.glass | UPRIGHT);
    return;
  }
  if (len < WIN.wall) return;
  const n = Math.floor((len - WIN.gap * 0.5) / WIN.gap);
  for (let i = 0; i < n; i++) {
    const t = (len - n * WIN.gap) / 2 + (i + 0.5) * WIN.gap;
    const x = ax + ux * t;
    const z = az + uz * t;
    const g = ground(x, z);
    // (only on a wall that stands tall enough over the ground there)
    if (lo - g < WIN.tall) continue;
    // a storey's row, and another above for each storey more
    for (let s = 0; g + WIN.head + s * 3.4 < lo - 0.4; s++) {
      const y0 = g + WIN.sill + s * 3.4;
      const y1 = g + WIN.head + s * 3.4;
      const p = (dt, y) => new THREE.Vector3(x + ux * dt + nx * out, y, z + uz * dt + nz * out);
      const q = [p(-WIN.w / 2, y0), p(WIN.w / 2, y0), p(WIN.w / 2, y1), p(-WIN.w / 2, y1)];
      glass.tris([q[0], q[1], q[2], q[0], q[2], q[3]], () => col, SURF.glass | UPRIGHT);
    }
  }
}
