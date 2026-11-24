// What keeps the animals in and the people out, and what tells you who's
// there: the walls and fences the map draws, as they're drawn; a fence round
// each pen, of the kind its animals want (species.js: a tall wire mesh for
// the big cats, a timber rail at the Kids' Farm), wherever its edge isn't on
// a path, under a roof, in the water (Lion/Tiger Hill has its moat) or
// along a wall or fence the map already has (one fence, not two side by
// side), and none at all round a yard the map has fenced in already (the
// goats'); and at each exhibit, a sign by the path with its name on it.
//
// buildFences(site, ground, out) fills out with { walls, posts, net: Mesher
// each, solids } (net is the wire mesh, drawn see-through), a little at a
// time (a generator, as buildings.js's is).

import * as THREE from 'three';
import { Mesher } from '../build/geometry.js';
import { SURF, UPRIGHT } from '../build/surfaces.js';
import { layout } from '../build/font.js';
import { USE } from './site.js';
import { inside } from './shapes.js';

// Each kind of fence: how high (m), what it's made of, how far apart its
// posts are, and whether it's a mesh you see through.
export const FENCES = {
  mesh: { h: 2.4, post: 2.5, col: 0x2e3a32, net: true },
  tall: { h: 3.6, post: 2.5, col: 0x2e3a32, net: true },
  rail: { h: 1.15, post: 2.2, col: 0x7a5a38, rails: 3 },
  wall: { h: 1.2, col: 0x9a9284, solid: SURF.stone },
  glass: { h: 1.6, post: 2, col: 0x3a403c, glass: true },
};
// The map's own, by its barrier tag.
const MAPPED = { wall: 'wall', retaining_wall: 'wall', city_wall: 'wall', fence: 'mesh', hedge: 'wall', guard_rail: 'rail', handrail: 'rail' };
const PIECE = 2; // m: a pen's edge is looked at this much at a time
// A piece of a pen's edge with a wall or fence of the map's running along it
// nearer than this (m), and as near parallel as this (the cosine of the
// angle between them), has that for its fence. (Not one that only crosses
// it: that's a wall across the pen.)
const ALONGSIDE = 3;
const PARALLEL = 0.8;
const WALL_T = 0.3; // m thick
const _c = new THREE.Color();
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function* buildFences(site, ground, out = {}) {
  const walls = new Mesher();
  const posts = new Mesher();
  const net = new Mesher();
  const solids = [];
  Object.assign(out, { walls, posts, net, solids });
  // the map's
  for (const b of site.barriers) {
    const kind = { ...FENCES[MAPPED[b.kind] || 'mesh'], h: b.h };
    for (let k = 0; k + 3 < b.pts.length; k += 2) run(out, kind, b.pts[k], b.pts[k + 1], b.pts[k + 2], b.pts[k + 3], ground, b.kind === 'hedge' ? 0x3e5a2c : null);
  }
  yield;
  // round each pen
  for (const e of site.exhibits) {
    if (!e.pen || !e.kind || e.kind.fence === null || e.shared || e.walled) continue;
    yield;
    const kind = FENCES[e.kind.fence || 'mesh'];
    const P = e.pen;
    for (let i = 0; i < P.length; i++) {
      const [ax, az] = P[i];
      const [bx, bz] = P[(i + 1) % P.length];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(len / PIECE));
      // the pieces of it that are wanted, joined up where they run on
      let from = null;
      for (let j = 0; j <= n; j++) {
        const t0 = j / n;
        const t1 = (j + 1) / n;
        const mx = ax + (bx - ax) * ((t0 + t1) / 2);
        const mz = az + (bz - az) * ((t0 + t1) / 2);
        const wanted = j < n && !(site.use(mx, mz) & (USE.path | USE.building | USE.fence | USE.plaza)) && !site.wet(mx, mz) && !alongside(site, mx, mz, bx - ax, bz - az);
        if (wanted && from === null) from = t0;
        if (!wanted && from !== null) {
          run(out, kind, ax + (bx - ax) * from, az + (bz - az) * from, ax + (bx - ax) * t0, az + (bz - az) * t0, ground);
          from = null;
        }
      }
    }
  }
  return out;
}

// Whether one of the map's walls or fences runs along beside (x, z), going
// the way (dx, dz) goes.
function alongside(site, x, z, dx, dz) {
  if (!site.near(x, z, ALONGSIDE, USE.fence)) return false;
  const l = Math.hypot(dx, dz) || 1;
  for (const b of site.barriers) {
    const P = b.pts;
    for (let k = 0; k + 3 < P.length; k += 2) {
      const [ax, az, bx, bz] = [P[k], P[k + 1], P[k + 2], P[k + 3]];
      const ux = bx - ax;
      const uz = bz - az;
      const ul = Math.hypot(ux, uz);
      if (ul < 1e-3) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * ux + (z - az) * uz) / (ul * ul)));
      if (Math.hypot(ax + ux * t - x, az + uz * t - z) > ALONGSIDE) continue;
      if (Math.abs(ux * dx + uz * dz) / (ul * l) >= PARALLEL) return true;
    }
  }
  return false;
}

