// The far view from a hike: the land beyond where the forest is streamed in.
//
// Chunks reach a couple of hundred metres from you, which in a forest is
// plenty: the trees close in long before. From a real mountain top it isn't.
// The lake you climbed above, the ridges across it, the valley running off
// to the haze are a kilometre or more away. So round each hike the land is
// drawn once more, coarsely (farGrid.js), as one mesh coloured the way the
// forest looks from afar: dark crowns of conifers raised over the ground,
// meadows, bare rock on the steeps, and water that mirrors the sky.
//
// Where the chunks are, it sinks out of sight under them, so near you the
// real ground and the real trees are what you see, and it only shows past
// their edge.
//
// Each mesh is measured from its own corner and put there, like a chunk
// (render/origin.js).

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { SKY_GLSL, SKY_UNIFORMS_GLSL } from '../render/glsl.js';
import { SKY } from '../render/uniforms.js';
import { NO_WATER } from '../world/water.js';

const CANOPY = 11; // m: how far the crowns of a closed wood stand over the ground
const SINK = 45; // m: how far it drops out of sight under the loaded chunks
const SINK_BAND = 48; // m inside their edge over which it drops
const UNDER = 0.8; // m: it always sits this far under the real ground
// m: nothing of it is drawn further from the camera than this. Much past
// here the picture can't tell land from sky (the composite pass reads the far
// end of the depth range as sky), so the fog must have closed in by then.
export const FAR_CLIP = 1000;

// Linear colours, as the forest reads from a long way off.
const CONIFER = new THREE.Color(0.012, 0.042, 0.018);
const BROADLEAF = new THREE.Color(0.03, 0.065, 0.016);
const MEADOW = new THREE.Color(0.075, 0.13, 0.03);
const ROCK = new THREE.Color(0.11, 0.1, 0.085);
const WATER = new THREE.Color(0.012, 0.035, 0.042);

const _c = new THREE.Color();
const _w = new THREE.Color();

export class FarView {
  constructor(scene) {
    this.scene = scene;
    this.meshes = new Map(); // id -> mesh
    // The loaded chunks' square: its middle (x, z), and how far it reaches
    // each way. The middle is a place: whoever makes this registers it to be
    // slid with the scene (origin.place).
    this.mid = { value: new THREE.Vector2() };
    this.half = { value: 0 };
    this.material = this._material();
  }

  has(id) {
    return this.meshes.has(id);
  }

  // A grid from sampleFar() → a mesh for hike `id`. ground: what the hike's
  // country says its ground is made of (world/country.js).
  add(id, grid, ground = null) {
    this.remove(id);
    const mesh = new THREE.Mesh(buildGeometry(grid, ground), this.material);
    mesh.name = `far view: ${id}`;
    mesh.userData.grid = { x0: grid.x0, z0: grid.z0, x1: grid.x0 + (grid.n - 1) * grid.step, z1: grid.z0 + (grid.n - 1) * grid.step };
    mesh.position.set(grid.x0, 0, grid.z0);
    this.scene.add(mesh);
    this.meshes.set(id, mesh);
  }

  remove(id) {
    const m = this.meshes.get(id);
    if (!m) return;
    this.scene.remove(m);
    m.geometry.dispose();
    this.meshes.delete(id);
  }

  // How far (m) from (x, z) to the nearest edge of any far view it's inside
  // of: as far as there is land drawn in every direction. 0 if outside them all.
  reach(x, z) {
    let best = 0;
    for (const m of this.meshes.values()) {
      const g = m.userData.grid;
      const e = Math.min(x - g.x0, g.x1 - x, z - g.z0, g.z1 - z);
      if (e > best) best = e;
    }
    return best;
  }

  // Keep out from under the chunks loaded around `focus`.
  update(focus) {
    const S = CONFIG.chunkSize;
    const R = CONFIG.viewRadius;
    const cx = Math.floor(focus.x / S);
    const cz = Math.floor(focus.z / S);
    this.mid.value.set((cx + 0.5) * S, (cz + 0.5) * S);
    this.half.value = (R + 0.5) * S;
  }

