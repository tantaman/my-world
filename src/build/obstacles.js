// Things standing on the ground that work has to go round: trees, boulders,
// stumps, footings — and whatever a feature adds (a fire ring, a well).
//
// Each tool used to ask the forest and the buildings separately, so adding a
// new thing to the world meant editing every tool that might bump into it.
// Now whoever owns a kind of thing registers a source, and tools ask one
// question.
//
//   obstacles.addSource((x, z, R, out) => {      // from src/fires/index.ts
//     for (const f of fires.list.values()) out.push({ x: f.x, z: f.z, what: 'a fire ring', dig: 1.05, wall: 0.55, footing: 1.15, roof: 0.5 });
//   });
//
// An obstacle says how much room it needs for each kind of work, as a radius
// from its centre (leave one out and that work ignores it):
//
//   what      how to name it in a prompt: 'a pine', 'a stump'
//   dig       the shovel can't move ground this close (roots, the stone itself)
//   wall      a wall can't run this close
//   low       ...but only its lowest courses are stopped (a stump is short)
//   footing   a footing can't be set this close
//   roof      a roof can't go over it: no room whose floor comes this close
//   roofWhy   ...and why not, for the prompt ('no chimney')
//   clear     how it can be got out of the way, if it can: 'fell' (a standing
//             tree) or 'grub' (a stump). The blueprint foreman clears a site
//             of these; leave it out for anything that stays put (a fire ring).
//   grown     true for what the seed grows (a tree, a boulder, an old cabin),
//             as against what someone has put there since
//
// What is grown from the seed asks a narrower question, to know whether it
// is still there: has anyone put something on it?
//
//   obstacles.built(x, z, R)       // a footing, a fire ring, a stump: nothing grown
//
// and a source whose things are all grown says so, so that built() needn't
// ask it:
//
//   obstacles.addSource(fn, { grown: true });    // from src/roads/index.js
//
// That is more than a saving. A grown thing's source goes looking for what
// is near (a road's for the roads there, a dealership's for the towns), and
// what it hasn't found yet it sends for. Were built() to ask those, every
// road found would send for the dealerships beside it, each of those for its
// town's roads, and so on outward across the world without end.

// The same, for the type check: what a .ts feature's source is held to.
/**
 * @typedef {object} Obstacle
 * @property {number} x
 * @property {number} z
 * @property {string} what
 * @property {number} [dig]
 * @property {number} [wall]
 * @property {boolean} [low]
 * @property {number} [footing]
 * @property {number} [roof]
 * @property {string} [roofWhy]
 * @property {'fell' | 'grub'} [clear]
 * @property {boolean} [grown]
 */
/** @typedef {(x: number, z: number, R: number, out: Obstacle[]) => void} ObstacleSource */

export class Obstacles {
  constructor() {
    /** @type {ObstacleSource[]} */
    this.sources = [];
    // ...and those of them that may hold something not grown from the seed
    /** @type {ObstacleSource[]} */
    this.put = [];
  }

  // grown: everything this source gives is grown from the seed.
  /**
   * @param {ObstacleSource} fn
   * @param {{ grown?: boolean }} [what]
   */
  addSource(fn, { grown = false } = {}) {
    this.sources.push(fn);
    if (!grown) this.put.push(fn);
  }

  // Everything within R of (x, z).
  /** @returns {Obstacle[]} */
  near(x, z, R) {
    /** @type {Obstacle[]} */
    const out = [];
    for (const source of this.sources) source(x, z, R, out);
    return out;
  }

  // What someone has put within R of (x, z): nothing the seed grows.
  /** @returns {Obstacle[]} */
  built(x, z, R) {
    /** @type {Obstacle[]} */
    const out = [];
    for (const source of this.put) source(x, z, R, out);
    return out.filter((o) => !o.grown);
  }
}
