// What a race track looks like, made in code like everything else here:
//
//   the racing surface   asphalt or dirt, draped over the land as surfaceOf
//                        lays it, with a bank of earth down to the ground on
//                        either side where it stands up off it
//   kerbs                red and white through the bends, white along the
//                        straights; on a dirt track, a ridge of loose dirt
//   lines                the white edges of an asphalt track, the
//                        chequered start line, a mark for each place on
//                        the grid
//   the barrier          steel armco on posts round a road circuit, a white
//                        wall round a dirt oval
//   the gantry           over the start line, with its five red lights
//   the grandstand       tiers of benches facing the main straight under a
//                        roof with the track's name on it, a crowd in them
//   the pits             a long garage with its bays open to the track, and
//                        an apron of tarmac in front where your car waits
//
// buildTrack(site, surface, ground, materials) -> {
//   object    a Group, placed at the track's frame and turned with it, its
//             geometry made round it (render/origin.js)
//   solids    capsules for the world's Solids: the barrier, the grandstand,
//             the pits, the gantry's legs
//   blockers  boxes the camera can't see through: the pits, the grandstand
//             ({ inv, half }, as core/geom.js rayBox takes them)
//   lamps     the five lights' meshes, left to right, to switch on and off
//   apron     the apron's top (m, in the world)
// }
//   surface   surfaceOf's (site.js); ground(x, z): the land's height
//   materials { outside, glow, lamp: [5 materials] }

import * as THREE from 'three';
import { Kit } from '../videostore/store.js';
import { toWorld } from '../landmarks/sites.js';
import { mulberry32 } from '../noise.js';
import { circuitOf, KERB } from './layouts.js';
import { PADDOCK, BANK, paddockOf } from './site.js';
import { RACE, gridSlot } from './race.js';

const C = (hex) => new THREE.Color(hex);
const COLOUR = {
  asphalt: C(0x3b3c3f),
  dirt: C(0x7d5a3e),
  dirtLoose: C(0x6a4a32),
  kerbRed: C(0xc8302a),
  kerbWhite: C(0xe8e6e0),
  line: C(0xeeeeea),
  bank: C(0x5d6a3a),
  earth: C(0x6b5a40),
  armco: C(0xb4b8bc),
  post: C(0x7a7e82),
  wall: C(0xe4e2dc),
  wallStripe: C(0xc8302a),
  tarmac: C(0x48494c),
  concrete: C(0xaaa69c),
  stand: C(0x8a8c90),
  bench: [C(0x1f6fd1), C(0xe8e6e0)],
  roof: C(0x3c4a5a),
  pits: C(0xd8d4c8),
  bay: C(0x1c1d20),
  trim: C(0xc8302a),
  sign: C(0xf2c230),
  signBack: C(0x202428),
  gantry: C(0x26282c),
  chequer: [C(0x111111), C(0xf2f2f2)],
};
const CROWD = [0xd8402a, 0x2a6ad8, 0xe8c030, 0x2a9a4a, 0xf0f0f0, 0x303038, 0xe07a20, 0x8a3ac8, 0x6ac0e0].map(C);
const SKIN = [0xe8c4a8, 0xc68c6c, 0x8a5a3c, 0xdcae90, 0x6a4430].map(C);

const BEND = 1 / 140; // 1/m: tighter than this is a bend, and its kerbs are striped
const STRIPE = 3; // m each kerb stripe runs
const EDGE_LINE = { in: 0.35, width: 0.22 }; // m in from the edge, and wide
const ARMCO = { low: 0.38, high: 0.74, post: 4 }; // m: the rail's bottom and top, and between posts
const WALL = { high: 0.95, thick: 0.3, stripe: [0.12, 0.3] }; // m: a dirt oval's wall, and its red stripe
const GANTRY = { high: 5.6, beam: 0.7, lamp: 0.42 }; // m: under the beam, how deep it is, each lamp's size
const STAND = { rows: 7, rise: 0.45, deep: 1.25, roof: 3.2, posts: 10 }; // the grandstand's tiers (m)
const PITS = { high: 4.2, bays: 6 }; // m tall, and how many bays
const SEAT_EVERY = 0.75; // m between people on a bench
const UNDER_EVERY = 3; // m between looks at the ground under the paddock's slabs
const APRON_STEP = 2.5; // m the apron's edge may stand over the ground and still be walked up onto
const FULL = 0.62; // share of the seats taken

