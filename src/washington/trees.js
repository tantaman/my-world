// Washington's street trees, each where the city planted it (codec.js: its
// survey of every tree box in the District), as tall as the city's lidar
// measured its crown: drawn as the forest's own trees are, with the same
// models and the same material (world/models.js, world/chunks.js), in their
// city colours.
//
// streetTrees(trees, { models, material, shadow, ground }) → { meshes, solids }:
//   trees     codec.js's [x, z, height, kind, ...] (tile metres)
//   models    the forest's models, by kind ({ lod0, lod1, lod2, height,
//             trunkRadius })
//   material, shadow   the forest's vegetation material and its shadow's
//   ground(x, z)       the height of the ground there
// meshes is { mesh, kind } each, one to a kind, in tile metres; lod(mesh, k)
// sets how finely each is drawn. solids, their trunks.
//
// kerbside(trees, streets) → trees: each that the survey has standing just
// out in a street (its box at the curb, the street drawn a little wide) set
// back onto the curb's side of it. streets: polygons ({ outer, holes }, each
// ring [[x, z], ...]) of what's driven on.

import * as THREE from 'three';
import { TREES } from './codec.js';
import { inside } from '../core/rings.js';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
// A street tree's trunk, to bump into: at least this thick (m), and how
// high it stands solid.
const TRUNK = { least: 0.18, high: 2.5 };
// How much of a tree's height is its trunk's girth: a street tree is
// pruned up and slimmer than one in the woods.
const SLIM = 0.85;
// m: a tree this far out into a street, or less, is set back over its edge
// and this far onto the curb's side; one further out is in a median, and stays.
const KERB = { most: 1.5, back: 0.45 };

export function streetTrees(trees, { models, material, shadow, ground, detail = true }) {
  const n = trees.length / 4;
  const byKind = new Map();
  for (let k = 0; k < n; k++) {
    const kind = TREES[trees[k * 4 + 3]] || 'broad';
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(k);
  }
  const meshes = [];
  const solids = [];
  for (const [kind, ks] of byKind) {
    const model = models[kind];
    if (!model) continue;
    const mesh = new THREE.InstancedMesh(detail ? model.lod0 : model.lod2, material, ks.length);
    ks.forEach((k, i) => {
      const [x, z, h] = [trees[k * 4], trees[k * 4 + 1], trees[k * 4 + 2]];
      const y = ground(x, z);
      const s = h / model.height;
      // (turned and tinted each its own way, by where it is)
      const t = fract(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453);
      _p.set(x, y, z);
      _q.setFromAxisAngle(UP, t * Math.PI * 2);
      _s.set(s * SLIM, s, s * SLIM);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, tint(kind, t, _c));
      const r = Math.max(TRUNK.least, model.trunkRadius * s * SLIM);
      if (detail) solids.push({ ax: x, az: z, bx: x, bz: z, r, bottom: y - 0.5, topA: y + TRUNK.high, topB: y + TRUNK.high });
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = detail;
    mesh.receiveShadow = detail;
    if (shadow) mesh.customDepthMaterial = shadow;
    meshes.push({ mesh, kind, model });
  }
  return { meshes, solids };
}

// How finely the trees are drawn: 0 close, 2 far.
export function treesLod(meshes, lod) {
  for (const { mesh, model } of meshes) mesh.geometry = lod === 0 ? model.lod0 : lod === 1 ? model.lod1 : model.lod2;
}

const fract = (v) => v - Math.floor(v);

// A street tree's colour: a city's trees greener and more even than the
// woods', an early-turning one here and there.
function tint(kind, t, out) {
  const a = fract(t * 7.31);
  const b = fract(t * 13.77);
  if (kind === 'broad' && t > 0.96) return out.setRGB(1.3, 0.98, 0.5);
  const v = 0.86 + a * 0.24;
  if (kind === 'pine') return out.setRGB(v * 0.92, v, v * (0.95 + b * 0.1));
  return out.setRGB(v * (0.92 + b * 0.12), v * 1.04, v * 0.82);
}

export function kerbside(trees, streets) {
  const out = Float32Array.from(trees);
  const boxed = streets.map((p) => {
    let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, z] of p.outer) [x0, z0, x1, z1] = [Math.min(x0, x), Math.min(z0, z), Math.max(x1, x), Math.max(z1, z)];
    return { p, box: [x0, z0, x1, z1] };
  });
  const within = ({ p }, x, z) => inside(p.outer, x, z) && !p.holes.some((h) => inside(h, x, z));
  for (let k = 0; k < out.length; k += 4) {
    const [x, z] = [out[k], out[k + 1]];
    const s = boxed.find((b) => x >= b.box[0] && x <= b.box[2] && z >= b.box[1] && z <= b.box[3] && within(b, x, z));
    if (!s) continue;
    // the nearest point of its edge, and which way is out
    let [best, bx, bz, nx, nz] = [Infinity, 0, 0, 0, 0];
    for (const ring of [s.p.outer, ...s.p.holes]) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, az] = ring[j];
        const [ex, ez] = [ring[i][0] - ax, ring[i][1] - az];
        const l2 = ex * ex + ez * ez;
        if (!l2) continue;
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
        const [px, pz] = [ax + ex * t, az + ez * t];
        const d = Math.hypot(px - x, pz - z);
        if (d >= best) continue;
        const l = Math.sqrt(l2);
        [best, bx, bz, nx, nz] = [d, px, pz, -ez / l, ex / l];
      }
    }
    if (best > KERB.most) continue;
    // (out is the side of the edge the street isn't on)
    if (within(s, bx + nx * 0.05, bz + nz * 0.05)) [nx, nz] = [-nx, -nz];
    [out[k], out[k + 1]] = [bx + nx * KERB.back, bz + nz * KERB.back];
  }
  return out;
}
