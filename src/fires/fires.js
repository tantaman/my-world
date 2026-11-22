// Campfires: a ring of stones round a scraped pit, split wood stood up in a
// teepee, and a fire that burns it down.
//
// A fire goes: an empty ring → wood laid → burning (it takes a few seconds to
// catch) → embers once the wood is gone → cold ash. While it burns you can
// feed it; embers can be rekindled; either can be put out. A ring with no
// fire in it can be taken apart for its stones.
//
// Fires burn on the wall clock, not on the hour of the sky, which is yours to
// scrub. So everyone in a world watches the same fire burn down, and one you
// lit yesterday is cold ash when you come back. That is also why a fire costs
// nothing to keep in sync: it is stored as how much wood was put on it and
// when it was lit, and what's left is worked out from those wherever it's seen.
//
// The couple of fires nearest you light their surroundings: they are
// sources of light for the picture's pool of lights (render/lights.js),
// which gives real ones, and a shadow, to whatever matters most where you
// are. How it all looks is in look.js.
//
// Emits:
//   'change'   ()   a fire was made, laid, lit, fed, put out or taken apart
//                   here (not when someone else's arrive: see adopt)

import * as THREE from 'three';
import { Emitter } from '../core/events.js';
import { Mesher } from '../build/geometry.js';
import { phash } from '../noise.js';
import { regionOf } from '../save/regions.js';
import { SHARED, SKY } from '../render/uniforms.js';
import { addFireRing, addFirewood, addCoals } from './geometry.js';
import { FireFx, createCoalMaterial, createFlameMaterial, flicker } from './look.js';
import { flameBox } from '../render/flame.js';
import { createHazeMaterial } from '../render/haze.js';
import { OVER, HEAT } from '../render/pipeline.js';

export const FIRE = {
  stones: 4, // to ring a pit
  lay: 1, // metres of log split to lay a fire
  feed: 0.5, // metres of log in an armful
  max: 3, // most wood a fire will take, metres
  burn: 300, // seconds a metre of wood burns for
  catch: 8, // seconds a fresh fire takes to catch properly
  embers: 150, // seconds the embers glow once the wood is gone
  ring: 0.55, // radius of the stone ring, metres
  trees: 2, // how far from a trunk a fire must be, for the branches' sake (m)
  apart: 2.6, // how far apart two fires must be (m)
};

const LIGHTS = 2; // fires near you that light the world around them
const HEARD = 2; // fires near you that you can hear
const HEARING = 40; // metres: beyond this a fire makes no sound
const SEEN = 70; // metres: beyond this, a fire's smoke and sparks aren't worth making

const fk = (x, z) => `${x},${z}`;
const r3 = (v) => Math.round(v * 1000) / 1000;
const smooth = (t) => t * t * (3 - 2 * t);

// What a fire is doing at `now` (ms since the epoch).
// -> { state, fuel, heat, age }
//    state: 'ring' | 'laid' | 'burning' | 'embers' | 'cold'
//    fuel:  metres of wood left on it
//    heat:  0..1, how hard it burns or how bright the embers are
//    age:   seconds since it was lit
//
// A fire's `ash` is 0 for a clean pit, 1 once something has burned in it, and
// 2 when the wood stood in it is what was left when a fire was put out.
export function fireState(f, now = Date.now()) {
  if (!f.lit) return { state: f.wood > 0.01 ? 'laid' : f.ash ? 'cold' : 'ring', fuel: f.wood, heat: 0, age: 0 };
  const age = Math.max(0, (now - f.lit) / 1000);
  const fuel = f.wood - age / FIRE.burn;
  if (fuel > 0) {
    const caught = smooth(Math.min(1, age / FIRE.catch));
    // a fire with plenty on it burns tall; one down to its last stick, low
    const heat = Math.max(0.04, caught * (0.4 + 0.6 * Math.min(1, fuel / 1.2)));
    return { state: 'burning', fuel, heat, age };
  }
  const out = -fuel * FIRE.burn; // seconds since the last of the wood went
  if (out < FIRE.embers) return { state: 'embers', fuel: 0, heat: 1 - out / FIRE.embers, age };
  return { state: 'cold', fuel: 0, heat: 0, age };
}