export function buildTrack(site, surface, ground, materials) {
  const c = circuitOf(site.layout);
  const L = c.layout;
  const pad = paddockOf(c);
  const base = Math.round(site.lo);
  const object = new THREE.Group();
  object.position.set(site.x, base, site.z);
  object.rotation.y = site.yaw;
  const kit = new Kit();
  const glow = new Kit();
  const solids = [];
  const blockers = [];
  const blocker = (x0, y0, z0, x1, y1, z1) => blockers.push({ c: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], h: [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2] });
  const _w = { x: 0, z: 0 };
  // the land under a point of the track's frame, from base
  const g = (u, v) => {
    toWorld(site, u, v, _w);
    return ground(_w.x, _w.z) - base;
  };
  // the surface at sample i, lat to the left of the line, from base
  const sf = (i, lat) => surface.mid[i] + surface.fall[i] * lat - base;
  const solid = (u0, v0, u1, v1, r, bottom, top, extra = null) => {
    const a = toWorld(site, u0, v0);
    const b = toWorld(site, u1, v1);
    solids.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, r, bottom: base + bottom, topA: base + top, topB: base + top, ...extra });
  };
  const quad = (k, a, b, cc, d, color) => {
    // the normal from its corners (a b c d anticlockwise seen from the front)
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = d[0] - a[0];
    const vy = d[1] - a[1];
    const vz = d[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    k.quad(a, b, cc, d, [nx, ny, nz], color);
  };

  // ── The racing surface, its kerbs and its banks ───────────────────────────
  const w = c.half + KERB;
  const n = c.n;
  const P = [];
  for (let i = 0; i < n; i++) P.push(c.at(i * c.step));
  // a point lat to the left of sample i, at height y: [x, y, z]
  const at = (i, lat, y) => [P[i].x + P[i].tz * lat, y, P[i].z - P[i].tx * lat];
  const dirt = L.surface === 'dirt';
  const shade = (col, i, k = 0.05) => col.clone().multiplyScalar(1 - k + ((i * 7919) % 13) / 13 * k * 2);
  // how far each bank runs out past the kerb, either side (m)
  const bankOut = (i, side) => {
    const lat = side * w;
    const p = at(i, lat, 0);
    const drop = sf(i, lat) - g(p[0], p[2]);
    return Math.min(c.barrier - w - 0.3, Math.max(0.5, drop / BANK + 0.4));
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const s = i * c.step;
    const bend = Math.abs(c.k[i]) > BEND || Math.abs(c.k[j]) > BEND;
    // the surface itself
    quad(kit, at(i, -c.half, sf(i, -c.half)), at(j, -c.half, sf(j, -c.half)), at(j, c.half, sf(j, c.half)), at(i, c.half, sf(i, c.half)), shade(dirt ? COLOUR.dirt : COLOUR.asphalt, i));
    for (const side of [1, -1]) {
      // the kerb, a little raised
      const kerb = dirt ? shade(COLOUR.dirtLoose, i + 3) : bend ? (Math.floor(s / STRIPE) % 2 ? COLOUR.kerbRed : COLOUR.kerbWhite) : COLOUR.kerbWhite;
      const up = dirt ? 0.05 : 0.03;
      const a0 = at(i, side * c.half, sf(i, side * c.half));
      const a1 = at(j, side * c.half, sf(j, side * c.half));
      const b0 = at(i, side * w, sf(i, side * w) + up);
      const b1 = at(j, side * w, sf(j, side * w) + up);
      if (side > 0) quad(kit, a0, a1, b1, b0, kerb);
      else quad(kit, b0, b1, a1, a0, kerb);
      // the bank down to the ground
      const o0 = side * (w + bankOut(i, side));
      const o1 = side * (w + bankOut(j, side));
      const e0 = at(i, o0, 0);
      const e1 = at(j, o1, 0);
      e0[1] = g(e0[0], e0[2]) - 0.15;
      e1[1] = g(e1[0], e1[2]) - 0.15;
      const col = shade(COLOUR.bank, i, 0.08);
      if (side > 0) quad(kit, b0, b1, e1, e0, col);
      else quad(kit, e0, e1, b1, b0, col);
    }
    // the white lines along an asphalt track's edges
    if (!dirt) {
      for (const side of [1, -1]) {
        const l0 = side * (c.half - EDGE_LINE.in);
        const l1 = side * (c.half - EDGE_LINE.in - EDGE_LINE.width);
        const q = [at(i, l0, sf(i, l0) + 0.012), at(j, l0, sf(j, l0) + 0.012), at(j, l1, sf(j, l1) + 0.012), at(i, l1, sf(i, l1) + 0.012)];
        if (side > 0) quad(kit, q[3], q[2], q[1], q[0], COLOUR.line);
        else quad(kit, q[0], q[1], q[2], q[3], COLOUR.line);
      }
    }
  }
  // the start line, chequered, across the surface at s = 0
  {
    const sq = 0.6;
    const cols = Math.round((2 * c.half) / sq);
    const p = {};
    for (let row = 0; row < 2; row++) {
      for (let k = 0; k < cols; k++) {
        const s0 = (row - 1) * sq;
        const lat0 = -c.half + k * ((2 * c.half) / cols);
        const lat1 = lat0 + (2 * c.half) / cols;
        const corner = (s, lat) => {
          c.at(s, p, lat);
          const i = Math.round(c.wrap(s) / c.step) % n;
          return [p.x, sf(i, lat) + 0.016, p.z];
        };
        quad(kit, corner(s0, lat0), corner(s0 + sq, lat0), corner(s0 + sq, lat1), corner(s0, lat1), COLOUR.chequer[(row + k) % 2]);
      }
    }
    // a mark across the front of each place on the grid
    for (let slot = 0; slot <= RACE.rivals; slot++) {
      const { run, lat } = gridSlot(slot);
      const s = run + 2.4;
      const corner = (ds, dl) => {
        c.at(s + ds, p, lat + dl);
        const i = Math.round(c.wrap(s + ds) / c.step) % n;
        return [p.x, sf(i, lat + dl) + 0.014, p.z];
      };
      quad(kit, corner(0, -1.1), corner(0.2, -1.1), corner(0.2, 1.1), corner(0, 1.1), COLOUR.line);
    }
  }

  // ── The barrier ───────────────────────────────────────────────────────────
  const every = Math.max(1, Math.round(ARMCO.post / c.step));
  for (const side of [1, -1]) {
    const lat = side * c.barrier;
    for (let i = 0; i < n; i += every) {
      const j = (i + every) % n;
      const p0 = at(i, lat, 0);
      const p1 = at(j, lat, 0);
      const y0 = g(p0[0], p0[2]);
      const y1 = g(p1[0], p1[2]);
      if (dirt) {
        // a white wall, a red stripe along it
        const t = (WALL.thick / 2) * side;
        const in0 = at(i, lat - t, 0);
        const in1 = at(j, lat - t, 0);
        const out0 = at(i, lat + t, 0);
        const out1 = at(j, lat + t, 0);
        // (facing the track, or away from it)
        const face = (a, b, lo, hi, col, toTrack) => {
          const q = [[a[0], y0 + lo, a[2]], [b[0], y1 + lo, b[2]], [b[0], y1 + hi, b[2]], [a[0], y0 + hi, a[2]]];
          if (side > 0 === toTrack) quad(kit, q[0], q[1], q[2], q[3], col);
          else quad(kit, q[1], q[0], q[3], q[2], col);
        };
        face(in0, in1, -0.3, WALL.stripe[0], COLOUR.wall, true);
        face(in0, in1, WALL.stripe[0], WALL.stripe[1], COLOUR.wallStripe, true);
        face(in0, in1, WALL.stripe[1], WALL.high, COLOUR.wall, true);
        face(out0, out1, -0.3, WALL.high, COLOUR.wall, false);
        quad(kit, [in0[0], y0 + WALL.high, in0[2]], [in1[0], y1 + WALL.high, in1[2]], [out1[0], y1 + WALL.high, out1[2]], [out0[0], y0 + WALL.high, out0[2]], COLOUR.wall);
        solid(p0[0], p0[2], p1[0], p1[2], WALL.thick / 2 + 0.05, Math.min(y0, y1) - 0.3, Math.max(y0, y1) + WALL.high);
      } else {
        // a steel rail on posts
        const q = [[p0[0], y0 + ARMCO.low, p0[2]], [p1[0], y1 + ARMCO.low, p1[2]], [p1[0], y1 + ARMCO.high, p1[2]], [p0[0], y0 + ARMCO.high, p0[2]]];
        quad(kit, q[0], q[1], q[2], q[3], COLOUR.armco);
        quad(kit, q[1], q[0], q[3], q[2], COLOUR.armco);
        const o = at(i, lat + side * 0.12, 0);
        kit.box(o[0] - 0.06, y0 - 0.3, o[2] - 0.06, o[0] + 0.06, y0 + ARMCO.high - 0.04, o[2] + 0.06, COLOUR.post);
        solid(p0[0], p0[2], p1[0], p1[2], 0.12, Math.min(y0, y1) - 0.3, Math.max(y0, y1) + ARMCO.high);
      }
    }
  }

  // ── The gantry over the start line ────────────────────────────────────────
  const lamps = [];
  {
    const reach = c.barrier - 1;
    const top = sf(0, 0) + GANTRY.high;
    const legs = [at(0, reach, 0), at(0, -reach, 0)];
    for (const leg of legs) {
      const y = g(leg[0], leg[2]);
      kit.box(leg[0] - 0.22, y - 0.3, leg[2] - 0.22, leg[0] + 0.22, top + GANTRY.beam, leg[2] + 0.22, COLOUR.gantry);
      solid(leg[0], leg[2], leg[0], leg[2], 0.3, y - 0.3, top + GANTRY.beam);
    }
    // the beam across, in the track's frame turned to lie across the line
    const beam = new Kit();
    beam.box(-0.35, 0, -reach, 0.35, GANTRY.beam, reach, COLOUR.gantry);
    // the chequered banner along its front (facing the grid, -x here)
    const sq = GANTRY.beam / 2;
    for (let k = 0; k < Math.floor((2 * reach) / sq); k++) {
      for (let row = 0; row < 2; row++) {
        const z0 = -reach + k * sq;
        beam.quad([-0.36, row * sq, z0 + sq], [-0.36, row * sq, z0], [-0.36, (row + 1) * sq, z0], [-0.36, (row + 1) * sq, z0 + sq], [-1, 0, 0], COLOUR.chequer[(row + k) % 2]);
      }
    }
    // the lights' housings, hanging under it
    const span = (RACE.lights - 1) * 0.9;
    for (let k = 0; k < RACE.lights; k++) {
      const z = -span / 2 + k * 0.9;
      beam.box(-0.3, -0.75, z - 0.3, 0.3, 0, z + 0.3, COLOUR.gantry);
    }
    const mesh = new THREE.Mesh(beam.build(), materials.outside);
    const yaw = Math.atan2(P[0].tx, P[0].tz); // the way the cars go, along the line
    mesh.position.set(P[0].x, top, P[0].z);
    mesh.rotation.y = yaw - Math.PI / 2;
    mesh.castShadow = true;
    object.add(mesh);
    for (let k = 0; k < RACE.lights; k++) {
      // left to right, as you see them from the grid (+z here is to your right)
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(GANTRY.lamp / 2, 16), materials.lamp[k]);
      lamp.position.set(-0.31, -0.38, -span / 2 + k * 0.9);
      lamp.rotation.y = -Math.PI / 2;
      mesh.add(lamp);
      lamps.push(lamp);
    }
  }

  // ── The paddock ───────────────────────────────────────────────────────────
  const sx = L.start;
  const zb = pad.zb;
  // the highest and lowest ground under a rectangle of the track's frame,
  // looked at every few metres
  const under = ([x0, z0, x1, z1]) => {
    let hi = -Infinity;
    let lo = Infinity;
    const nx = Math.ceil((x1 - x0) / UNDER_EVERY);
    const nz = Math.ceil((z1 - z0) / UNDER_EVERY);
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const h = g(x0 + ((x1 - x0) * i) / nx, z0 + ((z1 - z0) * j) / nz);
        hi = Math.max(hi, h);
        lo = Math.min(lo, h);
      }
    }
    return { hi, lo };
  };
  const rect = ([a, b, cc, d]) => [sx + a, zb + b, sx + cc, zb + d];
  // a slab on the ground: its top over the highest corner, its sides down
  // into the lowest
  const slab = (r, color, up = 0.12) => {
    const { hi, lo } = under(r);
    const [x0, z0, x1, z1] = r;
    kit.box(x0, lo - 0.3, z0, x1, hi + up, z1, color, 'y-');
    return hi + up;
  };
  // a rectangle as capsules along its long side
  const rectSolid = ([x0, z0, x1, z1], bottom, top, extra = null) => {
    const alongX = x1 - x0 >= z1 - z0;
    const short = alongX ? z1 - z0 : x1 - x0;
    const k = Math.max(1, Math.round(short / 1.2));
    const r = short / k / 2;
    for (let i = 0; i < k; i++) {
      const m = (alongX ? z0 : x0) + r * (2 * i + 1);
      if (alongX) solid(x0 + r, m, Math.max(x0 + r, x1 - r), m, r + 0.02, bottom, top, extra);
      else solid(m, z0 + r, m, Math.max(z0 + r, z1 - r), r + 0.02, bottom, top, extra);
    }
  };

  // the apron, where your car waits: walked up onto from anywhere round it
  const apron = slab(rect(PADDOCK.apron), COLOUR.tarmac);
  rectSolid(rect(PADDOCK.apron), under(rect(PADDOCK.apron)).lo - 0.3, apron, { step: APRON_STEP, surface: 'tarmac' });

  // the pits: a long garage, its bays open to the track
  {
    const r = rect(PADDOCK.pits);
    const [x0, z0, x1, z1] = r;
    const floor = slab(r, COLOUR.concrete, 0.15);
    const top = floor + PITS.high;
    kit.box(x0, floor, z0 + 0.6, x1, top, z1, COLOUR.pits, 'y-');
    kit.box(x0 - 0.3, top, z0 - 0.4, x1 + 0.3, top + 0.35, z1 + 0.3, COLOUR.roof);
    kit.box(x0 - 0.3, top - 0.25, z0 - 0.42, x1 + 0.3, top, z0 - 0.38, COLOUR.trim);
    const bay = (x1 - x0) / PITS.bays;
    for (let k = 0; k < PITS.bays; k++) {
      const bx = x0 + bay * k;
      kit.quad([bx + bay - 0.8, floor + 0.02, z0 + 0.58], [bx + 0.8, floor + 0.02, z0 + 0.58], [bx + 0.8, floor + 3.1, z0 + 0.58], [bx + bay - 0.8, floor + 3.1, z0 + 0.58], [0, 0, -1], COLOUR.bay);
      kit.words(String(k + 1), bx + bay / 2, floor + 3.55, z0 + 0.57, 0, -1, 0.07, COLOUR.signBack, { small: true });
    }
    kit.words('PITS', x0 + 6, top + 0.9, z0 - 0.45, 0, -1, 0.11, COLOUR.sign);
    rectSolid([x0, z0 + 0.6, x1, z1], floor - 0.3, top + 0.35);
    blocker(x0, floor - 0.3, z0 + 0.6, x1, top + 0.35, z1);
  }

  // the grandstand: tiers of benches up away from the track, a roof over
  {
    const r = rect(PADDOCK.stand);
    const [x0, z0, x1, z1] = r;
    const { hi, lo } = under(r);
    const floor = hi + 0.1;
    const rnd = mulberry32((Math.round(site.x) * 73856093) ^ (Math.round(site.z) * 19349663));
    const crowd = new Kit();
    for (let row = 0; row < STAND.rows; row++) {
      const fz = z0 + row * STAND.deep;
      const y = floor + (row + 1) * STAND.rise;
      kit.box(x0, lo - 0.3, fz, x1, y, z1, COLOUR.stand, 'y-');
      // the bench along it
      kit.box(x0 + 0.2, y, fz + 0.35, x1 - 0.2, y + 0.42, fz + 0.75, COLOUR.bench[row % 2]);
      // ...and who's sat on it
      for (let x = x0 + 0.6; x < x1 - 0.5; x += SEAT_EVERY) {
        if (rnd() > FULL) continue;
        const body = CROWD[Math.floor(rnd() * CROWD.length)];
        const skin = SKIN[Math.floor(rnd() * SKIN.length)];
        const bx = x + (rnd() - 0.5) * 0.15;
        crowd.box(bx - 0.2, y + 0.42, fz + 0.45, bx + 0.2, y + 1.0, fz + 0.75, body);
        crowd.box(bx - 0.11, y + 1.02, fz + 0.48, bx + 0.11, y + 1.26, fz + 0.7, skin);
      }
    }
    const back = floor + (STAND.rows + 1) * STAND.rise;
    kit.box(x0, back - 0.1, z1 - 0.3, x1, back + STAND.roof, z1, COLOUR.stand);
    // the roof, on posts at the front
    const roof = back + STAND.roof;
    kit.box(x0 - 0.5, roof, z0 - 1.2, x1 + 0.5, roof + 0.3, z1, COLOUR.roof);
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / Math.round((x1 - x0) / STAND.posts)) {
      kit.box(x - 0.12, floor, z0 - 0.9, x + 0.12, roof, z0 - 0.66, COLOUR.post);
      solid(x, z0 - 0.78, x, z0 - 0.78, 0.2, floor - 0.3, roof);
    }
    // the track's name along the front of the roof
    const name = site.name.toUpperCase();
    const px = Math.min(0.16, (x1 - x0 - 2) / (name.length * 6));
    kit.box(x0 + 1, roof + 0.3, z0 - 1.25, x1 - 1, roof + 0.3 + px * 11, z0 - 1.1, COLOUR.signBack);
    kit.words(name, (x0 + x1) / 2, roof + 0.3 + px * 5.5, z0 - 1.27, 0, -1, px, COLOUR.sign);
    rectSolid([x0, z0, x1, z1], lo - 0.3, back);
    blocker(x0, lo - 0.3, z0 + STAND.deep, x1, back + STAND.roof, z1);
    object.add(meshOf(crowd, materials.outside));
  }

  object.add(meshOf(kit, materials.outside));
  if (!glow.empty) object.add(meshOf(glow, materials.glow, false));
  object.updateMatrixWorld(true);
  const blocks = blockers.map(({ c: m, h }) => {
    const local = new THREE.Matrix4().makeTranslation(m[0], m[1], m[2]);
    return { inv: object.matrixWorld.clone().multiply(local).invert(), half: h };
  });
  return { object, solids, blockers: blocks, lamps, apron: base + apron, base };
}

