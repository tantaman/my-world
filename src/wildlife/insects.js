// Bees and butterflies over the meadow flowers.
//
// A bee is a speck at this resolution, so a whole swarm is one InstancedMesh:
// striped bodies with pale blurred wings, darting from flower to flower and
// hovering there. Butterflies are big enough to see their wings, so each is a
// tiny skinned mesh whose two wings clap open and shut as it flutters about.

import * as THREE from 'three';
import { RigBuilder, lin, at, ellipsoid } from './rig.js';
import { clamp, lerp } from '../noise.js';
import { rand } from '../core/geom.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

let beeGeo = null;
function makeBeeGeometry() {
  // built with the rig builder for its vertex colours, then unskinned
  const r = new RigBuilder(5);
  r.grain = 0.05;
  const b = r.root;
  const yellow = lin(0xe8b818);
  const black = lin(0x1a1408);
  r.part(b, ellipsoid(0.0065, 0.0065, 0.012, 8, 6), { matrix: at(0, 0, -0.004), color: (p) => (Math.floor((p.z / 0.012 + 1) * 2.5) % 2 ? yellow : black) });
  r.part(b, ellipsoid(0.005, 0.005, 0.005, 6, 4), { matrix: at(0, 0.001, 0.008), color: yellow });
  r.part(b, ellipsoid(0.0035, 0.0035, 0.0035, 6, 4), { matrix: at(0, 0, 0.0135), color: black });
  r.mirror((side) => [b, ellipsoid(0.008, 0.0006, 0.0045, 6, 3), { matrix: at(side * 0.007, 0.0055, 0.002, 0, side * 0.5, side * 0.3), color: lin(0xd8dde4) }]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(r.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(r.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(r.col, 3));
  g.setIndex(r.idx);
  g.computeBoundingSphere();
  // scaled up a little: a real bee would be under one art pixel
  g.scale(1.6, 1.6, 1.6);
  return g;
}
const beeMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 });

export class BeeSwarm {
  constructor(x, z, count, ground) {
    if (!beeGeo) beeGeo = makeBeeGeometry();
    this.x = x;
    this.z = z;
    this.ground = ground;
    this.mesh = new THREE.InstancedMesh(beeGeo, beeMaterial, count);
    this.mesh.frustumCulled = false; // they move every frame; the swarm is small
    this.mesh.castShadow = false;
    this.bees = [];
    for (let i = 0; i < count; i++) {
      const b = { x, y: 0, z, tx: x, ty: 0, tz: z, hover: rand(0, 2), yaw: rand(0, 6), vx: 0, vy: 0, vz: 0 };
      this.pickFlower(b);
      b.x = b.tx + rand(-1, 1);
      b.z = b.tz + rand(-1, 1);
      b.y = b.ty + 0.4;
      this.bees.push(b);
    }
  }

  // somewhere among the flowers near the swarm's middle
  pickFlower(b) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * 3.2;
    b.tx = this.x + Math.cos(a) * d;
    b.tz = this.z + Math.sin(a) * d;
    b.ty = this.ground(b.tx, b.tz) + rand(0.12, 0.45);
    b.hover = rand(0.8, 3.5);
  }

  update(dt, time) {
    for (let i = 0; i < this.bees.length; i++) {
      const b = this.bees[i];
      const dx = b.tx - b.x;
      const dy = b.ty - b.y;
      const dz = b.tz - b.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 0.05) {
        // working a flower: tiny jitter, then off to the next
        b.hover -= dt;
        if (b.hover < 0) this.pickFlower(b);
      }
      const sp = d > 0.05 ? Math.min(2.2, d * 3) : 0;
      const k = 1 - Math.exp(-dt * 6);
      b.vx = lerp(b.vx, (dx / (d + 1e-4)) * sp, k);
      b.vy = lerp(b.vy, (dy / (d + 1e-4)) * sp, k);
      b.vz = lerp(b.vz, (dz / (d + 1e-4)) * sp, k);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      if (Math.hypot(b.vx, b.vz) > 0.05) b.yaw = Math.atan2(b.vx, b.vz);
      const jit = 0.012;
      _p.set(b.x + Math.sin(time * 31 + i) * jit, b.y + Math.sin(time * 23 + i * 3) * jit, b.z + Math.cos(time * 27 + i * 2) * jit);
      _e.set(0, b.yaw, 0);
      _q.setFromEuler(_e);
      _m.compose(_p, _q, _s.set(1, 1, 1));
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.dispose();
  }
}

