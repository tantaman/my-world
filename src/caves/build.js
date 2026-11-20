// Making a cave from its layout (sites.js): the rock, its skin, the floor
// and walls to walk by, and what grows in it — stalactites and stalagmites,
// glowworms, crystals — and the boulders that mark its mouth. No three.js in
// here: what comes out is plain arrays, for look.js to draw and space.js to
// walk in, and for the tests.
//
// It is a generator, so the work can be spread over frames as you walk up to
// a cave (step), or done all at once when you arrive in one (finish):
//
//   const job = buildCave(gen, cave);
//   while (!step(job, 4)) await nextFrame();     // ...or finish(job)
//   job.result -> { cave, mesh, cols, space, decor, rocks, cuts, drips }

import { mulberry32, hash2i, lerp, smoothstep } from '../noise.js';
import { shapesOf, CaveGrid, addShape, roughen, RES } from './shape.js';
import { meshGrid } from './mesh.js';
import { columnsOf, walkOf, CaveSpace, WALK } from './space.js';
import { daylight, farthest } from './sites.js';

export const DECOR = {
  stalactites: 0.32, // per m² of roof, in rooms (a third of that in passages)
  stalagmites: 0.06, // per m² of floor, in rooms
  glowworms: 4, // per m² of roof in rooms, where there are any (a third of that in passages)
  headroom: 2.05, // m: nothing hangs lower than this over where you walk
};

const OFF = 1 << 20;

// The land's height as the finest terrain mesh has it (1 m grid, triangles
// split the same way as ChunkManager.sampleHeight), so the edge of the
// cutting at the mouth lines up with the ground.
export function terrainOf(gen) {
  const cache = new Map();
  const H = (ix, iz) => {
    const k = (ix + OFF) * 2097152 + (iz + OFF);
    let h = cache.get(k);
    if (h === undefined) cache.set(k, (h = gen.height(ix, iz)));
    return h;
  };
  return (x, z) => {
    const i = Math.floor(x);
    const j = Math.floor(z);
    const u = x - i;
    const v = z - j;
    const a = H(i, j);
    const b = H(i + 1, j);
    const c = H(i, j + 1);
    const d = H(i + 1, j + 1);
    if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  };
}

export function* buildCave(gen, cave) {
  const job = { result: null };
  const terrain = terrainOf(gen);
  const light = (d) => daylight(cave, d);
  const seed = hash2i(cave.cx, cave.cz, gen.seed ^ 0x7c47);

  // the rock
  const shapes = shapesOf(cave);
  const grid = new CaveGrid(shapes);
  for (const sh of shapes) {
    addShape(grid, sh);
    yield;
  }
  roughen(grid, seed, cave.nodes[1].d);
  yield;

  // where to walk
  const cols = columnsOf(grid, terrain, light);
  yield;
  walkOf(cols);
  yield;

  // its skin
  const mesh = meshGrid(grid, { terrain, light, seed });
  yield;

  // what grows in it, then where to walk again round what's on the floor
  const rng = mulberry32(seed ^ 0x2d1);
  const decor = decorate(cave, cols, rng);
  walkOf(cols);
  yield;

  const rocks = mouthRocks(cave, terrain, rng);
  const m = cave.mouth;
  const way = cave.nodes[1];
  // the hillside is opened for the way in, and only the way in
  const cuts = [{ ax: m.x, az: m.z, bx: way.x, bz: way.z, fa: m.floor, fb: way.floor, w: m.w, h: m.h }];
  // what the rock was made from is done with; its field is kept, for the camera
  grid.floor = grid.d = grid._raw = null;
  const result = { cave, mesh, cols, space: new CaveSpace(cave, cols, grid), decor, rocks, cuts, drips: decor.drips };
  return result;
}

// Run a build for up to `ms`. -> its result once done, else null.
export function step(job, ms = 4) {
  if (job.done) return job.result;
  const t0 = performance.now();
  for (;;) {
    const r = job.next();
    if (r.done) {
      job.done = true;
      job.result = r.value;
      return r.value;
    }
    if (performance.now() - t0 > ms) return null;
  }
}

export function finish(job) {
  return step(job, Infinity);
}

