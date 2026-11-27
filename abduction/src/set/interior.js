// The shop, through the glass (PLAN.md 5.9, and the original at 27 to 31 s):
// a room of stained render with a suspended ceiling; a long counter of light
// wood on a dark front with a chrome edge, red stools along it and a cream
// till on it; dark wooden shelves on brackets along the back wall and steel
// racks down the room, all stocked with bottles (red, amber, green, brown,
// clear, labelled), tins and a few boxes, instanced; a drinks fridge lit
// from inside; two pendant lamps over the counter and a ceiling tube. Its
// lights are in light/rig.js.
import {
  Group, Mesh, BoxGeometry, PlaneGeometry, CylinderGeometry, InstancedMesh, Object3D, Color, MeshStandardNodeMaterial, BackSide,
  DoubleSide, SphereGeometry, LatheGeometry, Vector2,
} from 'three/webgpu';
import { vec3, float, mix, smoothstep, positionGeometry, instanceIndex, instanceColor, hash } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHOP } from './layout.js';
import { weathered } from '../materials/weathered.js';
import { pbr } from '../materials/textures.js';
import { rand } from '../noise1.js';
import { boxMesh } from './shapes.js';

const T = 0.26;              // the walls' thickness, as seen from inside, metres
const TILE = 0.6;            // the suspended ceiling's grid, metres
const PENDANTS = [[-0.5, -1.5], [3.4, -2.0]];   // over the counter; light/rig.js has their lights
const BOTTLE_GAP = 0.025;    // metres between neighbours on a shelf, at least
const SHADE_GLOW = 0.35;     // the pendant shades' own glow (the bulb through the enamel)

// What the shelves hold: [weight, colour] of glass and tin.
const GLASS = [
  [5, '#5a0e08'], [4, '#74320c'], [3, '#8a5612'], [3, '#1e3612'], [2, '#14260f'], [2, '#36200e'], [1, '#6a6a56'], [1, '#9a7a20'],
];
const TINS = [[3, '#a9a59a'], [2, '#7a1a14'], [2, '#3c5a2a'], [1, '#c4b070']];
const pick = (table, r) => {
  const total = table.reduce((s, [w]) => s + w, 0);
  let x = r * total;
  for (const [w, c] of table) { if ((x -= w) <= 0) return c; }
  return table.at(-1)[1];
};

