// The airboat's wake: the white water it leaves on the bayou.
//
// It's where the boat has been, not a shape fixed to the boat: a trail laid
// down under it as it goes, so it follows the boat round the bends of a
// canal and stays on the water it was made on. White water peels off the
// hull's sides, and runs out behind either side in broken lines, the arms
// of the V, until they reach the banks and wash along them; between them,
// behind the stern, the propeller's wash churns it white, spreading and
// thinning. It all fades in a few seconds, and there's none while the boat
// sits still. (What's under the hull is hidden by it.)
//
// Drawn on the water: on the OVER layer, after it (render/pipeline.js), so
// that it's seen on the water rather than under it. Built round its own
// mesh, which is put under the boat each frame (render/origin.js), so the
// numbers handed to the graphics card stay small wherever the bayou is.
//
//   const wake = new Wake()
//   wake.update({ x, z, yaw, level, v, room }, dt)   each frame: where the
//       middle of the boat is and which way it heads (rad), the water's
//       level (m), how fast it's going (m/s), and how far it is to the bank
//       either side (m), there
//   wake.clear()      none left (the boat has been put somewhere else)
//   wake.object       the mesh, to put in the scene
//   wake.dispose()

import * as THREE from 'three';
import { OVER } from '../render/pipeline.js';
import { mulberry32, clamp } from '../noise.js';

const DROP = 1.5; // m the boat goes between the points the trail is kept as
const LIFE = 8; // s a point of the trail lasts before it's gone
const FULL = 6; // m/s: going this fast and over, the wake is all there
const STILL = 0.4; // m/s: going slower than this, none is made
const LIFT = 0.04; // m over the water
const TILE = 9; // m of trail one repeat of the foam covers, along and across
const JUMP = 30; // m: the boat moved further than this in a frame, and it was put there
// the propeller's wash: as wide as the stern at first (m, half), spreading
// out (m/s either side), how long it stays white (s), and how white at most
const WASH = { half: 1.0, spread: 0.5, white: 1.0, most: 0.6 };
// the arms of the V: how far out from the middle they start (m: the hull's
// sides), how fast they run out (for each m/s the boat goes: about the
// 19½° of a wake on deep water, a little less), how wide they are at first
// (m) and grow (m/s), how white at the most, and how broken up: each point
// along them somewhere between `broken` and all of that
const ARM = { out: 1.25, spread: 0.3, wide: 0.5, grow: 0.3, most: 0.5, broken: 0.25 };
const MAX_POINTS = Math.ceil((LIFE * 14) / DROP) + 2; // (it goes 13 m/s at the most: route.js PACE)
const BANDS = 3; // the wash and the two arms
const ACROSS = 3; // vertices across a band: clear at its edges, whitest in the middle
const ROWS = MAX_POINTS + 1; // the points, and where the boat is now
const PER_ROW = BANDS * ACROSS;
const TRIS_PER_ROW = BANDS * (ACROSS - 1) * 2; // between one row and the next