// ── What grows in a cave ────────────────────────────────────────────────────
// Lists of numbers, a fixed number each:
//   hang     stalactites: x, y (the roof), z, length, radius, tint
//   stand    stalagmites: x, y (the floor), z, height, radius, tint
//   crystals x, y, z, length, radius, yaw, tilt, hue
//   glow     glowworms: x, y, z, phase
//   drips    where water drips from: x, y, z (the tips of stalactites)
function decorate(cave, cols, rng) {
  const { nx, nz, res, F, C, T, S, W, blocked } = cols;
  const hang = [];
  const stand = [];
  const crystals = [];
  const glow = [];
  const drips = [];
  const nodes = cave.nodes;
  const roomOf = (x, z) => {
    for (const r of cave.rooms) {
      const n = nodes[r.node];
      const dx = x - n.x;
      const dz = z - n.z;
      const lx = dx * Math.cos(r.yaw) + dz * Math.sin(r.yaw);
      const lz = -dx * Math.sin(r.yaw) + dz * Math.cos(r.yaw);
      if ((lx / r.rx) ** 2 + (lz / r.rz) ** 2 < 0.8) return r;
    }
    return null;
  };
  const far = farthest(cave);
  const grotto = cave.crystals ? cave.rooms.find((r) => r.node === far) || cave.rooms[cave.rooms.length - 1] : null;
  const cell = res * res;
  const block = (x, z, r) => {
    for (let k = Math.floor((z - r - cols.z0) / res); k <= Math.ceil((z + r - cols.z0) / res); k++) {
      for (let i = Math.floor((x - r - cols.x0) / res); i <= Math.ceil((x + r - cols.x0) / res); i++) {
        if (i < 0 || k < 0 || i >= nx || k >= nz) continue;
        if (Math.hypot(cols.x0 + i * res - x, cols.z0 + k * res - z) <= r + res * 0.5) blocked[i + k * nx] = 1;
      }
    }
  };

  for (let k = 1; k < nz - 1; k++) {
    for (let i = 1; i < nx - 1; i++) {
      const c = i + k * nx;
      const f = F[c];
      if (!Number.isFinite(f) || S[c] > 0.35 || T[c] < C[c] + 0.5) continue; // only under a good roof, out of the daylight
      const x = cols.x0 + i * res + (rng() - 0.5) * res;
      const z = cols.z0 + k * res + (rng() - 0.5) * res;
      const room = roomOf(x, z);
      const high = C[c] - f;
      const walkHere = W[c] > -0.2;
      // ── from the roof
      const wantHang = DECOR.stalactites * cell * (room ? 1 : 0.35) * smoothstep(2.2, 3.2, high);
      if (rng() < wantHang) {
        const room4 = walkHere ? high - DECOR.headroom : high - 0.4;
        const len = Math.min(room4, lerp(0.2, 1.5, rng() ** 1.6));
        if (len > 0.15) {
          const rad = len * lerp(0.12, 0.2, rng()) + 0.03;
          hang.push(x, C[c] + 0.15, z, len + 0.15, rad, rng());
          drips.push(x, C[c] - len, z);
        }
      }
      // glowworms on the roofs of rooms and deep passages, if this cave has them
      if (cave.glow && S[c] < 0.08 && high > 2.4) {
        for (let n = DECOR.glowworms * cell * (room ? 1 : 0.33); n > 0; n--) {
          if (n < 1 && rng() > n) break;
          glow.push(x + (rng() - 0.5) * res, C[c] - 0.03, z + (rng() - 0.5) * res, rng() * 6.283);
        }
      }
      // ── from the floor, in rooms: against the walls, or out in the open
      if (room && room !== grotto && (W[c] < 0.9 && W[c] > 0.25 || W[c] > 2.4) && rng() < DECOR.stalagmites * cell) {
        const h = lerp(0.3, Math.min(1.7, high - 0.6), rng() ** 1.4);
        const rad = h * lerp(0.14, 0.22, rng()) + 0.05;
        stand.push(x, f - 0.1, z, h + 0.1, rad, rng());
        block(x, z, rad + 0.1);
        // and very often a stalactite over it, dripping
        if (rng() < 0.6 && high > 2.5) {
          const len = Math.min(high - h - 0.25, lerp(0.3, 1.2, rng()));
          if (len > 0.2) hang.push(x, C[c] + 0.15, z, len + 0.15, len * 0.16 + 0.04, rng());
        }
      }
    }
  }

  // ── a grotto of crystals, in the room furthest in
  if (grotto) {
    const n = nodes[grotto.node];
    const clusters = 5 + Math.floor(rng() * 4);
    const hue = rng();
    for (let q = 0, tries = 0; q < clusters && tries < 200; tries++) {
      const a = rng() * Math.PI * 2;
      const rr = lerp(0.35, 0.95, rng());
      const x = n.x + Math.cos(a) * grotto.rx * rr;
      const z = n.z + Math.sin(a) * grotto.rz * rr;
      const i = Math.round((x - cols.x0) / res);
      const k = Math.round((z - cols.z0) / res);
      const c = i + k * nx;
      if (i < 1 || k < 1 || i >= nx - 1 || k >= nz - 1 || !Number.isFinite(F[c]) || W[c] > 1.4 || W[c] < -0.6) continue;
      q++;
      const count = 4 + Math.floor(rng() * 6);
      // lean out from the wall
      const gx = W[c + 1] - W[c - 1];
      const gz = W[c + nx] - W[c - nx];
      const out = Math.atan2(gx, gz);
      for (let p = 0; p < count; p++) {
        const len = lerp(0.25, 1.35, rng() ** 1.5);
        crystals.push(x + (rng() - 0.5) * 0.7, F[c] - 0.08, z + (rng() - 0.5) * 0.7, len, len * lerp(0.13, 0.2, rng()) + 0.03, rng() * 6.283, out + (rng() - 0.5) * 1.6, (hue + (rng() - 0.5) * 0.12 + 1) % 1);
      }
      block(x, z, 0.7);
    }
  }
  return { hang: Float32Array.from(hang), stand: Float32Array.from(stand), crystals: Float32Array.from(crystals), glow: Float32Array.from(glow), drips: Float32Array.from(drips) };
}

