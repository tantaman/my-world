// What is where in the video store, in its own frame (m): x across, from
// -HALF_W on the left (as you come in) to HALF_W on the right; z from the
// back wall to the glass front, which faces the car park; y up from the shop
// floor.
//
//   the back wall    NEW RELEASES, the whole length of it: the same box six
//                    or eight times along a shelf, row on row
//   the left wall    action and thrillers, and at the front, low shelves for
//                    the kids, with a television and two bean bags
//   four aisles      island shelves down the middle, a genre a side, a sign
//                    hung over each; staff picks on the ends that face the
//                    door, previously viewed tapes for sale on the far ends
//   the right wall   drama, and foreign films
//   the counter      along the right, at the front: the till, the return
//                    slot, sweets and popcorn in front of it, the tapes
//                    themselves on the wall behind
//
// Each run of shelving is a *face*: a flat front you stand at and look at,
// with boxes set out face on, in rows. A box's place is its *slot*: which
// face, which column along it from the left as you face it, and which row
// from the top. The tapes are put out in alphabetical order (ignoring "The"
// and "A"), bay by bay: along each shelf of a bay, top to bottom, then on to
// the next bay, as a video shop did it. On the new release wall a title's
// copies stand side by side on one shelf.
//
// No three.js in here: the tests read it, and so does what the store looks
// like (store.js) and what you can take down (index.js).
//
//   FACES     [face]: { id, section, x0, z0 (its left end, on its front),
//             ux, uz (to the right along it), nx, nz (out of it, at you),
//             cols, rows, y0 (the bottom of its lowest row), bay, kind,
//             depth (from its front back to its back) }
//   slotAt(face, col, row) -> { x, y, z }: the middle of the box's front
//   aim(face, x, y, z) -> { col, row } | null: the slot a point on the face is in
//   SECTIONS  the sections: their signs, and what's rented how
//   SOLIDS    the shelving, counter and so on, as rectangles to bump into
//   walkable(x, z) -> whether you could stand there (the tests check the
//             aisles are clear)

export const HALF_W = 12; // the inside of the side walls
export const BACK = -9; // the inside of the back wall
export const FRONT = 9; // the glass front
export const CEILING = 4; // m from the floor to the ceiling tiles
export const BOX = { w: 0.135, h: 0.24, d: 0.035 }; // a tape's box, a little bigger than life, to be read in pixels
export const DVD_BOX = { w: 0.135, h: 0.19, d: 0.015 }; // standard DVD keep case, m
export const SLOT = 0.17; // m along a shelf from one box to the next
export const ROW = 0.36; // m up from one shelf to the next
export const DOOR = { x0: -1.6, x1: 1.6 }; // the sliding doors in the glass front
export const GATE = { z: FRONT - 1.3, half: 1.25 }; // the security pillars, just inside the doors

// Which kinds of shelving there are: how deep, how tall, how many rows.
export const RACKS = {
  wall: { depth: 0.45, height: 2.35, rows: 5, y0: 0.3 },
  island: { depth: 0.5, height: 1.72, rows: 4, y0: 0.26 },
  low: { depth: 0.4, height: 1.18, rows: 3, y0: 0.14 },
};

// The sections. sign: what's on the sign over it. rent: how a tape from it
// goes out (see browse.js). copies: how many of each title, as [most often,
// sometimes, how often sometimes].
export const SECTIONS = {
  new: { sign: 'NEW RELEASES', rent: 'new' },
  action: { sign: 'ACTION', genre: 'action', copies: [1, 2, 0.25] },
  thriller: { sign: 'THRILLER', genre: 'thriller', copies: [1, 2, 0.15] },
  comedy: { sign: 'COMEDY', genre: 'comedy', copies: [1, 2, 0.25] },
  horror: { sign: 'HORROR', genre: 'horror', copies: [1, 2, 0.15] },
  scifi: { sign: 'SCI-FI', genre: 'scifi', copies: [1, 2, 0.15] },
  drama: { sign: 'DRAMA', genre: 'drama', copies: [1, 2, 0.1] },
  foreign: { sign: 'FOREIGN', genre: 'foreign', copies: [1, 1, 0] },
  romance: { sign: 'ROMANCE', genre: 'romance', copies: [1, 2, 0.1] },
  classics: { sign: 'CLASSICS', genre: 'classics', copies: [1, 1, 0] },
  western: { sign: 'WESTERNS', genre: 'western', copies: [1, 1, 0] },
  cult: { sign: 'CULT', genre: 'cult', copies: [1, 1, 0] },
  family: { sign: 'FAMILY', genre: 'family', copies: [1, 2, 0.3], rent: 'family' },
  picks: { sign: 'STAFF PICKS', rent: 'picks' },
  sale: { sign: 'PREVIOUSLY VIEWED', rent: 'sale' },
};

