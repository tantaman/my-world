// Architecture and furniture share a local frame, in metres. The same blocks
// that close a passage to the eye close it to a walker and the chase camera.
import * as THREE from 'three';
import { Kit } from '../videostore/store.js';
import { toWorld } from '../landmarks/sites.js';
import { mulberry32 } from '../noise.js';

const colors = new Map();
function color(hex) {
  if (!colors.has(hex)) colors.set(hex, new THREE.Color(hex));
  return colors.get(hex);
}
const brick = 0x70594e,
  stone = 0x898378,
  iron = 0x383b38,
  rust = 0x76523d;
const plaster = 0x999684,
  tile = 0x53665e,
  wood = 0x665746,
  paper = 0xc7bb92;
const black = 0x212729,
  light = 0xb5c8b0;

export function buildInstitution(site, ground, material, litMaterial) {
  const { w, d, height: h, bays, top } = site;
  const ward = site.kind === 'asylum';
  const rnd = mulberry32(site.seed);
  const shell = new Kit(),
    lit = new Kit();
  const object = new THREE.Group();
  object.position.set(site.x, top, site.z);
  object.rotation.y = site.yaw;
  object.updateMatrixWorld();
  const solids = [],
    blockers = [],
    crossings = [],
    traces = [];
  function box(x, y, z, width, height, depth, hex, kit = shell) {
    kit.box(x - width / 2, y - height / 2, z - depth / 2, x + width / 2, y + height / 2, z + depth / 2, color(hex));
  }
  function block(x, y, z, width, height, depth, hex, surface) {
    box(x, y, z, width, height, depth, hex);
    const inv = object.matrixWorld
      .clone()
      .multiply(new THREE.Matrix4().makeTranslation(x, y, z))
      .invert();
    blockers.push({ inv, half: [width / 2, height / 2, depth / 2] });
    const across = width >= depth;
    const short = Math.min(width, depth),
      long = Math.max(width, depth);
    const rows = Math.ceil(short / 1.2),
      r = short / (2 * rows);
    for (let i = 0; i < rows; i++) {
      const c = -short / 2 + (2 * i + 1) * r,
        e = long / 2 - r;
      const a = toWorld(site, x + (across ? -e : c), z + (across ? c : -e));
      const b = toWorld(site, x + (across ? e : c), z + (across ? c : e));
      solids.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, r: r + 0.013, bottom: top + y - height / 2, topA: top + y + height / 2, topB: top + y + height / 2, surface });
    }
  }

  // A continuous foundation, with shallow steps that disappear into the
  // hillside. The map arrival is on this same approach.
  const foundation = top - site.low + 0.5;
  block(0, -foundation / 2, 0, 2 * w, foundation, 2 * d, stone, 'rock');
  const frontGround = toWorld(site, 0, d + 8);
  const count = Math.ceil(Math.max(0.22, top - ground(frontGround.x, frontGround.z) + 0.35) / 0.21);
  for (let i = 0; i < count; i++) {
    const y = -i * 0.21;
    block(0, y - 0.42, d + ((i + 0.5) * 8) / count, 4.4, 0.84, 8 / count + 0.02, stone, 'rock');
  }

  // The main doors open onto a long spine. The wings have cross aisles
  // at the far windows and the lobby, and connecting doors along each wing.
  const wall = ward ? brick : 0x626961;
  for (const side of [-1, 1]) {
    block(side * w, h / 2, 0, 0.42, h, 2 * d, wall);
    block((side * (w + 1.45)) / 2, h / 2, d, w - 1.45, h, 0.44, wall);
  }
  block(0, h / 2, -d, 2 * w, h, 0.44, wall);
  block(0, (2.9 + h) / 2, d, 2.9, h - 2.9, 0.44, wall);
  block(0, h + 0.17, 0, 2 * w + 0.8, 0.34, 2 * d + 0.8, iron, 'rock');

  // Street elevation. The dormers have steep hipped caps. The depot has
  // north-light roof monitors and a tall exhaust stack over its boiler bay.
  function cap(x, y, z, width, depth, rise) {
    const apex = [x, y + rise, z];
    for (const [a, b, n] of [
      [
        [-1, 1],
        [1, 1],
        [0, 0.6, 0.8],
      ],
      [
        [1, -1],
        [-1, -1],
        [0, 0.6, -0.8],
      ],
      [
        [1, 1],
        [1, -1],
        [0.8, 0.6, 0],
      ],
      [
        [-1, -1],
        [-1, 1],
        [-0.8, 0.6, 0],
      ],
    ])
      shell.quad([x + (a[0] * width) / 2, y, z + (a[1] * depth) / 2], [x + (b[0] * width) / 2, y, z + (b[1] * depth) / 2], apex, apex, n, color(iron));
  }
  if (ward) {
    for (const x of [-w + 3.3, 0, w - 3.3]) {
      const rise = x === 0 ? 5.2 : 2.8;
      box(x, h + rise / 2, d - 2.5, 6.3, rise, 5.8, brick);
      for (const dx of [-1.4, 0, 1.4]) {
        box(x + dx, h + rise * 0.52, d + 0.43, 0.76, rise * 0.58, 0.08, black);
        box(x + dx, h + rise * 0.52, d + 0.5, 0.075, rise * 0.58, 0.08, stone);
      }
      box(x, h + rise, d - 2.5, 6.8, 0.3, 6.3, stone);
      cap(x, h + rise + 0.15, d - 2.5, 7, 6.5, 3.4);
    }
  } else {
    for (let z = -d + 5; z < d; z += 10) {
      box(0, h + 1, z, 2 * w - 3, 1.6, 2.5, iron);
      for (let x = -w + 3; x < w - 2; x += 3) box(x, h + 1.1, z + 1.28, 2.65, 1.05, 0.08, 0x718480);
    }
    box(w - 3, h + 4, -d + 3, 1.6, 8, 1.6, brick);
    box(w - 3, h + 8, -d + 3, 1.9, 0.35, 1.9, stone);
  }
  for (let x = -w + 2; x < w; x += 3.8) {
    if (Math.abs(x) < 3.5) continue;
    box(x, 1.95, d + 0.23, 2.2, 2.65, 0.14, stone);
    box(x, 1.99, d + 0.32, 1.88, 2.28, 0.08, black);
    box(x, 2, d + 0.4, 0.09, 2.25, 0.06, iron);
    box(x, 2.4, d + 0.41, 1.88, 0.1, 0.06, iron);
    box(x, 0.74, d + 0.38, 2.45, 0.22, 0.52, stone);
    if (rnd() < 0.5) box(x, 1.8, d + 0.46, 2.1, 0.31, 0.09, wood);
  }
  box(0, 3.38, d + 0.35, 8.6, 0.82, 0.3, iron);
  shell.words(site.sign, 0, 3.38, d + 0.52, 0, 1, 0.065, color(paper));
  box(0, 2.85, d + 1.25, 5.2, 0.23, 2.6, iron);
  for (const x of [-2.25, 2.25]) block(x, 1.4, d + 2.3, 0.22, 2.8, 0.22, rust);

  const aisle = ward ? 2.3 : 3.8;
  const cell = (2 * d - 8) / bays;
  for (let i = 0; i < bays; i++) {
    const z0 = -d + 4 + i * cell,
      z = z0 + cell / 2;
    for (const side of [-1, 1]) {
      const x = side * aisle,
        roomX = (side * (aisle + w)) / 2;
      const gap = ward ? 1.9 : 3.2;
      const doorZ = z + (rnd() - 0.5) * 1.1;
      const sortingFloor = !ward && side < 0;
      if (sortingFloor) {
        // One open hall, roof beams spanning the machinery. The painted
        // bay numbers are high enough to read across the belts.
        block(x, h / 2, z0, 0.32, h, 0.48, iron);
        box(-w / 2, h - 0.4, z0, w, 0.48, 0.22, rust);
        box(roomX, h - 1.05, z0, 2.4, 1.2, 0.12, wood);
        shell.words('0' + (i + 1), roomX, h - 1.05, z0 + 0.07, 0, 1, 0.12, color(paper));
      } else {
        for (const [a, b] of [
          [z0, doorZ - gap / 2],
          [doorZ + gap / 2, z0 + cell],
        ]) {
          block(x, h / 2, (a + b) / 2, 0.25, h, b - a, plaster);
          box(x, 0.64, (a + b) / 2, 0.29, 1.28, b - a, ward ? tile : 0x74644b);
          box(x, 1.31, (a + b) / 2, 0.31, 0.07, b - a, wood);
          for (let j = 0; j < 4; j++) {
            const streak = 0.2 + rnd() * 0.9;
            box(x - side * 0.14, h - streak / 2, a + rnd() * (b - a), 0.025, streak, 0.12 + rnd() * 0.24, 0x706f60);
          }
        }
        block(x, (2.55 + h) / 2, doorZ, 0.25, h - 2.55, gap, ward ? plaster : stone);

        // Leave a passage at the outer windows through every partition.
        if (ward || i % 2 === 0) block((side * (w + aisle - 3)) / 2, h / 2, z0, w - aisle - 3, h, 0.25, plaster);
        const label = ward ? ['LINEN', 'OBSERVATION', 'NIGHT WARD', 'RECORDS', 'DAY ROOM', 'BATHS'][i] : ['RETURNS', 'SORTING', 'ARCHIVE', 'DISPATCH'][i];
        shell.words(label, x - side * 0.15, 2.82, doorZ, -side, 0, 0.026, color(black));
      }
      if (!sortingFloor) crossings.push({ x, z: doorZ, side });
      // Boarded side windows, visible from both the gallery and the trees.
      for (const face of [-1, 1]) {
        const fx = side * (w + face * 0.25);
        box(fx, 2.22, z, 0.09, 2.16, 3.3, black);
        box(fx + side * face * 0.07, 2.22, z, 0.06, 2.16, 0.11, stone);
        box(fx + side * face * 0.07, 2.55, z, 0.07, 0.1, 3.3, wood);
        box(fx + side * face * 0.09, 1.18, z, 0.3, 0.15, 3.6, stone);
        if ((i + side) % 3 === 0) box(fx + side * face * 0.1, 1.9, z, 0.09, 0.38, 3.5, wood);
      }
      if (sortingFloor) {
        block(roomX, 0.85, z, 1.9, 0.22, cell - 1.7, iron);
        for (const dx of [-0.84, 0.84]) {
          for (const dz of [-cell / 3, cell / 3]) box(roomX + dx, 0.42, z + dz, 0.14, 0.84, 0.14, rust);
        }
        for (let dz = -cell / 2 + 1.1; dz < cell / 2 - 1; dz += 0.34) box(roomX, 0.99, z + dz, 1.68, 0.09, 0.18, stone);
        const length = 0.46 + rnd() * 0.5;
        box(roomX, 1.26, z, 0.65, 0.46, length, wood);
        box(roomX, 1.5, z, 0.09, 0.03, length, paper);
      } else if (ward && i % 3 !== 0) {
        // Iron beds with a bare spring frame or a stained mattress.
        for (const dz of [-1.65, 1.65]) {
          const bx = roomX + side * (rnd() - 0.5);
          block(bx, 0.53, z + dz, 2.25, 0.14, 0.92, iron);
          for (const end of [-1, 1]) {
            box(bx + end * 1.08, 0.49, z + dz, 0.08, 0.95, 0.98, rust);
          }
          if (rnd() < 0.7) box(bx, 0.69, z + dz, 2.02, 0.16, 0.84, 0x898579);
          else for (let k = -4; k <= 4; k++) box(bx + k * 0.23, 0.62, z + dz, 0.055, 0.04, 0.85, rust);
        }
      } else {
        // Sorting pigeonholes and archive shelving. Contents thin out
        // toward the top, leaving a few envelopes in otherwise empty rows.
        block(roomX, 1.08, z, 0.64, 2.16, 4.4, wood);
        box(roomX - side * 0.33, 1.18, z, 0.05, 1.78, 4.24, black);
        for (let row = 0; row < 4; row++) {
          box(roomX - side * 0.49, 0.36 + row * 0.53, z, 0.44, 0.08, 4.35, wood);
          for (let col = -2; col <= 2; col++) {
            if (row === 0) box(roomX - side * 0.48, 1.13, z + col * 0.81, 0.4, 1.8, 0.06, wood);
            if (rnd() < 0.35) box(roomX - side * 0.49, 0.46 + row * 0.53, z + col * 0.81 + 0.24, 0.3, 0.12, 0.36, paper);
          }
        }
      }
    }
    box(0, h - 0.18, z, 0.42, 0.24, 2.4, iron);
    box(0, h - 0.32, z, 0.23, 0.045, 2.1, i % 3 === 1 ? light : 0x636759, i % 3 === 1 ? lit : shell);
  }

  // Visitors left a line of tape, a camera and an abandoned bedroll.
  const clues = ward
    ? [
        'Someone wrote “back by four” on the visitor pass. The ink ran where they folded it.',
        'The disposable camera has one exposure left. Its lens points at the doorway.',
        'Two enamel cups sit beside a single bedroll. One is still upside down.',
      ]
    : [
        'A hiking map lies open on the desk. Someone circled this building twice.',
        'The camera strap is looped around a shelf. Someone meant to come back for it.',
        'A sleeping bag lies half rolled. The boots beside it point into the archive.',
      ];
  for (const [i, [x, z]] of [
    [-3.8, d - 2],
    [w - 2, -d + cell + 3],
    [-w + 2, -d + 2],
  ].entries()) {
    traces.push({ x, z, text: clues[i] });
    if (i < 2) {
      block(x, 0.85, z, 1.6, 0.16, 0.88, wood);
      for (const dx of [-0.68, 0.68]) box(x + dx, 0.42, z, 0.1, 0.84, 0.78, iron);
      box(x, 0.954, z, i ? 0.31 : 0.47, i ? 0.18 : 0.018, 0.29, i ? black : paper);
      if (i) box(x, 0.97, z + 0.15, 0.13, 0.11, 0.08, stone);
    } else {
      box(x, 0.09, z, 0.78, 0.18, 1.85, 0x77704d);
      box(x, 0.18, z - 0.73, 0.86, 0.32, 0.45, 0x6a5543);
      for (const dx of [0.56, 0.82]) box(x + dx, 0.1, z + 0.3, 0.16, 0.2, 0.21, ward ? paper : wood);
    }
  }
  // Worn floor tiles and paint lines give scale and lead the eye back to
  // the entrance. A few mud prints break away from the line in mid-hall.
  for (let z = -d + 1; z < d; z += 1.5) {
    box(-aisle + 0.4, 0.012, z, 0.12, 0.02, 1.41, 0x786a4f);
    if (rnd() < 0.75) box((rnd() - 0.5) * 2, 0.015, z, 0.16, 0.02, 0.29, 0x585448);
  }
  box(0, 3.18, d - 0.25, 1.6, 0.48, 0.1, tile);
  lit.words('EXIT', 0, 3.18, d - 0.32, 0, -1, 0.047, color(light));
  shell.words(site.subtitle, 0, 2.35, -d + 0.23, 0, 1, 0.078, color(paper));
  for (const [kit, mat] of [
    [shell, material],
    [lit, litMaterial],
  ]) {
    const mesh = new THREE.Mesh(kit.build(), mat);
    mesh.castShadow = mesh.receiveShadow = kit === shell;
    object.add(mesh);
  }
  // A narrow moving fold seen through a doorway. Geometry and depth testing
  // keep it behind walls even if the listener is in the next room.
  const fold = new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 1.05, 2, 5), material);
  const geom = fold.geometry;
  const shade = new Float32Array(geom.attributes.position.count * 3).fill(0.016);
  geom.setAttribute('color', new THREE.BufferAttribute(shade, 3));
  fold.scale.set(0.8, 1.13, 0.6);
  fold.rotation.z = 0.12;
  fold.visible = false;
  object.add(fold);
  const pane = new Kit();
  const windowX = -w + 2;
  pane.panel(windowX - 0.49, 2.72, d + 0.38, 0, 1, 0.78, 0.48, color(0xbaa571));
  const windowLight = new THREE.Mesh(pane.build(), litMaterial);
  windowLight.visible = false;
  object.add(windowLight);
  return { object, solids, blockers, crossings, traces, fold, windowLight };
}
