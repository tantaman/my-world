// What Purgatory looks like: everything that is built to be seen there,
// fetched the first time it's wanted (core/lazy.ts) — the road up out of
// Hell, or a save that left you on the mountain — so nobody who never goes
// fetches any of it.
//
//   const v = buildView({ land, space, group, models, materials });
//   v.update(dt, eye, here)   each frame you're there
//   v.settle(eye, x, z)       everything near, now (set down somewhere)
//
// It holds the ground (render/landTiles.js, drawn with look.js), what the
// ground is strewn with (furnish.js), what was built (built.js) and who is
// there to be met (people.js).

import { LandTiles } from '../render/landTiles.js';
import { Strewn } from '../world/strewn.js';
import { createMountGround, createMountLiquid } from './look.js';
import { makeKit, strew, CELL } from './furnish.js';
import { Built } from './built.js';
import { People } from './people.js';
import { SEA_REACH } from './land.js';

// The ground's tiles: big at the root, for the sea to the horizon, and
// half a metre to the vertex underfoot, for a terrace five metres wide.
const TILES = { root: 4096, levels: 8, range: SEA_REACH };
const STREWN = { near: 270, far: 350 }; // m: squares this near are furnished, and let go of this far off

// (models, materials: the forest's, world/: its trees grow on the top too)
export function buildView({ land, space, group, models, materials }) {
  const terrain = new LandTiles({ land, material: createMountGround(), liquid: createMountLiquid(), group, tiles: TILES });
  const strewn = new Strewn({ land, space, group, kit: makeKit({ models, materials }), strew, cell: CELL, ...STREWN });
  const built = new Built({ land, space, group });
  const people = new People({ land, group });
  return {
    terrain,
    strewn,
    built,
    people,
    // here: { r, th, h, hours, region, wiped }
    update(dt, eye, here) {
      terrain.update(eye.x, eye.y, eye.z, 0, 5);
      strewn.update(eye.x, eye.z, 0, 3);
      built.update(dt, eye, here);
      people.update(dt, eye, here);
    },
    settle(eye, x, z) {
      terrain.settle(eye.x, eye.y, eye.z, 0);
      strewn.settle(x, z, 0);
      built.update(0, eye, null);
    },
    // the light of the fires near the eye (render/lights.js)
    lightsNear(eye, out) {
      strewn.lightsNear(eye, out);
      built.lightsNear(eye, out);
    },
    // the angel at the foot of stair k + 1 has wiped a P
    angelAt(k) {
      people.wing(k);
    },
    // how far (m) the nearest tree of the sixth terrace is from (x, z)
    nearTree(x, z) {
      return built.nearTree(x, z);
    },
  };
}