// A stretch of fence or wall from a to b, standing on the ground.
function run(out, kind, ax, az, bx, bz, ground, colour = null) {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.2) return;
  const ux = (bx - ax) / len;
  const uz = (bz - az) / len;
  const col = new THREE.Color(colour ?? kind.col);
  const n = Math.max(1, Math.ceil(len / (kind.post || 2)));
  const ys = [];
  for (let i = 0; i <= n; i++) ys.push(ground(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n));
  const at = (i) => [ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n];
  if (kind.solid) {
    // a wall: both faces and its top, down into the ground
    const [nx, nz] = [-uz * WALL_T * 0.5, ux * WALL_T * 0.5];
    const tri = [];
    for (let i = 0; i < n; i++) {
      const [x0, z0] = at(i);
      const [x1, z1] = at(i + 1);
      const [b0, b1] = [ys[i] - 0.4, ys[i + 1] - 0.4];
      const [t0, t1] = [ys[i] + kind.h, ys[i + 1] + kind.h];
      for (const s of [1, -1]) {
        const a = V(x0 + nx * s, b0, z0 + nz * s);
        const b = V(x1 + nx * s, b1, z1 + nz * s);
        const c = V(x1 + nx * s, t1, z1 + nz * s);
        const d = V(x0 + nx * s, t0, z0 + nz * s);
        tri.push(a, b, c, a, c, d);
      }
      tri.push(V(x0 + nx, t0, z0 + nz), V(x1 + nx, t1, z1 + nz), V(x1 - nx, t1, z1 - nz), V(x0 + nx, t0, z0 + nz), V(x1 - nx, t1, z1 - nz), V(x0 - nx, t0, z0 - nz));
    }
    out.walls.tris(tri, (p) => _c.copy(col).multiplyScalar(0.92 + 0.08 * Math.sin(p.x * 1.3 + p.z * 0.7)), kind.solid | UPRIGHT);
  } else {
    // posts, and between them a mesh, glass or rails
    for (let i = 0; i <= n; i++) {
      const [x, z] = at(i);
      const g = new THREE.CylinderGeometry(0.045, 0.05, kind.h + 0.4, 5);
      out.posts.add(g, new THREE.Matrix4().setPosition(x, ys[i] + (kind.h - 0.4) / 2, z), () => col, null, kind.rails ? SURF.wood : SURF.iron);
    }
    for (let i = 0; i < n; i++) {
      const [x0, z0] = at(i);
      const [x1, z1] = at(i + 1);
      if (kind.rails) {
        for (let r = 1; r <= kind.rails; r++) {
          const y = (kind.h * r) / kind.rails - 0.08;
          const q = [V(x0, ys[i] + y, z0), V(x1, ys[i + 1] + y, z1), V(x1, ys[i + 1] + y + 0.12, z1), V(x0, ys[i] + y + 0.12, z0)];
          out.posts.tris([q[0], q[1], q[2], q[0], q[2], q[3]], () => col, SURF.wood | UPRIGHT);
        }
      } else {
        const q = [V(x0, ys[i] + 0.05, z0), V(x1, ys[i + 1] + 0.05, z1), V(x1, ys[i + 1] + kind.h, z1), V(x0, ys[i] + kind.h, z0)];
        (kind.glass ? out.walls : out.net).tris([q[0], q[1], q[2], q[0], q[2], q[3]], () => (kind.glass ? _c.set(0x6a8088) : col), (kind.glass ? SURF.glass : SURF.iron) | UPRIGHT);
        // a rail along its top
        const t = [V(x0, ys[i] + kind.h, z0), V(x1, ys[i + 1] + kind.h, z1), V(x1, ys[i + 1] + kind.h - 0.06, z1), V(x0, ys[i] + kind.h - 0.06, z0)];
        out.posts.tris([t[0], t[1], t[2], t[0], t[2], t[3]], () => col, SURF.iron | UPRIGHT);
      }
    }
  }
  out.solids.push({ ax, az, bx, bz, r: kind.solid ? WALL_T / 2 + 0.05 : 0.12, bottom: Math.min(...ys) - 1, topA: ys[0] + kind.h, topB: ys[n] + kind.h });
}

// ── Signs ───────────────────────────────────────────────────────────────────
// A board on two posts beside the path, with the exhibit's name on it in
// white on brown, the National Zoo's own colours for them.
const SIGN = { dot: 0.032, high: 1.25, line: 15, posts: 0x3a2c20, board: 0x5a3e28, letters: 0xf0ead8, back: 0.9 };

