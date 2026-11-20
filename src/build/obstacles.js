// Things standing on the ground that work has to go round: trees, boulders,
// stumps, footings — and whatever a feature adds (a fire ring, a well).
//
// Each tool used to ask the forest and the buildings separately, so adding a
// new thing to the world meant editing every tool that might bump into it.
// Now whoever owns a kind of thing registers a source, and tools ask one
// question.
//
//   obstacles.addSource((x, z, R, out) => {      // from src/fires/index.js
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

export class Obstacles {
  constructor() {
    this.sources = [];
  }

  addSource(fn) {
    this.sources.push(fn);
  }

  // Everything within R of (x, z).
  near(x, z, R) {
    const out = [];
    for (const source of this.sources) source(x, z, R, out);
    return out;
  }
}
