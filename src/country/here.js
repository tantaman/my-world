// Which real place you're on or nearest, and what its weather is where you
// stand: a hike's, over the real Earth's (world/earth.js) out past the
// forest round the middle.

import { smoothstep } from '../noise.js';
import { SEA } from '../world/sea.js';
import { EARTH } from '../world/earth.js';

// m past a land's edge by which its weather has cleared
export const CLEARS_IN = 500;
// The weather in the forest's own country: none to speak of.
const CLEAR = { cover: 0, haze: 1, overcast: 0, floor: 0, deck: NaN, shade: 0 };
// On the Earth the cloud's billows are measured from the corner of the
// square this many m across that you're in (they shift when you cross into
// the next, which is a long way to go unnoticed).
const BILLOWS = 64000;

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
export function weatherAt(land, x, z, y, under = CLEAR) {
  const { cover: c0, haze: h0, overcast: o0, floor: f0 } = under;
  if (!land) return { cover: c0, haze: h0, overcast: o0, floor: f0 };
  const c = land.country;
  const on = 1 - smoothstep(0, CLEARS_IN, land.clearance(x, z));
  const own = deckHeight(land);
  // (whose cloud it is: the real place's, once you're more onto it than not)
  const mine = on > 0.5;
  const deck = mine ? own : under.deck;
  const cover = c0 + ((Number.isNaN(own) ? 0 : c.clouds.cover) - c0) * on;
  const shade = mine ? c.clouds.shade : under.shade;
  return { cover, haze: h0 + (c.haze - h0) * on, overcast: cover > 0 && y < deck ? shade * cover : 0, floor: f0 + (Math.min(0, land.offset) - f0) * on + 0 }; // (+ 0: no -0)
}

// Whose cloud is over you at (x, z), as weatherAt() has it: the real place's
// once you're more onto it than not, else the Earth's (under).
export function deckAt(land, x, z, under = CLEAR) {
  if (land && land.clearance(x, z) < CLEARS_IN / 2) return { deck: deckHeight(land), mid: [land.cx, land.cz] };
  return { deck: under.deck, mid: under.mid || (land ? [land.cx, land.cz] : null) };
}

// The weather of the Earth's own country `country`, where w (0..1) of
// (x, z) is the Earth's, with your eye at height y: as weatherAt() says it,
// and where its cloud's billows are measured from (mid).
export function earthWeather(country, w, x, z, y) {
  const c = country.clouds;
  const deck = c.deck === null ? NaN : SEA.level + c.deck * EARTH.scale;
  const cover = Number.isNaN(deck) ? 0 : c.cover * w;
  return {
    cover,
    haze: 1 + (country.haze - 1) * w,
    overcast: cover > 0 && y < deck ? c.shade * cover : 0,
    floor: 0,
    deck,
    shade: c.shade,
    mid: [Math.floor(x / BILLOWS) * BILLOWS, Math.floor(z / BILLOWS) * BILLOWS],
  };
}
