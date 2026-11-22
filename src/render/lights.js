// Light given off by things in the world: a campfire, the fire in a tomb, a
// pool of lava, a lantern, a demon's burning eyes. Features say where light
// comes from; the picture makes real lights of the few that matter most from
// where you're looking, every frame, and the nearest of those casts shadows
// of whatever stands in its light, as everything does by a fire.
//
//   const src = game.lights.add(scene, { x, y, z, color: [1, 0.5, 0.2], power: 6, range: 16 });
//   src.power = 0;                 // change any of it whenever you like
//   game.lights.remove(src);
//   game.lights.addSource(scene, (eye, out) => { out.push(...near(eye)); });
//
// A source is a plain object, kept by reference and read every frame:
//   x, y, z    where it is (m, in the world)
//   color      [r, g, b], 0..1 (or anything with .r .g .b)
//   power      how bright, as a three.js point light's intensity (candela)
//   range      m: past this it lights nothing (and it fades to that smoothly)
//   decay      how it falls off with distance: 2 is a point's inverse square;
//              something spread out (a fire's bed of coals) is gentler
//   flicker    a number: it wavers as a fire does, different for each number
//   shadow     false: never give it the light that casts shadows (a glow
//              that is everywhere at once, which would cast nonsense)
//
// Those that come and go by the hundred (every tomb on a plain has a fire in
// it) are better handed over by a function (addSource) that gives only
// those near the eye, from whatever the feature keeps them in.
//
// Why a pool. A shader is compiled for so many lights, of so many kinds,
// casting shadows or not; change the number and everything drawn is
// compiled again. So there is always the same number of lights here, each
// given to whichever source deserves it most this frame and dark when there
// are too few; and what a light was given fades out as another comes to
// deserve it more, rather than going out between one frame and the next.
//
// The air glows round a light too, where it's thick (render/pipeline.js):
// `glow` holds the brightest few, for that.

import * as THREE from 'three';

const AIR = 6; // how many lights the air glows round, at the most (the pipeline's uniforms)
const FADE = 0.35; // how close (as a share of its own) the next one's claim must be before a light starts going out
const SHADOW_NEAR = 0.15; // m
const SHADOW_MAP = 512; // texels a side of each face of the cube a shadow is cast into
const SHADOW_FAR = 2.5; // a source this many times its range off gets no shadow (it would be too small to see)

// A wavering 0..1 that never quite repeats, different for every seed.
export function flicker(t, seed) {
  return 0.5 + 0.22 * Math.sin(t * 13.1 + seed) + 0.17 * Math.sin(t * 7.3 + seed * 1.7) + 0.11 * Math.sin(t * 23.9 + seed * 0.3);
}

const _c = new THREE.Color();