// ── Butterflies ────────────────────────────────────────────────────────────
export const BUTTERFLIES = {
  monarch: { span: 0.1, base: 0xe0761a, edge: 0x1a1210, spot: 0xf4f0e8, under: 0xd89a50 },
  white: { span: 0.055, base: 0xf2f2ea, edge: 0xf2f2ea, spot: 0x2a2a2a, under: 0xe8ecc8 },
  swallowtail: { span: 0.11, base: 0xf0d438, edge: 0x1a1612, spot: 0x2a5ab0, under: 0xf0dc70 },
  cloak: { span: 0.085, base: 0x3a2018, edge: 0xe8d890, spot: 0x5070c0, under: 0x3a3430 },
  azure: { span: 0.03, base: 0x8ab0e8, edge: 0x5a6a8a, spot: 0x8ab0e8, under: 0xd8dce4 },
};

export function buildButterfly(kind, seed) {
  const s = BUTTERFLIES[kind];
  const r = new RigBuilder(seed);
  r.grain = 0.06;
  const half = s.span / 2;
  const body = r.bone(null, 0, 0, 0, 'body');
  const wings = [r.bone(body, half * 0.06, 0, 0, 'wingL'), r.bone(body, -half * 0.06, 0, 0, 'wingR')];
  r.part(body, ellipsoid(half * 0.07, half * 0.07, half * 0.5, 5, 4), { color: lin(0x1a1410) });
  const base = lin(s.base);
  const edge = lin(s.edge);
  const spot = lin(s.spot);
  const under = lin(s.under);
  r.mirror((side) => {
    const i = side > 0 ? 0 : 1;
    // forewing and hindwing as two flattened ovals, upper and under colours
    const col = (p, n) => {
      if (n.y < -0.5) return under;
      const d = Math.hypot(p.x, p.z);
      if (d > 0.82) return edge;
      if (d > 0.7 && Math.sin(p.x * 30) > 0.6) return spot;
      return base;
    };
    r.part(wings[i], ellipsoid(1, 0.04, 1, 10, 3), { matrix: at(side * half * 0.5, 0, half * 0.18, 0, side * 0.35, 0, half * 0.55, 1, half * 0.42), color: col });
    return [wings[i], ellipsoid(1, 0.04, 1, 10, 3), { matrix: at(side * half * 0.38, -0.0005, -half * 0.3, 0, -side * 0.4, 0, half * 0.42, 1, half * 0.36), color: col }];
  });
  const mesh = r.build({ shadow: false });
  return { mesh, body, wings, span: s.span };
}

export class Butterfly {
  constructor(rig, x, z, ground) {
    this.rig = rig;
    this.ground = ground;
    this.mesh = rig.mesh;
    this.x = x;
    this.z = z;
    this.y = ground(x, z) + 0.6;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.heading = Math.random() * 6.28;
    this.time = Math.random() * 10;
    this.home = { x, z };
    this.rest = 0; // > 0: sitting on a flower, wings slowly opening and shutting
    this.leaving = false;
  }

  update(dt) {
    this.time += dt;
    const g = this.ground(this.x, this.z);
    if (this.rest > 0) {
      this.rest -= dt;
      const open = 0.3 + 0.3 * Math.sin(this.time * 1.5);
      this.flap(open);
      this.mesh.position.set(this.x, this.y, this.z);
      return;
    }
    // erratic: a wandering heading, bobbing height, drawn back toward home
    this.heading += (Math.sin(this.time * 1.3) * 1.6 + (Math.random() - 0.5) * 6) * dt;
    if (!this.leaving) {
      const hx = this.home.x - this.x;
      const hz = this.home.z - this.z;
      const hd = Math.hypot(hx, hz);
      if (hd > 4) {
        const want = Math.atan2(hx, hz);
        let dd = want - this.heading;
        dd = Math.atan2(Math.sin(dd), Math.cos(dd));
        this.heading += dd * dt * 1.5;
      }
    }
    const sp = this.leaving ? 1.6 : 0.9;
    this.x += Math.sin(this.heading) * sp * dt;
    this.z += Math.cos(this.heading) * sp * dt;
    const want = g + (this.leaving ? 3 : 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(this.time * 0.9)));
    this.y += (want - this.y) * (1 - Math.exp(-dt * 1.5)) + Math.sin(this.time * 14) * 0.25 * dt;
    if (this.y < g + 0.12) this.y = g + 0.12;
    if (!this.leaving && this.y < g + 0.3 && Math.random() < dt * 0.15) {
      this.rest = rand(2, 6);
      this.y = g + rand(0.15, 0.3); // on a flower head
    }
    this.flap(Math.abs(Math.sin(this.time * 11)));
    this.mesh.position.set(this.x, this.y + Math.sin(this.time * 22) * 0.012, this.z);
    this.mesh.rotation.y = this.heading;
  }

  // 0 = wings flat open, 1 = clapped together above the back
  flap(t) {
    const a = clamp(t, 0, 1) * 1.35 - 0.15;
    this.rig.wings[0].rotation.z = a;
    this.rig.wings[1].rotation.z = -a;
  }
}

