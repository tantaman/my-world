// The blueprints that come with the game. Each is written as walls with
// openings rather than as a list of logs, so a door reads as a door; the
// result is an ordinary blueprint (see plan.js).
//
// Walls along x sit on the even levels (they take the sills) and walls along
// z on the odd ones. A door is an opening from level 2 up to 10 over a sill
// log that runs right across (you step over it), with a header at 12: about
// 1.6 m of headroom. Doorways are 2 m wide in round log, whose free ends
// would leave a 1 m opening too tight to walk through, and 1 m in timber.
// test/blueprints.test.js puts each of these up under the building rules.

import { normalize } from './plan.js';

const DOOR = [2, 10]; // levels a door is open over
const TOP_X = 12; // the last level of a wall along x
const TOP_Z = 11; // ...and along z

// Levels lo, lo + 2, … hi.
const levels = (lo, hi) => {
  const out = [];
  for (let k = lo; k <= hi; k += 2) out.push(k);
  return out;
};

// A wall of `kind` along `axis` on `line` from s0 to s1, one log per level,
// broken by openings [from, to, kLo, kHi]: no wood between nodes from and to
// on levels kLo to kHi.
function wall(kind, axis, line, s0, s1, openings = []) {
  const out = [];
  const ks = axis === 'x' ? levels(0, TOP_X) : levels(1, TOP_Z);
  for (const k of ks) {
    const gaps = openings.filter(([, , lo, hi]) => k >= lo && k <= hi).sort((a, b) => a[0] - b[0]);
    let at = s0;
    for (const [from, to] of gaps) {
      if (from > at) out.push([kind, axis, line, at, from, k]);
      at = Math.max(at, to);
    }
    if (s1 > at) out.push([kind, axis, line, at, s1, k]);
  }
  return out;
}

const door = (from, to) => [from, to, ...DOOR];

export const PLANS = [
  {
    name: 'Small cabin',
    footings: [[0, 0], [4, 0], [0, 3], [4, 3]],
    logs: [...wall('log', 'x', 0, 0, 4, [door(1, 3)]), ...wall('log', 'x', 3, 0, 4), ...wall('log', 'z', 0, 0, 3), ...wall('log', 'z', 4, 0, 3)],
    roofs: [[0, 0, 4, 3]],
  },
  {
    name: 'Cabin with windows',
    footings: [[0, 0], [5, 0], [0, 4], [5, 4]],
    logs: [
      ...wall('log', 'x', 0, 0, 5, [door(1, 3)]),
      ...wall('log', 'x', 4, 0, 5, [[2, 3, 6, 10]]), // a window at the back
      ...wall('log', 'z', 0, 0, 4, [[1, 3, 5, 9]]), // and a wide one on the side
      ...wall('log', 'z', 5, 0, 4),
    ],
    roofs: [[0, 0, 5, 4]],
  },
  {
    name: 'Two-room cabin',
    // stone under the middle wall as well as the corners
    footings: [[0, 0], [4, 0], [8, 0], [0, 5], [4, 5], [8, 5]],
    logs: [
      ...wall('log', 'x', 0, 0, 8, [door(1, 3), door(5, 7)]), // a door into each room
      ...wall('log', 'x', 5, 0, 8),
      ...wall('log', 'z', 0, 0, 5),
      ...wall('log', 'z', 4, 0, 5),
      ...wall('log', 'z', 8, 0, 5),
    ],
    // two gables side by side, ridges front to back
    roofs: [[0, 0, 4, 5], [4, 0, 8, 5]],
  },
  {
    name: 'Timber hut',
    footings: [[0, 0], [3, 0], [0, 3], [3, 3]],
    logs: [...wall('timber', 'x', 0, 0, 3, [door(1, 2)]), ...wall('timber', 'x', 3, 0, 3), ...wall('timber', 'z', 0, 0, 3), ...wall('timber', 'z', 3, 0, 3)],
    roofs: [[0, 0, 3, 3]],
  },
].map(normalize);