// ── The mouth ───────────────────────────────────────────────────────────────
// Boulders either side of the cutting and over the way in, so the mouth reads
// as a mouth from across the valley: [{ x, y, z, s, sy, yaw }], set in the
// ground a little. A boulder (world/models.js makeRock) reaches about
// ROCK_SIDE of its size out to the side and ROCK_FOOT of its height down.
const ROCK_SIDE = 1.25;
const ROCK_FOOT = 0.63;
function mouthRocks(cave, terrain, rng) {
  const m = cave.mouth;
  const way = cave.nodes[1];
  const inner = Math.hypot(way.x - m.x, way.z - m.z);
  const roof = (along) => m.floor + (way.floor - m.floor) * Math.min(1, Math.max(0, along / inner)) + m.h;
  const px = -m.uz;
  const pz = m.ux;
  const out = [];
  const put = (along, across, s, squash = 0.75) => {
    const x = m.x + m.ux * along + px * across;
    const z = m.z + m.uz * along + pz * across;
    out.push({ x, y: terrain(x, z) - s * 0.15, z, s, sy: s * squash, yaw: rng() * Math.PI * 2 });
  };
  // flanking the cutting, clear of it
  for (const side of [-1, 1]) {
    const a = lerp(1.4, 2.1, rng());
    put(lerp(0.4, 0.8, rng()) * m.portal, side * (m.w + 0.35 + a * ROCK_SIDE), a);
    const b = lerp(1.1, 1.8, rng());
    put(m.portal + lerp(0.3, 1.2, rng()), side * (m.w + 0.35 + b * ROCK_SIDE), b);
    const c = lerp(0.6, 1.1, rng());
    if (rng() < 0.7) put(lerp(-0.6, 0.6, rng()), side * (m.w + 1.2 + c * ROCK_SIDE + rng() * 1.5), c);
  }
  // over the way in, its foot well clear of the roof
  const s = lerp(2, 2.8, rng());
  for (let along = m.portal + 1.5; along < inner + 4; along += 0.5) {
    const x = m.x + m.ux * along;
    const z = m.z + m.uz * along;
    const reach = s * ROCK_SIDE * 0.8;
    const foot = terrain(x, z) - s * 0.15 - s * 0.6 * ROCK_FOOT;
    if (foot > roof(along - reach) + 0.4 && foot > roof(along + reach) + 0.4) {
      put(along, (rng() - 0.5) * 1.2, s, 0.6);
      break;
    }
  }
  return out;
}

export { RES };