export class Fires extends Emitter {
  // sky: the Sky, for how much firelight shows against the daylight (optional)
  // lights: the game's (render/lights.js), to give light by; without them
  //   (in a test) none is given
  // clock: () => ms since the epoch; the wall clock unless a test says otherwise
  /** @param {{ scene: THREE.Scene, solids: import('../world/solids.js').Solids, sky?: import('../world/sky.js').Sky | null, lights?: import('../render/lights.js').Lights | null, clock?: () => number }} options */
  constructor({ scene, solids, sky = null, lights = null, clock = Date.now }) {
    super();
    this.scene = scene;
    this.solids = solids;
    this.sky = sky;
    this.clock = clock;
    // Fresh firewood and the stones: the same vertex-coloured look as what
    // the builder puts up (and, with the same settings, the same shader).
    this.wood = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    this.list = new Map(); // "x,z" -> fire
    this.fx = new FireFx(scene);
    // a flame is a box the fire burns in (render/flame.js), and the air over
    // it shimmers (render/haze.js)
    this.flameGeo = flameBox();
    this.hazeMat = createHazeMaterial({ tall: 3.2 });
    // The light the nearest of them give: a fire is a spread-out source, not
    // a point, so a gentler falloff than the inverse square keeps the stones
    // beside it from burning out to white and lets the light reach the edge
    // of the clearing. Which of them are real lights, and which casts
    // shadows, the picture decides (render/lights.js).
    this.lights = [];
    for (let i = 0; i < LIGHTS; i++) {
      const l = { x: 0, y: 0, z: 0, color: [1, 0.55, 0.2], power: 0, range: 16, decay: 1.5 };
      if (lights) lights.add(scene, l);
      this.lights.push(l);
    }
    // The fires nearest you that are alight, nearest first, for the sound to
    // follow: [{ x, y, z, heat }]. Kept up to date by update().
    this.heard = [];
    this._near = [];
  }