export class Lights {
  // count: lights in the pool; shadows: how many of them cast shadows
  constructor({ count = 4, shadows = 1, mapSize = SHADOW_MAP } = {}) {
    this.count = count;
    this.shadows = Math.min(shadows, count);
    this.group = new THREE.Group();
    this.group.name = 'lights';
    this.pool = [];
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      // lights fall on what's drawn over the water too (pipeline.js: OVER)
      l.layers.enableAll();
      if (i < this.shadows) {
        l.castShadow = true;
        l.shadow.mapSize.set(mapSize, mapSize);
        l.shadow.camera.near = SHADOW_NEAR;
        l.shadow.bias = -0.0025;
        l.shadow.normalBias = 0.03;
        l.shadow.radius = 2;
        l.shadow.autoUpdate = false;
      }
      this.group.add(l);
      this.pool.push(l);
    }
    this.scenes = new Map(); // scene -> { list: Set, sources: [fn] }
    // the brightest few this frame, for the air to glow round: { x, y, z, r, g, b, range }
    this.glow = [];
    for (let i = 0; i < AIR; i++) this.glow.push({ x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, range: 1, on: false });
    this.time = 0;
    this._cand = [];
    this._got = [];
  }

  _of(scene) {
    let s = this.scenes.get(scene);
    if (!s) this.scenes.set(scene, (s = { list: new Set(), sources: [] }));
    return s;
  }

  add(scene, source) {
    this._of(scene).list.add(source);
    return source;
  }

  remove(source) {
    for (const s of this.scenes.values()) s.list.delete(source);
  }

  addSource(scene, fn) {
    this._of(scene).sources.push(fn);
    return fn;
  }

  // Give the pool to the sources of `scene` that matter most seen from
  // `eye` (m, in the world), and put it in that scene. t: seconds, for the
  // flicker.
  assign(scene, eye, t = this.time) {
    this.time = t;
    if (this.group.parent !== scene) scene.add(this.group);
    const cand = this._cand;
    cand.length = 0;
    const s = this.scenes.get(scene);
    if (s) {
      for (const src of s.list) cand.push(src);
      for (const fn of s.sources) fn(eye, cand);
    }
    // what each would light, as seen from here: its pool of light is as wide
    // as its range and looks smaller with distance
    const got = this._got;
    got.length = 0;
    for (const src of cand) {
      const p = src.power * (src.flicker === undefined ? 1 : 0.78 + 0.44 * flicker(t, src.flicker));
      if (!(p > 0) || !(src.range > 0)) continue;
      const d2 = (src.x - eye.x) ** 2 + (src.y - eye.y) ** 2 + (src.z - eye.z) ** 2;
      const claim = (p * src.range * src.range) / Math.max(d2, 1);
      got.push({ src, p, d2, claim });
    }
    got.sort((a, b) => b.claim - a.claim);

    // The shadow goes to the one that most deserves it and may have it.
    const n = this.pool.length;
    const shadowed = [];
    for (let i = 0; i < got.length && shadowed.length < this.shadows; i++) {
      const g = got[i];
      if (g.src.shadow === false || g.d2 > (g.src.range * SHADOW_FAR) ** 2 || i >= n) continue;
      shadowed.push(g);
    }
    // the rest of the pool, in order of their claims
    const rest = got.filter((g) => !shadowed.includes(g)).slice(0, n - shadowed.length);
    const cut = got.length > n ? got[n].claim : 0;
    const fade = (g) => (cut > 0 ? Math.min(1, (g.claim / cut - 1) / FADE) : 1);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const l = this.pool[i];
      const g = i < this.shadows ? shadowed[i] : rest[k++];
      if (i < this.shadows && !shadowed[i]) {
        l.intensity = 0;
        l.shadow.autoUpdate = false;
        continue;
      }
      if (!g) {
        l.intensity = 0;
        continue;
      }
      const src = g.src;
      // (a flickering fire sways its light a little, and the shadows with it)
      const sway = src.flicker === undefined ? 0 : (flicker(t * 1.3, src.flicker + 9) - 0.5) * 0.08;
      l.position.set(src.x + sway, src.y, src.z - sway);
      l.intensity = g.p * fade(g);
      l.distance = src.range;
      l.decay = src.decay ?? 2;
      const c = src.color;
      if (Array.isArray(c)) l.color.setRGB(c[0], c[1], c[2]);
      else if (c) l.color.copy(c);
      else l.color.setRGB(1, 1, 1);
      if (l.castShadow) {
        l.shadow.autoUpdate = l.intensity > 0;
        if (l.shadow.camera.far !== src.range) {
          l.shadow.camera.far = src.range;
          l.shadow.camera.updateProjectionMatrix();
        }
      }
    }

    // the brightest few, for the air to glow round (more than are lit:
    // the air round a fire further off glows too), going out as gently
    const airCut = got.length > AIR ? got[AIR].claim : 0;
    for (let i = 0; i < AIR; i++) {
      const o = this.glow[i];
      const g = got[i];
      o.on = !!g;
      if (!g) continue;
      const src = g.src;
      const c = src.color;
      _c.setRGB(1, 1, 1);
      if (Array.isArray(c)) _c.setRGB(c[0], c[1], c[2]);
      else if (c) _c.copy(c);
      const p = g.p * (airCut > 0 ? Math.min(1, (g.claim / airCut - 1) / FADE) : 1);
      o.x = src.x;
      o.y = src.y;
      o.z = src.z;
      o.r = _c.r * p;
      o.g = _c.g * p;
      o.b = _c.b * p;
      o.range = src.range;
    }
    return this;
  }
}

export const LIGHTS_AIR = AIR;