export class Wake {
  constructor() {
    this.pts = []; // { x, z, nx, nz, level, born, k, v, room, u, l, r }, oldest first
    this.spare = []; // points gone, to be used again (nothing made each frame)
    this.head = point(); // where the boat is now: the last row
    this.rnd = mulberry32(0x3a7e);
    this.time = 0;
    this.u = 0; // m along the trail, for the foam to stay where it was laid
    this.had = false; // whether it was anywhere last frame...
    this.last = { x: 0, z: 0 }; // ...and where
    const n = ROWS * PER_ROW;
    this.pos = new Float32Array(n * 3);
    this.uv = new Float32Array(n * 2);
    this.col = new Float32Array(n * 4).fill(1);
    const normal = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) normal[i * 3 + 1] = 1;
    // row by row, so that only the rows in use are drawn (setDrawRange);
    // wound to face up, a band's vertices going across it leftward
    const idx = [];
    for (let r = 0; r < ROWS - 1; r++) {
      for (let b = 0; b < BANDS; b++) {
        for (let c = 0; c < ACROSS - 1; c++) {
          const a0 = r * PER_ROW + b * ACROSS + c;
          const a1 = a0 + 1;
          const b0 = a0 + PER_ROW;
          const b1 = b0 + 1;
          idx.push(a0, b0, a1, a1, b0, b1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    g.boundingSphere = new THREE.Sphere();
    this.geometry = g;
    this.texture = foamTexture();
    // lit, so it's no brighter than the water at dusk, and dark at night
    this.material = new THREE.MeshLambertMaterial({ map: this.texture, color: 0xdfe6e0, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(g, this.material);
    mesh.name = 'airboat wake';
    mesh.layers.set(OVER);
    mesh.renderOrder = 1;
    mesh.visible = false;
    this.object = mesh;
  }

  clear() {
    this.spare.push(...this.pts);
    this.pts.length = 0;
    this.had = false;
    this.object.visible = false;
  }

  update({ x, z, yaw, level, v, room }, dt) {
    this.time += dt;
    const L = this.last;
    if (this.had && Math.hypot(x - L.x, z - L.z) > JUMP) this.clear();
    if (this.had) this.u += Math.hypot(x - L.x, z - L.z);
    L.x = x;
    L.z = z;
    this.had = true;
    const k = clamp((v - STILL) / (FULL - STILL), 0, 1);
    const P = this.pts;
    while (P.length && this.time - P[0].born > LIFE) this.spare.push(P.shift());
    const newest = P[P.length - 1];
    if (k > 0 && (!newest || Math.hypot(x - newest.x, z - newest.z) >= DROP)) {
      if (P.length >= MAX_POINTS) this.spare.push(P.shift());
      const q = this.#set(this.spare.pop() || point(), x, z, yaw, level, k, v, room);
      q.l = ARM.broken + (1 - ARM.broken) * this.rnd();
      q.r = ARM.broken + (1 - ARM.broken) * this.rnd();
      P.push(q);
    }
    if (!P.length) {
      this.object.visible = false;
      return;
    }
    const head = this.#set(this.head, x, z, yaw, level, k, v, room);
    head.l = P[P.length - 1].l;
    head.r = P[P.length - 1].r;
    // the rows: each point, oldest first, then where the boat is now
    const mesh = this.object;
    mesh.position.set(x, level, z);
    const rows = P.length + 1;
    let far = 0;
    for (let r = 0; r < rows; r++) {
      const p = r < P.length ? P[r] : head;
      const age = this.time - p.born;
      const left = 1 - age / LIFE;
      const bank = Math.max(0.3, p.room);
      // the wash, churned white under the stern and thinning behind
      const wash = Math.min(bank, WASH.half + age * WASH.spread);
      const white = p.k * WASH.most * Math.exp(-age / WASH.white) * left;
      // the arms, running out to the banks, and washing along them
      const out = Math.min(bank, ARM.out + age * ARM.spread * p.v);
      const wide = ARM.wide + age * ARM.grow;
      const edge = Math.min(bank + 0.2, out + wide / 2);
      const arm = left * left * p.k * ARM.most;
      const dx = p.x - x;
      const dz = p.z - z;
      const y = p.level - level + LIFT;
      far = Math.max(far, Math.hypot(dx, dz) + edge);
      const along = p.u / TILE;
      this.#row(0, r, dx, dz, y, p.nx, p.nz, -wash, wash, along, (2 * wash) / TILE, white);
      this.#row(1, r, dx, dz, y, p.nx, p.nz, out - wide / 2, edge, along, wide / TILE, arm * p.l);
      this.#row(2, r, dx, dz, y, p.nx, p.nz, -edge, -(out - wide / 2), along, wide / TILE, arm * p.r);
    }
    const g = this.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.uv.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.setDrawRange(0, (rows - 1) * TRIS_PER_ROW * 3);
    g.boundingSphere.center.set(0, 0, 0);
    g.boundingSphere.radius = far + 1;
    mesh.visible = true;
  }

  // a point of the trail: here, now (nx, nz: left of the way the boat heads)
  #set(p, x, z, yaw, level, k, v, room) {
    p.x = x;
    p.z = z;
    p.nx = Math.cos(yaw);
    p.nz = -Math.sin(yaw);
    p.level = level;
    p.born = this.time;
    p.k = k;
    p.v = v;
    p.room = room;
    p.u = this.u;
    return p;
  }

  // One row of a band: across it from a to b (m, left of the way; a < b) at
  // the point (dx, dz) from the boat, y over the water there; the foam's
  // v along, and how many repeats of it across; how white in the middle.
  #row(band, r, dx, dz, y, nx, nz, a, b, v, across, alpha) {
    for (let c = 0; c < ACROSS; c++) {
      const f = c / (ACROSS - 1);
      const o = a + (b - a) * f;
      const i = r * PER_ROW + band * ACROSS + c;
      this.pos[i * 3] = dx + nx * o;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = dz + nz * o;
      this.uv[i * 2] = 0.5 + across * (f - 0.5);
      this.uv[i * 2 + 1] = v;
      this.col[i * 4 + 3] = c === 0 || c === ACROSS - 1 ? 0 : alpha;
    }
  }

  dispose() {
    this.geometry.dispose();
    this.texture.dispose();
    this.material.dispose();
  }
}

const point = () => ({ x: 0, z: 0, nx: 1, nz: 0, level: 0, born: 0, k: 0, v: 0, room: 0, u: 0, l: 1, r: 1 });

// Foam: white flecks and streaks along the way the water goes, a tile of it
// drawn once, repeating along and across; how much shows is its alpha.
function foamTexture() {
  const W = 64;
  const H = 64;
  const rnd = mulberry32(0xa1b0a7);
  const a = new Float32Array(W * H);
  for (let n = 0; n < 220; n++) {
    const cx = rnd() * W;
    const cy = rnd() * H;
    const r = 1 + rnd() * 3;
    const len = 1 + rnd() * 4; // streaked along the way it goes
    for (let y = Math.floor(cy - r * len); y <= cy + r * len; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = (x - cx) / r;
        const dy = (y - cy) / (r * len);
        const f = 1 - (dx * dx + dy * dy);
        if (f <= 0) continue;
        const i = ((y + H) % H) * W + ((x + W) % W);
        a[i] = Math.min(1, a[i] + f * (0.35 + rnd() * 0.4));
      }
    }
  }
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) data.set([255, 255, 255, Math.round(255 * a[i])], i * 4);
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