// The four islands down the middle: where each stands across the shop, and
// from where to where front to back.
export const ISLANDS = { xs: [-8, -4.6, -1.2, 2.2], z0: -5.6, z1: 2.6, half: 0.5 };
const ENDCAP = 0.45; // m an end display stands out from an island's end

// The counter and what's round it.
export const COUNTER = { x0: 8, x1: 8.8, z0: 0.6, z1: 6.4, top: 1.05 };
export const CLERK = { x: 10.1, z: 3.4 }; // where the clerk stands, facing the shop (-x)
export const QUEUE = { x0: 6.3, x1: 8, z0: 0.6, z1: 6.4 }; // where you stand to be served
export const RETURN_SLOT = { x: 8.4, z: 6.4 }; // the slot in the counter's front end
export const CANDY = { x0: 5.5, x1: 6.1, z0: 1.8, z1: 4.6, top: 1.2 };
// the kids' television, on top of their shelves under the window, and two bean bags in front of it
export const KIDS = { tv: { x: -5.4, z: FRONT - 0.22 }, bags: [{ x: -6.3, z: 7.1 }, { x: -7.7, z: 7.3 }] };
// Cardboard stand-ups of the big new films, by the doors, facing them.
export const STANDEES = [{ x: -3.4, z: 5.6, yaw: 0.35 }, { x: 3.6, z: 6.4, yaw: -0.4 }, { x: 4.4, z: 4.2, yaw: -0.15 }];

// ── The faces ────────────────────────────────────────────────────────────────

// A face from its left end (as you face it) along to the right: ux, uz is
// (nz, -nx), the right hand of someone looking into it.
function face(id, section, kind, x0, z0, nx, nz, len, extra = {}) {
  const R = RACKS[kind];
  return { id, section, kind, x0, z0, ux: nz, uz: -nx, nx, nz, cols: Math.floor(len / SLOT), rows: R.rows, y0: R.y0, bay: 6, len, depth: R.depth, ...extra };
}

function buildFaces() {
  const W = RACKS.wall.depth;
  const out = [];
  // the back wall, end to end: new releases, along the rows
  out.push(face('new', 'new', 'wall', -HALF_W + W, BACK + W, 0, 1, 2 * (HALF_W - W), { bay: 12 }));
  // the left wall, from the kids' corner back: action, then thrillers
  const leftFront = 4.6;
  const leftMid = -1.9;
  out.push(face('left-a', 'action', 'wall', -HALF_W + W, leftFront, 1, 0, leftFront - leftMid));
  out.push(face('left-b', 'thriller', 'wall', -HALF_W + W, leftMid, 1, 0, leftMid - (BACK + W)));
  // the right wall, from the back to the counter: drama, then foreign
  const rightEnd = COUNTER.z0 - 0.8;
  const rightMid = -3.5;
  out.push(face('right-a', 'drama', 'wall', HALF_W - W, BACK + W, -1, 0, rightMid - (BACK + W)));
  out.push(face('right-b', 'foreign', 'wall', HALF_W - W, rightMid, -1, 0, rightEnd - rightMid));
  // the kids' shelves: low, along the left wall at the front, and under the window
  out.push(face('kids-a', 'family', 'low', -HALF_W + RACKS.low.depth, FRONT - 0.4, 1, 0, FRONT - 0.4 - (leftFront + 0.4)));
  out.push(face('kids-b', 'family', 'low', -4.6, FRONT - RACKS.low.depth, 0, -1, -4.6 - (-HALF_W + 0.9)));
  // the islands: a section on each side, some sides shared by two
  const { xs, z0, z1, half } = ISLANDS;
  const len = z1 - z0;
  const sides = [
    [['action'], ['comedy']],
    [['comedy'], ['horror']],
    [['scifi'], ['drama']],
    [
      ['romance', 'classics'],
      ['western', 'cult'],
    ],
  ];
  xs.forEach((x, i) => {
    const [west, east] = sides[i];
    // the side facing -x is read from the back of the shop to the front
    // (looking along +x, your right hand is +z); the side facing +x, from
    // the front to the back
    west.forEach((section, k) => {
      const l = len / west.length;
      out.push(face(`island${i + 1}-w${k ? 'b' : ''}`, section, 'island', x - half, z0 + k * l, -1, 0, l));
    });
    east.forEach((section, k) => {
      const l = len / east.length;
      out.push(face(`island${i + 1}-e${k ? 'b' : ''}`, section, 'island', x + half, z1 - k * l, 1, 0, l));
    });
    // its ends: staff picks facing the door, the sale tapes facing the back
    out.push(face(`island${i + 1}-picks`, 'picks', 'island', x - half, z1 + ENDCAP, 0, 1, 2 * half, { staff: i, depth: ENDCAP }));
    out.push(face(`island${i + 1}-sale`, 'sale', 'island', x + half, z0 - ENDCAP, 0, -1, 2 * half, { depth: ENDCAP }));
  });
  return out;
}

export const FACES = buildFaces();
export const FACE_BY_ID = new Map(FACES.map((f) => [f.id, f]));