// Where each named exhibit's sign goes: on the path side of its pen (or of
// where the map says it is), facing the path: into out, [{ exhibit, x, z,
// yaw }], an exhibit a step (a generator).
export function* signSpots(site, out = []) {
  for (const e of site.exhibits) {
    if (!e.name) continue;
    yield;
    // one sign for a name in one place
    if (out.some((s) => s.exhibit.name === e.name && Math.hypot(s.x - e.x, s.z - e.z) < 40)) continue;
    const ring = e.pen || e.area;
    // the nearest bit of path to the exhibit
    let best = { d: Infinity };
    for (const p of site.paths) {
      const P = p.pts;
      for (let k = 0; k + 3 < P.length; k += 2) {
        const [ax, az, bx, bz] = [P[k], P[k + 1], P[k + 2], P[k + 3]];
        const dx = bx - ax;
        const dz = bz - az;
        const l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((e.x - ax) * dx + (e.z - az) * dz) / l2));
        const px = ax + dx * t;
        const pz = az + dz * t;
        // (judged from the exhibit's edge, where it has one)
        let d = Math.hypot(px - e.x, pz - e.z);
        if (ring) d = Math.min(...ring.map(([x, z]) => Math.hypot(px - x, pz - z)));
        if (d < best.d) best = { d, px, pz, half: p.width / 2 };
      }
    }
    if (!Number.isFinite(best.d) || best.d > 60) continue;
    // from that bit of path, back towards the exhibit, just off the path
    let [dx, dz] = [e.x - best.px, e.z - best.pz];
    const l = Math.hypot(dx, dz) || 1;
    [dx, dz] = [dx / l, dz / l];
    let x = best.px + dx * (best.half + SIGN.back);
    let z = best.pz + dz * (best.half + SIGN.back);
    // (not in the pen, nor in a building)
    for (let k = 0; k < 6 && ((ring && inside(ring, x, z)) || site.use(x, z) & USE.building); k++) {
      x -= dx * 0.5;
      z -= dz * 0.5;
    }
    out.push({ exhibit: e, x, z, yaw: Math.atan2(-dx, -dz) });
  }
  return out;
}

// The signs: their posts and boards into `wood`, their letters into `paint`.
export function buildSigns(spots, ground, wood, paint) {
  const solids = [];
  for (const s of spots) {
    const words = s.exhibit.name.toUpperCase().split(/\s+/);
    const lines = [];
    for (const w of words) {
      const last = lines[lines.length - 1];
      if (last && (last + ' ' + w).length <= SIGN.line) lines[lines.length - 1] = `${last} ${w}`;
      else lines.push(w);
    }
    const laid = lines.slice(0, 3).map((t) => layout(t));
    const D = SIGN.dot;
    const W = (Math.max(...laid.map((l) => l.width)) + 4) * D;
    const H = (laid.length * 9 + 2) * D;
    const y = ground(s.x, s.z);
    const [sn, cs] = [Math.sin(s.yaw), Math.cos(s.yaw)];
    // u across the board (its right, looking at it), v towards whoever reads it
    const P = (u, h, v) => V(s.x + cs * u + sn * v, y + h, s.z - sn * u + cs * v);
    const box = (u, h, v, w, hh, d, col, surf) => {
      const g = new THREE.BoxGeometry(w, hh, d);
      const c = new THREE.Color(col);
      wood.add(g, new THREE.Matrix4().makeRotationY(s.yaw).setPosition(P(u, h + hh / 2, v)), () => c, null, surf);
    };
    for (const u of [-W / 2 + 0.08, W / 2 - 0.08]) box(u, 0, 0, 0.08, SIGN.high + H, 0.08, SIGN.posts, SURF.wood);
    box(0, SIGN.high, 0, W, H, 0.05, SIGN.board, SURF.paint);
    // the letters, a run of lit dots at a time
    const col = new THREE.Color(SIGN.letters);
    const tri = [];
    laid.forEach((l, row) => {
      const x0 = -l.width / 2;
      const top = SIGN.high + H - (2 + row * 9) * D;
      const runs = new Map();
      for (const [dx, dy] of l.dots) {
        const k = dy;
        if (!runs.has(k)) runs.set(k, []);
        runs.get(k).push(dx);
      }
      for (const [dy, xs] of runs) {
        xs.sort((a, b) => a - b);
        for (let i = 0; i < xs.length; ) {
          let j = i;
          while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
          // facing the reader: u runs to their right, so the text reads left to right
          const u0 = (x0 + xs[i]) * D;
          const u1 = (x0 + xs[j] + 1) * D;
          const h0 = top - (dy + 1) * D;
          const h1 = top - dy * D;
          const v = 0.03;
          tri.push(P(u0, h0, v), P(u1, h0, v), P(u1, h1, v), P(u0, h0, v), P(u1, h1, v), P(u0, h1, v));
          i = j + 1;
        }
      }
    });
    paint.tris(tri, () => col, SURF.paint | UPRIGHT);
    solids.push({ ax: s.x - cs * W * 0.5, az: s.z + sn * W * 0.5, bx: s.x + cs * W * 0.5, bz: s.z - sn * W * 0.5, r: 0.08, bottom: y - 0.5, topA: y + SIGN.high + H, topB: y + SIGN.high + H });
  }
  return solids;
}
