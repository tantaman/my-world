// Which real place you're on or nearest, and what its weather is where you
// stand.

import { smoothstep } from '../noise.js';

// m past a land's edge by which its weather has cleared
const CLEARS_IN = 500;

// The land (world/landform.js) whose edge is nearest (x, z), or null if
// there are none. On one, that is the one you're on.
export function nearestLandform(landforms, x, z) {
  let best = null;
  let bestD = Infinity;
  for (const L of landforms) {
    const d = L.clearance(x, z);
    if (d < bestD) [best, bestD] = [L, d];
  }
  return best;
}

// How high (game m) a land's layer of cloud lies: its country says in real
// metres above the sea, and the land knows how its own heights were measured.
// NaN if it has none.
export function deckHeight(land) {
  const deck = land.country.clouds.deck;
  return deck === null ? NaN : land.offset + (deck - (land.def.base || 0)) * land.def.scale;
}

// The game height of a land's sea level: what its real heights are measured
// up from, as the beds in a sandstone country's cliffs are (render/glsl.js).
export function seaLevel(land) {
  return land.offset - (land.def.base || 0) * land.def.scale;
}

// The weather at (x, z) with your eye at height y, by the land you're
// nearest: { cover: how much cloud its layer has here (it thins out past the
// land's edge), haze: how thick the air is (1: the forest's), overcast: how
// much of the sun that cloud takes, which is none if you're over it, floor:
// the height the haze thins out up from (render/pipeline.js), which is the
// forest's (0), or the land's lowest ground where that is below it: down in a
// canyon cut into a plateau the air is as clear as on the forest floor, not
// as thick as it would be that far below it }.
export function weatherAt(land, x, z, y) {
  if (!land) return { cover: 0, haze: 1, overcast: 0, floor: 0 };
  const c = land.country;
  const on = 1 - smoothstep(0, CLEARS_IN, land.clearance(x, z));
  const deck = deckHeight(land);
  const cover = Number.isNaN(deck) ? 0 : c.clouds.cover * on;
  return { cover, haze: 1 + (c.haze - 1) * on, overcast: cover > 0 && y < deck ? c.clouds.shade * cover : 0, floor: Math.min(0, land.offset) * on + 0 }; // (+ 0: no -0)
}
