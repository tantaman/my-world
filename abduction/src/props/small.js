// The small things round the station (PLAN.md 5.10): pumps, oil drums, the
// bench, the ice chest, the bin. Sizes from set/layout.js. Each maker
// returns an Object3D standing on the ground at the origin, facing +Z.
//
// Every surface is the weathered material over a photo-scanned one (rusty
// sheet, planks, rust), so the paint is chipped and speckled the way the
// original's is; the materials are made once and shared, so set/batch.js
// merges all the drums, say, into one draw.
import { Group, Mesh, BoxGeometry, PlaneGeometry, CylinderGeometry, LatheGeometry, Vector2, TorusGeometry } from 'three/webgpu';
import { texture, uv } from 'three/tsl';
import { PUMP, ISLANDS, ISLAND, BENCH, DRUM_SHOP, ICE, BIN } from '../set/layout.js';
import { weathered } from '../materials/weathered.js';
import { pbr } from '../materials/textures.js';
import { signTexture } from '../set/signs.js';
import { boxMesh, tubeMesh, shadowed } from '../set/shapes.js';
import { metals } from '../materials/metals.js';

// Made on first use and shared by every copy.
let M = null;
function materials() {
  if (M) return M;
  const sheet = pbr('rusty_metal_02');
  const rust = pbr('rust_coarse_01');
  M = {
    // Old white enamel on steel: rust specks everywhere, worse at the foot.
    pump: weathered({ colour: '#d3d3be', under: '#5b4a38', peel: 0.06, rust: 0.22, streaks: 0.55, dirt: 0.65, dirtHeight: 0.5,
      rough: 0.5, metal: 0.15, scale: 0.5, wet: 0.15, photo: sheet, photoScale: 0.55, photoSat: 0.3, photoContrast: 0.8, photoAmount: 0.65 }),
    black: metals().black,
    rubber: metals().cable,
    chrome: metals().chrome,
    dial: weathered({ colour: '#ffffff', map: texture(signTexture('dial', 256, 330), uv()), streaks: 0.2, dirt: 0, rough: 0.25, scale: 0.4,
      photo: sheet, photoScale: 0.5, photoAmount: 0.4 }),
    // A drum: dark green with a cream band, rust through both.
    drumGreen: weathered({ colour: '#2c463e', under: '#3a2a1e', peel: 0.05, rust: 0.42, streaks: 0.4, dirt: 0.4, rough: 0.55, metal: 0.35,
      scale: 0.35, wet: 0.2, photo: sheet, photoScale: 0.45, photoSat: 0.55, photoContrast: 1.2 }),
    drumCream: weathered({ colour: '#cdc8b2', under: '#3a2a1e', peel: 0.05, rust: 0.38, streaks: 0.45, dirt: 0.3, rough: 0.55, metal: 0.25,
      scale: 0.35, wet: 0.2, photo: sheet, photoScale: 0.45, photoSat: 0.55, photoContrast: 1.2 }),
    drumLid: weathered({ colour: '#4a3324', rust: 0.55, rough: 0.7, metal: 0.3, scale: 0.3, wet: 0.5,
      photo: rust, photoScale: 0.5, photoSat: 0.8, photoContrast: 1.3 }),
    // The bench: grey-green planks, weathered, on black iron.
    slat: weathered({ colour: '#6f786b', under: '#3d3a31', peel: 0.12, streaks: 0.3, dirt: 0.2, rough: 0.75, scale: 0.4, wet: 0.25,
      photo: pbr('wood_planks_grey'), photoScale: 1.5, photoSat: 0.2, photoContrast: 1.5, photoBump: 1.5, turn: true }),
    iron: metals().black,
    // The ice chest: white painted steel, grimy.
    chest: weathered({ colour: '#dcd9cc', under: '#5b4a38', rust: 0.06, streaks: 0.5, dirt: 0.45, dirtHeight: 0.35, rough: 0.5, scale: 0.5,
      wet: 0.2, photo: sheet, photoScale: 0.9, photoSat: 0.2, photoContrast: 0.9 }),
    chestLabel: weathered({ colour: '#ffffff', map: texture(signTexture('ice', 1024, 480), uv()), rust: 0.03, streaks: 0.4, dirt: 0.35,
      dirtHeight: 0.3, rough: 0.5, scale: 0.5, wet: 0.2, photo: sheet, photoScale: 0.9, photoSat: 0.2, photoContrast: 0.9 }),
    binPaint: weathered({ colour: '#2b2e2b', rust: 0.4, rough: 0.6, metal: 0.3, dirt: 0.5, photo: sheet, photoScale: 0.5, photoSat: 0.8 }),
  };
  return M;
}

