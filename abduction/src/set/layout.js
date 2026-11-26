// Every position and size in the set, named. PLAN.md section 4 is where the
// first numbers came from (estimated by eye from the original's stills);
// fitting them against the stills is what milestone 0 is for, so correct
// them here and nowhere else.
//
// Axes: X along the road (the way the lamps go off into the fog), Y up, Z
// from the shop out across the forecourt, the road and the field. The origin
// is on the ground at the middle of the shop's front wall. Metres.

export const SHOP = {
  x0: -9, x1: 9, z0: -7, z1: 0,
  wall: 3.4,           // eaves height
  parapet: 3.9,        // top of the parapet
  band: 0.55,          // height of the dark green band at the foot of the wall
  // The glazed part of the front, and the door in it.
  glass: { x0: -3.5, x1: 6, sill: 0.75, head: 2.6, mullions: [-3.5, -1.1, 1.3, 3.0, 4.2, 6] },
  door: { x0: 3.0, x1: 4.2 },
  shutterBox: { y: 2.75, h: 0.4, d: 0.35 },
  // The west end wall's door and lamp: the warm patch on the left of 01.
  westDoor: { x: -9, z: -2.6, w: 1.0, h: 2.15 },
  westLamp: { x: -9.15, y: 2.7, z: -2.6 },
  wallLamp: { x: -5.6, y: 2.75, z: 0.12 },  // the caged lamp on the front
  vent: { x: -6.5, z: -4.5, w: 0.7, h: 1.6 },
  mast: { x: -5.0, z: -3.5, h: 3.4 },
};

export const CANOPY = {
  x0: -3, x1: 14, z0: 0, z1: 12,
  under: 4.5,          // underside
  thick: 0.6,
  // Twin-tube lights on the underside: [x, z, turned (radians)]. One hangs crooked.
  tubes: [[2.5, 5.0, 0], [9.5, 5.5, 0], [5.8, 9.5, 0], [11.5, 2.5, Math.PI / 2]],
  crooked: 3,          // index of the tube that hangs crooked
};

export const ISLANDS = [
  { x: 1.5, z: 8 },
  { x: 9.5, z: 8 },
];
export const ISLAND = { len: 4.2, wid: 1.3, h: 0.18, column: 0.45, pumpDx: 0.9, drumDx: -1.4 };
export const PUMP = { w: 0.75, d: 0.5, h: 1.9 };

export const VAN = { x: 7.0, z: 2.3, heading: 0.04, len: 5.2, wid: 2.0, h: 2.1 };
export const BENCH = { x: -0.5, z: 0.6, len: 1.8 };
export const DRUM_SHOP = { x: -2.2, z: 0.6 };
export const ICE = { x: -6.6, z: 0.75, w: 1.9, d: 1.0, h: 1.05 };
export const BIN = { x: -8.0, z: 0.5 };
export const PHONE = { x: -4.3, z: 0.12 };

export const FORECOURT = { x0: -30, x1: 24, z0: 0, z1: 13.5, slab: 4 };

// The welcome sign: an arrow of rusty sheet on two posts, facing south-west.
export const SIGN = { x: -12.2, z: 11.4, yaw: -2.3, w: 3.2, h: 1.2, y: 1.15 };

// Fitted (tools/fit.mjs) to 01, 13 and 18: closer together than PLAN.md's
// first guess, on the verge, one just ahead and left of where the camera
// stands for the abduction.
export const LAMPS = {
  z: 14.7, x0: -11.35, step: 10.25, count: 24,
  pole: 5.5, arm: 0.9,
};
export const lampX = (k) => LAMPS.x0 + LAMPS.step * k;

export const ROAD = { z0: 15.2, z1: 22.2, centre: 18.7, half: 400 };
export const VERGE = { z0: 13.5, z1: 15.2 };
export const SHOULDER = { z0: 22.2, z1: 25.2 };
export const FENCE = { z: 25.2, step: 4, post: 1.2, x0: -120, x1: 120 };
export const COW = { x: 1, z: 26.8, shoulder: 1.45, yaw: 0.25 };
export const TREES = { z0: 32, z1: 170, x0: -160, x1: 220 };
export const POWER = { z: 60, x0: 40, step: 45, count: 6 };

// Where the saucer hovers: above the cow, hull 12 m up.
export const UFO = { x: 1, y: 12, z: 26.8, radius: 5.5, depth: 2.4 };

export const EYE = 1.5;  // chest height of the camera
