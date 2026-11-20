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
export const SHARED = {
  uTime: { value: 0 },
  uWind: { value: 1 },
  uPlayer: { value: new THREE.Vector3() },
  uGrassRadius: { value: 40 },
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

// The water around the player's legs: how much it's stirred up (0..1), and
// how fast it's going past them (m/s, x and z: the current less your own
// way through it), which sets the wake.
export const WADE = { uWade: { value: 0 }, uWadeFlow: { value: new THREE.Vector2() } };
