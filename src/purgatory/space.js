// Purgatory as somewhere to be: one space, a long way under the forest and
// off to one side of Hell, as wide as the island (world/landSpace.js is any
// land made in code as a space). Its floor is the land's (land.js); its roof
// is the sky, as high as anything flies; its walls are whatever is too
// steep to climb, the sea where it is too deep to wade, and the gate's door
// while it is shut.
//
// And the law of the mountain (Canto VII): after the sun is gone, nobody
// goes up. "Not that aught else would hindrance give, however, to going up,
// save the nocturnal darkness." While `ceiling` is set (a height, world m),
// ground higher than it is a wall like any other: you can go down, and
// round, "while the horizon holds the day imprisoned", but not up.

import { LandSpace } from '../world/landSpace.js';
import { WADE, R } from './plan.js';

const LID = 1400; // m over the sea: as high as anything flies
const NOT_UP = 1000; // m: what ground over the ceiling counts as, to whoever would climb it

export class MountSpace extends LandSpace {
  constructor(land) {
    super(land, { id: 'purgatory', lid: LID, wade: WADE, reach: R.reach });
    this.surface = 'grass';
    // the most you can be at, just now (world m): Infinity by day
    this.ceiling = Infinity;
  }

  _felt(x, z) {
    const h = super._felt(x, z);
    return h > this.ceiling ? h + NOT_UP : h;
  }
}
