// The airboat, made in code like everything else: a flat-bottomed aluminium
// hull painted blue, its bow swept up to ride over the weed, its number
// painted down either side of the bow; three benches for the passengers,
// each row higher than the one in front, with a rail along the back of each;
// the guide's seat high up behind them; and behind that the engine, and the
// big propeller in its round wire cage, with the rudders behind it to steer
// by. A card on the bow says what the guide hopes you'll do.
//
// Built round its own origin (the middle of the hull, at the waterline),
// +z towards the bow, and placed in the world as a whole (render/origin.js).
//
//   buildAirboat(materials) -> {
//     object     the group: put it where the boat is
//     prop       the propeller, turned about its own z as the engine runs
//     blur       the disc it makes spinning fast: its material's opacity
//     rudders    [group], turned about y to steer
//     seats      where people sit: [{ x, y, z }] in the boat's frame, the
//                passengers' (front row first) then the guide's (last)
//     stick      where the guide's hand goes, on the stick
//   }
//   materials  { paint, metal, dark, glass }: vertex-coloured standard materials

import * as THREE from 'three';
import { Kit } from '../videostore/store.js';

const col = (hex) => new THREE.Color(hex);
const PAL = {
  hull: col(0x1f4ea6),
  deck: col(0x2a5ab4),
  trim: col(0xb9bcc0),
  rail: col(0xd0d3d6),
  seat: col(0x1c2433),
  seatEdge: col(0x2c3648),
  number: col(0xeeeeea),
  card: col(0xf2f0e8),
  ink: col(0x15151a),
  engine: col(0x2a2c30),
  head: col(0x8c1a16),
  chrome: col(0xc8cacc),
  prop: col(0x3a3026),
  cage: col(0xa8acb0),
  rudder: col(0xb0b4b8),
  frame: col(0x8e9296),
  placard: col(0xe8e4d4),
  vest: col(0xe2541c),
};

// m: the hull. Long and broad and flat; the bow sweeps up from BOW_FROM to
// the front, and the sides stand GUNWALE over the waterline.
export const HULL = { len: 5.8, beam: 2.4, draft: 0.07, gunwale: 0.42, deck: 0.26, bowFrom: 1.85 };
// where the propeller turns (its hub), and how big it is (m)
export const PROP = { z: -2.62, y: 1.34, r: 0.95 };
const STATIONS = 24; // pieces of hull along its length

// the hull's bottom and half its width at z along it (from the stern, -len/2)
function section(z) {
  const H = HULL;
  const t = Math.max(0, (z - H.bowFrom) / (H.len / 2 - H.bowFrom));
  return {
    bottom: -H.draft + (H.gunwale - 0.06 + H.draft) * Math.pow(t, 1.6),
    half: (H.beam / 2) * (1 - 0.14 * t * t),
  };
}

