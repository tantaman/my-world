// Which way the wind blows: the one prevailing wind of the world, for
// whatever leans, drifts or flies with it (a fire's flames and smoke, a
// wildfire's front, the way a plane takes off and lands).
//
// x and y are the world's x and z (a Vector2 has no z); a unit vector.

import * as THREE from 'three';

export const WIND = new THREE.Vector2(1, 0.45).normalize();
