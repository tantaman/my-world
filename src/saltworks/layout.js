// A walled saltworks with two relay yards and an offset settling basin.
// Dimensions and collision boxes are shared by the renderer and match.
export const NAME = 'Saltworks';
export const TEAMS = ['Runners', 'Wardens'];
export const COLORS = [0xffa752, 0x58d5df];
export const WIDTH = 68;
export const LENGTH = 56;

const box = (x0, z0, x1, z1, y1, kind, y0 = 0) => ({ x0, z0, x1, z1, y0, y1, kind });

export const BARRIERS = [
  box(-35, -29, -34, 29, 4.5, 'wall'), box(34, -29, 35, 29, 4.5, 'wall'),
  box(-34, -29, 34, -28, 4.5, 'wall'), box(-34, 28, 34, 29, 4.5, 'wall'),
  // Settling basin and its pump house
  box(-10, -7, 7, 4, 1.2, 'basin'),
  box(-9, -8, -6, 2, 6.4, 'building'),
  box(1, 4, 7, 12, 5.6, 'building'),
  // West: packing yard, sheds, and stacked salt
  box(-33, 5, -22, 9, 5.2, 'building'),
  box(-22, -24, -16, -12, 6.2, 'building'),
  box(-15, -2, -12, 10, 3, 'wall'),
  box(-31, -14, -28, -11, 1.25, 'crate'),
  box(-26, -2, -23, 0, 1.9, 'crate'),
  box(-21, 13, -16, 17, 1.15, 'crate'),
  box(-12, 18, -5, 22, 4.6, 'building'),
  // East: drying beds and an open-ended covered yard
  box(13, -25, 18, -10, 5.7, 'building'),
  box(17, -4, 21, 1, 2.6, 'wall'),
  box(27, -6, 33, -2, 3.6, 'building'),
  box(18, 10, 33, 13, 5, 'building'),
  box(11, 16, 14, 20, 1.2, 'crate'),
  box(27, 16, 31, 20, 1.9, 'crate'),
  box(24, -21, 28, -18, 1.15, 'crate'),
  box(-4, -17, 3, -15, 1.2, 'crate'),
];

export const COLLISION = {
  boxes: [box(-35, -29, 35, 29, 0, 'floor', -2), ...BARRIERS],
};

export const RELAYS = [
  { label: 'A', name: 'Packing Yard', x: -24, z: -7, r: 3.6 },
  { label: 'B', name: 'Drying Terrace', x: 25, z: 5.5, r: 3.6 },
];

export const SPAWNS = [[6, 9, 12, 15, 18], [-13, -10, -7, -4, -1]].map((row, team) =>
  row.map((x, i) => ({ x, z: (team === 0 ? 1 : -1) * (24 + (i % 2) * 1.7), yaw: team * Math.PI })),
);

export const OVERLOOK = { x: 0, y: 15, z: 19, yaw: 0, pitch: -0.55 };

export function relayAt({ x, y, z }) {
  return y < 1.5 ? RELAYS.findIndex((p) => Math.hypot(x - p.x, z - p.z) <= p.r) : -1;
}
