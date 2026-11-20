// A small world with one of everything that can be saved, spelled the way the
// game has always kept it. If one of these shapes has to change, old saves
// have to keep opening: add a migration rather than editing the fixture.

export const SEED = 20261119;
export const NAME = 'Cabin by the pond';

// What the builder keeps under my-world:build:<seed>.
export const BUILD = {
  v: 1,
  inv: { log: 12.5, timber: 3, stone: 4, soil: 1.25 },
  datum: { x: 12, y: 4.2, z: 22 },
  // x, z, height offset, cleared — four numbers per moved vertex
  terrain: [10, 20, -0.42, 1, 11, 20, -0.4, 1, -3, -70, 0.25, 0.5, 64, 0, -0.1, 0, 63, -1, 0.05, 1],
  forest: {
    removed: { '0,0': ['pine@1234,5678', 'rock@100,200'], '-1,-2': ['fern@-700,-6500'], '1,0': ['birch@7025,300'] },
    stumps: [
      { kind: 'pine', x: 12.34, y: 3.21, z: 56.78, r: 0.41 },
      { kind: 'birch', x: 70.25, y: 2.4, z: 3, r: 0.22 },
    ],
    felled: [
      { kind: 'broad', x: 70.5, y: 2.1, z: 3.25, s: 1.1, yaw: 0.5, dir: 1.2, end: 1.5, state: 'limbed', total: 7, left: 3, r0: 0.44 },
      { kind: 'pine', x: -8.5, y: 1.05, z: -70.75, s: 0.9, yaw: 2.5, dir: -0.4, end: 1.48, state: 'down', total: 9.5, left: 9.5, r0: 0.29 },
    ],
  },
  buildings: [
    {
      y0: 4.2,
      sill: 'x',
      footings: [[10, 20, 3.98], [14, 20, 4.01], [10, 24, 4], [14, 24, 3.95]],
      logs: [
        ['log', 'x', 20, 10, 14, 0, []],
        ['log', 'x', 24, 10, 14, 0, []],
        ['log', 'z', 10, 20, 24, 1, [20, 24]],
        ['timber', 'z', 14, 20, 24, 1, [20]],
      ],
      roofs: [[10, 20, 14, 24, 6.1, 'x']],
    },
    {
      // stands across the line between two 64 m regions
      y0: 1.8,
      sill: 'z',
      footings: [[62, -30, 1.6], [66, -30, 1.62], [62, -26, 1.58], [66, -26, 1.65]],
      logs: [['timber', 'z', 62, -30, -26, 0, []], ['timber', 'z', 66, -30, -26, 0, []]],
      roofs: [],
    },
  ],
};

// What the map keeps under my-world:marks:<seed>.
export const MARKS = {
  marks: [
    { id: 'k3f9x1', x: 12.5, z: -40.1, name: 'the thinking spot', icon: 'idea', color: '#d9b45a', note: 'come back at dusk', created: 1763600000000 },
    { id: 'p0q8zz', x: -310, z: 88.4, name: '', icon: 'flag', color: '#4f8fd6', note: '', created: 1763600500000 },
  ],
  tracked: 'k3f9x1',
};

export const PLAYER = { x: 11.25, z: 21.5, yaw: 1.234, camYaw: -2.5, camPitch: 0.41 };
export const HOURS = 17.25;
