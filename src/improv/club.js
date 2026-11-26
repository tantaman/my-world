// The DC Improv, where it is and what's where in it: its door on
// Connecticut Avenue, and downstairs the lobby, the Main Showroom and the
// Lounge, laid out in the club's own frame (world/frame.js), and that
// downstairs as somewhere to be (a space: world/spaces.js).
//
// Where: 1140 Connecticut Avenue NW, between L and M Streets, in the
// Golden Triangle (OpenStreetMap's DC Improv, node 739528094: 38.90497 N,
// 77.04113 W). The door is on the front of the building the city surveyed
// there, facing the avenue, as near the club as that front comes; the club
// is downstairs, under the building, as it is.
//
// The club's frame: its origin is the door, on the building's front at
// street level, and +z goes in, under the building; x is across. The rooms
// are DEPTH under the street. Nothing here is drawn (look.js does that);
// this is what the space, the act key, the people and the tests go by.
//
// No three.js in here.

import { toWorld, toLocal } from '../world/frame.js';

// The door: game m from the middle of Washington's real place (its card in
// world/hikes.js, as the city's tiles are), and which way is in.
export const DOOR = { x: -2299.6, z: -1266.8, yaw: -1.1422 };
export const ADDRESS = '1140 Connecticut Avenue NW';

export const DEPTH = 4.8; // m from the street down to the club's floor

// The rooms, in the club's frame: [x0, z0, x1, z1] and how high the ceiling
// is over the floor (m).
export const ROOMS = {
  lobby: { name: 'the lobby', box: [-5, 1, 5, 9], ceiling: 3.2 },
  main: { name: 'the Main Showroom', box: [-9, 9, 9, 32], ceiling: 4.4 },
  lounge: { name: 'the Lounge', box: [5, 1, 17, 9], ceiling: 3.4 },
};
// The ways between them: strips that run a little into each room either
// side of the wall they go through.
export const DOORWAYS = [
  { between: ['lobby', 'main'], box: [-1.6, 8.3, 1.6, 9.7] },
  { between: ['lobby', 'lounge'], box: [4.3, 4.2, 5.7, 6.4] },
];
// The stages (their front edge is a wall to the audience), and how high.
export const STAGES = {
  main: { box: [-6.5, 27.5, 6.5, 32], h: 0.65, facing: -1 },
  lounge: { box: [14.6, 1.6, 17, 8.4], h: 0.35, facing: -1 },
};
// What else is in the way: counters and the bar ([x0, z0, x1, z1], how high).
export const COUNTERS = [
  { what: 'the box office', box: [-5, 2.8, -3.6, 6.4], h: 1.1 },
  { what: 'the bar', box: [3.2, 9, 8.8, 10.2], h: 1.1 },
];

// Where you come down the stairs, and where you go back up.
export const STAIRS = { x: 0, z: 2.1, foot: { x: 0, z: 1.4 } };
// On the street: where you stand at the door, and its reach.
export const STREET = { x: 0, z: -1.9, reach: 2.6 };

// The marks on each stage: where a performer stands (x, z in the club's
// frame) and which way they face (yaw in the club's frame). The audience
// faces each stage.
export const MARKS = {
  main: {
    mic: { x: 0, z: 28.7, yaw: Math.PI },
    left: { x: -1.5, z: 29.2, yaw: Math.PI },
    right: { x: 1.5, z: 29.2, yaw: Math.PI },
    back: [{ x: -3, z: 31.2 }, { x: -1, z: 31.2 }, { x: 1, z: 31.2 }, { x: 3, z: 31.2 }],
    wings: { x: -6.2, z: 31.1 },
    stool: { x: 1.1, z: 29.6 },
  },
  lounge: {
    mic: { x: 15.3, z: 5.0, yaw: -Math.PI / 2 },
    left: { x: 15.5, z: 3.6, yaw: -Math.PI / 2 },
    right: { x: 15.5, z: 6.4, yaw: -Math.PI / 2 },
    back: [{ x: 16.5, z: 2.6 }, { x: 16.5, z: 4.0 }, { x: 16.5, z: 6.0 }, { x: 16.5, z: 7.4 }],
    wings: { x: 16.6, z: 1.8 },
    stool: { x: 15.9, z: 5.9 },
  },
};

// The tables in the Main Showroom (two seats behind each, facing the stage),
// and the Lounge's rows of chairs. A seat: { x, z, yaw, room, table? }
const TABLE = 0.36; // m: half a table's side
export const TABLES = [];
export const SEATS = [];
for (const z of [13, 15.3, 17.6, 19.9, 22.2, 24.5]) {
  for (const x of [-7.2, -4.6, -2.1, 2.1, 4.6, 7.2]) {
    const t = { x, z, r: TABLE };
    TABLES.push(t);
    for (const s of [-0.34, 0.34]) SEATS.push({ x: x + s, z: z - 0.62, yaw: 0, room: 'main', table: t });
  }
}
for (const x of [7, 8.4, 9.8, 11.2, 12.6]) {
  for (let k = 0; k < 7; k++) {
    const z = 1.9 + k * 0.9 + (k >= 4 ? 0.5 : 0); // (an aisle up the middle)
    SEATS.push({ x, z, yaw: Math.PI / 2, room: 'lounge' });
  }
}

// Which room (x, z) in the club's frame is in, or null.
export function roomAt(x, z) {
  for (const [id, r] of Object.entries(ROOMS)) {
    const [x0, z0, x1, z1] = r.box;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return id;
  }
  return null;
}

