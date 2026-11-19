// Dimensions and rules for building. Everything snaps to a world-aligned
// 1 m grid of "nodes" (integer x, z), which is also the terrain's finest
// vertex spacing, so digging and building line up exactly.
//
// Walls are stacked in half-courses, Lincoln-log style. A log at level k has
// its underside at y0 + k * HALF, where y0 is the top of the building's
// footings. Logs running along the building's "sill axis" sit on even
// levels, logs across it on odd levels, so wherever two walls cross, the
// upper log overlaps the lower by about half its depth. That overlap is the
// notch you cut with the axe.

export const HALF = 0.16; // half a course, metres
export const LOG_D = 0.34; // round log diameter (two halves plus a little, so courses touch)
export const TIMBER_H = HALF * 2; // hewn timbers stack flush
export const TIMBER_W = 0.24;
export const OVERHANG = { log: 0.3, timber: 0.1 }; // how far log ends run past a corner

export const PIER = { min: 0.1, max: 0.36, first: 0.22 }; // footing height above the ground
export const MAX_SPAN = 8; // longest single log, metres between nodes
export const MAX_LEVEL = 34; // half-courses, ~5.4 m of wall
export const JOIN_RADIUS = 14; // footings this close belong to the same building

export const ROOF = {
  pitch: (34 * Math.PI) / 180,
  overhang: 0.45,
  minWall: 1.7, // walls must be at least this high all round
  slack: HALF * 2 + 0.01, // and level to within a course
  cost: 0.7, // metres of timber per m² of floor
};

export const DIG = {
  radius: 1.25, // shovel brush
  rate: 0.55, // m/s at the centre of the brush
  maxCut: 1.6, // how far from natural ground you can dig or fill
};

export const height = (kind) => (kind === 'log' ? LOG_D : TIMBER_H);
// Height an unnotched log rides above where it would sit if notched.
export const raise = (kind) => height(kind) - HALF;