export function buildAirboat(materials) {
  const object = new THREE.Group();
  object.name = 'airboat';
  const paint = new Kit();
  const metal = new Kit();
  const dark = new Kit();
  const H = HULL;

  // ── The hull ──────────────────────────────────────────────────────────────
  const zs = [];
  for (let k = 0; k <= STATIONS; k++) zs.push(-H.len / 2 + (H.len * k) / STATIONS);
  const top = H.gunwale;
  for (let k = 0; k < STATIONS; k++) {
    const [za, zb] = [zs[k], zs[k + 1]];
    const [a, b] = [section(za), section(zb)];
    for (const side of [1, -1]) {
      // the side, from the chine up to the gunwale
      const p = [[side * a.half, a.bottom, za], [side * b.half, b.bottom, zb], [side * b.half, top, zb], [side * a.half, top, za]];
      if (side < 0) p.reverse();
      paint.quad(...p, [side, 0, 0], PAL.hull);
      // and inside, down to the deck
      const q = [[side * (a.half - 0.04), H.deck, za], [side * (a.half - 0.04), top, za], [side * (b.half - 0.04), top, zb], [side * (b.half - 0.04), H.deck, zb]];
      if (side < 0) q.reverse();
      paint.quad(...q, [-side, 0, 0], PAL.deck);
      // the gunwale's cap
      const c = [[side * (a.half - 0.05), top, za], [side * (a.half + 0.01), top, za], [side * (b.half + 0.01), top, zb], [side * (b.half - 0.05), top, zb]];
      if (side > 0) c.reverse();
      metal.quad(...c, [0, 1, 0], PAL.trim);
    }
    // the bottom, swept up at the bow
    const n = [0, -1, 0];
    paint.quad([-a.half, a.bottom, za], [a.half, a.bottom, za], [b.half, b.bottom, zb], [-b.half, b.bottom, zb], n, PAL.hull.clone().multiplyScalar(0.6));
    // the deck, flat, until the bow rises over it
    if (zb <= H.bowFrom + 0.6) paint.quad([-a.half + 0.04, H.deck, zb], [a.half - 0.04, H.deck, zb], [a.half - 0.04, H.deck, za], [-a.half + 0.04, H.deck, za], [0, 1, 0], PAL.deck);
  }
  // the bow deck, closing the front over, and the transom across the stern
  const bow = H.bowFrom + 0.6;
  const s0 = section(bow);
  const s1 = section(H.len / 2);
  paint.quad([-s0.half + 0.04, top - 0.02, bow], [s0.half - 0.04, top - 0.02, bow], [s1.half, top - 0.02, H.len / 2], [-s1.half, top - 0.02, H.len / 2], [0, 1, 0], PAL.deck);
  paint.quad([s0.half - 0.04, H.deck, bow], [-s0.half + 0.04, H.deck, bow], [-s0.half + 0.04, top - 0.02, bow], [s0.half - 0.04, top - 0.02, bow], [0, 0, -1], PAL.deck);
  paint.quad([s1.half, section(H.len / 2).bottom, H.len / 2], [-s1.half, section(H.len / 2).bottom, H.len / 2], [-s1.half, top, H.len / 2], [s1.half, top, H.len / 2], [0, 0, 1], PAL.hull);
  const st = section(-H.len / 2);
  paint.quad([-st.half, st.bottom, -H.len / 2], [st.half, st.bottom, -H.len / 2], [st.half, top, -H.len / 2], [-st.half, top, -H.len / 2], [0, 0, -1], PAL.hull);
  // its number, down both sides of the bow
  for (const side of [1, -1]) {
    const z = 1.25;
    paint.words('LA 8101 GG', side * (section(z).half + 0.004), 0.28, z, side, 0, 0.017, PAL.number);
  }
  // and the card on the bow deck, facing the passengers
  paint.box(0.45, top - 0.02, bow + 0.05, 0.95, top + 0.012, bow + 0.32, PAL.card);
  paint.words('TIP THE', 0.7, top + 0.013, bow + 0.13, 0, 0, 0.012, PAL.ink, { small: true });
  flatWords(paint, 'TIP THE', 0.7, top + 0.014, bow + 0.25, 0.013, PAL.ink);
  flatWords(paint, 'GUIDE!!', 0.7, top + 0.014, bow + 0.15, 0.013, PAL.ink);

  // ── The seats ─────────────────────────────────────────────────────────────
  // three rows, each higher than the last, on risers; the guide's high up
  const ROWS = [
    { z: 0.95, y: 0.66 },
    { z: 0.1, y: 0.98 },
    { z: -0.75, y: 1.3 },
  ];
  const seats = [];
  const W = 2.0;
  for (const r of ROWS) {
    // the riser it stands on, the bench, its back, and a rail along the back
    if (r.y > 0.7) paint.box(-W / 2, H.deck, r.z - 0.32, W / 2, r.y - 0.42, r.z + 0.3, PAL.deck);
    dark.box(-W / 2, r.y - 0.42, r.z - 0.22, W / 2, r.y - 0.08, r.z + 0.2, PAL.seatEdge);
    dark.box(-W / 2, r.y - 0.08, r.z - 0.24, W / 2, r.y, r.z + 0.22, PAL.seat);
    dark.box(-W / 2, r.y, r.z - 0.3, W / 2, r.y + 0.42, r.z - 0.22, PAL.seat);
    rail(metal, -W / 2 - 0.05, r.y + 0.48, r.z - 0.3, W / 2 + 0.05, r.y + 0.48, r.z - 0.3, 0.02);
    for (const x of [-W / 2 - 0.05, W / 2 + 0.05]) rail(metal, x, r.y - 0.08, r.z - 0.3, x, r.y + 0.48, r.z - 0.3, 0.02);
    for (const x of [-0.62, 0, 0.62]) seats.push({ x, y: r.y, z: r.z + 0.02 });
  }
  // a rail in front of the front row, to hold on to
  rail(metal, -W / 2, 0.92, 1.45, W / 2, 0.92, 1.45, 0.018);
  for (const x of [-W / 2, W / 2]) rail(metal, x, H.deck, 1.45, x, 0.92, 1.45, 0.018);
  // the guide's seat on its frame, with a footrest; the stick at the left
  const G = { z: -1.62, y: 2.05 };
  for (const [x, z] of [[-0.35, G.z - 0.25], [0.35, G.z - 0.25], [-0.35, G.z + 0.25], [0.35, G.z + 0.25]]) rail(metal, x, H.deck, z, x * 0.8, G.y - 0.1, z * 0.98 + G.z * 0.02, 0.025);
  dark.box(-0.32, G.y - 0.1, G.z - 0.22, 0.32, G.y, G.z + 0.24, PAL.seat);
  dark.box(-0.32, G.y, G.z - 0.3, 0.32, G.y + 0.5, G.z - 0.22, PAL.seat);
  paint.box(-0.4, G.y - 0.75, G.z + 0.35, 0.4, G.y - 0.7, G.z + 0.6, PAL.deck);
  rail(metal, -0.5, G.y - 0.6, G.z + 0.1, -0.52, G.y + 0.2, G.z + 0.35, 0.02);
  dark.box(-0.56, G.y + 0.18, G.z + 0.31, -0.48, G.y + 0.3, G.z + 0.4, PAL.ink);
  seats.push({ x: 0, y: G.y, z: G.z });
  const stick = { x: -0.52, y: G.y + 0.24, z: G.z + 0.36 };
  // life jackets in a rack under the guide's seat, and the card that says how
  // to put one on
  for (const x of [-0.2, 0.05]) dark.box(x, H.deck + 0.02, G.z - 0.15, x + 0.2, H.deck + 0.32, G.z + 0.1, PAL.vest);
  paint.box(0.5, ROWS[0].y - 0.38, ROWS[0].z - 0.235, 0.82, ROWS[0].y - 0.12, ROWS[0].z - 0.222, PAL.placard);

  // ── The engine, the propeller and its cage ────────────────────────────────
  const E = { z0: -2.42, z1: -1.95, y0: H.deck, y1: PROP.y + 0.12 };
  paint.box(-0.5, E.y0, E.z0 - 0.05, 0.5, E.y0 + 0.45, E.z1 + 0.15, PAL.deck);
  dark.box(-0.32, E.y0 + 0.45, E.z0, 0.32, E.y1 - 0.25, E.z1, PAL.engine);
  for (const side of [1, -1]) dark.box(side * 0.2, E.y1 - 0.45, E.z0 + 0.02, side * 0.38, E.y1 - 0.3, E.z1 - 0.02, PAL.head);
  dark.box(-0.2, E.y1 - 0.25, E.z0 + 0.05, 0.2, E.y1 - 0.12, E.z1 - 0.05, PAL.chrome);
  for (const side of [1, -1]) rail(metal, side * 0.42, E.y1 - 0.4, E.z0 + 0.2, side * 0.5, E.y1 + 0.35, E.z0 + 0.05, 0.03);
  // the hub's shaft
  rail(metal, 0, PROP.y, E.z0, 0, PROP.y, PROP.z, 0.06);

  const geo = (kit, material) => {
    const m = new THREE.Mesh(kit.build(), material);
    m.castShadow = true;
    m.receiveShadow = true;
    object.add(m);
    return m;
  };
  geo(paint, materials.paint);
  geo(dark, materials.dark);

  // the cage: two hoops, the wire across the side facing the passengers, and
  // struts down to the deck
  const cage = new Kit();
  const R = PROP.r + 0.08;
  for (const z of [PROP.z + 0.18, PROP.z - 0.2]) hoop(cage, R, PROP.y, z, 0.022, 36);
  for (let k = -6; k <= 6; k++) {
    const x = (k / 6.5) * R;
    const h = Math.sqrt(Math.max(0, R * R - x * x));
    rail(cage, x, PROP.y - h, PROP.z + 0.18, x, PROP.y + h, PROP.z + 0.18, 0.006);
    rail(cage, -h, PROP.y + x, PROP.z + 0.18, h, PROP.y + x, PROP.z + 0.18, 0.006);
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    rail(cage, Math.cos(a) * R, PROP.y + Math.sin(a) * R, PROP.z + 0.18, Math.cos(a) * R, PROP.y + Math.sin(a) * R, PROP.z - 0.2, 0.012);
  }
  for (const side of [1, -1]) {
    rail(cage, side * R * 0.7, PROP.y - R * 0.7, PROP.z, side * 0.9, H.deck, PROP.z + 0.35, 0.03);
    rail(cage, side * R * 0.7, PROP.y - R * 0.7, PROP.z, side * 0.9, H.deck, PROP.z - 0.25, 0.03);
  }
  geo(cage, materials.metal);
  geo(metal, materials.metal);

  // the propeller: two long blades on a hub, turned about z
  const prop = new THREE.Group();
  prop.position.set(0, PROP.y, PROP.z);
  const blades = new Kit();
  blades.box(-0.09, -0.09, -0.08, 0.09, 0.09, 0.1, PAL.engine);
  for (const side of [1, -1]) {
    // each blade twisted a little, wide near the hub, narrowing to the tip
    for (let k = 0; k < 6; k++) {
      const r0 = 0.08 + (k / 6) * (PROP.r - 0.08);
      const r1 = 0.08 + ((k + 1) / 6) * (PROP.r - 0.08);
      const w0 = 0.12 - 0.05 * (k / 6);
      const w1 = 0.12 - 0.05 * ((k + 1) / 6);
      const t0 = 0.35 - 0.2 * (k / 6);
      const t1 = 0.35 - 0.2 * ((k + 1) / 6);
      const p = (r, w, t, s) => [side * r, s * w * Math.cos(t), s * w * Math.sin(t) * side];
      blades.quad(p(r0, w0, t0, -1), p(r1, w1, t1, -1), p(r1, w1, t1, 1), p(r0, w0, t0, 1), [0, 0, 1], PAL.prop);
      blades.quad(p(r0, w0, t0, 1), p(r1, w1, t1, 1), p(r1, w1, t1, -1), p(r0, w0, t0, -1), [0, 0, -1], PAL.prop);
    }
  }
  const bladeMesh = new THREE.Mesh(blades.build(), materials.dark);
  bladeMesh.castShadow = true;
  prop.add(bladeMesh);
  object.add(prop);
  // spinning fast, the blades are a blur: a dark disc, more there the faster
  const blur = new THREE.MeshBasicMaterial({ color: 0x1c1814, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(PROP.r, 32), blur);
  disc.position.set(0, PROP.y, PROP.z);
  object.add(disc);

  // the rudders: three upright blades behind the cage, linked, turned together
  const rudders = [];
  const rk = new Kit();
  rk.box(-0.012, -0.55, -0.42, 0.012, 0.55, 0.04, PAL.rudder);
  const rudderGeo = rk.build();
  for (const x of [-0.6, 0, 0.6]) {
    const g = new THREE.Group();
    g.position.set(x, PROP.y - 0.05, PROP.z - 0.36);
    const m = new THREE.Mesh(rudderGeo, materials.metal);
    m.castShadow = true;
    g.add(m);
    object.add(g);
    rudders.push(g);
  }
  const rodKit = new Kit();
  rail(rodKit, -0.65, PROP.y - 0.58, PROP.z - 0.36, 0.65, PROP.y - 0.58, PROP.z - 0.36, 0.015);
  geo(rodKit, materials.metal);

  return { object, prop, blur, rudders, seats, stick };
}

// A round bar from a to b, r thick (square, at this size nobody can tell).
function rail(k, ax, ay, az, bx, by, bz, r) {
  const d = new THREE.Vector3(bx - ax, by - ay, bz - az);
  const len = d.length();
  if (len < 1e-6) return;
  d.normalize();
  const u = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize().multiplyScalar(r);
  const v = new THREE.Vector3().crossVectors(d, u).normalize().multiplyScalar(r);
  const A = new THREE.Vector3(ax, ay, az);
  const B = new THREE.Vector3(bx, by, bz);
  const c = PAL.rail;
  const corners = [u.clone().add(v), u.clone().sub(v), u.clone().negate().sub(v), u.clone().negate().add(v)];
  for (let i = 0; i < 4; i++) {
    const p = corners[i];
    const q = corners[(i + 1) % 4];
    const n = p.clone().add(q).normalize();
    k.quad(A.clone().add(p).toArray(), B.clone().add(p).toArray(), B.clone().add(q).toArray(), A.clone().add(q).toArray(), n.toArray(), c);
  }
}

// A hoop of bar in the plane z, round (0, y), radius R.
function hoop(k, R, y, z, r, n) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = ((i + 1) / n) * Math.PI * 2;
    rail(k, Math.cos(a) * R, y + Math.sin(a) * R, z, Math.cos(b) * R, y + Math.sin(b) * R, z, r);
  }
}

// Words lying flat, facing up, read from behind (by someone at -z looking
// toward +z): the 3 × 5 font, each square px across, middled on (x, z).
function flatWords(k, text, x, y, z, px, color) {
  const rows = 5;
  let col = 0;
  const cells = [];
  for (const ch of text) {
    const g = SMALL[ch];
    if (g) g.forEach((row, j) => [...row].forEach((c, i) => c === '#' && cells.push([col + i, j])));
    col += 4;
  }
  const w = col - 1;
  for (const [i, j] of cells) {
    const cx = x + (w / 2 - i - 0.5) * px;
    const cz = z + (rows / 2 - j - 0.5) * px;
    k.quad([cx + px * 0.48, y, cz - px * 0.48], [cx - px * 0.48, y, cz - px * 0.48], [cx - px * 0.48, y, cz + px * 0.48], [cx + px * 0.48, y, cz + px * 0.48], [0, 1, 0], color);
  }
}
const SMALL = {
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  E: ['###', '#..', '##.', '#..', '###'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  ' ': ['...', '...', '...', '...', '...'],
};
