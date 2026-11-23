// Where Purgatory is, from where Hell is: off from Hell's axis on the far
// side from its door, far enough that the two never meet, and lower down
// (its sea is DEPTH m under Hell's top); the road out of Hell comes up on
// the side of the island the sun rises on (Canto III: "the sun, that in
// our rear was flaming red").
//
// It is pinned (test/golden/purgatory-*.json), as Hell's gate is: someone
// who left off on the mountain is saved standing there, so it mustn't move.

import { R, EAST } from './plan.js';

const DEPTH = 2500; // m under Hell's top: the sea's surface
const APART = 2500; // m between the far edge of Hell and the island's reach

// hell: Hell's land (hell/land.js) -> { cx, cz, top, turn }, for MountLand
export function placeOf(hell) {
  const away = hell.turn + Math.PI;
  const off = hell.reach + R.reach + APART;
  return { cx: hell.cx + Math.cos(away) * off, cz: hell.cz + Math.sin(away) * off, top: hell.top - DEPTH, turn: EAST };
}
