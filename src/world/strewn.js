// A land made in code, strewn with what stands, lies and walks on it:
// rocks and trees, tombs and fires, and the shades of the dead (Hell's, and
// Purgatory's), each doing what its place has them do.
//
// The ground is cut into squares `cell` m across. Each square near you is
// furnished once, from the seed, and let go of when you're away: its things
// are drawn as instances (one mesh a kind a square), and the ones you can
// bump into are put in the space's solids. What goes in a square is the
// place's own say: strew(land, ref, x0, z0, seed, put) looks it over and
// puts things down,
//
//   put(kind, x, y, z, yaw, scale, more)
//   more: { go: [dirX, dirZ, speed, span], phase, rise, sink, stride, shade,
//   red, tall, tiltX, tiltZ } (render/shades.js says what the first five do)
//
// and a kit says what each kind is: { geo, mat, solid, goes, haze, shadow, receiveShadow }
// — its shape, what it is drawn with, how wide and tall it is if it is in
// the way ({ r, top, step, len }, m at a scale of 1), whether it can walk
// (its instances say how, so its geometry is its own), for a flame, the
// shimmer over it, and whether it casts a shadow (the material its shadow
// is drawn with, if it isn't the one it is: leaves have gaps in them) or
// receives one. A kind called 'flame' is drawn over the rest and gives light
// (render/flame.js, render/lights.js).
//
// A land whose circles don't close (Hell's) furnishes a square for a turn of
// them, and one turn on furnishes it differently: turnOf, in a subclass.

import * as THREE from 'three';
import { hash2i } from '../noise.js';
import { hazeOver } from '../render/shades.js';
import { SHARED } from '../render/uniforms.js';
import { OVER, HEAT } from '../render/pipeline.js';

const CELL = 64; // m
const NEAR = 250; // m: squares this close are furnished
const FAR = 330; // m: and let go of this far off
// The light a flame gives (render/lights.js), for one a metre high and half
// as wide: how bright, and how far it reaches. Bigger ones give more.
const FIRE_LIGHT = { power: 16, range: 16, decay: 2, color: [1, 0.42, 0.13] };
const LIT_NEAR = 90; // m: flames further off than this light nothing you'd see

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

// A kind for a kit: its shape, what it is drawn with, and if it is in the
// way, how wide and tall (m at a scale of 1). It walks unless it is drawn
// with `still` (a material whose instances only stand).
export const kind = (geo, mat, solid = null, still = null) => ({ geo, mat, solid, goes: mat !== still });

export class Strewn {
  // land, space: the place's (landSpace.js) · group: where its meshes go ·
  // kit: what can be put down (above) · strew(land, ref, x0, z0, seed, put):
  // what is put down in the square at (x0, z0) (put: below) · cell, near,
  // far: how big a square is, and how near one is furnished and how far
  // off let go of (m)
  constructor({ land, space, group, kit, strew, cell = CELL, near = NEAR, far = FAR }) {
    this.land = land;
    this.space = space;
    this.group = group;
    this.kit = kit;
    this.strew = strew;
    this.cell = cell;
    this.near = near;
    this.far = far;
    this.cells = new Map();
    this.queue = [];
    this.count = 0; // things standing, in all the furnished squares
  }

