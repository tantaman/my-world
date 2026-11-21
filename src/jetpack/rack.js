// Where the jetpack's rack stands at the launch site: on the pad, at the
// front (the side people come from), between the fuel tank and the rocket,
// facing them. It is placed in the pad's own frame (spaceport/site.js), so
// wherever the site is grown and however it's turned, the rack is with it,
// and everyone in a world finds it in the same place. Nothing about it is
// saved.
//
// No three.js in here: the tests read it.
//
//   rackAt(site) -> null where there's no launch site, or {
//     x, z, y   the foot of the rack in the world, on the top of the pad
//     yaw       which way it faces (its front, +z, the way the pad's does)
//     solid     a capsule for the world's Solids (world/solids.js)
//     front     { x, z, yaw }: where to stand to take it, facing it
//   }

import { toWorld } from '../landmarks/sites.js';
import { PAD } from '../spaceport/site.js';

// Where it is on the pad (m, the pad's frame), how wide and high it is, and
// how thick its posts are to bump into.
export const RACK = { x: -2.6, z: PAD - 2, width: 0.66, height: 1.75, r: 0.3 };
const FRONT = 1.3; // m in front of it to stand

export function rackAt(site) {
  if (!site) return null;
  const at = toWorld(site, RACK.x, RACK.z);
  const a = toWorld(site, RACK.x - RACK.width / 2, RACK.z - 0.08);
  const b = toWorld(site, RACK.x + RACK.width / 2, RACK.z - 0.08);
  const f = toWorld(site, RACK.x, RACK.z + FRONT);
  const top = site.top + RACK.height;
  return {
    x: at.x,
    z: at.z,
    y: site.top,
    yaw: site.yaw,
    solid: { ax: a.x, az: a.z, bx: b.x, bz: b.z, r: RACK.r, bottom: site.top - 0.3, topA: top, topB: top },
    front: { x: f.x, z: f.z, yaw: site.yaw + Math.PI },
  };
}
