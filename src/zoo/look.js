// What the zoo is built from, fetched the first time you come near it
// (index.js asks for it, core/lazy.ts): its plan, and the code that stands
// it up. Nothing here is needed anywhere else.
//
// new Zoo({ card, offset, ground, wet, water }): everything in it built, at
// its place in the world, and the animals in their pens.

import * as THREE from 'three';
import { Emitter } from '../core/events.js';
import PLAN from './plan.js';
import { Site, USE } from './site.js';
import { kindOf } from './species.js';
import { buildBuildings } from './buildings.js';
import { buildGrounds, madeOf } from './grounds.js';
import { buildFences, signSpots, buildSigns } from './fences.js';
import { Residents } from './residents.js';
import { Mesher } from '../build/geometry.js';
import { createBuildingMaterial } from '../build/surfaces.js';

export { PLAN };

// What a chunk's plants keep off, by what's on the ground (site.js's USE):
// how far (m) a tree keeps from a building, a path, a plaza or a fence. In
// a pen, only the small ones go: the animals have the trees they have.
export const KEEP = { building: 2.5, path: 1.2, plaza: 1, fence: 1 };

// Emits 'call' ({ kind, x, y, z }) when one of its animals calls.
export class Zoo extends Emitter {
  // card: the real place's (world/hikes.js); offset: its land's (the height
  // its plan's heights are measured from); ground(x, z); wet(x, z): whether
  // there's water there; water(x, z): the level of it, or NaN.
  //
  // It's built a little at a time (pump), a step being a few milliseconds:
  // until `ready`, nothing of it is in its group.
  constructor({ card, offset, ground, wet, water }) {
    super();
    // (laid out in the first step of building it: there from when it's ready)
    /** @type {Site} */
    this.site = /** @type {any} */ (null);
    this.group = new THREE.Group();
    this.group.name = 'zoo';
    this.ready = false;
    this.solids = {};
    this.obstacles = [];
    this.signs = [];
    /** @type {Residents} */
    this.residents = /** @type {any} */ (null);
    this.materials = {
      solid: createBuildingMaterial(),
      paving: createBuildingMaterial(),
      net: createBuildingMaterial(),
      glass: createBuildingMaterial(),
    };
    Object.assign(this.materials.paving, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    Object.assign(this.materials.net, { transparent: true, opacity: 0.42, depthWrite: false });
    Object.assign(this.materials.glass, { roughness: 0.15, metalness: 0.3 });
    this._steps = this._build({ card, offset, ground, wet, water });
  }

  // Build up to about ms more of it. → whether there's more to do.
  pump(ms) {
    const end = performance.now() + ms;
    while (!this.ready) {
      if (this._steps.next().done) this.ready = true;
      else if (performance.now() >= end) return true;
    }
    return false;
  }

  *_build({ card, offset, ground, wet, water }) {
    this.site = new Site(PLAN, { at: card.at, offset, ground, wet, kindOf, madeOf });
    this.residents = new Residents(this.site, { ground, water });
    this.residents.on('call', (c) => this.emit('call', c));
    yield;
    const site = this.site;
    const materials = this.materials;
    const meshes = [];
    // everything is built round the zoo's middle, and the meshes put there
    // (render/origin.js: nothing big goes to the graphics card); each mesh
    // is made in a step of its own
    const at = new THREE.Vector3(card.at[0], 0, card.at[1]);
    const pending = [];
    const add = (m, mat, opts) => pending.push([m, mat, opts]);
    const made = function* () {
      for (const [m, mat, { cast = true, receive = true } = {}] of pending.splice(0)) {
        if (!m || m.empty) continue;
        const mesh = new THREE.Mesh(m.build(at), mat);
        mesh.position.copy(at);
        mesh.castShadow = cast;
        mesh.receiveShadow = receive;
        meshes.push(mesh);
        yield;
      }
    };
    const b = yield* buildBuildings(site, ground);
    add(b.roofs, materials.solid);
    add(b.walls, materials.solid);
    add(b.glass, materials.glass, { cast: false });
    add(b.mesh, materials.net, { receive: false });
    yield* made();
    const g = yield* buildGrounds(site, ground);
    for (const p of g.paving) add(p, materials.paving, { cast: false });
    add(g.things, materials.solid);
    yield* made();
    const f = yield* buildFences(site, ground);
    add(f.walls, materials.solid);
    add(f.posts, materials.solid);
    add(f.net, materials.net, { receive: false });
    yield* made();
    this.signs = yield* signSpots(site);
    const signs = new Mesher();
    const letters = new Mesher();
    const signSolids = buildSigns(this.signs, ground, signs, letters);
    add(signs, materials.solid);
    add(letters, materials.solid, { cast: false });
    yield* made();
    yield* this.residents.populate();
    // what you bump into, and what a builder's tools go round
    this.solids = { buildings: b.solids, grounds: g.solids, fences: f.solids, signs: signSolids };
    this.obstacles = b.obstacles;
    for (const m of meshes) this.group.add(m);
    this.group.add(this.residents.group);
  }

  // Whether a plant at (x, z) is to go (a tree in the Panda House, a bush on
  // Olmsted Walk). small: a fern or a bush, not a tree or a rock.
  clears(x, z, small = false) {
    const s = this.site;
    const u = s.use(x, z);
    if (u & (USE.building | USE.path | USE.plaza | USE.fence)) return true;
    if (u & USE.pen && !small) return false;
    if (s.near(x, z, KEEP.building, USE.building)) return true;
    if (s.near(x, z, KEEP.path, USE.path | USE.plaza | USE.fence)) return true;
    return false;
  }
  // Whether grass grows at (x, z): not on what's paved or built.
  bare(x, z) {
    return (this.site.use(x, z) & (USE.building | USE.path | USE.plaza)) !== 0;
  }
  // What the paths and plazas are made of underfoot, for whatever asks
  // (world/paved.ts): the site's.
  paving(x, z) {
    return this.site.paving(x, z);
  }

  update(dt, eye) {
    this.residents.update(dt, eye);
  }

  dispose() {
    this.group.traverse((o) => o.isMesh && o.geometry.dispose());
    if (this.residents) this.residents.dispose();
    for (const m of Object.values(this.materials)) m.dispose();
  }
}
