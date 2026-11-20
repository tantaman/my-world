// Folding someone else's changes into the world in front of you.
//
// The element map has already been updated by the time this runs; this is only
// about making what you can see match it. Ground is nudged vertex by vertex,
// because re-meshing the terrain would be far more work than the edit is. The
// forest and the buildings are simply put up again — there are only ever a
// handful of felled trees and cabins, and rebuilding them is cheaper than
// working out which course moved.

import { fromElements } from './regions.js';

export function applyRemote(ops, elements, parts, seed) {
  const { builder, marks } = parts;
  const steps = [];
  let bounds = null;
  let forest = false;
  let buildings = false;
  let marked = false;
  let name = null;

  for (const op of ops) {
    const kind = op.k.slice(0, op.k.indexOf(':'));
    if (kind === 't') {
      const [, x, z] = op.k.split(':');
      const ix = Number(x);
      const iz = Number(z);
      steps.push(builder.terrain.adopt(ix, iz, op.v ? op.v[0] : null, op.v ? op.v[1] : 0));
      bounds = grow(bounds, ix, iz);
    } else if (kind === 'r' || kind === 's' || kind === 'f') forest = true;
    else if (kind === 'p' || kind === 'l' || kind === 'o') buildings = true;
    else if (kind === 'm') marked = true;
    else if (op.k === 'name') name = op.v || '';
  }

  if (steps.length) {
    builder.terrain.applyLive(steps);
    // The turf changes where the ground does.
    if (bounds) builder.grass.invalidate(bounds[0] - 2, bounds[1] - 2, bounds[2] + 2, bounds[3] + 2);
  }
  if (forest || buildings || marked) {
    const whole = fromElements(seed, elements);
    if (forest) builder.forest.adopt(whole.world.forest);
    if (buildings) builder.buildings.adopt(whole.world.buildings);
    if (marked) marks.adopt(whole.marks);
  }
  return { name, ground: steps.length, forest, buildings, marked };
}

const grow = (r, x, z) => (r ? [Math.min(r[0], x), Math.min(r[1], z), Math.max(r[2], x), Math.max(r[3], z)] : [x, z, x, z]);