export function createInterior() {
  const g = new Group();
  const S = SHOP;
  const X0 = S.x0 + T;
  const X1 = S.x1 - T;
  const Z0 = S.z0 + T;
  const Z1 = S.z1 - T;
  const H = S.wall - 0.25;   // under the suspended ceiling
  const stained = pbr('dirty_concrete', { res: '2k' });
  const wood = pbr('weathered_planks');
  const wall = weathered({ colour: '#6e5848', under: '#3a2a20', scale: 1.0, vary: 0.3, streaks: 0.5, dirt: 0.5, dirtHeight: 1.2,
    rough: 0.85, wet: 0, bump: 0.3, photo: stained, photoScale: 2.2, photoSat: 0.4, photoContrast: 1.7 });
  const floor = weathered({ colour: '#4a3e34', scale: 0.6, streaks: 0, dirt: 0, rough: 0.45, wet: 0, bump: 0,
    photo: stained, photoScale: 2.5, photoSat: 0.3, photoContrast: 1.2 });
  const ceiling = weathered({ colour: '#5c564c', scale: 1, streaks: 0, dirt: 0, rough: 0.9, wet: 0, bump: 0,
    photo: stained, photoScale: 1.8, photoContrast: 1.5, photoSat: 0.3 });
  const darkWood = weathered({ colour: '#3e2a1c', scale: 0.4, streaks: 0.1, dirt: 0.2, rough: 0.6, wet: 0, bump: 0.3,
    photo: wood, photoScale: 1.6, photoSat: 0.6, photoContrast: 1.2, turn: true });
  const lightWood = weathered({ colour: '#a98a60', scale: 0.4, streaks: 0, dirt: 0, rough: 0.35, wet: 0, bump: 0.2,
    photo: wood, photoScale: 2.2, photoSat: 0.5, photoAmount: 0.6, turn: true });
  const steel = weathered({ colour: '#8a8c88', rust: 0.12, metal: 0.5, rough: 0.45, wet: 0, bump: 0, streaks: 0,
    photo: pbr('rusty_metal_02'), photoScale: 0.6, photoSat: 0.3, photoAmount: 0.6 });
  const chrome = weathered({ colour: '#b4b4ae', metal: 0.9, rough: 0.2, wet: 0, bump: 0, streaks: 0, dirt: 0 });
  const red = weathered({ colour: '#8e1e16', rough: 0.45, wet: 0, bump: 0, streaks: 0, dirt: 0.2 });
  const cream = weathered({ colour: '#d6d0bc', rough: 0.4, wet: 0, bump: 0, streaks: 0.1, dirt: 0.2 });

  const add = (mesh) => { g.add(mesh); return mesh; };
  const box = (x0, y0, z0, x1, y1, z1, m, r = 0) => add(boxMesh(x0, y0, z0, x1, y1, z1, m, r));

  // The room: walls seen from inside, a floor, a ceiling of tiles on a grid,
  // pilasters along the back wall.
  wall.side = BackSide;
  const room = new Mesh(new BoxGeometry(X1 - X0, S.wall - 0.02, Z1 - Z0), wall);
  room.position.set((X0 + X1) / 2, S.wall / 2 + 0.01, (Z0 + Z1) / 2);
  const floorMesh = new Mesh(new PlaneGeometry(X1 - X0, Z1 - Z0), floor);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set((X0 + X1) / 2, 0.015, (Z0 + Z1) / 2);
  const ceil = new Mesh(new PlaneGeometry(X1 - X0, Z1 - Z0), ceiling);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set((X0 + X1) / 2, H, (Z0 + Z1) / 2);
  add(room); add(floorMesh); add(ceil);
  const grid = [];
  for (let x = X0 + TILE; x < X1; x += TILE) grid.push(new BoxGeometry(0.025, 0.02, Z1 - Z0).translate(x, H - 0.01, (Z0 + Z1) / 2));
  for (let z = Z0 + TILE; z < Z1; z += TILE) grid.push(new BoxGeometry(X1 - X0, 0.02, 0.025).translate((X0 + X1) / 2, H - 0.01, z));
  add(new Mesh(mergeGeometries(grid), steel));
  const pilaster = weathered({ colour: '#76604e', scale: 1.0, vary: 0.3, streaks: 0.5, dirt: 0.5, dirtHeight: 1.2, rough: 0.85, wet: 0,
    bump: 0.3, photo: stained, photoScale: 2.2, photoSat: 0.4, photoContrast: 1.7 });
  for (const x of [-7.0, -1.9, 3.6]) box(x - 0.22, 0, Z0, x + 0.22, H, Z0 + 0.18, pilaster, 0.01);

  // The counter: a dark wooden front, a light top with a chrome edge,
  // the till on it, red stools on the window side.
  const C = { x: -0.8, z: -1.3, len: 4.2, w: 0.62, h: 0.98 };
  box(C.x - C.len / 2, 0, C.z - C.w / 2 + 0.05, C.x + C.len / 2, C.h - 0.04, C.z + C.w / 2 - 0.02, darkWood);
  box(C.x - C.len / 2 - 0.06, C.h - 0.05, C.z - C.w / 2, C.x + C.len / 2 + 0.06, C.h, C.z + C.w / 2 + 0.06, lightWood, 0.01);
  box(C.x - C.len / 2 - 0.06, C.h - 0.065, C.z + C.w / 2 + 0.05, C.x + C.len / 2 + 0.06, C.h - 0.03, C.z + C.w / 2 + 0.075, chrome, 0.008);
  box(C.x - C.len / 2, 0, C.z + C.w / 2 - 0.04, C.x + C.len / 2, 0.08, C.z + C.w / 2 - 0.01, chrome);
  // The till: a cream base, a drawer, the keys sloping, a display on a stalk.
  const tx = 0.4;
  const tz = C.z;
  box(tx - 0.22, C.h, tz - 0.2, tx + 0.22, C.h + 0.1, tz + 0.2, cream, 0.012);
  const keys = add(boxMesh(-0.2, -0.04, -0.12, 0.2, 0.04, 0.12, cream, 0.01));
  keys.position.set(tx, C.h + 0.15, tz + 0.04);
  keys.rotation.x = 0.35;
  box(tx - 0.2, C.h + 0.12, tz - 0.2, tx + 0.2, C.h + 0.3, tz - 0.06, cream, 0.012);
  box(tx - 0.12, C.h + 0.3, tz - 0.16, tx + 0.12, C.h + 0.4, tz - 0.1, cream, 0.008);
  box(tx - 0.1, C.h + 0.32, tz - 0.1, tx + 0.1, C.h + 0.38, tz - 0.095, steel);
  // A few bottles left on the counter.
  for (const [x, c] of [[1.15, '#1e3518'], [1.35, '#2c4a1c'], [-2.2, '#7a140c']]) {
    const b = add(new Mesh(bottleGeometry(), new MeshStandardNodeMaterial({ color: new Color(c), roughness: 0.2 })));
    b.scale.set(0.075, 0.27, 0.075);
    b.position.set(x, C.h, C.z + 0.15);
  }
  // Stools: a red seat and back on a chrome post.
  for (const x of [-2.4, -0.8, 0.8]) {
    const z = C.z + C.w / 2 + 0.45;
    box(x - 0.025, 0, z - 0.025, x + 0.025, 0.62, z + 0.025, chrome);
    box(x - 0.2, 0.62, z - 0.2, x + 0.2, 0.72, z + 0.2, red, 0.03);
    box(x - 0.2, 0.72, z + 0.14, x + 0.2, 1.06, z + 0.2, red, 0.025);
    box(x - 0.18, 0, z - 0.18, x + 0.18, 0.02, z + 0.18, chrome, 0.008);
  }

  // Where goods stand: each shelf as [x0, x1, y, z, depth].
  const shelves = [];
  // Dark wooden shelves on brackets along the back wall.
  for (const [x0, x1] of [[-6.6, -2.2], [-1.6, 3.0]]) {
    for (const y of [0.95, 1.38, 1.81, 2.24]) {
      box(x0, y - 0.035, Z0 + 0.18, x1, y, Z0 + 0.52, darkWood);
      for (let x = x0 + 0.3; x < x1; x += 1.2) box(x - 0.015, y - 0.25, Z0 + 0.18, x + 0.015, y - 0.035, Z0 + 0.45, steel);
      shelves.push([x0 + 0.05, x1 - 0.05, y, Z0 + 0.38, 0.22]);
    }
  }
  // Steel racks down the room, open both sides, and one against the west wall.
  const racks = [
    { x0: 1.9, x1: 4.7, z: -3.7, d: 0.5 },
    { x0: 1.9, x1: 4.7, z: -2.5, d: 0.5 },
    { x0: -7.9, x1: -6.4, z: -1.6, d: 0.4 },
  ];
  for (const r of racks) {
    const levels = [0.12, 0.52, 0.92, 1.32, 1.72];
    for (const y of levels) {
      box(r.x0, y - 0.03, r.z - r.d / 2, r.x1, y, r.z + r.d / 2, steel);
      box(r.x0, y, r.z + r.d / 2 - 0.01, r.x1, y + 0.04, r.z + r.d / 2, steel);
      shelves.push([r.x0 + 0.04, r.x1 - 0.04, y, r.z, r.d - 0.08]);
    }
    for (const x of [r.x0, r.x1]) for (const z of [r.z - r.d / 2, r.z + r.d / 2 - 0.03]) box(x, 0, z, x + 0.03, 1.95, z + 0.03, steel);
  }
  // The drinks fridge by the door: a white cabinet, a glass door, lit inside.
  const F = { x0: 4.9, x1: 5.9, z0: -1.75, z1: -1.05, h: 1.95 };
  box(F.x0, 0, F.z0, F.x1, F.h, F.z0 + 0.06, cream);
  for (const x of [F.x0, F.x1 - 0.06]) box(x, 0, F.z0, x + 0.06, F.h, F.z1, cream);
  box(F.x0, 0, F.z0, F.x1, 0.18, F.z1, cream);
  box(F.x0, F.h - 0.22, F.z0, F.x1, F.h, F.z1, red);
  const fridgeLight = new MeshStandardNodeMaterial({ color: new Color(0.6, 0.65, 0.7), roughness: 0.6 });
  fridgeLight.emissiveNode = vec3(0.75, 0.85, 1.0).mul(0.6);
  const back = add(new Mesh(new PlaneGeometry(F.x1 - F.x0 - 0.12, F.h - 0.42), fridgeLight));
  back.position.set((F.x0 + F.x1) / 2, (F.h + 0.18 - 0.22) / 2 + 0.09, F.z0 + 0.065);
  for (const y of [0.55, 0.95, 1.35]) {
    box(F.x0 + 0.06, y - 0.015, F.z0 + 0.06, F.x1 - 0.06, y, F.z1 - 0.05, steel);
    shelves.push([F.x0 + 0.1, F.x1 - 0.1, y, (F.z0 + F.z1) / 2, 0.4]);
  }
  box(F.x0, 0.18, F.z1 - 0.04, F.x0 + 0.05, F.h - 0.22, F.z1, cream);
  box(F.x1 - 0.05, 0.18, F.z1 - 0.04, F.x1, F.h - 0.22, F.z1, cream);

  // The goods: rows of bottles and tins (and a few boxes) along each shelf,
  // two deep where the shelf is deep enough, a gap now and then.
  const bottles = [];
  const tins = [];
  const cartons = [];
  let n = 0;
  for (const [x0, x1, y, z, depth] of shelves) {
    const rows = depth > 0.3 ? 2 : 1;
    for (let row = 0; row < rows; row++) {
      const zr = z + (rows > 1 ? (row - 0.5) * depth * 0.5 : 0);
      let x = x0 + rand(n++, 9) * 0.05;
      while (x < x1 - 0.05) {
        const k = n++;
        const kind = rand(k, 1);
        if (rand(k, 2) < 0.06) { x += 0.08 + rand(k, 3) * 0.12; continue; }   // a gap
        if (kind < 0.74) {
          const r = 0.03 + rand(k, 4) * 0.015;
          const h = 0.22 + rand(k, 5) * 0.12;
          bottles.push([x + r, y, zr + (rand(k, 6) - 0.5) * 0.04, r, h, pick(GLASS, rand(k, 7)), rand(k, 8)]);
          x += 2 * r + BOTTLE_GAP + rand(k, 9) * (depth > 0.3 ? 0.03 : 0.07);
        } else if (kind < 0.96) {
          const r = 0.032 + rand(k, 4) * 0.012;
          const h = 0.1 + rand(k, 5) * 0.06;
          // Tins stack two high now and then.
          const stack = rand(k, 6) < 0.3 ? 2 : 1;
          for (let s = 0; s < stack; s++) tins.push([x + r, y + s * h, zr, r, h, pick(TINS, rand(k, 7 + s))]);
          x += 2 * r + 0.01;
        } else {
          const w = 0.12 + rand(k, 4) * 0.12;
          const h = 0.16 + rand(k, 5) * 0.14;
          cartons.push([x + w / 2, y, zr, w, h, pick([[2, '#8a7048'], [2, '#6a2a18'], [1, '#a8a088'], [1, '#2c3a4a']], rand(k, 7))]);
          x += w + 0.02;
        }
      }
    }
  }
  const d = new Object3D();
  const colour = new Color();
  const instanced = (geo, mat, list, place) => {
    const inst = new InstancedMesh(geo, mat, list.length);
    list.forEach((item, i) => {
      place(item);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
      inst.setColorAt(i, colour.set(item[5]));
    });
    inst.instanceMatrix.needsUpdate = true;
    g.add(inst);
    return inst;
  };
  // Glass: glossy, its label a paler band round the middle (from the
  // bottle's own height, so every bottle has one), some without.
  const glass = new MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0 });
  const yb = positionGeometry.y;
  const hasLabel = hash(float(instanceIndex).mul(7.3)).greaterThan(0.45);
  const label = smoothstep(0.3, 0.32, yb).mul(smoothstep(0.5, 0.48, yb)).mul(hasLabel.select(float(1), float(0)));
  // (The instance's colour multiplies whatever this gives, so the label is
  // divided by it to come out its own colour.)
  const paper = mix(vec3(0.3, 0.24, 0.15), vec3(0.55, 0.5, 0.4), hash(float(instanceIndex).mul(3.7)));
  glass.colorNode = mix(vec3(1), paper.div(instanceColor.max(0.01)), label);
  glass.roughnessNode = mix(float(0.06), float(0.7), label);
  instanced(bottleGeometry(), glass, bottles, ([x, y, z, r, h, , turn]) => {
    d.position.set(x, y + 0.002, z);
    d.scale.set(r, h, r);
    d.rotation.set(0, turn * 6, 0);
  });
  const tin = new MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.6 });
  const rim = smoothstep(0.9, 0.93, positionGeometry.y.add(0.5)).max(smoothstep(0.1, 0.07, positionGeometry.y.add(0.5)));
  tin.colorNode = mix(vec3(1), vec3(1.6), rim);
  instanced(new CylinderGeometry(1, 1, 1, 10), tin, tins, ([x, y, z, r, h]) => {
    d.position.set(x, y + h / 2 + 0.002, z);
    d.scale.set(r, h, r);
    d.rotation.set(0, 0, 0);
  });
  const card = new MeshStandardNodeMaterial({ roughness: 0.8 });
  instanced(new BoxGeometry(1, 1, 1), card, cartons, ([x, y, z, w, h]) => {
    d.position.set(x, y + h / 2 + 0.002, z);
    d.scale.set(w, h, Math.min(0.2, w));
    d.rotation.set(0, 0, 0);
  });

  // Pendant lamps over the counter: a cord, a cream cone, a bulb inside.
  // The shades are thin cream enamel, glowing a little with the bulb inside.
  const shade = weathered({ colour: '#cdbb94', rough: 0.5, metal: 0.2, wet: 0, bump: 0, streaks: 0, dirt: 0,
    emissive: vec3(1.0, 0.78, 0.5).mul(SHADE_GLOW) });
  shade.side = DoubleSide;
  const bulb = new MeshStandardNodeMaterial({ color: new Color(1, 0.8, 0.6) });
  bulb.emissiveNode = vec3(1.0, 0.62, 0.32).mul(9);
  for (const [x, z] of PENDANTS) {
    add(new Mesh(new CylinderGeometry(0.005, 0.005, 0.62, 3), steel)).position.set(x, S.wall - 0.31, z);
    add(new Mesh(new CylinderGeometry(0.04, 0.04, 0.06, 10), steel)).position.set(x, S.wall - 0.64, z);
    add(new Mesh(new CylinderGeometry(0.05, 0.27, 0.2, 18, 1, true), shade)).position.set(x, S.wall - 0.77, z);
    add(new Mesh(new SphereGeometry(0.07, 10, 8), bulb)).position.set(x, S.wall - 0.84, z);
  }
  // Ceiling tubes in the grid.
  const tube = new MeshStandardNodeMaterial({ color: new Color(1, 1, 1) });
  tube.emissiveNode = vec3(1.0, 0.96, 0.9).mul(5);
  for (const x of [-5, 1.5]) add(new Mesh(new BoxGeometry(1.2, 0.04, 0.14), tube)).position.set(x, H - 0.025, -4.5);
  // Nothing in here casts a shadow (no shadowing light reaches it), and it is
  // left out of the ground's mirror (layer 1): the glass hides it there anyway.
  g.traverse((o) => { o.castShadow = false; o.layers.set(1); });
  return { object: g, update() {} };
}

// A bottle one unit tall and one unit in radius at its body: body, shoulder,
// neck, lip. Scaled per instance.
let BOTTLE = null;
function bottleGeometry() {
  BOTTLE ??= new LatheGeometry([
    [0, 0], [0.92, 0], [1, 0.03], [1, 0.58], [0.9, 0.66], [0.55, 0.74], [0.36, 0.8], [0.34, 0.95], [0.4, 0.97], [0.38, 1], [0, 1],
  ].map(([r, y]) => new Vector2(r, y)), 10);
  return BOTTLE;
}
