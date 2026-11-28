// The far view: the land beyond where the forest is streamed in.
//
// Chunks reach a couple of hundred metres from you, which among trees is
// plenty: they close in long before. From a mountain top it isn't. The lake
// you climbed above, the ridges across it, the valley running off to the haze
// are a kilometre or more away. So the land is drawn once more, coarsely
// (grid.js), as one mesh per square coloured the way the forest looks from
// afar: dark crowns of conifers raised over the ground, meadows, bare rock on
// the steeps, and water that mirrors the sky.
//
// Where the chunks are, it sinks out of sight under them, so near you the
// real ground and the real trees are what you see, and it only shows past
// their edge. Its points are far apart, so where the land falls away steeply
// between them (a canyon's walls) a face of it can stand well over the real
// ground between: each point sinks further by as much as the land falls
// from it to the next.
//
// A wood from afar isn't a smooth green sheet: it's crowns, each lit on the
// sun's side and dark on the other, with darker gaps between, gathered in
// clumps and stands with hollows among them, the whole of it rough with
// small gullies. So over a wood the picture draws a height for the canopy, a
// pixel at a time: domes on a jittered grid (CROWNS), and over them clumps,
// stands and hollows (STANDS), which tips the light as the real ones do and
// is darker down in the gaps. Each scale gives way to its own average as it
// gets smaller than a pixel or so, rather than shimmer: so close to, the
// crowns; a few km off, the stands and hollows, which a photograph from
// Mount Storm King shows as the texture of its far slopes (tools/look.mjs).
// The crowns are the size of real ones.
// ?no=canopy (config.js) leaves them out, the wood its one colour again.
//
// Each mesh is measured from its own corner and put there, like a chunk
// (render/origin.js).

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { SKY_GLSL, SKY_UNIFORMS_GLSL, NOISE_GLSL, WORLD_GLSL, WORLD_NOISE_GLSL } from '../render/glsl.js';
import { SKY, SHARED } from '../render/uniforms.js';
import { NO_WATER } from '../world/water.js';
import { COUNTRIES } from '../world/country.js';

const CANOPY = 11; // m: how far the crowns of a closed wood stand over the ground
// The crowns drawn over a wood from afar (see the top). m between them (a
// real crown's, 8 or so, a little more), how much of their
// cell each fills, how far a crown's dome tips the light at its edge, how
// dark the gaps between them are (of the crowns' colour), how much one
// crown's colour differs from the next, and the share of a crown's width a
// pixel may be before they've all given way to their average.
const CROWNS = { size: 9, fill: 0.8, tall: 3, gap: 0.3, vary: 0.35, gone: 0.9 };
// Clumps, stands and the hollows between them over the crowns: each m
// across, m high, and how much darker (of the canopy's colour) it is at the
// bottom of one than at the top.
const STANDS = [
  { size: 35, tall: 4.4, dark: 0.3 },
  { size: 100, tall: 10, dark: 0.35 },
  { size: 275, tall: 22, dark: 0.3 },
];
const SINK = 45; // m: how far it drops out of sight under the loaded chunks
const SINK_BAND = 48; // m inside their edge over which it drops
const UNDER = 0.8; // m: it always sits this far under the real ground
// Default draw range in metres. A longer view also needs a longer camera
// projection so the composite can still distinguish its depth from the sky.
export const FAR_CLIP = 1000;

// Linear colours, as the forest reads from a long way off.
const CONIFER = new THREE.Color(0.012, 0.042, 0.018);
const BROADLEAF = new THREE.Color(0.03, 0.065, 0.016);
const MEADOW = new THREE.Color(0.075, 0.13, 0.03);
const ROCK = new THREE.Color(0.11, 0.1, 0.085);
const WATER = new THREE.Color(0.012, 0.035, 0.042);
const TURF = new THREE.Color(0.12, 0.115, 0.07); // above the trees: thin turf among stones
const SNOW = new THREE.Color(0.6, 0.62, 0.66);

const _c = new THREE.Color();
const _w = new THREE.Color();
const _u = new THREE.Color();

export class FarView {
  constructor(scene) {
    this.scene = scene;
    this.meshes = new Map(); // id -> mesh
    // The loaded chunks' square: its middle (x, z), and how far it reaches
    // each way. The middle is a place: whoever makes this registers it to be
    // slid with the scene (origin.place).
    this.mid = { value: new THREE.Vector2() };
    this.half = { value: 0 };
    this.materials = new Map();
    this.shown = true;
  }

