// Every position and size in the set, named. PLAN.md section 4 is where the
// first numbers came from (estimated by eye from the original's stills);
// fitting them against the stills is what milestone 0 is for, so correct
// them here and nowhere else.
//
// Surveyed (tools/survey.mjs, from the points in tools/marks.mjs): the shop,
// canopy, columns, van, ice chest, sign, lamp row, road, fence, cow and the
// saucer's hover solved together with the camera at fifteen of the stills,
// about 9 px rms. The scale is the camera's height (EYE): nothing in the
// frames fixes it, and at 1.5 m the drums, the chest and the cow come out
// their real sizes while the canopy, lamps and van come out small.
//
// Axes: X along the road (the way the lamps go off into the fog), Y up, Z
// from the shop out across the forecourt, the road and the field. The origin
// is on the ground at the middle of the shop's front wall. Metres.

export const SHOP = {
  x0: -9, x1: 9, z0: -7, z1: 0,
  wall: 2.92,          // eaves height: under the cornice
  parapet: 4.32,       // top of the parapet
  band: 0.72,          // height of the dark green band at the foot of the wall: up to the sill (17 s, 27 s)
  // The glazed part of the front, and the door in it.
  // (Surveyed from 07 and 18: one mullion west of the door, the door just
  // west of the van's tail, which stands before the glass east of it.)
  glass: { x0: -3.6, x1: 6, sill: 0.75, head: 2.6, mullions: [-3.6, -1.8, -0.35, 0.55, 3.0, 6] },
  door: { x0: -0.35, x1: 0.55 },
  shutterBox: { y: 2.62, h: 0.28, d: 0.35 },
  // The west end wall's door and lamp: the warm patch on the left of 01.
  westDoor: { x: -9, z: -2.2, w: 1.0, h: 2.15 },
  westLamp: { x: -9.15, y: 2.7, z: -2.2 },
  wallLamp: { x: -5.6, y: 2.6, z: 0.12 },  // the caged lamp on the front
  vent: { x: -6.5, z: -4.5, w: 0.7, h: 1.8 },
  mast: { x: -5.0, z: -3.5, h: 2.6 },
};

export const CANOPY = {
  x0: -3.83, x1: 7.52, z0: 0, z1: 9.47,
  under: 3.84,         // underside
  thick: 0.52,
  // Twin-tube lights on the underside: [x, z, turned (radians)], surveyed
  // from 01-06 and 09: one across the west bay, one along X out by the
  // front (seen end on from 01 and 04), one across the east bay.
  tubes: [[-2.2, 3.36, Math.PI / 2], [0.45, 7.48, 0], [5.7, 3.97, Math.PI / 2]],
  crooked: 1,          // index of the tube that hangs crooked
};

// Where the columns stand; each island is laid along X round its column.
export const ISLANDS = [
  { x: -1.78, z: 5.94 },
  { x: 5.07, z: 6.0 },
];
// The drum stands against the column's west foot (24, 36, 38, 40 s); from
// 06 and 09 it lines up in front of the column a little toward the shop
// (drumDz, metres in z; small.js stands it 0.1 m toward the road).
export const ISLAND = { len: 4.2, wid: 1.3, h: 0.18, column: 0.45, pumpDx: 0.9, drumDx: -0.6, drumDz: -0.1 };
export const PUMP = { w: 0.75, d: 0.5, h: 1.9 };

// Parked at a slant, nose toward the road: its side faces the forecourt from
// 01 and 04, its rear doors the camera at 33-40 s. Smaller than a real panel
// van, as surveyed (held at 5.2 x 2.0 it misses its marks by 15-40 px).
export const VAN = { x: 3.2, z: 2.01, heading: -0.36, len: 4.18, wid: 1.74, h: 2.1 };
export const BENCH = { x: -1.5, z: 0.6, len: 1.8 };
export const DRUM_SHOP = { x: -3.2, z: 0.45 };
export const ICE = { x: -6.48, z: 0.59, w: 1.9, d: 1.0, h: 1.05 };
export const BIN = { x: -8.0, z: 0.5 };
export const PHONE = { x: -3.95, z: 0.12 };

export const FORECOURT = { x0: -30, x1: 24, z0: 0, z1: 11.0, slab: 4 };

// The welcome sign: an arrow of rusty sheet on two posts, facing south-west,
// low on the verge about a metre from the road's edge.
export const SIGN = { x: -9.63, z: 11.12, yaw: -1.81, w: 2.92, h: 1.31, y: 0.37 };

// On the verge at the road's edge. Lamp 1 (x -3.6) is the near one in 01
// and the one beside the camera for the abduction; lamp 0 is never seen.
export const LAMPS = {
  z: 12.01, x0: -18.54, step: 14.92, count: 25,
  pole: 5.44, arm: 0.68,
};
export const lampX = (k) => LAMPS.x0 + LAMPS.step * k;

export const ROAD = { z0: 12.19, z1: 17.5, centre: 14.85, half: 400 };
export const VERGE = { z0: 11.0, z1: 12.19 };
export const SHOULDER = { z0: 17.5, z1: 20.5 };
export const FENCE = { z: 26.7, step: 4, post: 1.2, x0: -120, x1: 120 };
export const COW = { x: 5.51, z: 28.69, shoulder: 1.45, yaw: 0.25 };
export const TREES = { z0: 32, z1: 170, x0: -160, x1: 220 };
export const POWER = { z: 60, x0: 40, step: 45, count: 6 };

// Where the saucer hovers: above the cow, the middle of its rim surveyed
// 13.3 m up (y is the bottom of its lip, 1.46 m below: ufo/saucer.js).
export const UFO = { x: 5.51, y: 11.85, z: 28.69, radius: 5.5, depth: 2.4 };

export const EYE = 1.5;  // chest height of the camera
