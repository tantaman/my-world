// The gate's ground in the forest: what the forest does for it once it's
// known where the gate stands.
//
//   the plants under its slab are hidden as their chunk comes into view
//   grass doesn't grow on it
//   building goes round it
//   it is a place on the map, and can be looked up in Routes
//
// Nothing about the land changes for it (site.js). Until the gate has a
// place (index.ts decides it, once what might be in its way has been found)
// none of this does anything; `settle(site)` is when it starts to.
//
// Handed what it needs of the game, so it knows nothing else of it:
//   chunks, grass, builder, map    the forest's, the tools', the map's
//   start     where people first arrive
//   reach     how far from there the gate can be (m)
//   visited   () => whether you've been
//   decide    () => the site, found now if it hasn't been (asked for by its id)

import { onPlan, planDiscs, toWorld } from '../world/frame.js';
import { VEG_STRIDE } from '../world/flora.js';
import { PendingNearest } from '../core/nearest.js';
import { NAME, FRONT } from './site.js';

// How far (m) plants of each kind are kept back from the slab.
const KEEP_BACK = { pine: 1.8, broad: 2, birch: 1.4, bush: 0.7, fern: 0.25, rock: 1.1, log: 2.4 };
const SCALED = { rock: true, log: true };
// an archway, on the map's badge
const GLYPH = ['#######', '#.###.#', '#.#.#.#', '#.#.#.#', '#.#.#.#', '#.#.#.#', '#.#.#.#'];
const SEARCH_WORDS = 'skirmish match shooter arena bots five a side raiders wardens'; // what the gate is found by in Routes, besides its name
export const SITE_NAME = `${NAME} gate`;

export class Grounds {
  constructor({ chunks, grass, builder, map, start, reach, visited, decide }) {
    this.chunks = chunks;
    this.grass = grass;
    this.visited = visited;
    this.site = null;
    this.discs = []; // over its slab and sides, once it's somewhere
    this.place = null;
    this.decided = false;

    chunks.on('vegetation', (ch) => this.site && this._clear(ch));
    grass.addClearing((x0, z0, x1, z1) => {
      const s = this.site;
      if (!s || s.box[0] > x1 || s.box[2] < x0 || s.box[1] > z1 || s.box[3] < z0) return null;
      return (x, z) => onPlan(s, x, z, 0.1, s.cleared);
    });
    builder.obstacles.addSource((x, z, R, out) => {
      for (const d of this.discs) {
        if (Math.hypot(d.x - x, d.z - z) > R + d.r + 1) continue;
        out.push({ x: d.x, z: d.z, what: 'the gate', dig: d.r + 0.3, wall: d.r + 0.2, footing: d.r + 0.5, roof: d.r, grown: true });
      }
    });
    map.places.addSource({
      within: (x0, z0, x1, z1) => {
        const p = this.asPlace();
        return p && p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1 ? [p] : [];
      },
      get: (id) => (String(id).startsWith('skirmish:') && decide() && id === this.site.id ? this.asPlace() : null),
      // (looked up in Routes by name or by what it is, once it's been found)
      nearest: (x, z) => new PendingNearest(x, z, () => (this.decided ? this.asPlace() : undefined), Math.max(0, Math.hypot(x - start.x, z - start.z) - reach)),
    });
  }

  // The gate stands here (or, null, nowhere): from now on the forest makes way.
  settle(site) {
    this.decided = true;
    this.site = site;
    if (!site) return;
    this.discs = planDiscs({ ...site, plan: site.cleared }, 2);
    for (const ch of this.chunks.chunks.values()) this._clear(ch);
    this.grass.invalidate(...site.box);
  }

  _clear(ch) {
    const s = this.site;
    const S = this.chunks.size;
    const x0 = ch.cx * S;
    const z0 = ch.cz * S;
    if (!ch.vegLists || s.box[0] > x0 + S + 3 || s.box[2] < x0 - 3 || s.box[1] > z0 + S + 3 || s.box[3] < z0 - 3) return;
    for (const kind in ch.vegLists) {
      const list = ch.vegLists[kind];
      for (let o = 0, k = 0; o < list.length; o += VEG_STRIDE, k++) {
        const scale = list[o + 4];
        if (scale <= 0) continue;
        const back = (KEEP_BACK[kind] ?? 0.6) * (SCALED[kind] ? scale : 1);
        if (onPlan(s, list[o], list[o + 2], back, s.cleared)) this.chunks.hideInstance(ch, kind, k);
      }
    }
  }

  // Where it leads, and where `go here` sets you down: on the paving in front
  // of the archway, facing it. (In the archway you'd be in the town already.)
  asPlace() {
    const s = this.site;
    if (!s) return null;
    const visited = this.visited();
    if (this.place && this.place.visited === visited) return this.place;
    const corners = (rect) =>
      [
        [rect[0], rect[1]],
        [rect[2], rect[1]],
        [rect[2], rect[3]],
        [rect[0], rect[3]],
      ].map(([u, v]) => {
        const p = toWorld(s, u, v);
        return [p.x, p.z];
      });
    const front = toWorld(s, 0, FRONT);
    this.place = { id: s.id, x: front.x, z: front.z, yaw: s.yaw + Math.PI, name: SITE_NAME, kind: 'gate', note: 'five a side in a desert town: walk in to take a bot’s place', words: SEARCH_WORDS, glyph: GLYPH, visited, shape: [corners([-6.4, -1.1, 6.4, 1.1])], ground: [corners(s.cleared[0])] };
    return this.place;
  }
}