  // Drawn, or not (from under the ground there's no seeing it).
  show(on) {
    if (on === this.shown) return;
    this.shown = on;
    for (const m of this.meshes.values()) m.visible = on;
  }

  has(id) {
    return this.meshes.has(id);
  }

  // A grid from sampleFar() → a mesh for `id`. A ring round a square drawn
  // finer (ringed: true) has a hole in it, where that square is and it isn't
  // drawn (setHole): cut, not sunk under it, since a coarse ring's heights
  // across a steep valley stand far over its floor. A material of its own,
  // for where its hole is.
  add(id, grid, clip = FAR_CLIP, ringed = false) {
    this.remove(id);
    let mat;
    if (ringed) mat = this._material(clip, true);
    else {
      if (!this.materials.has(clip)) this.materials.set(clip, this._material(clip));
      mat = this.materials.get(clip);
    }
    const mesh = new THREE.Mesh(buildGeometry(grid), mat);
    mesh.name = `far view: ${id}`;
    mesh.userData.grid = { x0: grid.x0, z0: grid.z0, x1: grid.x0 + (grid.n - 1) * grid.step, z1: grid.z0 + (grid.n - 1) * grid.step, step: grid.step };
    mesh.userData.clip = clip;
    mesh.userData.ringed = ringed;
    mesh.position.set(grid.x0, 0, grid.z0);
    mesh.visible = this.shown;
    this.scene.add(mesh);
    this.meshes.set(id, mesh);
  }

  // The square a ring is drawn round, finer, where it isn't drawn
  // ({ x0, z0, x1, z1 }, world m; null: none, and it's all drawn).
  setHole(id, hole) {
    const m = this.meshes.get(id);
    if (!m || !m.userData.ringed) return;
    const g = m.userData.grid;
    const u = m.material.userData.hole;
    if (hole) u.value.set(hole.x0 - g.x0, hole.z0 - g.z0, hole.x1 - g.x0, hole.z1 - g.z0);
    else u.value.set(1, 1, 0, 0);
  }

  remove(id) {
    const m = this.meshes.get(id);
    if (!m) return;
    this.scene.remove(m);
    m.geometry.dispose();
    if (m.userData.ringed) m.material.dispose();
    this.meshes.delete(id);
  }

