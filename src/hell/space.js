// Hell as somewhere to be: one space, a long way under the forest, as wide
// as the whole pit (world/landSpace.js is any land made in code as a space).
// Its floor is the land's (land.js), or the roadway of a bridge you're on;
// its roof is the dark, a long way up; its walls are whatever is too steep
// to climb, too deep to wade, or built (the wall of Dis, a castle's).

import { LandSpace } from '../world/landSpace.js';
import { WADE } from './plan.js';

const LID = 300; // m over the vestibule's floor: as high as anything flies

export class HellSpace extends LandSpace {
  constructor(land) {
    super(land, { id: 'hell', lid: LID, wade: WADE });
  }
}