// A white enamel pump: a black plinth, a lower cabinet and a head over a
// dark seam, a capped top, a holster with its nozzle on the front, the hose
// hanging from it in a loop to a fitting on the side, and the price dial
// (three rows) on the back of the head.
export function pump() {
  const m = materials();
  const g = new Group();
  const { w, d, h } = PUMP;
  const add = (mesh) => { g.add(mesh); return mesh; };
  const SEAM = 1.05;     // metres: where the head sits on the cabinet
  add(boxMesh(-w / 2 - 0.02, 0, -d / 2 - 0.02, w / 2 + 0.02, 0.08, d / 2 + 0.02, m.black, 0.01));
  add(boxMesh(-w / 2, 0.08, -d / 2, w / 2, SEAM - 0.012, d / 2, m.pump, 0.025));
  add(boxMesh(-w / 2 + 0.01, SEAM - 0.015, -d / 2 + 0.01, w / 2 - 0.01, SEAM + 0.012, d / 2 - 0.01, m.black));
  add(boxMesh(-w / 2 - 0.006, SEAM + 0.01, -d / 2 - 0.006, w / 2 + 0.006, h - 0.05, d / 2 + 0.006, m.pump, 0.03));
  add(boxMesh(-w / 2 - 0.018, h - 0.06, -d / 2 - 0.018, w / 2 + 0.018, h, d / 2 + 0.018, m.pump, 0.025));
  // The holster: a black box standing proud of the front, open at the top.
  const hx = 0.03;
  const front = d / 2 + 0.006;
  add(boxMesh(hx - 0.085, 1.3, front, hx + 0.085, 1.62, front + 0.05, m.black, 0.008));
  // The nozzle: its grip angled out of the holster, the spout down inside.
  const grip = add(shadowed(new Mesh(new BoxGeometry(0.045, 0.2, 0.05), m.rubber)));
  grip.position.set(hx, 1.55, front + 0.07);
  grip.rotation.x = 0.35;
  const spout = add(shadowed(new Mesh(new CylinderGeometry(0.012, 0.014, 0.16, 8), m.chrome)));
  spout.position.set(hx, 1.6, front + 0.03);
  spout.rotation.x = -0.4;
  const lever = add(shadowed(new Mesh(new BoxGeometry(0.02, 0.12, 0.03), m.chrome)));
  lever.position.set(hx, 1.47, front + 0.1);
  lever.rotation.x = 0.15;
  // The hose: out of the grip's foot, down to the island, round and up to a
  // fitting at the seam on the right side.
  const sx = w / 2 + 0.006;
  add(tubeMesh([
    [hx, 1.45, front + 0.08], [hx - 0.01, 1.1, front + 0.13], [hx - 0.02, 0.45, front + 0.16], [hx + 0.02, 0.1, front + 0.18],
    [hx + 0.16, 0.04, front + 0.2], [sx + 0.03, 0.12, front + 0.12], [sx + 0.05, 0.5, front + 0.03], [sx + 0.035, 0.85, 0.08],
    [sx + 0.02, SEAM - 0.02, 0.06],
  ], 0.017, m.rubber, { segments: 48, sides: 8 }));
  const fitting = add(shadowed(new Mesh(new TorusGeometry(0.03, 0.012, 6, 12), m.chrome)));
  fitting.position.set(sx + 0.005, SEAM - 0.01, 0.06);
  fitting.rotation.y = Math.PI / 2;
  // The latch on the cabinet's front.
  add(boxMesh(w / 2 - 0.16, 0.62, front - 0.004, w / 2 - 0.12, 0.72, front + 0.008, m.black));
  // The dial, in a dark frame, on the head's back (the road side, as the
  // original shows it at 71 s).
  const back = -(d / 2 + 0.006);
  add(boxMesh(-0.2, 1.22, back - 0.02, 0.2, 1.72, back, m.black, 0.006));
  const face = new Mesh(new PlaneGeometry(0.34, 0.44), m.dial);
  face.position.set(0, 1.47, back - 0.021);
  face.rotation.y = Math.PI;
  add(face);
  return g;
}