  // How far (m) from (x, z) to the nearest edge of any far view it's inside
  // of: as far as there is land drawn in every direction. 0 if outside them all.
  reach(x, z, short = 0) {
    let best = 0;
    for (const m of this.meshes.values()) {
      const g = m.userData.grid;
      let e = Math.min(x - g.x0, g.x1 - x, z - g.z0, g.z1 - z);
      if (short) e = Math.min(e - short, m.userData.clip - 30);
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

  _material(clip, ringed = false) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    const crowns = !CONFIG.no.has('canopy');
    // (a ring's hole, from its own corner: x0, z0, x1, z1)
    mat.userData.hole = { value: new THREE.Vector4(1, 1, 0, 0) };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, SKY, { uMid: this.mid, uHalf: this.half, uOrigin: SHARED.uOrigin, uHole: mat.userData.hole });
      if (crowns) shader.defines = { ...shader.defines, FAR_CROWNS: '' };
      if (ringed) shader.defines = { ...shader.defines, FAR_RING: '' };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute float aCanopy;
          attribute float aWater;
          attribute float aDrop;
          attribute float aWood;
          uniform vec2 uMid;
          uniform float uHalf;
          varying float vWater;
          varying float vWood;
          varying vec3 vWPos;
          #ifdef FAR_RING
          varying vec2 vLocal;
          #endif`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            vec4 wp = modelMatrix * vec4(transformed, 1.0);
            // how far inside the loaded chunks' square this is
            float e = uHalf - max(abs(wp.x - uMid.x), abs(wp.z - uMid.y));
            float under = smoothstep(0.0, ${SINK_BAND.toFixed(1)}, e);
            transformed.y += aCanopy * (1.0 - under) - under * (${SINK.toFixed(1)} + aDrop) - ${UNDER.toFixed(2)};
            #ifdef FAR_RING
            vLocal = position.xz;
            #endif
            vWater = aWater;
            vWood = aWood;
            vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          }`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying float vWater;
          varying float vWood;
          varying vec3 vWPos;
          #ifdef FAR_RING
          // (where the square drawn finer within it is, from its own corner)
          uniform vec4 uHole;
          varying vec2 vLocal;
          #endif
          ${SKY_UNIFORMS_GLSL}
          ${SKY_GLSL}
          #ifdef FAR_CROWNS
          ${NOISE_GLSL}
          ${WORLD_GLSL}
          ${WORLD_NOISE_GLSL}
          // The nearest crown to wp: how far from its middle (0) to its edge
          // (1), which way (off, in crown widths), and a number of its own.
          float crownAt(vec2 wp, out vec2 off, out float id) {
            float m = cellsIn(1.0 / ${CROWNS.size.toFixed(2)});
            vec2 p = wp * (m / PERIOD);
            vec2 c = floor(p);
            vec2 f = fract(p);
            float best = 9.0;
            off = vec2(0.0);
            id = 0.0;
            for (int j = -1; j <= 1; j++) {
              for (int i = -1; i <= 1; i++) {
                vec2 o = vec2(float(i), float(j));
                vec2 k = wrapCell(c + o, m);
                vec2 at = o + 0.15 + 0.7 * vec2(hash12(k), hash12(k + 19.7));
                float r = (0.75 + 0.5 * hash12(k + 3.1)) * ${(CROWNS.fill / 2).toFixed(3)};
                vec2 d = (f - at) / r;
                float q = length(d);
                if (q < best) {
                  best = q;
                  off = d;
                  id = hash12(k + 7.3);
                }
              }
            }
            return best;
          }
          // The normal (in view space) of a surface whose height over it is h
          // here, from how h changes from pixel to pixel.
          vec3 canopyNormal(vec3 n, float h) {
            vec3 pos = -vViewPosition;
            vec3 dpx = dFdx(pos);
            vec3 dpy = dFdy(pos);
            vec3 r1 = cross(dpy, n);
            vec3 r2 = cross(n, dpx);
            float det = dot(dpx, r1);
            vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
            return normalize(abs(det) * n - grad);
          }
          #endif`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          // the water, where the shore between two heights says it is
          if (vWater > 0.0) diffuseColor.rgb = vec3(${WATER.r.toFixed(4)}, ${WATER.g.toFixed(4)}, ${WATER.b.toFixed(4)});
          #ifdef FAR_CROWNS
          // crowns over a wood (see the top of far/view.js): darker in the
          // gaps, each its own shade; as they shrink past a pixel, their average
          float canopyH = 0.0;
          if (vWood > 0.01 && vWater <= 0.0) {
            vec2 cwp = worldXZ(vWPos);
            float fw = length(fwidth(cwp));
            // the crowns, while they're bigger than a pixel or so
            float crownNear = 1.0 - smoothstep(${(CROWNS.size * 0.3).toFixed(2)}, ${(CROWNS.size * CROWNS.gone).toFixed(2)}, fw);
            vec2 off;
            float id;
            float r = crownAt(cwp, off, id);
            float inCrown = 1.0 - smoothstep(0.85, 1.05, r);
            float shade = mix(${CROWNS.gap.toFixed(2)}, 1.0 + (id - 0.5) * ${CROWNS.vary.toFixed(2)}, inCrown);
            // (the average of that over a cell, for where they're too small to see)
            float mean = mix(${CROWNS.gap.toFixed(2)}, 1.0, ${(Math.PI * (CROWNS.fill / 2) ** 2 * 1.08).toFixed(3)});
            float tone = mix(mean, shade, crownNear);
            canopyH = max(0.0, 1.0 - r * r) * ${CROWNS.tall.toFixed(2)} * crownNear;
            // the clumps, stands and hollows, each while it's bigger than a pixel or so
            ${STANDS.map(
              (s, k) => `{
              float near = 1.0 - smoothstep(${(s.size * 0.25).toFixed(2)}, ${(s.size * 0.7).toFixed(2)}, fw);
              float v = wnoise(cwp, ${(1 / s.size).toFixed(5)}, vec2(${(k * 17.3).toFixed(1)})) - 0.5;
              canopyH += v * ${s.tall.toFixed(2)} * near;
              tone *= 1.0 + v * ${(2 * s.dark).toFixed(2)} * near;
            }`,
            ).join('\n            ')}
            diffuseColor.rgb *= mix(1.0, tone, vWood);
            canopyH *= vWood;
          }
          #endif`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          #ifdef FAR_CROWNS
          // the canopy's height tips the light: crowns lit on the sun's side,
          // stands and hollows on theirs
          if (canopyH != 0.0) normal = canopyNormal(normal, canopyH);
          #endif`,
        )
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          if (distance(vWPos, cameraPosition) > ${clip.toFixed(1)}) discard;
          #ifdef FAR_RING
          // not where it's drawn finer, within it: the two meet at its edge
          if (vLocal.x > uHole.x && vLocal.x < uHole.z && vLocal.y > uHole.y && vLocal.y < uHole.w) discard;
          #endif`,
        )
        .replace(
          '#include <opaque_fragment>',
          `if (vWater > 0.0) {
            // still water, from afar, is mostly the sky it mirrors
            vec3 V = normalize(cameraPosition - vWPos);
            vec3 R = reflect(-V, vec3(0.0, 1.0, 0.0));
            float F = 0.02 + 0.98 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
            outgoingLight = mix(outgoingLight, skyGradient(R) * 0.8, clamp(F * 1.6 + 0.25, 0.0, 0.9));
          }
          #include <opaque_fragment>`,
        );
    };
    mat.customProgramCacheKey = () => `far-view-v6-${clip}${crowns ? '-crowns' : ''}${ringed ? '-ring' : ''}`;
    return mat;
  }
}