function meshOf(kit, material, shadow = true) {
  const mesh = new THREE.Mesh(kit.build(), material);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

// The track on the map: its surface as a ring of quads round the lap (in
// the world), drawn at every zoom like a town's street; and close up, the
// grandstand and the pits.
export function mapShapes(site) {
  const c = circuitOf(site.layout);
  const pad = paddockOf(c);
  const w = c.half + KERB;
  const p = {};
  const q = {};
  const step = 8;
  const ground = [];
  const W = (u, v) => {
    const o = toWorld(site, u, v);
    return [o.x, o.z];
  };
  for (let s = 0; s < c.length; s += step) {
    c.at(s, p);
    c.at(Math.min(s + step + 0.5, c.length + 0.5), q);
    ground.push([W(p.x + p.tz * w, p.z - p.tx * w), W(q.x + q.tz * w, q.z - q.tx * w), W(q.x - q.tz * w, q.z + q.tx * w), W(p.x - p.tz * w, p.z + p.tx * w)]);
  }
  const L0 = (x) => c.layout.start + x;
  const box = ([a, b, cc, d]) => {
    const r = [L0(a), pad.zb + b, L0(cc), pad.zb + d];
    return [W(r[0], r[1]), W(r[2], r[1]), W(r[2], r[3]), W(r[0], r[3])];
  };
  return { ground, shape: [box(PADDOCK.stand), box(PADDOCK.pits)] };
}
