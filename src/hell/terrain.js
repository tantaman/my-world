// The ground of Hell, drawn: the land (land.js) as tiles round whoever is
// looking, fine underfoot and coarser with distance (render/landTiles.js
// does that for any land made in code). What is Hell's own is the turns and
// the pit:
//
//   - from the vestibule down to the sand a circle doesn't close (land.js),
//     so a tile out there is built for a turn of the circles, and built
//     again when the turn where it lies is another;
//   - down in the pit, the circles over the brink can't be seen, and aren't
//     drawn.

import { LandTiles } from '../render/landTiles.js';
import { R, H, ONE, TAU } from './plan.js';

const _o = {};
const PIT = 150; // m over the foot of the great cliff: lower than this, you're in the pit
const BRINK = 120; // m past the brink: from in the pit, nothing further out is drawn

export class HellTerrain extends LandTiles {
  turnOf(x, z, ref) {
    const p = this.land.polar(x, z, ref, _o);
    return p.r > ONE ? Math.round(p.th / TAU) : 0;
  }

  hides(t, eye) {
    return eye.y < this.land.top + H.bolge + PIT && this.nearestToAxis(t) > R.brink + BRINK;
  }
}