// Positions are from the grid's corner (x0, z0), where the mesh is put.
function buildGeometry({ n, step, h, water, shore, forest, species, bare, sand, land, country, real, above, snow }) {
  const _g = new THREE.Color();
  const N = n * n;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const canopy = new Float32Array(N);
  const woods = new Float32Array(N);
  const wet = new Float32Array(N);
  const y = new Float32Array(N);
  for (let k = 0; k < N; k++) y[k] = water[k] > NO_WATER * 0.5 ? water[k] : h[k];
  // how far the land falls from each point to the lowest next to it
  const drop = new Float32Array(N);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let low = y[j * n + i];
      for (let b = Math.max(0, j - 1); b <= Math.min(n - 1, j + 1); b++) for (let a = Math.max(0, i - 1); a <= Math.min(n - 1, i + 1); a++) low = Math.min(low, y[b * n + a]);
      drop[j * n + i] = y[j * n + i] - low;
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      pos[k * 3] = i * step;
      pos[k * 3 + 1] = y[k];
      pos[k * 3 + 2] = j * step;
      // how far into the water (m; less than nothing on land): where it
      // crosses nothing between two heights is the shore (the shader)
      wet[k] = shore ? shore[k] : water[k] > NO_WATER * 0.5 ? 1 : -1;
      if (water[k] > NO_WATER * 0.5) {
        _c.copy(WATER);
      } else {
        const dx = h[j * n + Math.min(n - 1, i + 1)] - h[j * n + Math.max(0, i - 1)];
        const dz = h[Math.min(n - 1, j + 1) * n + i] - h[Math.max(0, j - 1) * n + i];
        const slope = Math.hypot(dx, dz) / (2 * step);
        const rock = smooth(0.85, 1.4, slope);
        const wood = smooth(0.25, 0.75, forest[k]) * (1 - rock);
        _w.copy(BROADLEAF).lerp(CONIFER, smooth(-0.3, 0.3, species[k]));
        _c.copy(MEADOW);
        // a real place's own colours, as far as this spot is its country's
        const G = land[k] > 0 ? GROUND[country[k]] : null;
        if (G) {
          _c.multiply(_g.setRGB(1, 1, 1).lerp(G.tint, land[k]));
          // bare ground in broad drifts of its two colours, and beaches
          _c.lerp(_g.copy(G.bareB).lerp(G.bareA, smooth(0.7, 1, bare[k]) * (0.35 + 0.65 * hash(i >> 2, j >> 2))), smooth(0.34, 0.62, bare[k]));
          _c.lerp(G.sand, sand[k]);
          // a sandstone country's walls turn pale towards the rim, and its
          // slickrock with them
          const up = G.layers && real ? smooth(G.layers.at - 50, G.layers.at + 50, real[k]) : 0;
          _u.copy(G.rock);
          if (up > 0) {
            _c.lerp(G.upper, up * 0.85 * smooth(0.34, 0.62, bare[k]));
            _u.lerp(G.upper, up);
          }
          _c.lerp(_g.copy(ROCK).lerp(_u, land[k]), rock);
        } else _c.lerp(ROCK, rock);
        // above the trees, thin turf among stones; and snow where it lies,
        // which isn't on the cliffs
        if (above) {
          _c.lerp(TURF, above[k] * (1 - rock) * 0.8);
          _c.lerp(SNOW, smooth(0.3, 0.75, snow[k]) * (1 - smooth(0.55, 1, slope)));
        }
        _c.lerp(_w, wood);
        // a little variety, so a hillside isn't one flat colour
        const v = 0.85 + 0.3 * hash(i, j);
        _c.multiplyScalar(v);
        canopy[k] = wood * CANOPY * (0.8 + 0.4 * hash(j, i));
        woods[k] = wood;
      }
      col[k * 3] = _c.r;
      col[k * 3 + 1] = _c.g;
      col[k * 3 + 2] = _c.b;
    }
  }
  // The water's heights take the colour of the land beside them, so the
  // land up to the shore between them isn't darkened by it (the water's own
  // colour is the shader's, past the shore).
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      if (wet[k] <= 0) continue;
      let r = 0, g = 0, b = 0, m = 0;
      for (let jj = Math.max(0, j - 1); jj <= Math.min(n - 1, j + 1); jj++) {
        for (let ii = Math.max(0, i - 1); ii <= Math.min(n - 1, i + 1); ii++) {
          const q = jj * n + ii;
          if (wet[q] > 0) continue;
          r += col[q * 3];
          g += col[q * 3 + 1];
          b += col[q * 3 + 2];
          m++;
        }
      }
      if (!m) continue;
      col[k * 3] = r / m;
      col[k * 3 + 1] = g / m;
      col[k * 3 + 2] = b / m;
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
  const grid = new THREE.BufferGeometry();
  grid.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  grid.setIndex(new THREE.BufferAttribute(idx, 1));
  grid.computeVertexNormals();
  const geo = withSkirt(n, step, grid.getAttribute('normal').array, idx, { position: [pos, 3], color: [col, 3], aCanopy: [canopy, 1], aWood: [woods, 1], aWater: [wet, 1], aDrop: [drop, 1] });
  grid.dispose();
  geo.computeBoundingSphere();
  // the canopy is raised in the shader
  geo.boundingSphere.radius += CANOPY;
  return geo;
}