// An oil drum: a lathed profile with its chimes and two rolling hoops, dark
// green above and below a cream band between the hoops; a rusted lid set
// down inside the top chime, with its two bungs.
export function drum() {
  const m = materials();
  const g = new Group();
  const r = 0.29;
  const H = 0.88;
  const HOOPS = [0.29, 0.59];
  const hoop = (y, from, to) => {
    // Half a hoop's bulge each side of the band's edge.
    const pts = [];
    if (from) pts.push(new Vector2(r + 0.012, y), new Vector2(r, y + 0.02));
    if (to) pts.push(new Vector2(r, y - 0.02), new Vector2(r + 0.012, y));
    return pts;
  };
  const lathe = (pts, mat) => g.add(shadowed(new Mesh(new LatheGeometry(pts, 32), mat)));
  // Bottom: the chime, the wall up to the lower hoop.
  lathe([new Vector2(0, 0.004), new Vector2(r - 0.01, 0.004), new Vector2(r + 0.006, 0.0), new Vector2(r + 0.008, 0.02),
    new Vector2(r, 0.03), ...hoop(HOOPS[0], false, true)], m.drumGreen);
  lathe([...hoop(HOOPS[0], true, false), ...hoop(HOOPS[1], false, true)], m.drumCream);
  lathe([...hoop(HOOPS[1], true, false), new Vector2(r, H - 0.03), new Vector2(r + 0.008, H - 0.012), new Vector2(r + 0.004, H),
    new Vector2(r - 0.008, H), new Vector2(r - 0.01, H - 0.02)], m.drumGreen);
  const lid = shadowed(new Mesh(new CylinderGeometry(r - 0.01, r - 0.01, 0.01, 32), m.drumLid));
  lid.position.y = H - 0.02;
  g.add(lid);
  for (const [x, z, br] of [[0.17, 0.05, 0.032], [-0.15, -0.09, 0.022]]) {
    const bung = shadowed(new Mesh(new CylinderGeometry(br, br * 1.1, 0.018, 12), m.drumLid));
    bung.position.set(x, H - 0.008, z);
    g.add(bung);
  }
  return g;
}

// Green-grey planks on a black iron frame: three in the seat, three in the
// back; each end a front leg, a rear leg rising into the back's upright, and
// a rail under the seat.
export function bench() {
  const m = materials();
  const g = new Group();
  const L = BENCH.len;
  const SEAT = 0.45;      // metres: height of the seat
  const SLAT = 0.115;     // metres: width of a plank
  const GAP = 0.012;
  for (let i = 0; i < 3; i++) {
    const z = 0.18 - i * (SLAT + GAP);
    g.add(boxMesh(-L / 2, SEAT, z - SLAT, L / 2, SEAT + 0.035, z, m.slat, 0.008));
  }
  const back = new Group();
  for (let i = 0; i < 3; i++) {
    const y = 0.1 + i * (SLAT + GAP);
    back.add(boxMesh(-L / 2, y, -0.03, L / 2, y + SLAT, 0, m.slat, 0.008));
  }
  back.position.set(0, SEAT, -0.2);
  back.rotation.x = -0.14;
  g.add(back);
  for (const x of [-L / 2 + 0.12, L / 2 - 0.12]) {
    const bar = (pts, r = 0.016) => g.add(tubeMesh(pts, r, m.iron, { segments: 12, sides: 6 }));
    bar([[x, 0, 0.17], [x, SEAT - 0.02, 0.16]]);
    bar([[x, 0, -0.24], [x, SEAT - 0.02, -0.245], [x, SEAT + 0.095, -0.26], [x, SEAT + 0.47, -0.313]]);
    g.add(boxMesh(x - 0.02, SEAT - 0.035, -0.23, x + 0.02, SEAT, 0.2, m.iron, 0.005));
    for (const z of [0.17, -0.24]) g.add(boxMesh(x - 0.03, 0, z - 0.03, x + 0.03, 0.012, z + 0.03, m.iron));
  }
  return g;
}

