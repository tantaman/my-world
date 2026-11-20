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

// What the ground is made of in the country you're in (world/country.js):
// set by the country feature from the real place you're on or nearest. The
// terrain says, vertex by vertex, how far each applies (aLand), so in the
// forest these show nowhere.
export const LAND = {
  uTint: { value: new THREE.Color(1, 1, 1) }, // what grass green is multiplied by
  uDirt: { value: new THREE.Color(0.2, 0.135, 0.075) },
  uRock: { value: new THREE.Color(0.16, 0.155, 0.145) },
  uBareA: { value: new THREE.Color(0.2, 0.135, 0.075) },
  uBareB: { value: new THREE.Color(0.115, 0.078, 0.045) },
  uSand: { value: new THREE.Color(0.19, 0.16, 0.11) },
};

// A layer of cloud over the country you're in (world/country.js), drawn by
// the composite pass (pixelPipeline.js): from under it, a grey sky with the
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