// The middle of a slot's box front, in the store's frame.
export function slotAt(f, col, row, out = {}) {
  const along = (col + 0.5) * (f.len / f.cols);
  out.x = f.x0 + f.ux * along + f.nx * 0.02;
  out.z = f.z0 + f.uz * along + f.nz * 0.02;
  out.y = f.y0 + (f.rows - 1 - row) * ROW + BOX.h / 2 + 0.02;
  return out;
}

// The slot a point on a face's front is in, or null if it's on no box.
export function aim(f, x, y, z) {
  const along = (x - f.x0) * f.ux + (z - f.z0) * f.uz;
  if (along < 0 || along > f.len) return null;
  const col = Math.floor(along / (f.len / f.cols));
  const k = (y - f.y0) / ROW;
  const fromBottom = Math.floor(k);
  if (fromBottom < 0 || fromBottom >= f.rows) return null;
  // between the top of one box and the shelf over it: still that row, near enough
  if ((k - fromBottom) * ROW > BOX.h + 0.09) return null;
  return { col: Math.min(f.cols - 1, col), row: f.rows - 1 - fromBottom };
}

// Every slot of a face in the order tapes are put out on it: along each row
// of a bay, top to bottom, then on to the next bay. -> [[col, row]]
export function fillOrder(f) {
  const out = [];
  for (let b0 = 0; b0 < f.cols; b0 += f.bay) {
    const b1 = Math.min(f.cols, b0 + f.bay);
    for (let row = 0; row < f.rows; row++) for (let col = b0; col < b1; col++) out.push([col, row]);
  }
  return out;
}

// ── What's solid ─────────────────────────────────────────────────────────────
// Rectangles [x0, z0, x1, z1, height] in the store's frame: the shelving, the
// counter, the sweets, the clerk's corner. The walls are the store's own
// (store.js).
function buildSolids() {
  const W = RACKS.wall.depth;
  const out = [];
  out.push([-HALF_W, BACK, HALF_W, BACK + W, RACKS.wall.height]);
  out.push([-HALF_W, BACK, -HALF_W + W, 4.6, RACKS.wall.height]);
  out.push([HALF_W - W, BACK, HALF_W, COUNTER.z0 - 0.8, RACKS.wall.height]);
  out.push([-HALF_W, 4.6, -HALF_W + RACKS.low.depth, FRONT, RACKS.low.height]);
  out.push([-HALF_W + 0.9, FRONT - RACKS.low.depth, -4.6, FRONT, RACKS.low.height]);
  const { xs, z0, z1, half } = ISLANDS;
  for (const x of xs) out.push([x - half, z0 - ENDCAP, x + half, z1 + ENDCAP, RACKS.island.height]);
  out.push([COUNTER.x0, COUNTER.z0, COUNTER.x1, COUNTER.z1, COUNTER.top]);
  out.push([CANDY.x0, CANDY.z0, CANDY.x1, CANDY.z1, CANDY.top]);
  // behind the counter is the clerk's, with the tapes on the wall
  out.push([COUNTER.x1, COUNTER.z0 - 0.8, HALF_W, COUNTER.z0 - 0.4, 1.1]);
  out.push([HALF_W - 0.5, COUNTER.z0 - 0.4, HALF_W, FRONT, 2.2]);
  for (const s of STANDEES) out.push([s.x - 0.3, s.z - 0.15, s.x + 0.3, s.z + 0.15, 1.9]);
  // the security pillars
  for (const side of [-1, 1]) out.push([side * GATE.half - 0.07, GATE.z - 0.15, side * GATE.half + 0.07, GATE.z + 0.15, 1.5]);
  return out;
}
export const SOLIDS = buildSolids();

// Could you stand at (x, z), r clear of everything? (Inside the walls, and
// not in any shelving.)
export function walkable(x, z, r = 0.3) {
  if (x < -HALF_W + r || x > HALF_W - r || z < BACK + r || z > FRONT - r) return false;
  for (const [x0, z0, x1, z1] of SOLIDS) if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return false;
  return true;
}

// Where the signs hang: on the wall over a wall's shelving, and over each
// side of an island, back to back along its top, each read from its aisle.
// -> [{ text, x, z, y, nx, nz, big }]: the middle of the sign, and which way
// it faces
export function signs() {
  const out = [];
  for (const f of FACES) {
    if (f.section === 'picks' || f.section === 'sale') continue;
    const mid = f.len / 2;
    const x = f.x0 + f.ux * mid;
    const z = f.z0 + f.uz * mid;
    const text = SECTIONS[f.section].sign;
    const R = RACKS[f.kind];
    // at the back of the shelving, an island's two back to back along its middle
    const back = f.depth - 0.03;
    out.push({ text, x: x - f.nx * back, z: z - f.nz * back, y: R.height + (f.kind === 'wall' ? 0.5 : 0.3), nx: f.nx, nz: f.nz, big: f.section === 'new' });
  }
  return out;
}
