// What grows under the water, near you: pondweed in lakes and ponds, and in
// the sea, seagrass in the shallows and kelp standing up toward the light
// from deeper down, in beds. All of it sways with the water.
//
// Like the grass, it is decoration, grown afresh wherever you are from the
// seed and the ground: in square tiles around the camera, each the same every
// time it grows, and nothing you bump into. It grows only while you're in the
// water, where you can see it.

import * as THREE from 'three';
import { SHARED } from '../render/uniforms.js';
import { WORLD_GLSL } from '../render/glsl.js';
import { createSimplex2, hash2i, mulberry32, smoothstep } from '../noise.js';
import { waterSample } from '../core/geom.js';
import { weedShape, kelpShape, seagrassShape } from './shapes.js';

const TILE = 12; // m
const REACH = 40; // m: tiles grown this far round the camera
const TILES_A_FRAME = 2;
// What grows, and where:
//   sea     in the sea (else fresh water)
//   tries   places looked at in each tile
//   depth   the water it grows in (m), [shallowest, deepest]
//   height  how tall (m): [shortest, tallest], or for kelp, the share of
//           the water it reaches up through
//   patch   [noise scale (m), how much of the bed is in a bed of it]
//   max     the most there can be around you at once
const PLANTS = {
  weed: { sea: false, tries: 70, depth: [0.5, 6], height: [0.4, 2.4], patch: [9, 0.45], max: 2400, shape: weedShape },
  seagrass: { sea: true, tries: 110, depth: [0.4, 7], height: [0.3, 0.8], patch: [7, 0.55], max: 4000, shape: seagrassShape },
  kelp: { sea: true, tries: 26, depth: [3, 24], height: [0.55, 0.85], patch: [16, 0.4], max: 1200, shape: kelpShape },
};

const _w = waterSample();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function plantMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SHARED.uTime;
    shader.uniforms.uOrigin = SHARED.uOrigin;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aBend;
        uniform float uTime;
        ${WORLD_GLSL}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          // (where it stands in the world, so it sways the same however the
          // mesh it's in is put)
          vec2 at = worldXZ((modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz);
          float h = length(instanceMatrix[1].xyz); // how tall it stands (m)
          float t = uTime * 0.7 + at.x * 0.13 + at.y * 0.09;
          vec2 sway = vec2(sin(t) + 0.4 * sin(t * 2.3 + at.y), cos(t * 0.8 + at.x * 0.2) * 0.7) * 0.35;
          // further at the top, and further for taller (in metres, so taken
          // back out of the instance's stretch)
          transformed.xz += sway * pow(aBend, 1.6) * min(h, 6.0) * 0.25;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'underwater-plants-v2';
  return mat;
}

export class Weed {
  // chunks: the ChunkManager; seed; salt(sample): whether the water in a
  // waterAt() sample is the sea.
  constructor({ scene, chunks, seed, salt }) {
    this.chunks = chunks;
    this.seed = seed;
    this.salt = salt;
    this.tiles = new Map(); // key -> { kind: Float32Array [x, y, z, yaw, h] }
    this.shown = '';
    const mat = plantMaterial();
    this.meshes = {};
    for (const [kind, p] of Object.entries(PLANTS)) {
      const mesh = new THREE.InstancedMesh(p.shape(), mat, p.max);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      scene.add(mesh);
      this.meshes[kind] = mesh;
    }
    this.nPatch = createSimplex2((seed ^ 0x3eed) >>> 0);
  }

  // The plants of one tile.
  _grow(tx, tz) {
    const rng = mulberry32(hash2i(tx, tz, (this.seed ^ 0x77ee) >>> 0));
    const out = {};
    for (const [kind, p] of Object.entries(PLANTS)) {
      const list = [];
      for (let i = 0; i < p.tries; i++) {
        const x = (tx + rng()) * TILE;
        const z = (tz + rng()) * TILE;
        const r1 = rng();
        const r2 = rng();
        const r3 = rng();
        if (!this.meshes[kind]) continue;
        const bed = smoothstep(1 - p.patch[1] - 0.15, 1 - p.patch[1] + 0.15, this.nPatch(x / p.patch[0] + (p.sea ? 31 : 0), z / p.patch[0]) * 0.5 + 0.5);
        if (r1 > bed) continue;
        if (!this.chunks.waterAt(x, z, _w)) continue;
        const sea = this.salt(_w);
        if (sea !== p.sea || _w.depth < p.depth[0] || _w.depth > p.depth[1]) continue;
        if (Math.hypot(_w.flowX, _w.flowZ) > 0.25) continue; // not where it runs
        const h = kind === 'kelp' ? Math.min(14, _w.depth * (p.height[0] + (p.height[1] - p.height[0]) * r2)) : p.height[0] + (p.height[1] - p.height[0]) * r2 * Math.min(1, _w.depth / 2);
        list.push(x, _w.level - _w.depth - 0.05, z, r3 * Math.PI * 2, h);
      }
      out[kind] = new Float32Array(list);
    }
    return out;
  }

  // Grow what's needed round (x, z), and show it. on: whether there's any
  // water about worth growing it for.
  update(x, z, on) {
    for (const mesh of Object.values(this.meshes)) mesh.visible = on;
    if (!on) return;
    const t0x = Math.floor((x - REACH) / TILE);
    const t1x = Math.floor((x + REACH) / TILE);
    const t0z = Math.floor((z - REACH) / TILE);
    const t1z = Math.floor((z + REACH) / TILE);
    let grown = 0;
    let missing = false;
    const want = [];
    for (let tz = t0z; tz <= t1z; tz++) {
      for (let tx = t0x; tx <= t1x; tx++) {
        const cx = (tx + 0.5) * TILE - x;
        const cz = (tz + 0.5) * TILE - z;
        if (cx * cx + cz * cz > (REACH + TILE) ** 2) continue;
        const key = `${tx},${tz}`;
        if (!this.tiles.has(key)) {
          // only once the ground there is in at full detail
          const ch = this.chunks.chunkAt((tx + 0.5) * TILE, (tz + 0.5) * TILE);
          if (grown >= TILES_A_FRAME || !ch || ch.lod !== 0) {
            missing = true;
            continue;
          }
          this.tiles.set(key, this._grow(tx, tz));
          grown++;
        }
        want.push(key);
      }
    }
    const shown = want.join(';') + (missing ? '+' : '');
    if (shown === this.shown && !grown) return;
    this.shown = shown;
    // forget tiles well out of reach
    if (this.tiles.size > want.length * 3) {
      const keep = new Set(want);
      for (const key of this.tiles.keys()) if (!keep.has(key)) this.tiles.delete(key);
    }
    // each mesh is put near you, and its plants measured from there, so the
    // numbers handed to the card stay small (render/origin.js)
    const ax = Math.round(x);
    const az = Math.round(z);
    for (const [kind, mesh] of Object.entries(this.meshes)) {
      let n = 0;
      const max = PLANTS[kind].max;
      mesh.position.set(ax, 0, az);
      for (const key of want) {
        const list = this.tiles.get(key)[kind];
        for (let o = 0; o < list.length && n < max; o += 5) {
          _p.set(list[o] - ax, list[o + 1], list[o + 2] - az);
          _q.setFromAxisAngle(UP, list[o + 3]);
          _s.set(1, list[o + 4], 1);
          _m.compose(_p, _q, _s);
          mesh.setMatrixAt(n++, _m);
        }
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