// ── Where it is in the world ────────────────────────────────────────────────
// The club's frame in the world, from the middle of Washington's real place
// (card.at) and the street's height at the door: { x, z, yaw, y (the
// street), floor (the club's) }
export function siteOf(at, street) {
  return { x: at[0] + DOOR.x, z: at[1] + DOOR.z, yaw: DOOR.yaw, y: street, floor: street - DEPTH };
}
export { toWorld, toLocal };

// ── Downstairs, as somewhere to be ──────────────────────────────────────────
// Its floor and ceiling, and its walls: the rooms' and the doorways', the
// stages' fronts, the counters. Lit (light 0.5): the house lights, dimmer
// than day, not dark enough to want a headlamp.
const ABOVE = 1.2; // m under the floor that feet still count as on it
const LIGHT = 0.5;
const _l = { x: 0, z: 0 };
const _w = { d: 0, nx: 0, nz: 0 };

export class ClubSpace {
  constructor(site) {
    this.site = site;
    this.surface = 'carpet';
    this.club = true;
    const rects = [...Object.values(ROOMS).map((r) => r.box), ...DOORWAYS.map((d) => d.box)];
    let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [a, b, c, d] of rects) {
      for (const [lx, lz] of [[a, b], [c, b], [a, d], [c, d]]) {
        const p = toWorld(site, lx, lz);
        [x0, z0, x1, z1] = [Math.min(x0, p.x), Math.min(z0, p.z), Math.max(x1, p.x), Math.max(z1, p.z)];
      }
    }
    Object.assign(this, { x0, z0, x1, z1 });
    this.rects = rects;
    this.blocks = [...Object.values(STAGES).map((s) => s.box), ...COUNTERS.map((c) => c.box)];
  }

  // Where (x, z) is: in the club's frame, and the highest ceiling over it
  // (or -Infinity if it's not in any room or doorway).
  _ceiling(x, z) {
    toLocal(this.site, x, z, _l);
    let c = -Infinity;
    for (const r of Object.values(ROOMS)) {
      const [a, b, cc, d] = r.box;
      if (_l.x >= a && _l.x <= cc && _l.z >= b && _l.z <= d) c = Math.max(c, r.ceiling);
    }
    if (c === -Infinity) for (const dw of DOORWAYS) if (_l.x >= dw.box[0] && _l.x <= dw.box[2] && _l.z >= dw.box[1] && _l.z <= dw.box[3]) c = 2.4;
    return c;
  }

  inside(x, z, y, out) {
    const c = this._ceiling(x, z);
    if (c === -Infinity) return false;
    const floor = this.site.floor;
    if (y < floor - ABOVE || y > floor + c) return false;
    out.floor = floor;
    out.roof = floor + c;
    return true;
  }

  // How far to the nearest wall, and the way out of it: the farthest any of
  // the rooms and doorways that (x, z) is in lets it go, then whatever's
  // standing in the room (a stage, a counter) nearer than that.
  walls(x, z, out) {
    toLocal(this.site, x, z, _l);
    let d = -Infinity;
    let nx = 0;
    let nz = 0;
    for (const [a, b, c, e] of this.rects) {
      if (_l.x < a - 1 || _l.x > c + 1 || _l.z < b - 1 || _l.z > e + 1) continue;
      inward(_l.x, _l.z, a, b, c, e, _w);
      if (_w.d > d) [d, nx, nz] = [_w.d, _w.nx, _w.nz];
    }
    for (const [a, b, c, e] of this.blocks) {
      outward(_l.x, _l.z, a, b, c, e, _w);
      if (_w.d < d) [d, nx, nz] = [_w.d, _w.nx, _w.nz];
    }
    // (back to the world's axes)
    const cs = Math.cos(this.site.yaw);
    const sn = Math.sin(this.site.yaw);
    out.d = d;
    out.nx = nx * cs + nz * sn;
    out.nz = -nx * sn + nz * cs;
  }

  air(x, y, z, m) {
    const c = this._ceiling(x, z);
    if (c === -Infinity) return false;
    const floor = this.site.floor;
    if (y < floor + m || y > floor + c - m) return false;
    this.walls(x, z, _w);
    return _w.d > m;
  }

  light() {
    return LIGHT;
  }
}

// How far (x, z) is inside the rectangle (< 0: outside it), and the way
// back in from its nearest side.
function inward(x, z, x0, z0, x1, z1, out) {
  const ds = [x - x0, x1 - x, z - z0, z1 - z];
  const k = ds.indexOf(Math.min(...ds));
  out.d = ds[k];
  out.nx = k === 0 ? 1 : k === 1 ? -1 : 0;
  out.nz = k === 2 ? 1 : k === 3 ? -1 : 0;
}

// How far (x, z) is outside the rectangle (< 0: in it), and the way out.
function outward(x, z, x0, z0, x1, z1, out) {
  const dx = Math.max(x0 - x, x - x1);
  const dz = Math.max(z0 - z, z - z1);
  if (dx > 0 || dz > 0) {
    const ex = Math.max(dx, 0);
    const ez = Math.max(dz, 0);
    const d = Math.hypot(ex, ez);
    out.d = d;
    out.nx = (ex * (x < x0 ? -1 : 1)) / d;
    out.nz = (ez * (z < z0 ? -1 : 1)) / d;
    return;
  }
  // in it: out by the nearest side
  inward(x, z, x0, z0, x1, z1, out);
  out.d = -out.d;
  out.nx = -out.nx;
  out.nz = -out.nz;
}