// The ice chest: a white steel chest with ICE in red across its front, its
// lid overhanging and sloping a little to the front, a hasp on the lid.
export function iceChest() {
  const m = materials();
  const g = new Group();
  const { w, d, h } = ICE;
  g.add(boxMesh(-w / 2 + 0.04, 0, -d / 2 + 0.04, w / 2 - 0.04, 0.06, d / 2 - 0.04, m.black, 0.01));
  g.add(boxMesh(-w / 2, 0.05, -d / 2, w / 2, h - 0.08, d / 2, m.chest, 0.035));
  const label = new Mesh(new PlaneGeometry(w - 0.08, h - 0.2), m.chestLabel);
  label.position.set(0, (h - 0.03) / 2, d / 2 + 0.002);
  label.receiveShadow = true;
  g.add(label);
  const lid = boxMesh(-w / 2 - 0.03, -0.05, -d / 2 - 0.02, w / 2 + 0.03, 0.05, d / 2 + 0.04, m.chest, 0.03);
  const hinge = new Group();
  lid.position.z += d / 2;
  hinge.add(lid);
  hinge.position.set(0, h - 0.04, -d / 2);
  hinge.rotation.x = 0.05;
  g.add(hinge);
  g.add(boxMesh(-w / 2 + 0.28, h - 0.2, d / 2 + 0.03, -w / 2 + 0.36, h - 0.05, d / 2 + 0.055, m.black, 0.005));
  return g;
}

export function bin() {
  const m = materials();
  const g = new Group();
  const body = shadowed(new Mesh(new CylinderGeometry(0.28, 0.25, 0.86, 20, 1, true), m.binPaint));
  body.position.y = 0.45;
  const rim = shadowed(new Mesh(new TorusGeometry(0.28, 0.015, 6, 20), m.binPaint));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.88;
  const floor = shadowed(new Mesh(new CylinderGeometry(0.25, 0.25, 0.02, 20), m.binPaint));
  floor.position.y = 0.03;
  g.add(body, rim, floor);
  return g;
}

// All of them where they stand.
export function createSmallProps() {
  const group = new Group();
  for (const is of ISLANDS) {
    const p = pump();
    p.position.set(is.x + ISLAND.pumpDx, ISLAND.h, is.z);
    // The holster faces the shop, along the island (the original at 33 to 38 s).
    p.rotation.y = Math.PI;
    const d = drum();
    d.position.set(is.x + ISLAND.drumDx, ISLAND.h, is.z + 0.1);
    d.rotation.y = is.x * 1.7;
    group.add(p, d);
  }
  const d = drum();
  d.position.set(DRUM_SHOP.x, 0, DRUM_SHOP.z);
  d.rotation.y = 2.2;
  const b = bench();
  b.position.set(BENCH.x, 0, BENCH.z + 0.05);
  const ice = iceChest();
  ice.position.set(ICE.x, 0, ICE.z);
  const bn = bin();
  bn.position.set(BIN.x, 0, BIN.z);
  group.add(d, b, ice, bn);
  return { object: group, update() {} };
}
