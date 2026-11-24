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

import * as THREE from 'three';
import { TREES } from './codec.js';

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

export function streetTrees(trees, { models, material, shadow, ground }) {
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
    const mesh = new THREE.InstancedMesh(model.lod0, material, ks.length);
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
      solids.push({ ax: x, az: z, bx: x, bz: z, r, bottom: y - 0.5, topA: y + TRUNK.high, topB: y + TRUNK.high });
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
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