// A skirt round the edge of a grid: the edge hung down SKIRT of its own steps,
// so that where it meets coarser land round it (a ring: far/index.js), whose
// heights between its own points don't agree with these, no sky shows
// through the seam. Its normals are the edge's own, worked out before it's
// hung (normals: the grid's), so the edge isn't shaded as if it fell away;
// and it faces both ways, since what it hides is on either side of it.
// attrs: name -> [array, size] for the grid's n × n points.
const SKIRT = 5;
function withSkirt(n, step, normals, idx, attrs) {
  const edge = [];
  for (let i = 0; i < n; i++) edge.push(i);
  for (let j = 1; j < n; j++) edge.push(j * n + n - 1);
  for (let i = n - 2; i >= 0; i--) edge.push((n - 1) * n + i);
  for (let j = n - 2; j >= 1; j--) edge.push(j * n);
  const N = n * n;
  const E = edge.length;
  const geo = new THREE.BufferGeometry();
  for (const [name, [arr, size]] of Object.entries(attrs)) {
    const out = new Float32Array((N + E) * size);
    out.set(arr);
    for (let e = 0; e < E; e++) for (let c = 0; c < size; c++) out[(N + e) * size + c] = arr[edge[e] * size + c];
    if (name === 'position') for (let e = 0; e < E; e++) out[(N + e) * 3 + 1] -= SKIRT * step;
    geo.setAttribute(name, new THREE.BufferAttribute(out, size));
  }
  const nor = new Float32Array((N + E) * 3);
  nor.set(normals);
  for (let e = 0; e < E; e++) for (let c = 0; c < 3; c++) nor[(N + e) * 3 + c] = normals[edge[e] * 3 + c];
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const all = new Uint32Array(idx.length + E * 12);
  all.set(idx);
  let w = idx.length;
  for (let e = 0; e < E; e++) {
    const a = edge[e];
    const b = edge[(e + 1) % E];
    const a2 = N + e;
    const b2 = N + ((e + 1) % E);
    all.set([a, a2, b, b, a2, b2, a, b, a2, b, b2, a2], w);
    w += 12;
  }
  geo.setIndex(new THREE.BufferAttribute(all, 1));
  return geo;
}

// What each country says its ground is made of (world/country.js), by id.
const GROUND = COUNTRIES.map(({ ground: g }) => ({
  tint: new THREE.Color(...g.tint),
  rock: new THREE.Color(...g.rock),
  bareA: new THREE.Color(...g.bare[0]),
  bareB: new THREE.Color(...g.bare[1]),
  sand: new THREE.Color(...g.sand),
  layers: g.layers,
  upper: g.layers ? new THREE.Color(...g.layers.upper) : null,
}));

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash = (i, j) => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