  // ── Lookup ────────────────────────────────────────────────────────────────
  // The fire whose centre is nearest (x, z), within r.
  near(x, z, r) {
    let best = null;
    let bd = r;
    for (const f of this.list.values()) {
      const d = Math.hypot(f.x - x, f.z - z);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  }

  // The fire on grid node (x, z) as it stands now. Someone else's change
  // rebuilds the list, so a fire held across a swing is looked up again here.
  at(x, z) {
    return this.list.get(fk(x, z)) || null;
  }

  state(f, now = this.clock()) {
    return fireState(f, now);
  }

  // ── Changes ───────────────────────────────────────────────────────────────
  // A new ring of stones round a pit whose floor is at y.
  add(x, z, y) {
    const f = { x, z, y: r3(y), wood: 0, lit: 0, ash: 0 };
    this._add(f);
    this.emit('change');
    return f;
  }

  // Wood split and stood up in a ring that has no fire in it.
  lay(f, metres) {
    const st = this.state(f);
    if (st.state === 'burning' || st.state === 'embers') return false;
    if (st.state !== 'laid') f.ash = f.ash ? 1 : 0; // fresh wood, on whatever ash is there
    f.wood = r3((st.state === 'laid' ? f.wood : 0) + metres);
    f.lit = 0;
    this._changed(f);
    return true;
  }

  light(f) {
    if (this.state(f).state !== 'laid') return false;
    f.lit = this.clock();
    f.ash = Math.max(1, f.ash);
    this._changed(f);
    this.fx.sparks(f, 14, 1.4);
    return true;
  }

  // More wood on a burning fire, or on embers that are still hot enough to
  // take it up again. -> false if it can't
  feed(f, metres) {
    const st = this.state(f);
    if (st.state === 'burning') {
      if (st.fuel + metres > FIRE.max + 1e-6) return false;
      f.wood = r3(f.wood + metres);
    } else if (st.state === 'embers') {
      // Hot coals catch fresh wood quickly: start it most of the way caught.
      const head = FIRE.catch * 0.6;
      f.lit = this.clock() - head * 1000;
      f.wood = r3(metres + head / FIRE.burn);
    } else return false;
    this._changed(f);
    this.fx.sparks(f, 24, 2.2);
    return true;
  }

  // Earth kicked over it. What hadn't burned stays, charred, and will light
  // again. -> the state it was in, or null if there was nothing to put out
  douse(f) {
    const st = this.state(f);
    if (st.state !== 'burning' && st.state !== 'embers') return null;
    f.wood = st.state === 'burning' && st.fuel >= 0.1 ? Math.round(st.fuel * 10) / 10 : 0;
    f.lit = 0;
    f.ash = f.wood ? 2 : 1;
    this._changed(f);
    this.fx.steam(f);
    return st.state;
  }

  // Take the ring apart. -> metres of unburned wood left in it
  remove(f) {
    const st = this.state(f);
    const left = st.state === 'laid' ? f.wood : 0;
    this._dispose(f);
    this.list.delete(fk(f.x, f.z));
    this.emit('change');
    return left;
  }

  _changed(f) {
    f.shown = null; // re-pick which parts are showing
    this.emit('change');
  }

  // ── Building one ──────────────────────────────────────────────────────────
  _add(f) {
    const seed = phash(f.x, f.z, 41) * 1000;
    const g = new THREE.Group();
    g.position.set(f.x, f.y, f.z);
    g.rotation.y = phash(f.x, f.z, 43) * Math.PI * 2;

    const part = (fill, mat) => {
      const m = new Mesher();
      fill(m);
      const mesh = new THREE.Mesh(m.build(), mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    f.coalMat = createCoalMaterial(f.y);
    f.ring = part((m) => addFireRing(m, seed, FIRE.ring), this.wood);
    f.teepee = part((m) => addFirewood(m, seed), this.wood);
    f.coals = part((m) => addCoals(m, seed), f.coalMat);

    f.flameMat = createFlameMaterial(seed);
    f.flame = new THREE.Mesh(this.flameGeo, f.flameMat);
    f.flame.castShadow = false;
    f.flame.layers.set(OVER); // (it reads what's behind it: render/flame.js)
    f.flame.position.set(f.x, f.y + 0.02, f.z);
    f.haze = new THREE.Mesh(this.flameGeo, this.hazeMat);
    f.haze.layers.set(HEAT);
    f.flame.add(f.haze);
    this.scene.add(f.flame);

    f.group = g;
    f.shown = null;
    f.seed = seed;
    this.scene.add(g);
    this.list.set(fk(f.x, f.z), f);
    this._show(f, this.state(f));
  }

  _dispose(f) {
    this.scene.remove(f.group);
    this.scene.remove(f.flame);
    for (const m of [f.ring, f.teepee, f.coals]) m.geometry.dispose();
    f.coalMat.dispose();
    f.flameMat.dispose();
    this.solids.clear(f);
  }

  // Which parts show, and whether you can walk through it, for this state.
  _show(f, st) {
    const key = `${st.state}${f.ash}`;
    if (key === f.shown) return;
    f.shown = key;
    const s = st.state;
    f.teepee.visible = s === 'laid' || s === 'burning';
    // fresh wood looks like wood; wood that has been in a fire is charred
    f.teepee.material = s === 'laid' && f.ash < 2 ? this.wood : f.coalMat;
    f.teepee.scale.set(1, 1, 1);
    f.coals.visible = s !== 'ring' && !(s === 'laid' && !f.ash);
    f.flame.visible = s === 'burning';
    f.coalMat.userData.glow.value = 0;
    // A bare ring you can step into; one with wood or fire in it you walk
    // round (and can't stand on: its step is out of reach).
    if (s === 'ring' || s === 'cold') this.solids.clear(f);
    else this.solids.set(f, [{ ax: f.x, az: f.z, bx: f.x, bz: f.z, r: FIRE.ring, bottom: f.y - 0.3, topA: f.y + 0.6, topB: f.y + 0.6, step: -1e9 }]);
  }

  // ── Per frame ─────────────────────────────────────────────────────────────
  // eye: where the camera is (the lights and the sound follow what you can see)
  update(dt, eye) {
    const now = this.clock();
    const t = SHARED.uTime.value;
    const near = this._near;
    near.length = 0;
    for (const f of this.list.values()) {
      const st = fireState(f, now);
      this._show(f, st);
      const d = Math.hypot(f.x - eye.x, f.z - eye.z);
      if (st.state === 'burning') {
        const h = st.heat;
        const fl = flicker(t, f.seed);
        const wide = 0.45 + 0.45 * h;
        f.flame.scale.set(wide, (0.4 + 1.05 * h) * (0.92 + 0.16 * fl), wide);
        f.flameMat.uniforms.uHeat.value = h;
        // the teepee burns down as the wood goes, and falls in at the end
        const k = Math.min(1, st.fuel / FIRE.lay);
        f.teepee.visible = st.fuel > 0.12;
        f.teepee.scale.set(0.8 + 0.2 * k, 0.45 + 0.55 * k, 0.8 + 0.2 * k);
        f.coalMat.userData.glow.value = (0.45 + 0.75 * h) * (0.85 + 0.3 * fl);
        if (d < SEEN) this.fx.emit(f, st, dt);
      } else if (st.state === 'embers') {
        f.coalMat.userData.glow.value = Math.pow(st.heat, 1.4) * (0.9 + 0.2 * flicker(t * 0.4, f.seed));
        if (d < SEEN) this.fx.emit(f, st, dt);
      }
      if (st.state === 'burning' || st.state === 'embers') near.push({ f, st, d });
    }
    near.sort((a, b) => a.d - b.d);
    // (the air shimmers over a fire that's burning: render/pipeline.js, HEAT)
    this.scene.userData.heat = near.some((n) => n.st.state === 'burning' && n.d < SEEN);

    // Firelight. By day the sun swamps it; at night it's what you can see by.
    const sun = this.sky ? Math.min(1, this.sky.sun.intensity / 3.2) : 0;
    const night = Math.max(SKY.uNight.value, 1 - sun);
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const n = near[i];
      if (!n) {
        l.power = 0;
        continue;
      }
      const { f, st } = n;
      const fl = flicker(t, f.seed);
      const burning = st.state === 'burning';
      const power = burning ? 5 * st.heat * (0.82 + 0.3 * fl) : 0.9 * Math.pow(st.heat, 1.5) * (0.9 + 0.15 * fl);
      l.power = power * (0.3 + 0.7 * night);
      l.color[0] = 1;
      l.color[1] = burning ? 0.52 + 0.06 * fl : 0.3;
      l.color[2] = burning ? 0.2 : 0.07;
      l.x = f.x + (fl - 0.5) * 0.06;
      l.y = f.y + (burning ? 0.55 + 0.25 * st.heat : 0.25);
      l.z = f.z + (flicker(t * 1.3, f.seed + 9) - 0.5) * 0.06;
    }

    // What the sound should be crackling (see sound.js).
    const heard = this.heard;
    heard.length = 0;
    for (const n of near) {
      if (heard.length >= HEARD || n.d > HEARING) break;
      heard.push({ x: n.f.x, y: n.f.y, z: n.f.z, heat: n.st.state === 'burning' ? n.st.heat : n.st.heat * 0.2 });
    }

    this.fx.update(dt, this.sky);
  }

  // ── Persistence ───────────────────────────────────────────────────────────
  // [x, z, y, wood, lit, ash]: lit is when it was lit (ms), 0 if it isn't.
  // Nothing else is needed to know what it's doing at any moment.
  serialize() {
    return [...this.list.values()].map((f) => [f.x, f.z, r3(f.y), r3(f.wood), f.lit, f.ash]);
  }

  load(arr) {
    if (!Array.isArray(arr)) return;
    for (const d of arr) {
      if (!Array.isArray(d)) continue;
      const [x, z, y, wood, lit, ash] = d;
      if (![x, z, y].every(Number.isFinite) || this.list.has(fk(x, z))) continue;
      this._add({ x, z, y, wood: Number.isFinite(wood) ? Math.max(0, wood) : 0, lit: Number.isFinite(lit) ? lit : 0, ash: ash === 2 ? 2 : ash ? 1 : 0 });
    }
  }

  // Someone else's version of the fires: put theirs up instead of ours. There
  // are only ever a handful, so rebuilding them all is cheaper than working
  // out which one moved.
  adopt(arr) {
    for (const f of this.list.values()) this._dispose(f);
    this.list.clear();
    this.load(arr);
  }
}

// ── How fires are spelled in a save ─────────────────────────────────────────
// A fire is one element on its grid node: c:<x>:<z> -> [y, wood, lit, ash].
// This is the spelling the campfires were first saved with; keep it.
export const firesSave = {
  id: 'fires',
  scope: /** @type {const} */ ('world'),
  kinds: ['c'],
  encode(data, put) {
    for (const [x, z, y, wood, lit, ash] of Array.isArray(data) ? data : []) put(regionOf(x, z), `c:${x}:${z}`, [y, wood, lit, ash]);
  },
  decode() {
    const out = [];
    return {
      take(region, kind, rest, v) {
        const [x, z] = rest.split(':').map(Number);
        if (Array.isArray(v)) out.push([x, z, v[0], v[1], v[2], v[3]]);
      },
      done: () => out,
    };
  },
  validate: (raw) => (Array.isArray(raw) ? raw.filter(Array.isArray) : []),
};
