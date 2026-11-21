// Shader uniforms that more than one material reads: the time, the wind, where
// the player is, what the sky is doing. One object each, shared by reference,
// so setting a value once reaches every shader that uses it.
//
// They live with the renderer rather than with any one part of the world
// because everything that draws reads them: the terrain, the plants, the
// water, the sky, the particles, and the post-process that turns it all into
// pixels.

import * as THREE from 'three';

// Set every frame by the world (time, wind) and the player (where you are).
//
// uPlayer is a place, and like every uniform that is, it's set in world
// coordinates and slid with the scene while a frame is drawn (origin.js,
// which is also what sets uOrigin: where the drawing origin is in the world,
// wrapped to the patterns' period. See worldXZ() in glsl.js).
export const SHARED = {
  uTime: { value: 0 },
  uWind: { value: 1 },
  uPlayer: { value: new THREE.Vector3() },
  uGrassRadius: { value: 40 },
  uOrigin: { value: new THREE.Vector2() },
  uLines: { value: 1080 }, // how many lines tall the picture is drawn (set by the pipeline)
};

// Set every frame by the sky (world/sky.js) from the hour of the day.
export const SKY = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uZenith: { value: new THREE.Color() },
  uHorizon: { value: new THREE.Color() },
  uSunColor: { value: new THREE.Color() },
  uNight: { value: 0 }, // 0 by day .. 1 in the dead of night
  uTime: SHARED.uTime,
};

// What the ground is made of in each kind of country (world/country.js):
// one colour of each sort for every country, by its id, filled in once by
// the country feature. The terrain says, vertex by vertex, which country it
// is and how far its colours apply (aLand), so in the forest they show
// nowhere, and two places side by side each keep their own.
//
// A sandstone country's cliffs are banded by real height (ground.layers),
// so the ground also needs to know how the real place you're on stands in the
// game: uRealY, set by the country feature as you come onto one.
export const MAX_COUNTRIES = 10;
const each = (r, g, b) => ({ value: Array.from({ length: MAX_COUNTRIES }, () => new THREE.Color(r, g, b)) });
export const LAND = {
  uTint: each(1, 1, 1), // what grass green is multiplied by
  uDirt: each(0.2, 0.135, 0.075),
  uRock: each(0.16, 0.155, 0.145),
  uBareA: each(0.2, 0.135, 0.075),
  uBareB: each(0.115, 0.078, 0.045),
  uSand: each(0.19, 0.16, 0.11),
  // layers: the rock up high, and (at: real m, bed: real m, varnish, 1 if
  // there are layers at all)
  uUpper: each(0.16, 0.155, 0.145),
  uLayers: { value: Array.from({ length: MAX_COUNTRIES }, () => new THREE.Vector4(0, 1, 0, 0)) },
  // for the real place you're on: the game height of its sea level, and game
  // metres to a real one. (Heights aren't slid with the scene: origin.js.)
  uRealY: { value: new THREE.Vector2(0, 1) },
  uRubble: { value: new Array(MAX_COUNTRIES).fill(0) }, // how much of its bare ground is broken stone, 0..1
};

// A layer of cloud over the country you're in (world/country.js), drawn by
// the composite pass (pipeline.js): from under it, a grey sky with the
// hilltops lost in it; from over it, a sea of cloud. Set by the country
// feature. uDeckMid is a place (the middle of the real land it lies over,
// which its billows are measured from), slid with the scene like any other.
export const DECK = {
  uDeck: { value: 0 }, // m: how high it lies
  uDeckCover: { value: 0 }, // 0..1: how much of it is cloud; 0, and there is none
  uDeckMid: { value: new THREE.Vector2() },
};

// The water around the player's legs: how much it's stirred up (0..1), and
// how fast it's going past them (m/s, x and z: the current less your own
// way through it), which sets the wake.
export const WADE = { uWade: { value: 0 }, uWadeFlow: { value: new THREE.Vector2() } };

// The sea, and the water the camera may be under. uSea is set by the world
// from its land (far below everything in a land with no sea); the rest every
// frame by whoever follows the camera under water (src/underwater/).
export const UNDER = {
  uSea: { value: -1e4 }, // the sea's level (m)
  uUnder: { value: 0 }, // 1 with the camera under water, 0 in the air
  uUnderLevel: { value: 0 }, // the surface over the camera (m), while it is under
  uUnderSea: { value: 0 }, // 0 in fresh water .. 1 in the sea: clearer, and bluer
};