  _material() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, SKY, { uMid: this.mid, uHalf: this.half });
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute float aCanopy;
          attribute float aWater;
          uniform vec2 uMid;
          uniform float uHalf;
          varying float vWater;
          varying vec3 vWPos;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            vec4 wp = modelMatrix * vec4(transformed, 1.0);
            // how far inside the loaded chunks' square this is
            float e = uHalf - max(abs(wp.x - uMid.x), abs(wp.z - uMid.y));
            float under = smoothstep(0.0, ${SINK_BAND.toFixed(1)}, e);
            transformed.y += aCanopy * (1.0 - under) - under * ${SINK.toFixed(1)} - ${UNDER.toFixed(2)};
            vWater = aWater;
            vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          }`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying float vWater;
          varying vec3 vWPos;
          ${SKY_UNIFORMS_GLSL}
          ${SKY_GLSL}`,
        )
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          if (distance(vWPos, cameraPosition) > ${FAR_CLIP.toFixed(1)}) discard;`,
        )
        .replace(
          '#include <opaque_fragment>',
          `if (vWater > 0.5) {
            // still water, from afar, is mostly the sky it mirrors
            vec3 V = normalize(cameraPosition - vWPos);
            vec3 R = reflect(-V, vec3(0.0, 1.0, 0.0));
            float F = 0.02 + 0.98 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
            outgoingLight = mix(outgoingLight, skyGradient(R) * 0.8, clamp(F * 1.6 + 0.25, 0.0, 0.9));
          }
          #include <opaque_fragment>`,
        );
    };
    mat.customProgramCacheKey = () => 'far-view-v2';
    return mat;
  }
}

// Positions are from the grid's corner (x0, z0), where the mesh is put.
function buildGeometry({ n, step, h, water, forest, species, bare, sand, land }, ground) {
  // the country's own colours, as far as each spot is that country's
  const G = ground && { tint: new THREE.Color(...ground.tint), rock: new THREE.Color(...ground.rock), bareA: new THREE.Color(...ground.bare[0]), bareB: new THREE.Color(...ground.bare[1]), sand: new THREE.Color(...ground.sand) };
  const _g = new THREE.Color();
  const N = n * n;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const canopy = new Float32Array(N);
  const wet = new Float32Array(N);
  const y = new Float32Array(N);
  for (let k = 0; k < N; k++) y[k] = water[k] > NO_WATER * 0.5 ? water[k] : h[k];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      pos[k * 3] = i * step;
      pos[k * 3 + 1] = y[k];
      pos[k * 3 + 2] = j * step;
      if (water[k] > NO_WATER * 0.5) {
        wet[k] = 1;
        _c.copy(WATER);
      } else {
        const dx = h[j * n + Math.min(n - 1, i + 1)] - h[j * n + Math.max(0, i - 1)];
        const dz = h[Math.min(n - 1, j + 1) * n + i] - h[Math.max(0, j - 1) * n + i];
        const slope = Math.hypot(dx, dz) / (2 * step);
        const rock = smooth(0.85, 1.4, slope);
        const wood = smooth(0.25, 0.75, forest[k]) * (1 - rock);
        _w.copy(BROADLEAF).lerp(CONIFER, smooth(-0.3, 0.3, species[k]));
        _c.copy(MEADOW);
        if (G && land[k] > 0) {
          _c.multiply(_g.setRGB(1, 1, 1).lerp(G.tint, land[k]));
          // bare ground in broad drifts of its two colours, and beaches
          _c.lerp(_g.copy(G.bareB).lerp(G.bareA, smooth(0.7, 1, bare[k]) * (0.35 + 0.65 * hash(i >> 2, j >> 2))), smooth(0.34, 0.62, bare[k]));
          _c.lerp(G.sand, sand[k]);
          _c.lerp(_g.copy(ROCK).lerp(G.rock, land[k]), rock);
        } else _c.lerp(ROCK, rock);
        _c.lerp(_w, wood);
        // a little variety, so a hillside isn't one flat colour
        const v = 0.85 + 0.3 * hash(i, j);
        _c.multiplyScalar(v);
        canopy[k] = wood * CANOPY * (0.8 + 0.4 * hash(j, i));
      }
      col[k * 3] = _c.r;
      col[k * 3 + 1] = _c.g;
      col[k * 3 + 2] = _c.b;
    }
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let w = 0;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      idx[w++] = a;
      idx[w++] = a + n;
      idx[w++] = a + 1;
      idx[w++] = a + 1;
      idx[w++] = a + n;
      idx[w++] = a + n + 1;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aCanopy', new THREE.BufferAttribute(canopy, 1));
  geo.setAttribute('aWater', new THREE.BufferAttribute(wet, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  // the canopy is raised in the shader
  geo.boundingSphere.radius += CANOPY;
  return geo;
}

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash = (i, j) => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