  // Furnish round (x, z), for the turn `ref`, spending up to ms.
  update(x, z, ref, ms = 3) {
    const L = this.land;
    const CELL = this.cell;
    const i0 = Math.floor((x - this.near) / CELL);
    const i1 = Math.floor((x + this.near) / CELL);
    const j0 = Math.floor((z - this.near) / CELL);
    const j1 = Math.floor((z + this.near) / CELL);
    this.queue.length = 0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const cx = (i + 0.5) * CELL;
        const cz = (j + 0.5) * CELL;
        const d = Math.hypot(cx - x, cz - z);
        if (d > this.near + CELL * 0.7) continue;
        if (Math.hypot(cx - L.cx, cz - L.cz) > L.reach) continue;
        const turn = this.turnOf(cx, cz, ref);
        const key = `${i}:${j}:${turn}`;
        if (!this.cells.has(key)) this.queue.push({ key, i, j, turn, d });
      }
    }
    if (this.queue.length) {
      this.queue.sort((a, b) => a.d - b.d);
      const until = performance.now() + ms;
      let n = 0;
      for (const q of this.queue) {
        if (n > 0 && performance.now() > until) break;
        this._furnish(q, ref);
        n++;
      }
    }
    for (const [key, c] of this.cells) {
      if (Math.hypot(c.cx - x, c.cz - z) > this.far + CELL) this._letGo(key, c);
    }
  }

  // Which turn of the land the square at (x, z) (its middle) is furnished
  // for, for whoever's turn is ref: none, unless a subclass says (a land
  // whose circles don't close: landTiles.js).
  turnOf(x, z, ref) {
    return 0;
  }

  // Everything near (x, z), now (for when you're set down somewhere).
  settle(x, z, ref) {
    this.update(x, z, ref, 1e6);
  }

  _furnish(q, ref) {
    const CELL = this.cell;
    const x0 = q.i * CELL;
    const z0 = q.j * CELL;
    const lists = new Map();
    const solids = [];
    const put = (kind, x, y, z, yaw = 0, scale = 1, more = null) => {
      let list = lists.get(kind);
      if (!list) lists.set(kind, (list = []));
      list.push({ x: x - x0, y, z: z - z0, yaw, scale, ...more });
      const sol = this.kit[kind].solid;
      if (!sol) return;
      const l = (sol.len || 0) * scale;
      const ax = Math.sin(yaw) * l;
      const az = Math.cos(yaw) * l;
      solids.push({ ax: x - ax, az: z - az, bx: x + ax, bz: z + az, r: sol.r * scale, bottom: y - 1, topA: y + sol.top * scale, topB: y + sol.top * scale, step: sol.step ? sol.step * scale : 0.3 });
    };
    this.strew(this.land, ref, x0, z0, hash2i(q.i, q.j, this.land.seed ^ Math.imul(q.turn, 7919)), put);

    const group = new THREE.Group();
    group.position.set(x0, 0, z0);
    group.matrixAutoUpdate = false;
    group.updateMatrix();
    let count = 0;
    for (const [kind, list] of lists) {
      const k = this.kit[kind];
      const n = list.length;
      // what goes somewhere says so per instance, in a geometry of its own
      // that shares the shape's buffers; what only stands shares the shape
      let geo = k.geo;
      if (k.goes) {
        geo = new THREE.BufferGeometry();
        for (const name of Object.keys(k.geo.attributes)) geo.setAttribute(name, k.geo.attributes[name]);
        geo.setIndex(k.geo.index);
      }
      const go = new Float32Array(n * 4);
      const how = new Float32Array(n * 4);
      const mesh = new THREE.InstancedMesh(geo, k.mat, n);
      let lo = Infinity;
      let hi = -Infinity;
      list.forEach((it, a) => {
        _e.set(it.tiltX || 0, it.yaw, it.tiltZ || 0, 'YXZ');
        _s.set(it.scale, it.scale * (it.tall || 1), it.scale);
        mesh.setMatrixAt(a, _m.compose(_p.set(it.x, it.y, it.z), _q.setFromEuler(_e), _s));
        const v = it.shade ?? 1;
        mesh.setColorAt(a, _c.setRGB(v * (it.red || 1), v, v));
        if (it.go) go.set(it.go, a * 4);
        how[a * 4] = it.phase || 0;
        how[a * 4 + 1] = it.rise || 0;
        how[a * 4 + 2] = it.sink || 0;
        how[a * 4 + 3] = it.stride || 0;
        if (it.y < lo) lo = it.y;
        if (it.y > hi) hi = it.y;
      });
      if (k.goes) {
        geo.setAttribute('aGo', new THREE.InstancedBufferAttribute(go, 4));
        geo.setAttribute('aHow', new THREE.InstancedBufferAttribute(how, 4));
      }
      // (things walk about in their square and past its edges: cull by the square, generously)
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(CELL / 2, (lo + hi) / 2, CELL / 2), CELL * 1.3 + (hi - lo) / 2 + 8);
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = !!k.shadow;
      if (k.shadow && k.shadow !== true) mesh.customDepthMaterial = k.shadow;
      mesh.receiveShadow = !!k.receiveShadow;
      group.add(mesh);
      // (a flame is drawn over the rest, which it reads: render/flame.js; and
      // the air over it shimmers)
      if (kind === 'flame') {
        mesh.layers.set(OVER);
        group.add(hazeOver(mesh, k.haze));
      }
      count += n;
    }
    this.group.add(group);
    // the flames' light: where each stands (its top, where it is brightest
    // and the light gets over the rim of a tomb), and the ones that walk,
    // with how
    const fires = [];
    for (const it of lists.get('flame') || []) {
      const big = it.scale * Math.sqrt(it.tall || 1);
      fires.push({
        x: x0 + it.x,
        y: it.y + it.scale * (it.tall || 1) * 0.7,
        z: z0 + it.z,
        color: FIRE_LIGHT.color,
        power: FIRE_LIGHT.power * big * big,
        range: FIRE_LIGHT.range * big,
        decay: FIRE_LIGHT.decay,
        flicker: (it.x * 7.1 + it.z * 3.3) % 97,
        go: it.go || null,
        at: it,
      });
    }
    this.cells.set(q.key, { group, cx: x0 + CELL / 2, cz: z0 + CELL / 2, count, solid: solids.length > 0, fires, x0, z0 });
    if (solids.length) this.space.solids.set(q.key, solids);
    this.count += count;
  }

  // The flames near `eye` that give light, for the picture's lights
  // (render/lights.js): pushed onto out. One that walks is where its
  // instance is drawn just now (shades.js: travel).
  lightsNear(eye, out) {
    const t = SHARED.uTime.value;
    const CELL = this.cell;
    for (const c of this.cells.values()) {
      if (!c.fires.length || Math.abs(c.cx - eye.x) > CELL / 2 + LIT_NEAR || Math.abs(c.cz - eye.z) > CELL / 2 + LIT_NEAR) continue;
      for (const f of c.fires) {
        if (f.go) {
          const [dx, dz, speed, span] = f.go;
          const it = f.at;
          const s = ((((t * speed + (it.phase || 0) * span) % span) + span) % span) - 0.5 * span;
          f.x = c.x0 + it.x + dx * s;
          f.z = c.z0 + it.z + dz * s;
          f.y = it.y - (it.sink || 0) + (it.rise || 0) * (s / span) + it.scale * (it.tall || 1) * 0.7;
        }
        if (Math.abs(f.x - eye.x) < LIT_NEAR && Math.abs(f.z - eye.z) < LIT_NEAR) out.push(f);
      }
    }
  }

  _letGo(key, c) {
    this.group.remove(c.group);
    for (const mesh of c.group.children) {
      // (a shape shared by every square stays; the per-instance buffers go)
      if (mesh.geometry.attributes.aGo && mesh.layers.mask !== 1 << HEAT) {
        mesh.geometry.deleteAttribute('aGo');
        mesh.geometry.deleteAttribute('aHow');
      }
      mesh.dispose();
    }
    if (c.solid) this.space.solids.clear(key);
    this.count -= c.count;
    this.cells.delete(key);
  }

  dispose() {
    for (const [key, c] of [...this.cells]) this._letGo(key, c);
  }
}
